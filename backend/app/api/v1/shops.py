"""Shop routes — vendor creates/manages shops."""
from fastapi import APIRouter, Depends, HTTPException, Request

from app.middleware.auth_middleware import verify_clerk_token

router = APIRouter()


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


@router.get("/mine")
async def get_my_shops(
    request: Request,
    _: dict = Depends(verify_clerk_token),
) -> list:
    """Returns the authenticated vendor's shops. Empty list if none exist."""
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
        raise HTTPException(status_code=404, detail="User not found")

    user_id: str = user_row.data[0]["id"]
    result = (
        sb.table("shops")
        .select("id,name,domain,description,is_active,created_at")
        .eq("vendor_id", user_id)
        .order("created_at", desc=False)
        .execute()
    )
    return result.data or []
