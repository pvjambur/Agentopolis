"""Internal health check — dev-only (APP_ENV=local), never ships to production.
GET /api/v1/internal/health-full → real connection test for every external service.
"""
import asyncio
import time
from concurrent.futures import ThreadPoolExecutor

from fastapi import APIRouter, HTTPException, Request

from app.config import settings

router = APIRouter()

_executor = ThreadPoolExecutor(max_workers=6, thread_name_prefix="health")


# ── helpers ──────────────────────────────────────────────────────────────────


def _supabase_sync() -> dict:
    try:
        from app.db.supabase_client import get_supabase_client

        sb = get_supabase_client()
        result = sb.table("users").select("id").limit(1).execute()
        return {"ok": True, "row_count": len(result.data)}
    except Exception as exc:
        return {"ok": False, "error": str(exc)}


def _pinecone_sync() -> dict:
    try:
        from app.db.pinecone_client import get_pinecone_index

        index = get_pinecone_index()
        # 384-dim zero vector — validates write access without semantic meaning
        test_vec = [round(0.01 * (i % 100), 4) for i in range(384)]
        index.upsert(vectors=[{
            "id": "__health-check__",
            "values": test_vec,
            "metadata": {"source": "health-full"},
        }])
        stats = index.describe_index_stats()
        return {
            "ok": True,
            "total_vectors": stats.total_vector_count,
            "dimension": stats.dimension,
        }
    except Exception as exc:
        return {"ok": False, "error": str(exc)}


def _redis_sync() -> dict:
    try:
        from app.services.cache import get_redis_client

        r = get_redis_client()
        r.set("__health-check__", "agentopolis-phase1", ex=60)
        val = r.get("__health-check__")
        return {"ok": True, "test_value": val}
    except Exception as exc:
        return {"ok": False, "error": str(exc)}


def _razorpay_sync() -> dict:
    try:
        import razorpay

        if not settings.razorpay_key_id or not settings.razorpay_key_secret:
            return {
                "ok": False,
                "error": "RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET not set — add test-mode keys from Razorpay Dashboard",
            }
        client = razorpay.Client(
            auth=(settings.razorpay_key_id, settings.razorpay_key_secret)
        )
        # Read-only call: list most recent order (count=1)
        orders = client.order.all({"count": 1})
        return {
            "ok": True,
            "test_mode": True,
            "items_returned": len(orders.get("items", [])),
        }
    except Exception as exc:
        return {"ok": False, "error": str(exc)}


def _anthropic_sync() -> dict:
    try:
        import anthropic

        if not settings.anthropic_api_key:
            return {
                "ok": False,
                "error": "ANTHROPIC_API_KEY not set — add your Anthropic key to .env",
            }
        client = anthropic.Anthropic(api_key=settings.anthropic_api_key)
        # Use Haiku for cheapest possible health-check call
        response = client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=20,
            messages=[{"role": "user", "content": "Reply with exactly: Agentopolis backend connected."}],
        )
        # content[0] may be TextBlock, ThinkingBlock, etc. — guard with hasattr
        first = response.content[0]
        reply = first.text if hasattr(first, "text") else repr(first)
        return {"ok": True, "reply": reply}
    except Exception as exc:
        return {"ok": False, "error": str(exc)}


def _websocket_check(request: Request) -> dict:
    try:
        from app.ws.manager import ws_manager

        ws_routes = sorted(
            r.path  # type: ignore[attr-defined]
            for r in request.app.routes
            if hasattr(r, "path") and "/ws/" in r.path
        )
        return {
            "ok": True,
            "manager_initialized": True,
            "active_missions": len(ws_manager.active),
            "active_clients": len(ws_manager.clients),
            "ws_routes": ws_routes,
        }
    except Exception as exc:
        return {"ok": False, "error": str(exc)}


# ── endpoint ─────────────────────────────────────────────────────────────────


@router.get("/health-full")
async def health_full(request: Request) -> dict:
    """Run live connection tests for every external service.
    Gated to APP_ENV=local — returns 404 in production.
    """
    if settings.app_env != "local":
        raise HTTPException(status_code=404)

    loop = asyncio.get_event_loop()
    t0 = time.monotonic()

    # Run all blocking checks concurrently in the thread pool
    results = await asyncio.gather(
        loop.run_in_executor(_executor, _supabase_sync),
        loop.run_in_executor(_executor, _pinecone_sync),
        loop.run_in_executor(_executor, _redis_sync),
        loop.run_in_executor(_executor, _razorpay_sync),
        loop.run_in_executor(_executor, _anthropic_sync),
    )

    supabase, pinecone, redis_r, razorpay, anthropic = results
    websocket = _websocket_check(request)

    elapsed_ms = round((time.monotonic() - t0) * 1000, 1)

    all_ok = all(r["ok"] for r in [supabase, pinecone, redis_r, razorpay, anthropic, websocket])

    return {
        "all_ok": all_ok,
        "elapsed_ms": elapsed_ms,
        "app_env": settings.app_env,
        "services": {
            "supabase": supabase,
            "pinecone": pinecone,
            "redis": redis_r,
            "razorpay": razorpay,
            "anthropic": anthropic,
            "websocket": websocket,
        },
    }
