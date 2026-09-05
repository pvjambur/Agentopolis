"""Persistence for the negotiation audit trail (missions + negotiations tables).

Every negotiation writes a row at the start and is updated on completion — the
audit trail must survive WebSocket disconnect, so it lives in Postgres, not just
in the live event stream.
"""
from __future__ import annotations

from datetime import datetime, timezone

from app.db.supabase_client import get_supabase_client


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def create_negotiation_row(
    mission_id: str,
    shop_id: str,
    product_id: str,
    item_requested: str,
    opening_price: float,
) -> dict:
    sb = get_supabase_client()
    row = (
        sb.table("negotiations")
        .insert(
            {
                "mission_id": mission_id,
                "shop_id": shop_id,
                "product_id": product_id,
                "item_requested": item_requested,
                "opening_price": str(opening_price),
                "rounds": [],
                "round_count": 0,
            }
        )
        .execute()
    )
    return row.data[0]


def update_negotiation_row(
    negotiation_id: str,
    rounds: list[dict],
    outcome: str,
    final_price: float | None,
    round_count: int,
) -> dict:
    sb = get_supabase_client()
    row = (
        sb.table("negotiations")
        .update(
            {
                "rounds": rounds,
                "outcome": outcome,
                "final_price": str(final_price) if final_price is not None else None,
                "round_count": round_count,
                "completed_at": _now(),
            }
        )
        .eq("id", negotiation_id)
        .execute()
    )
    return row.data[0]


def update_mission_status(
    mission_id: str,
    status: str,
    parsed_list: list[dict] | None = None,
    budget: float | None = None,
) -> None:
    sb = get_supabase_client()
    payload: dict = {"status": status}
    if parsed_list is not None:
        payload["parsed_list"] = parsed_list
    if budget is not None:
        payload["budget"] = str(budget)
    if status in ("completed", "failed"):
        payload["completed_at"] = _now()
    sb.table("missions").update(payload).eq("id", mission_id).execute()
