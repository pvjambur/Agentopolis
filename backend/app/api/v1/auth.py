"""Auth routes — Clerk JWT verification + user/wallet sync."""
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel

from app.middleware.auth_middleware import verify_clerk_token

router = APIRouter()


class SyncRequest(BaseModel):
    role: str           # "vendor" | "consumer"
    display_name: str | None = None


class SyncResponse(BaseModel):
    user_id: str
    clerk_id: str
    role: str
    is_new_user: bool


@router.post("/sync", response_model=SyncResponse)
async def sync_user(
    body: SyncRequest,
    request: Request,
    _: dict = Depends(verify_clerk_token),
) -> SyncResponse:
    """
    Called by frontend immediately after Clerk sign-up + role selection.
    Upserts user row and creates a wallet on first login.
    """
    if body.role not in ("vendor", "consumer"):
        raise HTTPException(status_code=400, detail="role must be 'vendor' or 'consumer'")

    from app.db.supabase_client import get_supabase_client
    sb = get_supabase_client()
    clerk_id: str = request.state.clerk_id

    existing = (
        sb.table("users")
        .select("id, role")
        .eq("clerk_id", clerk_id)
        .limit(1)
        .execute()
    )
    is_new = not existing.data

    if is_new:
        insert_result = (
            sb.table("users")
            .insert(
                {
                    "clerk_id": clerk_id,
                    "role": body.role,
                    "display_name": body.display_name,
                }
            )
            .execute()
        )
        user_id: str = insert_result.data[0]["id"]

        # Seed wallet with ₹1 000 for Phase 1 testing
        sb.table("wallets").insert(
            {"user_id": user_id, "balance": 1000.00, "currency": "INR"}
        ).execute()
    else:
        user_id = existing.data[0]["id"]
        current_role = existing.data[0].get("role")
        if current_role != body.role:
            sb.table("users").update({"role": body.role}).eq("id", user_id).execute()

    return SyncResponse(
        user_id=user_id,
        clerk_id=clerk_id,
        role=body.role,
        is_new_user=is_new,
    )


@router.get("/me")
async def get_me(
    request: Request,
    _: dict = Depends(verify_clerk_token),
) -> dict:
    """Returns the authenticated user's profile from Supabase."""
    from app.db.supabase_client import get_supabase_client
    row = (
        get_supabase_client()
        .table("users")
        .select("*")
        .eq("clerk_id", request.state.clerk_id)
        .limit(1)
        .execute()
    )
    if not row.data:
        raise HTTPException(status_code=404, detail="User not found — call /auth/sync first")
    return row.data[0]
