"""WebSocket connection manager — tracks active connections per mission, broadcasts events.
Events: agent_spawned, agent_moving, negotiation_round, deal_struck, payment_requested, etc.
Phase 3: full simulation streaming. Phase 1: skeleton + echo endpoint verified.
"""
from collections import defaultdict

from fastapi import WebSocket


class WebSocketManager:
    def __init__(self) -> None:
        # mission_id → list of sockets (broadcast pattern, Phase 3)
        self.active: dict[str, list[WebSocket]] = defaultdict(list)
        # client_id → single socket (direct send pattern, used by echo + Phase 3 agent events)
        self.clients: dict[str, WebSocket] = {}

    async def connect(self, websocket: WebSocket, mission_id: str) -> None:
        await websocket.accept()
        self.active[mission_id].append(websocket)

    async def connect_client(self, websocket: WebSocket, client_id: str) -> None:
        await websocket.accept()
        self.clients[client_id] = websocket

    def disconnect(self, websocket: WebSocket, mission_id: str) -> None:
        lst = self.active[mission_id]
        if websocket in lst:
            lst.remove(websocket)

    def disconnect_client(self, client_id: str) -> None:
        self.clients.pop(client_id, None)

    async def broadcast(self, mission_id: str, message: dict) -> None:
        dead: list[WebSocket] = []
        for ws in list(self.active[mission_id]):
            try:
                await ws.send_json(message)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.disconnect(ws, mission_id)

    async def send_event(self, client_id: str, event: dict) -> None:
        ws = self.clients.get(client_id)
        if ws:
            await ws.send_json(event)


ws_manager = WebSocketManager()
