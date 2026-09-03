"""WebSocket router — streams simulation events to connected clients."""
from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.ws.manager import ws_manager

router = APIRouter()


@router.websocket("/ws/simulation/{mission_id}")
async def simulation_ws(websocket: WebSocket, mission_id: str):
    """Phase 3: Live simulation event stream per mission."""
    await ws_manager.connect(websocket, mission_id)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        ws_manager.disconnect(websocket, mission_id)
