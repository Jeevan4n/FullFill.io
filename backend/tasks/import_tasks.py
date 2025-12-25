import csv
import os
from sqlalchemy import func

from celery_app import celery
from utils.session_manager import get_session, safe_close
from models.import_job import ImportJob
from models.product import Product


# -------------------------------------------------
# SAFE progress update (session-isolated)
# -------------------------------------------------
def update_job_progress(
    job_id,
    status=None,
    processed_rows=None,
    success_count=None,
    error_count=None,
    error_message=None,
    total_rows=None,
):
    session = get_session()
    try:
        job = session.get(ImportJob, job_id)
        if not job:
            return

        if status is not None:
            job.status = status
        if processed_rows is not None:
            job.processed_rows = processed_rows
        if success_count is not None:
            job.success_count = success_count
        if error_count is not None:
            job.error_count = error_count
        if error_message is not None:
            job.error_message = error_message
        if total_rows is not None:
            job.total_rows = total_rows

        session.commit()
    finally:
        safe_close(session)


# -------------------------------------------------
# CSV IMPORT TASK (PRODUCTION SAFE)
# -------------------------------------------------
@celery.task(bind=True)
def process_csv_import(self, job_id):
    session = get_session()
    job = None

    BATCH_SIZE = 4000
    PROGRESS_INTERVAL = 2000
    CANCEL_CHECK_INTERVAL = 1000

    try:
        # ---------------- Load Job ----------------
        job = session.get(ImportJob, job_id)
        if not job:
            return

        update_job_progress(job_id, status="parsing")

        # ---------------- Count rows ----------------
        with open(job.file_path, "r", encoding="utf-8") as f:
            total_rows = sum(1 for _ in f) - 1

        update_job_progress(
            job_id,
            status="processing",
            total_rows=total_rows,
            processed_rows=0,
            success_count=0,
            error_count=0,
        )

        # ---------------- Preload existing products ----------------
        existing_products = dict(
            session.query(func.lower(Product.sku), Product).all()
        )

        to_insert = []
        to_update = []

        success = 0
        error = 0
        errors = []

        # ---------------- Process CSV ----------------
        with open(job.file_path, "r", encoding="utf-8") as f:
            reader = csv.DictReader(f)

            for idx, row in enumerate(reader, start=1):

                # ---- Cancel check ----
                if idx % CANCEL_CHECK_INTERVAL == 0:
                    session.refresh(job)
                    if job.status == "cancelled":
                        update_job_progress(job_id, status="cancelled")
                        return

                sku = row.get("sku", "").strip().lower()
                name = row.get("name", "").strip()

                if not sku or not name:
                    error += 1
                    if len(errors) < 20:
                        errors.append(f"Row {idx}: Missing SKU or name")
                    continue

                # ---- Price validation ----
                price = None
                raw_price = row.get("price", "").strip()
                if raw_price:
                    try:
                        price = float(raw_price)
                        if price < 0:
                            raise ValueError
                    except ValueError:
                        error += 1
                        if len(errors) < 20:
                            errors.append(f"Row {idx}: Invalid price")
                        continue

                active = row.get("active", "true").lower() in (
                    "true", "1", "yes", "y", "active"
                )

                # ---- UPSERT ----
                if sku in existing_products:
                    p = existing_products[sku]
                    p.name = name
                    p.description = row.get("description")
                    p.price = price
                    p.active = active
                    to_update.append(p)
                else:
                    p = Product(
                        sku=sku,
                        name=name,
                        description=row.get("description"),
                        price=price,
                        active=active,
                    )
                    to_insert.append(p)
                    existing_products[sku] = p

                success += 1

                # ---- Batch flush ----
                if idx % BATCH_SIZE == 0:
                    if to_insert:
                        session.bulk_save_objects(to_insert)
                    if to_update:
                        session.bulk_save_objects(to_update)
                    session.commit()
                    to_insert.clear()
                    to_update.clear()

                # ---- Progress update ----
                if idx % PROGRESS_INTERVAL == 0:
                    update_job_progress(
                        job_id,
                        processed_rows=idx,
                        success_count=success,
                        error_count=error,
                    )

        # ---------------- Final flush ----------------
        if to_insert:
            session.bulk_save_objects(to_insert)
        if to_update:
            session.bulk_save_objects(to_update)

        session.commit()

        # ---------------- Final status ----------------
        if errors:
            update_job_progress(
                job_id,
                status="completed_with_errors",
                error_message="\n".join(errors),
                processed_rows=total_rows,
                success_count=success,
                error_count=error,
            )
        else:
            update_job_progress(
                job_id,
                status="completed",
                processed_rows=total_rows,
                success_count=success,
                error_count=error,
            )

    except Exception as e:
        session.rollback()
        update_job_progress(
            job_id,
            status="failed",
            error_message=str(e),
        )
        raise

    finally:
        safe_close(session)
        if job and os.path.exists(job.file_path):
            os.remove(job.file_path)
