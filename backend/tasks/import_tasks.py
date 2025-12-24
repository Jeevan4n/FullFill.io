import os
import csv
import time
import traceback
from decimal import Decimal, InvalidOperation
from datetime import datetime

from celery_worker import celery
from sqlalchemy import func

from utils.session_manager import get_session, safe_close
from models.import_job import ImportJob
from models.product import Product
from utils.webhooks import trigger_webhooks


@celery.task(bind=True, name="tasks.process_csv_import_task")
def process_csv_import_task(self, job_id: str, file_path: str):
    """
    Celery task: process CSV import.
    Args:
      - job_id: ImportJob.id (string UUID)
      - file_path: absolute or relative path to saved CSV
    """
    session = None
    try:
        session = get_session()
        job = session.get(ImportJob, job_id)
        if not job:
            return {"status": "error", "message": "Job not found"}

        # Mark processing
        job.status = "processing"
        job.processed_rows = 0
        job.success_count = 0
        job.error_count = 0
        job.updated_at = datetime.utcnow()
        session.commit()

        # Count rows (efficient streaming)
        total_rows = 0
        with open(file_path, "r", encoding="utf-8", errors="ignore") as f:
            reader = csv.reader(f)
            try:
                next(reader)  # skip header
            except StopIteration:
                total_rows = 0
            else:
                for _ in reader:
                    total_rows += 1

        if total_rows <= 0:
            job.status = "failed"
            job.error_message = "CSV contains no data rows"
            session.commit()
            return {"status": "error", "message": "Empty CSV"}

        job.total_rows = total_rows
        session.commit()

        # Processing parameters
        commit_interval = 500
        progress_interval = 100

        processed = 0
        created = 0
        updated = 0

        to_create = []
        to_update = []

        with open(file_path, "r", encoding="utf-8", errors="ignore") as f:
            reader = csv.DictReader(f)
            for row in reader:
                processed += 1
                try:
                    sku_raw = (row.get("sku") or "").strip()
                    sku = sku_raw.lower()
                    if not sku:
                        job.error_count += 1
                        continue

                    name = (row.get("name") or "").strip() or None
                    description = (row.get("description") or "").strip() or None
                    price_val = row.get("price")
                    price = None
                    if price_val not in (None, ""):
                        try:
                            price = Decimal(str(price_val))
                        except InvalidOperation:
                            price = None

                    # find existing product (case-insensitive)
                    existing = (
                        session.query(Product)
                        .filter(func.lower(Product.sku) == sku)
                        .first()
                    )

                    if existing:
                        existing.name = name or existing.name
                        existing.description = description or existing.description
                        if price is not None:
                            existing.price = price
                        existing.updated_at = datetime.utcnow()
                        to_update.append(existing)
                        updated += 1
                        # trigger per-item webhook after commit
                    else:
                        prod = Product(
                            sku=sku,
                            name=name,
                            description=description,
                            price=price,
                            active=True,
                        )
                        to_create.append(prod)
                        created += 1

                    job.success_count += 1

                except Exception:
                    job.error_count += 1
                    session.rollback()
                    continue

                # commit periodically
                if processed % commit_interval == 0:
                    if to_create:
                        session.bulk_save_objects(to_create)
                        to_create.clear()
                    if to_update:
                        for p in to_update:
                            session.merge(p)
                        to_update.clear()
                    job.processed_rows = processed
                    job.updated_at = datetime.utcnow()
                    session.commit()

                    # trigger progress state for celery UI
                    progress_pct = int((processed / total_rows) * 100)
                    self.update_state(
                        state="PROGRESS",
                        meta={
                            "current": processed,
                            "total": total_rows,
                            "progress": progress_pct,
                        },
                    )

                # update progress less frequently
                if processed % progress_interval == 0:
                    job.processed_rows = processed
                    job.updated_at = datetime.utcnow()
                    session.commit()

        # final commit of remaining objects
        if to_create:
            session.bulk_save_objects(to_create)
            to_create.clear()
        if to_update:
            for p in to_update:
                session.merge(p)
            to_update.clear()

        job.processed_rows = processed
        job.success_count = job.success_count or created + updated
        job.error_count = job.error_count or 0
        job.status = "completed"
        job.updated_at = datetime.utcnow()
        session.commit()

        # Trigger webhooks (simple: notify created/updated counts)
        try:
            trigger_webhooks("product.import.completed", {
                "job_id": job_id,
                "total_rows": total_rows,
                "processed": processed,
                "created": created,
                "updated": updated,
            })
        except Exception:
            pass

        # cleanup file
        try:
            os.remove(file_path)
        except Exception:
            pass

        return {
            "status": "completed",
            "total_processed": processed,
            "created": created,
            "updated": updated,
        }

    except Exception as exc:
        traceback.print_exc()
        try:
            if session:
                job = session.get(ImportJob, job_id) if job_id else None
                if job:
                    job.status = "failed"
                    job.error_message = str(exc)
                    job.updated_at = datetime.utcnow()
                    session.commit()
        except Exception:
            pass
        return {"status": "error", "message": str(exc)}
    finally:
        safe_close(session)