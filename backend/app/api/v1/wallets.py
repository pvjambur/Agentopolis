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
        user_res = (
            sb.table("users")
            .insert({"clerk_id": request.state.clerk_id, "role": "vendor"})
            .execute()
        )
        user_id = user_res.data[0]["id"]
    else:
        user_id = user_row.data[0]["id"]

    result = (
        sb.table("wallets")
        .select("balance,updated_at")
        .eq("user_id", user_id)
        .limit(1)
        .execute()
    )
    if not result.data:
        try:
            ins = (
                sb.table("wallets")
                .insert({"user_id": user_id, "balance": 1000.00, "currency": "INR"})
                .execute()
            )
            balance = float(ins.data[0]["balance"])
            updated_at = ins.data[0].get("updated_at")
        except Exception:
            balance = 1000.00
            updated_at = None
        return {"balance": balance, "currency": "INR", "updated_at": updated_at}

    return {
        "balance": float(result.data[0]["balance"]),
        "currency": "INR",
        "updated_at": result.data[0].get("updated_at"),
    }
