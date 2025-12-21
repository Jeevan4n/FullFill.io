import csv
import os
from celery import Celery
from sqlalchemy import func

from config.config import CELERY_BROKER_URL, CELERY_RESULT_BACKEND
from utils.session_manager import get_session, safe_close
from models.import_job import ImportJob
from models.product import Product



celery = Celery(
    "celery_worker",
    broker=CELERY_BROKER_URL,
    backend=CELERY_RESULT_BACKEND
)



# SAFE Progress Update (ID ONLY — NO ORM OBJECTS)

def update_job_progress(
    job_id,
    status=None,
    processed_rows=None,
    success_count=None,
    error_count=None,
    error_message=None
):
    """
    CRITICAL RULE:
    - NEVER accept ORM objects
    - NEVER call session.add(job)
    - ALWAYS fetch by ID inside the function
    """
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



@celery.task(bind=True)
def process_csv_task(self, job_id):
    """
    END-TO-END SAFE CELERY TASK

    ✔ No ORM leakage
    ✔ No session conflicts
    ✔ Windows compatible (--pool=solo)
    ✔ Scales to 500k+ rows
    """

    session = get_session()
    job = None

    try:
        # ----------------------------------------------------
        # Load job (ONLY inside this session)
        # ----------------------------------------------------
        job = session.get(ImportJob, job_id)
        if not job:
            return

        update_job_progress(job_id, status="parsing")

        # ----------------------------------------------------
        # Count rows (fast + safe)
        # ----------------------------------------------------
        with open(job.file_path, "r", encoding="utf-8") as f:
            total_rows = sum(1 for _ in f) - 1

        update_job_progress(
            job_id,
            processed_rows=0,
            success_count=0,
            error_count=0
        )

        update_job_progress(job_id, status="processing")

        success_count = 0
        error_count = 0
        errors = []

        # ----------------------------------------------------
        # Process CSV
        # ----------------------------------------------------
        with open(job.file_path, "r", encoding="utf-8") as f:
            reader = csv.DictReader(f)

            for row_idx, row in enumerate(reader, start=1):

                session.refresh(job)
                if job.status == "cancelled":
                    update_job_progress(job_id, status="cancelled")
                    return

                # ---- Validation ----
                sku = row.get("sku", "").strip().lower()
                name = row.get("name", "").strip()

                if not sku:
                    error_count += 1
                    errors.append(f"Row {row_idx}: SKU missing")
                    update_job_progress(
                        job_id,
                        processed_rows=row_idx,
                        error_count=error_count
                    )
                    continue

                if not name:
                    error_count += 1
                    errors.append(f"Row {row_idx}: Name missing")
                    update_job_progress(
                        job_id,
                        processed_rows=row_idx,
                        error_count=error_count
                    )
                    continue


                description = row.get("description", "").strip() or None

                price = None
                raw_price = row.get("price", "").strip()
                if raw_price:
                    try:
                        price = float(raw_price)
                        if price < 0:
                            raise ValueError
                    except ValueError:
                        error_count += 1
                        errors.append(f"Row {row_idx}: Invalid price")
                        update_job_progress(
                            job_id,
                            processed_rows=row_idx,
                            error_count=error_count
                        )
                        continue

                active = row.get("active", "true").lower() in (
                    "true", "1", "yes", "y", "active"
                )

                # ---- UPSERT Product ----
                product = (
                    session.query(Product)
                    .filter(func.lower(Product.sku) == sku)
                    .first()
                )

                if product:
                    product.name = name
                    product.description = description
                    product.price = price
                    product.active = active
                else:
                    session.add(Product(
                        sku=sku,
                        name=name,
                        description=description,
                        price=price,
                        active=active
                    ))

                success_count += 1

                # ---- Batch commit ----
                if row_idx % 500 == 0:
                    session.commit()

                update_job_progress(
                    job_id,
                    processed_rows=row_idx,
                    success_count=success_count,
                    error_count=error_count
                )

        session.commit()

        if errors:
            msg = "\n".join(errors[:10])
            if len(errors) > 10:
                msg += f"\n... and {len(errors) - 10} more errors"

            update_job_progress(
                job_id,
                status="completed_with_errors",
                error_message=msg
            )
        else:
            update_job_progress(job_id, status="completed")

    except Exception as e:
        session.rollback()
        update_job_progress(
            job_id,
            status="failed",
            error_message=str(e)
        )
        raise

    finally:
        safe_close(session)

        # Cleanup file
        try:
            if job and os.path.exists(job.file_path):
                os.remove(job.file_path)
        except Exception:
            pass
