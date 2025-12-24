import os

SQLALCHEMY_DATABASE_URI = os.getenv(
    "DATABASE_URL",
    "postgresql://postgres:939252@localhost:5432/fullfil"
)

SQLALCHEMY_TRACK_MODIFICATIONS = False

CELERY_BROKER_URL = "redis://localhost:6379/0"
CELERY_RESULT_BACKEND = "redis://localhost:6379/0"


# import os
# from dotenv import load_dotenv

# load_dotenv()

# # ---------------- DATABASE (PostgreSQL on Render) ----------------
# SQLALCHEMY_DATABASE_URI = os.getenv(
#     "DATABASE_URL"
# )

# SQLALCHEMY_TRACK_MODIFICATIONS = False


# # ---------------- CELERY (Redis on Render) ----------------
# CELERY_BROKER_URL = os.getenv(
#     "REDIS_URL"
# )

CELERY_RESULT_BACKEND = os.getenv(
    "REDIS_URL"
)
