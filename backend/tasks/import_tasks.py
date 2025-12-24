import csv
import os
import traceback
from datetime import datetime
from sqlalchemy import func

from celery_app import celery
from utils.session_manager import get_session, safe_close
from models.import_job import ImportJob
from models.product import Product


# -----------------------------------------
# SAFE progress update (ID only)
# -----------------------------------------
def update_job_progress(
    job_id,
    status=None,
    processed_rows=None,
    success_count=None,
    error_count=None,
    error_message=None,
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

        session.commit()
    finally:
        safe_close(session)


# -----------------------------------------
# CSV Import Task
# -----------------------------------------
@celery.task(bind=True, name="tasks.process_csv_import")
def process_csv_import(self, job_id: int, file_path: str):
    session = get_session()

    try:
        job = session.get(ImportJob, job_id)
        if not job:
            return {"status": "error", "message": "Job not found"}

        job.status = "processing"
        job.processed_rows = 0
        job.success_count = 0
        job.error_count = 0
        session.commit()

        # ---- Config ----
        COMMIT_INTERVAL = 500
        PROGRESS_INTERVAL = 100

        total_processed = total_created = total_updated = total_errors = 0

        # ---- Count rows ----
        with open(file_path, "r", encoding="utf-8") as f:
            reader = csv.reader(f)
            next(reader, None)
            total_rows = sum(1 for _ in reader)

        if total_rows == 0:
            update_job_progress(job_id, status="failed", error_message="Empty CSV")
            return {"status": "error", "message": "Empty CSV"}

        job.total_rows = total_rows
        session.commit()

        products_to_create = []
        products_to_update = []

        # ---- Process CSV ----
        with open(file_path, "r", encoding="utf-8") as f:
            reader = csv.DictReader(f)

            for row in reader:
                try:
                    sku = str(row.get("sku", "")).strip().lower()
                    if not sku:
                        total_errors += 1
                        continue

                    name = row.get("name", "").strip()
                    description = row.get("description", "").strip()
                    price = float(row["price"]) if row.get("price") else None
                    active = str(row.get("active", "true")).lower() in ("true", "1", "yes")

                    existing = session.query(Product).filter(
                        func.lower(Product.sku) == sku
                    ).first()

                    if existing:
                        existing.name = name
                        existing.description = description
                        existing.price = price
                        existing.active = active
                        existing.updated_at = datetime.utcnow()
                        products_to_update.append(existing)
                        total_updated += 1
                    else:
                        products_to_create.append(
                            Product(
                                sku=sku,
                                name=name,
                                description=description,
                                price=price,
                                active=active,
                            )
                        )
                        total_created += 1

                    total_processed += 1

                    # ---- Commit batch ----
                    if total_processed % COMMIT_INTERVAL == 0:
                        if products_to_create:
                            session.bulk_save_objects(products_to_create)
                            products_to_create.clear()

                        for prod in products_to_update:
                            session.merge(prod)
                        products_to_update.clear()

                        session.commit()

                    # ---- Progress update ----
                    if total_processed % PROGRESS_INTERVAL == 0:
                        progress = int((total_processed / total_rows) * 100)
                        update_job_progress(
                            job_id,
                            processed_rows=total_processed,
                            success_count=total_created + total_updated,
                            error_count=total_errors,
                        )

                        self.update_state(
                            state="PROGRESS",
                            meta={
                                "current": total_processed,
                                "total": total_rows,
                                "progress": progress,
                            },
                        )

                except Exception:
                    total_errors += 1
                    continue

        # ---- Final commit ----
        if products_to_create:
            session.bulk_save_objects(products_to_create)
        for prod in products_to_update:
            session.merge(prod)

        session.commit()

        update_job_progress(
            job_id,
            status="completed" if total_errors == 0 else "completed_with_errors",
            processed_rows=total_processed,
            success_count=total_created + total_updated,
            error_count=total_errors,
        )

        return {
            "status": "success",
            "processed": total_processed,
            "created": total_created,
            "updated": total_updated,
            "errors": total_errors,
        }

    except Exception as e:
        tb = traceback.format_exc()
        update_job_progress(job_id, status="failed", error_message=str(e))
        return {"status": "error", "message": str(e), "traceback": tb}

    finally:
        safe_close(session)
        try:
            os.remove(file_path)
        except Exception:
            pass
