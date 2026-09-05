"""Consumer private vendor rating ledger.

GET /ratings/mine   — all ratings for the authenticated consumer.
GET /ratings/summary/{shop_id} — avg score for a shop (for route planning debug).
"""
from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException, Request

from app.db.supabase_client import get_supabase_client
from app.middleware.auth_middleware import verify_clerk_token
from app.services.rating_service import get_avg_rating, get_consumer_ratings

logger = logging.getLogger(__name__)

router = APIRouter()


def _resolve_consumer(clerk_id: str) -> str:
    sb = get_supabase_client()
    row = sb.table("users").select("id").eq("clerk_id", clerk_id).limit(1).execute()
    if not row.data:
        raise HTTPException(status_code=404, detail="User not found")
    return row.data[0]["id"]


@router.get("/mine")
async def get_my_ratings(
    request: Request,
    _: dict = Depends(verify_clerk_token),
) -> list:
    """Consumer's full rating history, most-recent first, with shop name attached."""
    consumer_id = _resolve_consumer(request.state.clerk_id)
    return get_consumer_ratings(consumer_id)


@router.get("/summary/{shop_id}")
async def get_shop_rating_summary(
    shop_id: str,
    request: Request,
    _: dict = Depends(verify_clerk_token),
) -> dict:
    """This consumer's average score for one shop (1.0–5.0, or null if never rated)."""
    consumer_id = _resolve_consumer(request.state.clerk_id)
    avg = get_avg_rating(consumer_id, shop_id)
    return {"shop_id": shop_id, "avg_score": avg, "has_ratings": avg != 3.0}
