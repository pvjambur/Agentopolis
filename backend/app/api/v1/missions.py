"""Mission creation and read endpoints. Phase 2 (read + stub create). Phase 5 adds execution."""
from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel

from app.db.supabase_client import get_supabase_client
from app.middleware.auth_middleware import verify_clerk_token

logger = logging.getLogger(__name__)

router = APIRouter()


class MissionCreate(BaseModel):
    instruction_text: str
    budget: float | None = None
    mode: str = "single"


@router.get("")
async def list_missions(
    request: Request,
    status: str | None = Query(default=None),
    mode: str | None = Query(default=None),
    limit: int = Query(default=20, ge=1, le=100),
    _: dict = Depends(verify_clerk_token),
) -> list:
    """Lists missions for the authenticated consumer, filterable by status and mode."""
    sb = get_supabase_client()

    user_row = sb.table("users").select("id").eq("clerk_id", request.state.clerk_id).limit(1).execute()
    if not user_row.data:
        return []

    consumer_id = user_row.data[0]["id"]
    query = sb.table("missions").select("*").eq("consumer_id", consumer_id)

    if status:
        query = query.eq("status", status)
    if mode:
        query = query.eq("mode", mode)

    result = query.order("created_at", desc=True).limit(limit).execute()
    return result.data or []


@router.post("", status_code=202)
async def create_mission(
    body: MissionCreate,
    request: Request,
    _: dict = Depends(verify_clerk_token),
) -> dict:
    """
    Creates a mission row and dispatches execution to Celery.
    Phase 5 wires the orchestrator into the Celery task body.
    """
    sb = get_supabase_client()

    user_row = sb.table("users").select("id").eq("clerk_id", request.state.clerk_id).limit(1).execute()
    if not user_row.data:
        raise HTTPException(status_code=404, detail="User not found")
    consumer_id = user_row.data[0]["id"]

    if body.mode not in ("single", "swarm"):
        raise HTTPException(status_code=422, detail="mode must be 'single' or 'swarm'")

    row = sb.table("missions").insert({
        "consumer_id": consumer_id,
        "instruction_text": body.instruction_text,
        "budget": str(body.budget) if body.budget else None,
        "mode": body.mode,
        "status": "planning",
    }).execute()

    mission = row.data[0]

    # Dispatch execution to the Celery worker (survives restarts, retry semantics).
    from app.celery_app import celery_app
    celery_app.send_task("run_mission_task", args=[mission["id"]])
    logger.info("Mission %s created and dispatched to Celery", mission["id"])

    return {"mission_id": mission["id"], "status": "planning"}


@router.get("/{mission_id}")
async def get_mission(
    mission_id: str,
    _: dict = Depends(verify_clerk_token),
) -> dict:
    """
    Returns full mission details + all negotiations with complete rounds JSONB.
    This is what the transcript viewer reads — works after WebSocket has disconnected.
    """
    sb = get_supabase_client()

    mission_row = sb.table("missions").select("*").eq("id", mission_id).limit(1).execute()
    if not mission_row.data:
        raise HTTPException(status_code=404, detail="Mission not found")

    mission = mission_row.data[0]

    negotiations_row = sb.table("negotiations").select("*").eq("mission_id", mission_id).order("created_at").execute()
    mission["negotiations"] = negotiations_row.data or []

    return mission
