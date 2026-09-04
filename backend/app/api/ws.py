"""WebSocket router — streams simulation events to connected clients."""
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.ws.manager import ws_manager

router = APIRouter()


@router.websocket("/ws/simulation/{mission_id}")
async def simulation_ws(websocket: WebSocket, mission_id: str) -> None:
    """Phase 3: Live simulation event stream per mission."""
    await ws_manager.connect(websocket, mission_id)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
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
