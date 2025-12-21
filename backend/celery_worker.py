import csv
import os
import json
from celery import Celery
from sqlalchemy import func
from config.config import CELERY_BROKER_URL, CELERY_RESULT_BACKEND
from utils.session_manager import get_session, safe_close
from models.import_job import ImportJob
from models.product import Product

celery = Celery("celery_worker", broker=CELERY_BROKER_URL, backend=CELERY_RESULT_BACKEND)

@celery.task(bind=True)
def process_csv_task(self, job_id):
    session = get_session()
    try:
        job = session.query(ImportJob).get(job_id)
        if not job:
            return

        job.status = "parsing"
        session.commit()

        # Count rows
        with open(job.file_path, 'r', encoding='utf-8') as f:
            job.total_rows = sum(1 for _ in f) - 1
        job.processed_rows = 0
        job.success_count = 0
        job.error_count = 0
        session.commit()

        job.status = "validating"
        session.commit()

        with open(job.file_path, 'r', encoding='utf-8') as f:
            reader = csv.DictReader(f)
            batch = []
            for idx, row in enumerate(reader, start=1):
                session.refresh(job)
                if job.status == "cancelled":
                    session.commit()
                    return

                sku = row.get("sku", "").strip().lower()
                name = row.get("name", "").strip() or None
                desc = row.get("description", "").strip() or None
                price = None
                price_str = row.get("price", "").strip()
                if price_str:
                    try:
                        price = float(price_str)
                    except ValueError:
                        pass  # invalid price → null

                if not sku:
                    job.error_count += 1
                    continue

                product = session.query(Product).filter(func.lower(Product.sku) == sku).first()
                if product:
                    product.name = name
                    product.description = desc
                    product.price = price
                else:
                    product = Product(sku=sku, name=name, description=desc, price=price, active=True)
                    session.add(product)

                batch.append(product)
                job.processed_rows = idx
                job.success_count += 1

                if idx % 1000 == 0:
                    session.commit()

            # Final commit
            session.commit()

        job.status = "completed"
        session.commit()

    except Exception as e:
        session.rollback()
        job.status = "failed"
        job.error_message = str(e)
        session.commit()
    finally:
        safe_close(session)
        # Clean up file
        try:
            if os.path.exists(job.file_path):
                os.remove(job.file_path)
        except:
            pass