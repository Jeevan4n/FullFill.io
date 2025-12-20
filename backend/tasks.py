from celery import Celery
from config import Config
from database import db
from models import Product, ImportJob
import csv

celery = Celery(
    "tasks",
    broker=Config.CELERY_BROKER_URL,
    backend=Config.CELERY_RESULT_BACKEND
)

@celery.task(bind=True)
def import_products(self, job_id, file_path):
    job = ImportJob.query.get(job_id)
    job.status = "processing"
    db.session.commit()

    with open(file_path, newline="") as f:
        reader = csv.DictReader(f)
        rows = list(reader)
        job.total = len(rows)
        db.session.commit()

        batch = []
        for i, row in enumerate(rows, start=1):
            batch.append(
                Product(
                    sku=row["sku"].lower(),
                    name=row.get("name"),
                    description=row.get("description")
                )
            )

            if len(batch) == 1000:
                db.session.bulk_save_objects(batch)
                db.session.commit()
                batch.clear()

            job.processed = i
            db.session.commit()

    job.status = "completed"
    db.session.commit()
