# app.py
import os
import uuid
import csv
import logging
import json
import time
from datetime import datetime
from flask import Flask, request, jsonify, Response
from flask_cors import CORS
from sqlalchemy import or_, func, text

from models.base import Base
from models.import_job import ImportJob
from models.product import Product
from models.webhook import Webhook
from utils.session_manager import get_session, safe_close, engine
from utils.webhooks import trigger_webhooks
from tasks.import_tasks import process_csv_import

app = Flask(__name__)
CORS(app, resources={r"/api/*": {"origins": "*"}})

UPLOAD_FOLDER = "uploads"
os.makedirs(UPLOAD_FOLDER, exist_ok=True)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


# ---------- CSV Import helpers ----------
def validate_csv_structure(path: str):
    try:
        with open(path, "r", encoding="utf-8") as f:
            reader = csv.DictReader(f)
            if not reader.fieldnames:
                return False, "Empty CSV"
            required = {"sku", "name", "price"}
            headers = {h.lower() for h in reader.fieldnames}
            missing = required - headers
            if missing:
                return False, f"Missing columns: {', '.join(sorted(missing))}"
            # Optionally check first data row exists
            first = next(reader, None)
            if first is None:
                return False, "No data rows found"
            return True, "Valid structure"
    except Exception as e:
        return False, f"CSV read error: {str(e)}"


# ---------- Import endpoints ----------
@app.route("/api/imports", methods=["POST"])
def upload_csv():
    file = request.files.get("file")
    if not file or not file.filename.lower().endswith(".csv"):
        return jsonify({"error": "Valid CSV file required"}), 400

    file.seek(0, os.SEEK_END)
    file_size_bytes = file.tell()
    file.seek(0)
    if file_size_bytes > 1500 * 1024 * 1024:
        return jsonify({"error": "File too large (>1500MB)"}), 413

    job_id = str(uuid.uuid4())
    file_path = os.path.join(UPLOAD_FOLDER, f"{job_id}_{file.filename}")

    try:
        file.save(file_path)
    except Exception as e:
        logger.error("File save failed: %s", e)
        return jsonify({"error": "Failed to save file"}), 500

    is_valid, msg = validate_csv_structure(file_path)
    session = get_session()
    try:
        job = ImportJob(
            id=job_id,
            status="queued" if is_valid else "failed",
            file_path=file_path,
            file_size_mb=file_size_bytes / (1024 * 1024),
            error_message=None if is_valid else msg,
        )
        session.add(job)
        session.commit()

        if is_valid:
            process_csv_import.delay(job_id)
            logger.info("Queued import job %s", job_id)
        else:
            logger.warning("Invalid CSV for job %s: %s", job_id, msg)

        return (
            jsonify(
                {
                    "job_id": job_id,
                    "status": job.status,
                    "message": msg if not is_valid else "Upload successful, processing queued",
                }
            ),
            202,
        )
    except Exception as e:
        session.rollback()
        logger.error("Import job creation failed: %s", e)
        return jsonify({"error": "Failed to create job"}), 500
    finally:
        safe_close(session)


@app.route("/api/imports/<job_id>/status", methods=["GET"])
def get_import_status(job_id):
    session = get_session()
    try:
        job = session.get(ImportJob, job_id)
        if not job:
            return jsonify({"error": "Job not found"}), 404
        return jsonify(job.to_dict())
    finally:
        safe_close(session)


@app.route("/api/imports/<job_id>/status-stream", methods=["GET"])
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

                if job.status in ["completed", "failed", "cancelled"]:
                    yield f"data: {json.dumps(job.to_dict())}\n\n"
                    break

                if job.processed_rows != last_processed or job.status != last_status:
                    yield f"data: {json.dumps(job.to_dict())}\n\n"
                    last_processed = job.processed_rows
                    last_status = job.status

                time.sleep(1)
        except GeneratorExit:
            logger.info("SSE client disconnected for job %s", job_id)
        except Exception as e:
            logger.error("Error in SSE for job %s: %s", job_id, e)
            yield f"data: {json.dumps({'error': f'Stream error: {str(e)}'})}\n\n"
        finally:
            safe_close(session)

    return Response(event_stream(), mimetype="text/event-stream")


@app.route("/api/imports/<job_id>/retry", methods=["POST"])
def retry_import(job_id):
    session = get_session()
    try:
        job = session.get(ImportJob, job_id)
        if not job:
            return jsonify({"error": "Job not found"}), 404

        if job.status not in ["failed", "cancelled"]:
            return jsonify({"error": "Can only retry failed or cancelled jobs"}), 400

        job.status = "queued"
        job.processed_rows = 0
        job.success_count = 0
        job.error_count = 0
        job.error_message = None
        job.updated_at = datetime.utcnow()
        session.commit()

        process_csv_import.delay(job_id)
        logger.info("Retrying import job %s", job_id)
        return jsonify({"message": "Retry started"}), 202
    except Exception as e:
        session.rollback()
        logger.error("Retry failed for job %s: %s", job_id, e)
        return jsonify({"error": "Retry failed"}), 500
    finally:
        safe_close(session)


