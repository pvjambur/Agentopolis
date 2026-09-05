"""WebSocket router — streams simulation events to connected clients.

The /ws/simulation/{mission_id} endpoint subscribes to the mission's Redis
channel and forwards every event the Celery worker publishes. Redis pub/sub is
what bridges the worker process → web process gap (see app/ws/events.py).
"""
import asyncio
import logging

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.config import settings
from app.ws.events import mission_channel
from app.ws.manager import ws_manager

logger = logging.getLogger(__name__)

router = APIRouter()


@router.websocket("/ws/simulation/{mission_id}")
async def simulation_ws(websocket: WebSocket, mission_id: str) -> None:
    """Live mission event stream. Forwards events published to Redis by the
    Celery mission task."""
    import redis.asyncio as aioredis

    await ws_manager.connect(websocket, mission_id)

    url = settings.upstash_redis_url or settings.celery_broker_url
    client = aioredis.from_url(url, decode_responses=True)
    pubsub = client.pubsub()
    await pubsub.subscribe(mission_channel(mission_id))

    async def pump_redis_to_ws() -> None:
        async for message in pubsub.listen():
            if message is None or message.get("type") != "message":
                continue
            await websocket.send_text(message["data"])

    pump_task = asyncio.create_task(pump_redis_to_ws())
    try:
        # Keep the socket open; also drain inbound frames (client pings/closes).
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        pass
    finally:
        pump_task.cancel()
        try:
            await pubsub.unsubscribe(mission_channel(mission_id))
            await pubsub.aclose()
            await client.aclose()
        except Exception:
            pass
        ws_manager.disconnect(websocket, mission_id)


@router.websocket("/ws/echo/{client_id}")
async def echo_ws(websocket: WebSocket, client_id: str) -> None:
    """Phase 1 verification: echo any received message back as JSON event."""
    await ws_manager.connect_client(websocket, client_id)
    try:
        await ws_manager.send_event(client_id, {
            "event": "connected",
            "client_id": client_id,
            "message": "Agentopolis WS echo ready",
        })
        while True:
            data = await websocket.receive_text()
            await ws_manager.send_event(client_id, {"event": "echo", "data": data})
    except WebSocketDisconnect:
        ws_manager.disconnect_client(client_id)
