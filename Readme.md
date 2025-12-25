# FullFill.io – Product Import & Inventory Management System

## 📌 Project Summary

FullFill.io is a lightweight product import and inventory management system designed to handle large CSV product uploads efficiently using background processing. It enables users to manage products via a responsive frontend while tracking real-time import progress.

### Key Capabilities

- Upload and process large CSV files asynchronously
- Deduplicate and upsert products using case-insensitive SKU
- Real-time job progress updates via Server-Sent Events (SSE)
- Full CRUD operations for products
- Scalable architecture using background workers

## 🎯 Purpose

To provide a scalable and user-friendly system that allows businesses to:

- Import up to 500,000+ products reliably
- Avoid duplicate SKUs through intelligent upserts
- Track import progress in real time
- Manage product inventory through a modern UI

## 🧠 Business Logic

### CSV Import Flow

1. User uploads a `.csv` file via `POST /api/imports`
2. Backend validates headers and creates an `ImportJob`
3. A Celery background task processes the CSV asynchronously
4. Progress updates are streamed to the frontend via SSE

### Validation Rules

- CSV must include `sku`, `name`, and `price` (case-insensitive)
- Empty CSV or missing required headers → job marked as failed
- Validation errors are stored in the job's error message

### Processing Rules

For each CSV row:

- `sku` is normalized to lowercase
- If SKU exists → product is updated
- If SKU does not exist → product is created (`active = true`)
- Invalid SKUs are skipped and counted as errors
- Price parsing errors are tolerated (price set to `null`)

### Job Lifecycle

ImportJob statuses:

- `queued`
- `parsing`
- `validating`
- `processing`
- `completed`
- `failed`
- `cancelled`

Additional features:

- Retry failed or cancelled jobs
- Cancel running jobs
- Progress is committed every 1000 rows to preserve state

### Cleanup

- Uploaded CSV files are automatically deleted after job completion or failure

## 🏗️ Architecture & Components

### Backend

- **Framework:** Flask
- **ORM:** SQLAlchemy
- **Background Worker:** Celery
- **Broker / Result Backend:** Redis
- **Database:** PostgreSQL (configurable via `DATABASE_URL`)

#### Key Backend Files

- `app.py` – API routes & web server
- `celery_app.py` – Celery app & CSV processing tasks
- `import_job.py` – ImportJob model & progress tracking
- `product.py` – Product model with SKU uniqueness
- `uploads/` – Temporary CSV storage

### Frontend

- **Framework:** Next.js (React)
- **Styling:** Tailwind CSS
- **UI Components:** shadcn/ui (Radix UI wrappers)

#### Key Frontend Files

- `page.js` – Product list, CRUD UI
- `imports/page.js` – CSV import interface
- `webhooks/page.js` – Webhook listener / webhook debug UI
- `package.json` – Frontend dependencies

## 🔌 API Endpoints

### Import APIs

- `POST /api/imports` – Upload CSV & create import job
- `GET /api/imports/<job_id>/status` – Poll job status
- `GET /api/imports/<job_id>/status-stream` – SSE real-time updates
- `POST /api/imports/<job_id>/retry` – Retry job
- `POST /api/imports/<job_id>/cancel` – Cancel job

### Product APIs

- `GET /api/products` – List products (pagination, search, filters)
- `POST /api/products` – Create product
- `PUT /api/products/<sku>` – Update product (case-insensitive SKU)
- `DELETE /api/products/<sku>` – Delete product
- `DELETE /api/products/bulk-delete` – Delete all products

## 🖥️ Frontend Features

### Product List

- Server-side pagination (10 items per page)
- Loading & empty-state UI
- Columns: SKU, Name, Price, Status (Active/Inactive)

### Filtering & Search

- Free-text search across SKU, name, description
- Status filters: All / Active / Inactive
- Keyboard-friendly UX (Enter to apply filters)

### CRUD Operations

- Create product (modal dialog)
- Edit product (SKU locked during edit)
- Delete single product (confirmation dialog)
- Bulk delete all products (destructive confirmation)

### Import Interface

- Dedicated Import CSV tab/page
- Drag-and-drop file upload
- Live progress updates using SSE
- Retry failed imports
- Cancel running imports

## 🧪 Important Implementation Notes

- SKU uniqueness enforced via case-insensitive DB index
- CSV size limit: 500 MB
- Progress calculated using `processed_rows / total_rows`
- Periodic DB commits reduce long-running transactions
- Server-Sent Events (SSE) for real-time progress tracking

