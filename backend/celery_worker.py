import csv
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
        with open(job.file_path, encoding="utf-8") as f:
            job.total_rows = sum(1 for _ in f) - 1
        session.commit()

        job.status = "importing"
        session.commit()

        with open(job.file_path, encoding="utf-8") as f:
            reader = csv.DictReader(f)

            for idx, row in enumerate(reader, start=1):
                # cancellation support
                session.refresh(job)
                if job.status == "cancelled":
                    return

                sku = row["sku"].strip().lower()

                product = session.query(Product).filter(
                    func.lower(Product.sku) == sku
                ).first()

                if product:
                    product.name = row.get("name")
                    product.description = row.get("description")
                else:
                    session.add(Product(
                        sku=sku,
                        name=row.get("name"),
                        description=row.get("description"),
                        active=True
                    ))

                job.processed_rows = idx

                if idx % 1000 == 0:
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
