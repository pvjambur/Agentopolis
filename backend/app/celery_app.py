"""Celery application instance. Broker and backend read from env."""
from celery import Celery

from app.config import settings

celery_app = Celery(
    "agentopolis",
    broker=settings.celery_broker_url or "redis://localhost:6379/0",
    backend=settings.celery_result_backend or "redis://localhost:6379/0",
    include=["app.agents.orchestrator"],
)

celery_app.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    timezone="UTC",
    enable_utc=True,
)
