"""Agent configuration — vendor negotiation rules + consumer preferences. Phase 2."""
from __future__ import annotations

import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

from app.db.supabase_client import get_supabase_client
from app.middleware.auth_middleware import verify_clerk_token

logger = logging.getLogger(__name__)

router = APIRouter()

_VALID_PERSONALITIES = frozenset({"negotiator", "fixed_mrp", "loyalty", "premium"})
_VALID_TONES = frozenset({"friendly", "firm", "professional"})


def _get_user_id(clerk_id: str) -> str:
    sb = get_supabase_client()
    row = sb.table("users").select("id").eq("clerk_id", clerk_id).limit(1).execute()
    if not row.data:
        raise HTTPException(status_code=404, detail="User not found")
    return row.data[0]["id"]


def _upsert_config(user_id: str, agent_type: str, payload: dict) -> dict:
    """Check-then-update so we don't need a DB-level unique constraint."""
    sb = get_supabase_client()
    existing = (
        sb.table("agent_configs")
        .select("id")
        .eq("user_id", user_id)
        .eq("agent_type", agent_type)
        .limit(1)
        .execute()
    )
    now = datetime.now(timezone.utc).isoformat()
    full = {**payload, "user_id": user_id, "agent_type": agent_type, "updated_at": now}

    if existing.data:
        result = (
            sb.table("agent_configs")
            .update(full)
            .eq("id", existing.data[0]["id"])
            .execute()
        )
    else:
        result = sb.table("agent_configs").insert(full).execute()

    return result.data[0]


# ── Schemas ───────────────────────────────────────────────────────────────────

class VendorConfigPatch(BaseModel):
    personality_type: str = Field(default="negotiator")
    max_discount_percent: float = Field(default=15.0, ge=0, le=100)
    tone: str = Field(default="friendly")
    bundling_enabled: bool = Field(default=True)
    min_rounds_before_accept: int = Field(default=1, ge=0, le=10)


class ConsumerConfigPatch(BaseModel):
    price_weight: float = Field(default=0.7, ge=0.0, le=1.0)
    default_budget: float | None = Field(default=None, ge=0)


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/mine")
async def get_my_config(
    request: Request,
    _: dict = Depends(verify_clerk_token),
) -> dict:
    """Returns both vendor and consumer configs for the authenticated user."""
    user_id = _get_user_id(request.state.clerk_id)
    sb = get_supabase_client()
    result = (
        sb.table("agent_configs")
        .select("*")
        .eq("user_id", user_id)
        .execute()
    )
    configs: dict[str, dict] = {}
    for row in result.data or []:
        configs[row["agent_type"]] = row
    return configs


@router.patch("/vendor")
async def patch_vendor_config(
    body: VendorConfigPatch,
    request: Request,
    _: dict = Depends(verify_clerk_token),
) -> dict:
    if body.personality_type not in _VALID_PERSONALITIES:
        raise HTTPException(status_code=422, detail=f"Unknown personality_type '{body.personality_type}'")
    if body.tone not in _VALID_TONES:
        raise HTTPException(status_code=422, detail=f"Unknown tone '{body.tone}'")

    user_id = _get_user_id(request.state.clerk_id)
    return _upsert_config(
        user_id,
        "vendor",
        {
            "personality": {"personality_type": body.personality_type},
            "negotiation_rules": {
                "max_discount_percent": body.max_discount_percent,
                "tone": body.tone,
                "bundling_enabled": body.bundling_enabled,
                "min_rounds_before_accept": body.min_rounds_before_accept,
            },
        },
    )


@router.patch("/consumer")
async def patch_consumer_config(
    body: ConsumerConfigPatch,
    request: Request,
    _: dict = Depends(verify_clerk_token),
) -> dict:
    user_id = _get_user_id(request.state.clerk_id)
    quality_weight = round(1.0 - body.price_weight, 4)
    return _upsert_config(
        user_id,
        "consumer",
        {
            "personality": {
                "price_weight": body.price_weight,
                "quality_weight": quality_weight,
                "default_budget": body.default_budget,
            },
            "negotiation_rules": {},
        },
    )
