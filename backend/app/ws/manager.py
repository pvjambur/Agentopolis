"""WebSocket connection manager — tracks active connections per mission, broadcasts events.
Events: agent_spawned, agent_moving, negotiation_round, deal_struck, payment_requested, etc.
Implemented Phase 3.
"""
from collections import defaultdict

from fastapi import WebSocket


class WebSocketManager:
    def __init__(self):
        self.active: dict[str, list[WebSocket]] = defaultdict(list)

    async def connect(self, websocket: WebSocket, mission_id: str):
        await websocket.accept()
        self.active[mission_id].append(websocket)

    def disconnect(self, websocket: WebSocket, mission_id: str):
        self.active[mission_id].remove(websocket)

    async def broadcast(self, mission_id: str, message: dict):
        for ws in self.active[mission_id]:
            await ws.send_json(message)


ws_manager = WebSocketManager()
