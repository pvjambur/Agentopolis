"""Cross-process mission event bridge (Redis pub/sub).

The Celery worker that runs a mission is a SEPARATE process from the uvicorn
web server that holds the browser's WebSocket. The in-memory ws_manager cannot
bridge that gap, so negotiation events are published to Redis and the WS
endpoint (/ws/simulation/{mission_id}) subscribes and forwards them.
"""
from __future__ import annotations

import json
import logging

from app.services.cache import get_redis_client

logger = logging.getLogger(__name__)


def mission_channel(mission_id: str) -> str:
    return f"mission:{mission_id}"


def publish_mission_event(mission_id: str, event: dict) -> None:
    """Publish a single event to the mission's Redis channel (sync, Celery-safe)."""
    try:
        get_redis_client().publish(mission_channel(mission_id), json.dumps(event))
    except Exception as exc:  # never let a streaming failure break the negotiation
        logger.warning("publish_mission_event failed for %s: %s", mission_id, exc)
