import os
import uuid
import csv
import logging
import json
from datetime import datetime
from flask import Flask, request, jsonify, Response
from flask_cors import CORS
from sqlalchemy import create_engine, text, or_, func
from sqlalchemy.orm import sessionmaker
from config.config import SQLALCHEMY_DATABASE_URI
from models.base import Base
from models.import_job import ImportJob
from models.product import Product
from celery_worker import process_csv_task
from utils.session_manager import get_session, safe_close, engine

app = Flask(__name__)
CORS(app)

UPLOAD_FOLDER = "uploads"
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Cache for active job streams (optional, not strictly needed)
active_streams = {}

def get_file_size(file_path):
    """Get file size in MB"""
    if not os.path.exists(file_path):
        return 0
    size_bytes = os.path.getsize(file_path)
    return round(size_bytes / (1024 * 1024), 2)

def validate_csv_structure(file_path):
    """Validate CSV structure by checking the first few rows"""
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            reader = csv.DictReader(f)
            if not reader.fieldnames:
                return False, "Empty CSV file"

            required_fields = ['sku', 'name', 'price']
            fieldnames_lower = [f.lower() for f in reader.fieldnames]
            missing_fields = [field for field in required_fields if field not in fieldnames_lower]

            if missing_fields:
                return False, f"Missing required fields: {', '.join(missing_fields)}"

            # Check first data row
            first_row = next(reader, None)
            if not first_row:
                return False, "No data rows found in CSV"

            return True, f"Valid structure: {len(reader.fieldnames)} columns"
    except Exception as e:
        return False, f"CSV validation error: {str(e)}"


@app.route("/api/imports", methods=["POST"])
def upload_csv():
    file = request.files.get("file")
    if not file:
        return jsonify({"error": "CSV file required"}), 400

    if not file.filename.lower().endswith('.csv'):
        return jsonify({"error": "Only CSV files are allowed"}), 400

    # Check file size (500MB limit)
    file.seek(0, os.SEEK_END)
    file_size_bytes = file.tell()
    file.seek(0)

    if file_size_bytes > 500 * 1024 * 1024:
        return jsonify({"error": "File too large. Maximum size is 500MB"}), 413

    job_id = str(uuid.uuid4())
    file_path = os.path.join(UPLOAD_FOLDER, f"{job_id}_{file.filename}")

    try:
        file.save(file_path)
    except Exception as e:
        logger.error(f"Failed to save file {file.filename}: {str(e)}")
        return jsonify({"error": "Failed to save file"}), 500

    # Validate CSV structure
    is_valid, validation_message = validate_csv_structure(file_path)

    session = get_session()
    response_data = None
    try:
        job = ImportJob(
            id=job_id,
            status="parsing" if is_valid else "failed",
            file_path=file_path,
            file_size=get_file_size(file_path),
            total_rows=0,
            processed_rows=0,
            success_count=0,
            error_count=0,
            error_message=None if is_valid else validation_message
        )
        session.add(job)
        session.commit()

        if is_valid:
            process_csv_task.delay(job_id)
            logger.info(f"Started processing job {job_id}")
        else:
            logger.warning(f"Validation failed for job {job_id}: {validation_message}")

        # Build response while the session is still open (avoid detached instance)
        response_data = {
            "job_id": job_id,
            "status": job.status,
            "message": validation_message if not is_valid else "File uploaded successfully"
        }

    except Exception as e:
        session.rollback()
        logger.error(f"Database error for job {job_id}: {str(e)}")
        return jsonify({"error": "Failed to create import job"}), 500
    finally:
        safe_close(session)

    return jsonify(response_data), 202

@app.route("/api/imports/<job_id>/status")
def get_status(job_id):
    session = get_session()
    try:
        job = session.get(ImportJob, job_id)
        if not job:
            return jsonify({"error": "Job not found"}), 404

        return jsonify(job.to_dict())
    finally:
        safe_close(session)


@app.route("/api/imports/<job_id>/status-stream")
def status_stream(job_id):
    def event_stream():
        session = get_session()
        try:
            job = session.get(ImportJob, job_id)
            if not job:
                yield f"data: {json.dumps({'error': 'Job not found'})}\n\n"
                return

            last_processed = job.processed_rows
            last_status = job.status

            while True:
                session.refresh(job)

                if job.status in ['completed', 'failed', 'cancelled']:
                    yield f"data: {json.dumps(job.to_dict())}\n\n"
                    break

                if (job.processed_rows != last_processed or job.status != last_status):
                    yield f"data: {json.dumps(job.to_dict())}\n\n"
                    last_processed = job.processed_rows
                    last_status = job.status

                import time
                time.sleep(1)

        except GeneratorExit:
            logger.info(f"Stream closed for job {job_id}")
        except Exception as e:
            logger.error(f"Error in stream for job {job_id}: {str(e)}")
            yield f"data: {json.dumps({'error': f'Stream error: {str(e)}'})}\n\n"
        finally:
            safe_close(session)

    return Response(event_stream(), mimetype="text/event-stream")


