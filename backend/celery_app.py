from celery import Celery
from config.config import CELERY_BROKER_URL, CELERY_RESULT_BACKEND

celery = Celery(
    "celery_worker",
    broker=CELERY_BROKER_URL,
    backend=CELERY_RESULT_BACKEND,
    include=["tasks.import_tasks"],
)

celery.conf.update(
    task_track_started=True,
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
)

if __name__ == "__main__":
    import sys
    argv = ["worker"] + sys.argv[1:]
    celery.worker_main(argv)