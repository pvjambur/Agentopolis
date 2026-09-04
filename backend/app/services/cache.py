"""Upstash Redis cache — set/get wrapper, also used as Celery broker."""
from functools import lru_cache

import redis

from app.config import settings


@lru_cache(maxsize=1)
def get_redis_client() -> redis.Redis:
    url = settings.upstash_redis_url or settings.celery_broker_url
    if not url:
        raise RuntimeError(
            "UPSTASH_REDIS_URL (or CELERY_BROKER_URL) must be set. "
            "Create a free Upstash Redis instance at https://upstash.com "
            "and set the Redis URL in .env"
        )
    return redis.from_url(url, decode_responses=True, socket_connect_timeout=5)
