FullFill.io – Product Import & Inventory Management System
📌 Project Summary

FullFill.io is a lightweight product import and inventory management system designed to handle large CSV product uploads efficiently using background processing. It enables users to manage products via a responsive frontend while tracking real-time import progress.

Key Capabilities

Upload and process large CSV files asynchronously

Deduplicate and upsert products using case-insensitive SKU

Real-time job progress updates via Server-Sent Events (SSE)

Full CRUD operations for products

Scalable architecture using background workers

🎯 Purpose

To provide a scalable and user-friendly system that allows businesses to:

Import up to 500,000+ products reliably

Avoid duplicate SKUs through intelligent upserts

Track import progress in real time

Manage product inventory through a modern UI

🧠 Business Logic
CSV Import Flow

User uploads a .csv file via POST /api/imports

Backend validates headers and creates an ImportJob

A Celery background task processes the CSV asynchronously

Progress updates are streamed to the frontend via SSE

Validation Rules

CSV must include sku, name, and price (case-insensitive)

Empty CSV or missing required headers → job marked as failed

Validation errors are stored in the job’s error message

Processing Rules

For each CSV row:

sku is normalized to lowercase

If SKU exists → product is updated

If SKU does not exist → product is created (active = true)

Invalid SKUs are skipped and counted as errors

Price parsing errors are tolerated (price set to null)

Job Lifecycle

ImportJob statuses:

queued

parsing

validating

completed

failed

cancelled

Additional features:

Retry failed or cancelled jobs

Cancel running jobs

Progress is committed every 1000 rows to preserve state

Cleanup

Uploaded CSV files are automatically deleted after job completion or failure

🏗️ Architecture & Components
Backend

Framework: Flask

ORM: SQLAlchemy

Background Worker: Celery

Broker / Result Backend: Redis

Database: PostgreSQL (configurable via DATABASE_URL)

Key Backend Files

app.py – API routes & web server

celery_worker.py – CSV processing worker

import_job.py – ImportJob model & progress tracking

product.py – Product model with SKU uniqueness

uploads/ – Temporary CSV storage

Frontend

Framework: Next.js (React)

Styling: Tailwind CSS

UI Components: Radix UI (custom wrappers)

Key Frontend Files

page.js – Product list, CRUD UI

package.json – Frontend dependencies

🔌 API Endpoints
Import APIs

POST /api/imports – Upload CSV & create import job

GET /api/imports/<job_id>/status – Poll job status

GET /api/imports/<job_id>/status-stream – SSE real-time updates

POST /api/imports/<job_id>/retry – Retry job

POST /api/imports/<job_id>/cancel – Cancel job

Product APIs

GET /api/products – List products (pagination, search, filters)

POST /api/products – Create product

PUT /api/products/<sku> – Update product (case-insensitive SKU)

DELETE /api/products/<sku> – Delete product

DELETE /api/products/bulk-delete – Delete all products

🖥️ Frontend Features
Product List

Server-side pagination (10 items per page)

Loading & empty-state UI

Columns: SKU, Name, Price, Status (Active/Inactive)

Filtering & Search

Free-text search across SKU, name, description

Status filters: All / Active / Inactive

Keyboard-friendly UX (Enter to apply)

CRUD Operations

Create product (modal dialog)

Edit product (SKU locked during edit)

Delete single product (confirmation dialog)

Bulk delete all products (destructive confirmation)

Import Navigation

Dedicated Import CSV tab

Live progress updates using SSE

🧪 Important Implementation Notes

SKU uniqueness enforced via case-insensitive DB index

CSV size limit: 500 MB

Progress calculated using processed_rows / total_rows

Periodic DB commits reduce long-running transactions

⚙️ Tech Stack

Backend

Python 3

Flask

SQLAlchemy

Celery

Redis

PostgreSQL

Frontend

Next.js (React)

Tailwind CSS

Radix UI

Dev Tools

Node.js / npm

pip / virtualenv

🚀 Setup & Run (Local Development)
Backend
python -m venv .venv
# Windows
.venv\Scripts\activate
# Unix
source .venv/bin/activate

pip install -r backend/requirements.txt


Ensure PostgreSQL and Redis are running.

# Example DATABASE_URL
export DATABASE_URL=postgresql://user:pass@localhost:5432/fullfil


Start services:

cd backend
celery -A celery_worker worker --loglevel=info
python app.py

Frontend
cd frontend
npm install
npm run dev


Open: http://localhost:3000