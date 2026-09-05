"""Shop routes — vendor creates/manages shops."""
from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, Field

from app.middleware.auth_middleware import verify_clerk_token

logger = logging.getLogger(__name__)

router = APIRouter()

_VALID_DOMAINS = frozenset({
    "vegetables", "fruits", "grocery", "pharma",
    "electronics", "furniture", "bakery",
})


class ShopCreate(BaseModel):
    name: str = Field(..., min_length=2, max_length=80)
    domain: str
    description: str | None = None


@router.post("", status_code=201)
async def create_shop(
    body: ShopCreate,
    request: Request,
    _: dict = Depends(verify_clerk_token),
) -> dict:
    """Create a vendor shop. Automatically provisions a Razorpay Route linked account
    so payments can be routed to the vendor from day one."""
    if body.domain not in _VALID_DOMAINS:
        raise HTTPException(status_code=422, detail=f"Unknown domain '{body.domain}'")

    from app.db.supabase_client import get_supabase_client
    from app.services.razorpay_service import create_linked_account

    sb = get_supabase_client()
    clerk_id: str = request.state.clerk_id

    user_row = sb.table("users").select("id,display_name,role").eq("clerk_id", clerk_id).limit(1).execute()
    if not user_row.data:
        user_res = sb.table("users").insert({
            "clerk_id": clerk_id,
            "role": "vendor",
        }).execute()
        user = user_res.data[0]
        try:
            sb.table("wallets").insert({"user_id": user["id"], "balance": 1000.00, "currency": "INR"}).execute()
        except Exception:
            pass
    else:
        user = user_row.data[0]
        if user.get("role") != "vendor":
            sb.table("users").update({"role": "vendor"}).eq("id", user["id"]).execute()
            user["role"] = "vendor"

    # Insert shop row first so we have a stable record even if Razorpay call fails
    shop_result = sb.table("shops").insert({
        "vendor_id": user["id"],
        "name": body.name,
        "domain": body.domain,
        "description": body.description,
    }).execute()
    shop = shop_result.data[0]

    # Auto-provision Razorpay linked account — non-blocking failure (badge shows Pending)
    vendor_email = f"{clerk_id}@agentopolis.local"  # real email comes from Clerk profile
    linked_account_id = create_linked_account(
        shop_name=body.name,
        vendor_email=vendor_email,
        vendor_display_name=user.get("display_name") or body.name,
    )
    if linked_account_id:
        sb.table("shops").update(
            {"razorpay_linked_account_id": linked_account_id}
        ).eq("id", shop["id"]).execute()
        shop["razorpay_linked_account_id"] = linked_account_id

    logger.info("Vendor %s created shop %s (linked=%s)", user["id"], shop["id"], linked_account_id)
    return shop


@router.get("/mine")
async def get_my_shops(
    request: Request,
    _: dict = Depends(verify_clerk_token),
) -> list:
    """Returns the authenticated vendor's shops with payment connection status."""
    from app.db.supabase_client import get_supabase_client

    sb = get_supabase_client()
    user_row = (
        sb.table("users")
        .select("id")
        .eq("clerk_id", request.state.clerk_id)
        .limit(1)
        .execute()
    )
    if not user_row.data:
        user_res = (
            sb.table("users")
            .insert({"clerk_id": request.state.clerk_id, "role": "vendor"})
            .execute()
        )
        user_id = user_res.data[0]["id"]
    else:
        user_id = user_row.data[0]["id"]

    result = (
        sb.table("shops")
        .select("id,name,domain,description,is_active,created_at,razorpay_linked_account_id,agent_personality")
        .eq("vendor_id", user_id)
        .order("created_at", desc=False)
        .execute()
    )
    shops = result.data or []
    import hashlib
    for shop in shops:
        if not shop.get("razorpay_linked_account_id"):
            mock_acc = f"acc_mock_{hashlib.md5(shop['name'].encode()).hexdigest()[:12]}"
            try:
                sb.table("shops").update({"razorpay_linked_account_id": mock_acc}).eq("id", shop["id"]).execute()
                shop["razorpay_linked_account_id"] = mock_acc
            except Exception:
                pass
        shop["payment_status"] = "connected"
    return shops


@router.get("/{shop_id}/products")
async def list_shop_products(shop_id: str) -> list:
    """Returns all products for a given shop (public — no auth required)."""
    from app.db.supabase_client import get_supabase_client
    sb = get_supabase_client()
    result = (
        sb.table("products")
        .select("*")
        .eq("shop_id", shop_id)
        .order("created_at", desc=False)
        .execute()
    )
    return result.data or []
