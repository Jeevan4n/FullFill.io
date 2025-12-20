import os
import uuid
from flask import Flask, request, jsonify
from flask_sqlalchemy import SQLAlchemy
from flask_cors import CORS
from config.config import SQLALCHEMY_DATABASE_URI
from models.import_job import ImportJob
from celery_worker import process_csv_task

app = Flask(__name__)
CORS(app)

app.config["SQLALCHEMY_DATABASE_URI"] = SQLALCHEMY_DATABASE_URI
app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False

db = SQLAlchemy(app)

UPLOAD_FOLDER = "uploads"
os.makedirs(UPLOAD_FOLDER, exist_ok=True)



@app.route("/api/imports", methods=["POST"])
def upload_csv():
    file = request.files.get("file")
    if not file:
        return {"error": "CSV file required"}, 400

    job_id = str(uuid.uuid4())
    file_path = os.path.join(UPLOAD_FOLDER, f"{job_id}_{file.filename}")
    file.save(file_path)

    job = ImportJob(
        id=job_id,
        status="queued",
        file_path=file_path
    )
    db.session.add(job)
    db.session.commit()

    process_csv_task.delay(job_id)

    return {"job_id": job_id, "status": "queued"}, 202

@app.route("/api/imports/<job_id>/status")
def get_status(job_id):
    job = ImportJob.query.get(job_id)
    if not job:
        return {"error": "Not found"}, 404
    return job.to_dict()

@app.route("/api/imports/<job_id>/retry", methods=["POST"])
def retry(job_id):
    job = ImportJob.query.get(job_id)
    if not job:
        return {"error": "Not found"}, 404

    job.status = "queued"
    job.processed_rows = 0
    job.error_message = None
    db.session.commit()

    process_csv_task.delay(job_id)
    return {"message": "Retry started"}, 202

@app.route("/api/imports/<job_id>/cancel", methods=["POST"])
def cancel(job_id):
    job = ImportJob.query.get(job_id)
    if not job:
        return {"error": "Not found"}, 404

    job.status = "cancelled"
    db.session.commit()
    return {"message": "Cancelled"}

if __name__ == "__main__":
    app.run(debug=True)