@app.route("/api/imports/<job_id>/retry", methods=["POST"])
def retry(job_id):
    session = get_session()
    try:
        job = session.get(ImportJob, job_id)
        if not job:
            return jsonify({"error": "Job not found"}), 404

        if job.status not in ['failed', 'cancelled']:
            return jsonify({"error": "Can only retry failed or cancelled jobs"}), 400

        job.status = "parsing"
        job.processed_rows = 0
        job.success_count = 0
        job.error_count = 0
        job.error_message = None
        job.updated_at = datetime.utcnow()

        session.commit()
        logger.info(f"Retrying job {job_id}")

        process_csv_task.delay(job_id)

        return jsonify({"message": "Retry started"}), 202
    except Exception as e:
        session.rollback()
        logger.error(f"Retry failed for job {job_id}: {str(e)}")
        return jsonify({"error": str(e)}), 500
    finally:
        safe_close(session)


@app.route("/api/imports/<job_id>/cancel", methods=["POST"])
def cancel(job_id):
    session = get_session()
    try:
        job = session.get(ImportJob, job_id)
        if not job:
            return jsonify({"error": "Job not found"}), 404

        if job.status in ['completed', 'failed', 'cancelled']:
            return jsonify({"error": "Cannot cancel a finished job"}), 400

        job.status = "cancelled"
        job.error_message = "Import cancelled by user"
        job.updated_at = datetime.utcnow()
        session.commit()

        logger.info(f"Cancelled job {job_id}")
        return jsonify({"message": "Import cancelled successfully"})
    except Exception as e:
        session.rollback()
        logger.error(f"Cancel failed for job {job_id}: {str(e)}")
        return jsonify({"error": str(e)}), 500
    finally:
        safe_close(session)


@app.route("/api/products", methods=["GET"])
def list_products():
    session = get_session()
    try:
        page = int(request.args.get("page", 1))
        per_page = int(request.args.get("per_page", 20))
        search = request.args.get("search", "").strip()
        active = request.args.get("active")

        query = session.query(Product)

        if active is not None:
            active_bool = active.lower() in ("true", "1", "yes")
            query = query.filter(Product.active == active_bool)

        if search:
            search_lower = search.lower()
            query = query.filter(
                or_(
                    func.lower(Product.sku).contains(search_lower),
                    func.lower(Product.name).contains(search_lower),
                    func.lower(Product.description).contains(search_lower),
                )
            )

        total = query.count()
        products = query.offset((page - 1) * per_page).limit(per_page).all()

        return jsonify({
            "data": [p.to_dict() for p in products],
            "total": total,
            "page": page,
            "per_page": per_page,
            "pages": (total + per_page - 1) // per_page
        })
    finally:
        safe_close(session)


@app.route("/api/products", methods=["POST"])
def create_product():
    data = request.json
    if not data or 'sku' not in data:
        return jsonify({"error": "SKU is required"}), 400

    session = get_session()
    try:
        sku = data["sku"].strip().lower()
        existing = session.query(Product).filter(func.lower(Product.sku) == sku).first()
        if existing:
            return jsonify({"error": "SKU already exists (case-insensitive)"}), 400

        product = Product(
            sku=sku,
            name=data.get("name"),
            description=data.get("description"),
            price=data.get("price"),
            active=data.get("active", True)
        )
        session.add(product)
        session.commit()
        return jsonify(product.to_dict()), 201
    except Exception as e:
        session.rollback()
        return jsonify({"error": str(e)}), 500
    finally:
        safe_close(session)


@app.route("/api/products/<sku>", methods=["PUT"])
def update_product(sku):
    data = request.json
    session = get_session()
    try:
        product = session.query(Product).filter(func.lower(Product.sku) == sku.lower()).first()
        if not product:
            return jsonify({"error": "Product not found"}), 404

        product.name = data.get("name", product.name)
        product.description = data.get("description", product.description)
        product.price = data.get("price", product.price)
        product.active = data.get("active", product.active)

        session.commit()
        return jsonify(product.to_dict())
    except Exception as e:
        session.rollback()
        return jsonify({"error": str(e)}), 500
    finally:
        safe_close(session)


@app.route("/api/products/<sku>", methods=["DELETE"])
def delete_product(sku):
    session = get_session()
    try:
        product = session.query(Product).filter(func.lower(Product.sku) == sku.lower()).first()
        if not product:
            return jsonify({"error": "Product not found"}), 404

        session.delete(product)
        session.commit()
        return jsonify({"message": "Product deleted"}), 200
    except Exception as e:
        session.rollback()
        return jsonify({"error": str(e)}), 500
    finally:
        safe_close(session)


@app.route("/api/products/bulk-delete", methods=["DELETE"])
def bulk_delete_products():
    session = get_session()
    try:
        count = session.query(Product).delete()
        session.commit()
        return jsonify({"message": f"Deleted {count} products"}), 200
    except Exception as e:
        session.rollback()
        return jsonify({"error": str(e)}), 500
    finally:
        safe_close(session)


@app.route("/api/health", methods=["GET"])
def health_check():
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        return jsonify({"status": "healthy", "timestamp": datetime.utcnow().isoformat()})
    except Exception as e:
        logger.error(f"Health check failed: {str(e)}")
        return jsonify({"status": "unhealthy", "error": str(e)}), 503


@app.errorhandler(413)
def too_large(e):
    return jsonify({"error": "File too large"}), 413

@app.errorhandler(500)
def internal_error(e):
    logger.error(f"Internal server error: {str(e)}")
    return jsonify({"error": "Internal server error"}), 500


if __name__ == "__main__":
    # Create tables if they don't exist
    Base.metadata.create_all(engine)
    app.run(debug=True, host='0.0.0.0', port=5000)