@app.route("/api/imports/<job_id>/cancel", methods=["POST"])
def cancel_import(job_id):
    session = get_session()
    try:
        job = session.get(ImportJob, job_id)
        if not job:
            return jsonify({"error": "Job not found"}), 404

        if job.status in ["completed", "failed", "cancelled"]:
            return jsonify({"error": "Cannot cancel a finished job"}), 400

        job.status = "cancelled"
        job.error_message = "Import cancelled by user"
        job.updated_at = datetime.utcnow()
        session.commit()
        logger.info("Cancelled import job %s", job_id)
        return jsonify({"message": "Import cancelled successfully"}), 200
    except Exception as e:
        session.rollback()
        logger.error("Cancel failed for job %s: %s", job_id, e)
        return jsonify({"error": "Cancel failed"}), 500
    finally:
        safe_close(session)


# ---------- Products ----------
@app.route("/api/products", methods=["GET"])
def list_products():
    session = get_session()
    try:
        page = int(request.args.get("page", 1))
        per_page = int(request.args.get("per_page", 20))
        search = (request.args.get("search") or "").strip().lower()
        active_str = request.args.get("active")

        query = session.query(Product)

        if active_str is not None:
            active = active_str.lower() in ("true", "1", "yes")
            query = query.filter(Product.active == active)

        if search:
            query = query.filter(
                or_(
                    func.lower(Product.sku).contains(search),
                    func.lower(Product.name).contains(search),
                    func.lower(Product.description).contains(search),
                )
            )

        total = query.count()
        items = query.offset((page - 1) * per_page).limit(per_page).all()

        return jsonify(
            {
                "data": [p.to_dict() for p in items],
                "total": total,
                "page": page,
                "per_page": per_page,
                "pages": (total + per_page - 1) // per_page,
            }
        )
    finally:
        safe_close(session)


@app.route("/api/products", methods=["POST"])
def create_product():
    data = request.json or {}
    if "sku" not in data:
        return jsonify({"error": "SKU required"}), 400

    session = get_session()
    try:
        sku = data["sku"].strip().lower()
        if session.query(Product).filter(func.lower(Product.sku) == sku).first():
            return jsonify({"error": "SKU already exists (case-insensitive)"}), 409

        product = Product(
            sku=sku,
            name=(data.get("name") or "").strip(),
            description=data.get("description"),
            price=float(data.get("price")) if data.get("price") is not None else None,
            active=data.get("active", True),
        )
        session.add(product)
        session.commit()

        try:
            trigger_webhooks("product.created", product.to_dict())
        except Exception:
            logger.exception("Trigger webhooks (product.created) failed")

        return jsonify(product.to_dict()), 201
    except Exception as e:
        session.rollback()
        logger.error("Create product failed: %s", e)
        return jsonify({"error": "Create failed"}), 500
    finally:
        safe_close(session)


@app.route("/api/products/<sku>", methods=["PUT"])
def update_product(sku):
    data = request.json or {}
    session = get_session()
    try:
        product = session.query(Product).filter(func.lower(Product.sku) == sku.lower()).first()
        if not product:
            return jsonify({"error": "Product not found"}), 404

        product.name = data.get("name", product.name)
        product.description = data.get("description", product.description)
        product.price = float(data.get("price")) if "price" in data else product.price
        product.active = data.get("active", product.active)

        session.commit()

        try:
            trigger_webhooks("product.updated", product.to_dict())
        except Exception:
            logger.exception("Trigger webhooks (product.updated) failed")

        return jsonify(product.to_dict())
    except Exception as e:
        session.rollback()
        logger.error("Update product failed: %s", e)
        return jsonify({"error": "Update failed"}), 500
    finally:
        safe_close(session)


@app.route("/api/products/<sku>", methods=["DELETE"])
def delete_product(sku):
    session = get_session()
    try:
        product = session.query(Product).filter(func.lower(Product.sku) == sku.lower()).first()
        if not product:
            return jsonify({"error": "Not found"}), 404

        product_data = product.to_dict()
        session.delete(product)
        session.commit()

        try:
            trigger_webhooks("product.deleted", product_data)
        except Exception:
            logger.exception("Trigger webhooks (product.deleted) failed")

        return jsonify({"message": "Product deleted"})
    except Exception as e:
        session.rollback()
        logger.error("Delete product failed: %s", e)
        return jsonify({"error": "Delete failed"}), 500
    finally:
        safe_close(session)


@app.route("/api/products/bulk-delete", methods=["DELETE"])
def bulk_delete_products():
    session = get_session()
    try:
        count = session.query(Product).delete()
        session.commit()
        try:
            trigger_webhooks("product.bulk_deleted", {"deleted_count": count})
        except Exception:
            logger.exception("Trigger webhooks (product.bulk_deleted) failed")
        return jsonify({"message": f"Deleted {count} products"})
    except Exception as e:
        session.rollback()
        logger.error("Bulk delete failed: %s", e)
        return jsonify({"error": "Bulk delete failed"}), 500
    finally:
        safe_close(session)


