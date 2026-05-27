"""Celery application configuration for DataPilot background tasks."""

from celery import Celery
from app.config import settings

celery_app = Celery(
    "datapilot",
    broker=settings.CELERY_BROKER_URL,
    backend=settings.CELERY_RESULT_BACKEND,
)

celery_app.conf.update(
    task_serializer="json",
    accept_content=["json"],
    result_serializer="json",
    result_expires=86400,       # 24 hours
    task_time_limit=1800,       # 30 min hard limit
    task_soft_time_limit=1500,  # 25 min soft limit
    task_track_started=True,
    worker_prefetch_multiplier=1,
)

# Auto-discover tasks in the tasks package
celery_app.autodiscover_tasks(["app.tasks"])
