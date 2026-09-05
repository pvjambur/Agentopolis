"""Transaction history endpoints for vendors and consumers."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request

from app.db.supabase_client import get_supabase_client
from app.middleware.auth_middleware import verify_clerk_token
from app.services.reports_service import get_transactions_consumer, get_transactions_vendor

router = APIRouter()


def _resolve_user(clerk_id: str) -> tuple[str, str]:
    """Returns (user_id, role)."""
    sb = get_supabase_client()
    row = sb.table("users").select("id,role").eq("clerk_id", clerk_id).limit(1).execute()
    if not row.data:
        raise HTTPException(status_code=404, detail="User not found")
    return row.data[0]["id"], row.data[0].get("role", "consumer")


@router.get("/vendor/{shop_id}")
async def vendor_transactions(
    shop_id: str,
    page: int = 1,
    limit: int = 20,
    request: Request = None,
    _: dict = Depends(verify_clerk_token),
) -> dict:
    """Paginated deal transactions for a vendor's shop, newest-first."""
    vendor_id, role = _resolve_user(request.state.clerk_id)
    if role != "vendor":
        raise HTTPException(status_code=403, detail="Vendor role required")

    sb = get_supabase_client()
    shop_row = sb.table("shops").select("id").eq("id", shop_id).eq("vendor_id", vendor_id).limit(1).execute()
    if not shop_row.data:
        raise HTTPException(status_code=403, detail="Shop not found or access denied")

    limit = max(1, min(limit, 100))
    page = max(1, page)
    return get_transactions_vendor(shop_id, page=page, limit=limit)


@router.get("/consumer")
async def consumer_transactions(
    page: int = 1,
    limit: int = 20,
    request: Request = None,
    _: dict = Depends(verify_clerk_token),
) -> dict:
    """Paginated deal transactions for the authenticated consumer, newest-first."""
    consumer_id, _ = _resolve_user(request.state.clerk_id)
    limit = max(1, min(limit, 100))
    page = max(1, page)
    return get_transactions_consumer(consumer_id, page=page, limit=limit)


@router.get("/basket")
async def consumer_basket(
    request: Request = None,
    _: dict = Depends(verify_clerk_token),
) -> list:
    """All consumer deals grouped by mission — the 'what my agent bought me' view."""
    from app.services.reports_service import get_consumer_basket
    consumer_id, _ = _resolve_user(request.state.clerk_id)
    return get_consumer_basket(consumer_id)