# ---------- Webhook endpoints ----------
@app.route("/api/webhooks", methods=["GET"])
def list_webhooks():
    session = get_session()
    try:
        hooks = session.query(Webhook).all()
        return jsonify([h.to_dict() for h in hooks])
    finally:
        safe_close(session)


@app.route("/api/webhooks/<int:webhook_id>", methods=["GET"])
def get_webhook(webhook_id):
    session = get_session()
    try:
        hook = session.get(Webhook, webhook_id)
        if not hook:
            return jsonify({"error": "Not found"}), 404
        return jsonify(hook.to_dict())
    finally:
        safe_close(session)


@app.route("/api/webhooks", methods=["POST"])
def create_webhook():
    data = request.json or {}
    if not data.get("url") or not data.get("event_type"):
        return jsonify({"error": "url and event_type required"}), 400

    session = get_session()
    try:
        hook = Webhook(
            url=data["url"].strip(),
            event_type=data["event_type"].strip(),
            enabled=data.get("enabled", True),
            secret=data.get("secret") or None,
        )
        session.add(hook)
        session.commit()
        return jsonify(hook.to_dict()), 201
    except Exception as e:
        session.rollback()
        logger.error("Create webhook failed: %s", e)
        return jsonify({"error": "Create webhook failed"}), 500
    finally:
        safe_close(session)


@app.route("/api/webhooks/<int:webhook_id>", methods=["PUT"])
def update_webhook(webhook_id):
    data = request.json or {}
    session = get_session()
    try:
        hook = session.get(Webhook, webhook_id)
        if not hook:
            return jsonify({"error": "Not found"}), 404

        if "url" in data:
            hook.url = data["url"].strip()
        if "event_type" in data:
            hook.event_type = data["event_type"].strip()
        if "enabled" in data:
            hook.enabled = bool(data["enabled"])
        if "secret" in data:
            hook.secret = data.get("secret") or None

        hook.updated_at = datetime.utcnow()
        session.commit()
        return jsonify(hook.to_dict())
    except Exception as e:
        session.rollback()
        logger.error("Update webhook failed: %s", e)
        return jsonify({"error": "Update failed"}), 500
    finally:
        safe_close(session)


@app.route("/api/webhooks/<int:webhook_id>", methods=["DELETE"])
def delete_webhook(webhook_id):
    session = get_session()
    try:
        hook = session.get(Webhook, webhook_id)
        if not hook:
            return jsonify({"error": "Not found"}), 404
        session.delete(hook)
        session.commit()
        return jsonify({"message": "Webhook deleted successfully"})
    except Exception as e:
        session.rollback()
        logger.error("Delete webhook failed: %s", e)
        return jsonify({"error": "Delete failed"}), 500
    finally:
        safe_close(session)


@app.route("/api/webhooks/<int:webhook_id>/test", methods=["POST"])
def test_webhook(webhook_id):
    session = get_session()
    try:
        hook = session.get(Webhook, webhook_id)
        if not hook:
            return jsonify({"error": "Not found"}), 404

        payload = request.get_json() or {
            "event": "webhook.test",
            "message": "This is a test webhook trigger",
            "timestamp": datetime.utcnow().isoformat(),
        }

        result = trigger_webhooks(hook.event_type, payload, single_hook=hook)
        return jsonify({"webhook_id": hook.id, "url": hook.url, "result": result[0] if result else {"error": "No result"}})
    finally:
        safe_close(session)


# ---------- Health & Stats ----------
@app.route("/api/health", methods=["GET"])
def health():
    try:
        with engine.connect() as conn:
            conn.execute(text("SELECT 1"))
        return jsonify({"status": "healthy", "timestamp": datetime.utcnow().isoformat()})
    except Exception as e:
        logger.error("Health check failed: %s", e)
        return jsonify({"status": "unhealthy", "error": str(e)}), 503


@app.route("/api/products/stats", methods=["GET"])
def product_stats():
    session = get_session()
    try:
        total_products = session.query(func.count(Product.id)).scalar() or 0
        active_products = session.query(func.count(Product.id)).filter(Product.active == True).scalar() or 0
        avg_price = session.query(func.avg(Product.price)).filter(Product.price.isnot(None)).scalar() or 0.0

        return jsonify(
            {
                "total_products": int(total_products),
                "active_products": int(active_products),
                "average_price": round(float(avg_price), 2),
            }
        )
    finally:
        safe_close(session)


# ---------- Error handlers ----------
@app.errorhandler(413)
def payload_too_large(e):
    return jsonify({"error": "File too large"}), 413


@app.errorhandler(500)
def handle_500(e):
    logger.exception("Internal server error")
    return jsonify({"error": "Internal server error"}), 500


if __name__ == "__main__":
    Base.metadata.create_all(engine)
    app.run(debug=True, host="0.0.0.0", port=5000)