## ⚙️ Tech Stack

### Backend

- Python 3
- Flask
- SQLAlchemy
- Celery
- Redis
- PostgreSQL

### Frontend

- Next.js (React)
- Tailwind CSS
- shadcn/ui

### Dev Tools

- Node.js / npm
- pip / virtualenv

## 🚀 Setup & Run (Local Development)

### Prerequisites

- Python 3.8+
- Node.js 16+
- PostgreSQL
- Redis

### Backend Setup
```bash
# Create virtual environment
python -m venv .venv

# Activate virtual environment
# Windows (PowerShell)
.venv\Scripts\Activate.ps1
# Windows (cmd)
.venv\Scripts\activate.bat
# Unix/MacOS
source .venv/bin/activate

# Install dependencies
pip install -r backend/requirements.txt

# Set environment variables (examples)
# Windows (PowerShell)
$env:DATABASE_URL="postgresql://user:pass@localhost:5432/fullfill"
$env:REDIS_URL="redis://localhost:6379/0"
# Unix/MacOS
export DATABASE_URL=postgresql://user:pass@localhost:5432/fullfill
export REDIS_URL=redis://localhost:6379/0

# Initialize database (if provided)
cd backend
python init_db.py

# Start Celery worker (in a separate terminal)
# The Celery app object is named `celery` inside `backend/celery_app.py`,
# so target it as `celery_app.celery`.
celery -A celery_app.celery worker --loglevel=info

# If the Celery CLI has trouble on Windows, run via python -m:
python -m celery -A celery_app.celery worker --loglevel=info

# Example with concurrency and specific queue:
celery -A celery_app.celery worker --loglevel=info --concurrency=4 -Q default

# Start Flask server (in a separate terminal)
python app.py
```

Backend will run on `http://localhost:5000`

### Frontend Setup
```bash
cd frontend
npm install
npm run dev
```

Frontend will run on `http://localhost:3000`

## 📁 Project Structure
```
fullfill.io/
├── backend/
│   ├── app.py                 # Flask API server
│   ├── celery_app.py          # Celery app & task processor
│   ├── models/
│   │   ├── product.py         # Product model
│   │   └── import_job.py      # ImportJob model
│   ├── uploads/               # Temporary CSV storage
│   └── requirements.txt       # Python dependencies
├── frontend/
│   ├── app/
│   │   ├── page.js           # Products page
│   │   └── imports/
│   │       └── page.js       # Import CSV page
│   │   └── webhooks/
│   │       └── page.js       # Webhooks page
│   ├── components/ui/        # shadcn/ui components
│   └── package.json          # Node dependencies
└── README.md
```

## 🔧 Configuration

### Environment Variables

**Backend:**

- `DATABASE_URL` – PostgreSQL connection string
- `REDIS_URL` – Redis connection string (default: `redis://localhost:6379/0`)
- `UPLOAD_FOLDER` – CSV upload directory (default: `./uploads`)
- `MAX_CONTENT_LENGTH` – Max file size in bytes (default: 500MB)

**Frontend:**

- `NEXT_PUBLIC_API_URL` – Backend API URL (default: `http://localhost:5000`)

## 📝 CSV Format

Your CSV file must include these exact headers (case-insensitive):

| Header | Required | Description |
|--------|----------|-------------|
| `sku` | ✅ Yes | Unique product identifier (lowercase) |
| `name` | ✅ Yes | Product name |
| `description` | ❌ No | Product description |
| `price` | ❌ No | Product price (numeric) |
| `active` | ❌ No | Active status (true/false or 1/0) |

### Example CSV
```csv
sku,name,description,price,active
abc123,Wireless Mouse,"Compact and ergonomic",29.99,true
xyz789,USB Cable 2m,"Fast charging cable",12.50,true
demo001,Sample Product,Just a demo item,0.00,false
test2024,New Product 2024,,49.99,true
```

## 🤝 Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## 📄 License

This project is licensed under the MIT License.

## 🐛 Known Issues & Future Improvements

- [ ] Add user authentication
- [ ] Implement export to CSV functionality
- [ ] Add product categories and tags
- [ ] Support for bulk product updates
- [ ] Add API rate limiting
- [ ] Implement comprehensive error logging
- [ ] Add unit and integration tests

## 📞 Support

For issues and questions, please open an issue on GitHub.

