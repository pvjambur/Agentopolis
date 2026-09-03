from fastapi import FastAPI


def create_app() -> FastAPI:
    app = FastAPI(title="Agentopolis", version="0.1.0")

    @app.get("/health")
    async def health():
        return {"status": "ok", "project": "agentopolis"}

    return app


app = create_app()
