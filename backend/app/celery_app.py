"""Celery application instance. Broker and backend read from env.

Upstash Redis uses rediss:// (TLS). Celery requires an explicit ssl_cert_reqs
parameter on rediss URLs, so we append it if missing.
"""
from celery import Celery

from app.config import settings


def _normalize_rediss(url: str | None) -> str:
    if not url:
        return "redis://localhost:6379/0"
    if url.startswith("rediss://") and "ssl_cert_reqs" not in url:
        sep = "&" if "?" in url else "?"
        return f"{url}{sep}ssl_cert_reqs=CERT_NONE"
    return url


_broker = _normalize_rediss(settings.celery_broker_url or settings.upstash_redis_url)
_backend = _normalize_rediss(settings.celery_result_backend or settings.upstash_redis_url)

celery_app = Celery(
    "agentopolis",
    broker=_broker,
    backend=_backend,
    include=["app.agents.mission_runner"],
)

celery_app.conf.update(
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    timezone="UTC",
    enable_utc=True,
    broker_connection_retry_on_startup=True,
)
