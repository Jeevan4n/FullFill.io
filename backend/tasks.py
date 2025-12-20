import csv
import time
from sqlalchemy import func
from utils.database import get_session
from models.import_job import ImportJob
from models.product import Product

def process_csv(import_id, file_path):
    """Process CSV file and import products"""
    session = get_session()
    
    try:
        job = session.query(ImportJob).filter(ImportJob.id == import_id).first()
        if not job:
            print(f"Job {import_id} not found")
            return

        job.status = "parsing"
        session.commit()

        # Read and parse CSV
        with open(file_path, newline='', encoding="utf-8") as csvfile:
            reader = list(csv.DictReader(csvfile))
            job.total_rows = len(reader)
            job.status = "saving"
            session.commit()

            for index, row in enumerate(reader, start=1):
                time.sleep(0.001)  # Small delay to simulate processing
                
                sku = row.get("sku", "").strip()
                if not sku:
                    continue
                
                # Check if product exists (case-insensitive)
                existing = session.query(Product).filter(
                    func.lower(Product.sku) == sku.lower()
                ).first()
                
                if existing:
                    # Update existing product
                    existing.name = row.get("name")
                    existing.description = row.get("description")
                    print(f"Updated product: {sku}")
                else:
                    # Create new product
                    product = Product(
                        sku=sku,
                        name=row.get("name"),
                        description=row.get("description")
                    )
                    session.add(product)
                    print(f"Created product: {sku}")
                
                job.processed_rows = index
                session.commit()

        job.status = "completed"
        session.commit()
        print(f"Job {import_id} completed successfully!")

    except Exception as e:
        print(f"Error processing job {import_id}: {str(e)}")
        session.rollback()
        
        # Update job status
        job = session.query(ImportJob).filter(ImportJob.id == import_id).first()
        if job:
            job.status = "failed"
            job.error_message = str(e)
            session.commit()
    
    finally:
        session.close()
