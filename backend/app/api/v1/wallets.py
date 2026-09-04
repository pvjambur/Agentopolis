"""Wallet routes — read-only balance for Phase 1."""
from fastapi import APIRouter, Depends, HTTPException, Request

from app.middleware.auth_middleware import verify_clerk_token

router = APIRouter()


@router.get("/mine")
async def get_my_wallet(
    request: Request,
    _: dict = Depends(verify_clerk_token),
) -> dict:
    """Returns the authenticated user's wallet balance. Returns 0 if no wallet row."""
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
        sb.table("wallets")
        .select("balance,updated_at")
        .eq("user_id", user_id)
        .limit(1)
        .execute()
    )
    if not result.data:
        return {"balance": 0.00, "currency": "INR"}

    return {
        "balance": float(result.data[0]["balance"]),
        "currency": "INR",
        "updated_at": result.data[0].get("updated_at"),
    }
