from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.router import api_router
from app.api.ws import router as ws_router
from app.config import settings


def create_app() -> FastAPI:
    app = FastAPI(title="Agentopolis", version="0.1.0")

    app.add_middleware(
        CORSMiddleware,
        allow_origins=[settings.frontend_url, "http://localhost:5173"],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.get("/health")
    async def health() -> dict:
        return {"status": "ok", "project": "agentopolis"}

    app.include_router(api_router)
    app.include_router(ws_router)  # WebSocket endpoints at /ws/*

    return app


app = create_app()
