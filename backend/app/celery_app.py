"""Celery application instance. Broker and backend read from env.

Upstash Redis uses rediss:// (TLS). Celery requires an explicit ssl_cert_reqs
parameter on rediss URLs, so we append it if missing.
"""
import os
from celery import Celery

from app.config import settings


def _normalize_rediss(url: str | None) -> str:
    if not url or not str(url).strip():
        default_host = os.getenv("REDIS_HOST", "redis")
        return f"redis://{default_host}:6379/0"
    url_str = str(url).strip()
    if url_str.startswith("rediss://") and "ssl_cert_reqs" not in url_str:
        sep = "&" if "?" in url_str else "?"
        return f"{url_str}{sep}ssl_cert_reqs=CERT_NONE"
    return url_str


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
