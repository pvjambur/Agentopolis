"""Vendor reports endpoint."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request

from app.db.supabase_client import get_supabase_client
from app.middleware.auth_middleware import verify_clerk_token
from app.services.reports_service import Period, get_vendor_report

router = APIRouter()


def _resolve_vendor(clerk_id: str) -> str:
    sb = get_supabase_client()
    row = sb.table("users").select("id,role").eq("clerk_id", clerk_id).limit(1).execute()
    if not row.data:
        raise HTTPException(status_code=404, detail="User not found")
    if row.data[0].get("role") != "vendor":
        raise HTTPException(status_code=403, detail="Vendor role required")
    return row.data[0]["id"]


@router.get("/{shop_id}")
async def vendor_report(
    shop_id: str,
    period: str = "week",
    request: Request = None,
    _: dict = Depends(verify_clerk_token),
) -> dict:
    """Vendor sales report for one shop. period: week | month | all."""
    vendor_id = _resolve_vendor(request.state.clerk_id)

    # Verify the shop belongs to this vendor
    sb = get_supabase_client()
    shop_row = sb.table("shops").select("id").eq("id", shop_id).eq("vendor_id", vendor_id).limit(1).execute()
    if not shop_row.data:
        raise HTTPException(status_code=403, detail="Shop not found or access denied")

    valid_periods = ("week", "month", "all")
    if period not in valid_periods:
        period = "week"

    return get_vendor_report(shop_id, period=period)  # type: ignore[arg-type]
