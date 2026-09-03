"""User profile endpoints."""
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel

from app.middleware.auth_middleware import verify_clerk_token

router = APIRouter()

_VALID_CHARACTER_TYPES = frozenset(
    {
        "char_A_green_top",
        "char_B_orange_top",
        "char_C_grey_hair",
        "char_D_hardhat",
        "char_E_purple_top",
        "char_F_darkhair_orange",
    }
)


class AvatarPatchRequest(BaseModel):
    character_type: str


@router.patch("/me/avatar")
async def patch_avatar(
    body: AvatarPatchRequest,
    request: Request,
    _: dict = Depends(verify_clerk_token),
) -> dict:
    """Persists the selected character_type into users.avatar_config JSONB."""
    if body.character_type not in _VALID_CHARACTER_TYPES:
        raise HTTPException(
            status_code=400,
            detail=f"Unknown character_type '{body.character_type}'",
        )

    from app.db.supabase_client import get_supabase_client

    sb = get_supabase_client()
    result = (
        sb.table("users")
        .update({"avatar_config": {"character_type": body.character_type}})
        .eq("clerk_id", request.state.clerk_id)
        .execute()
    )
    if not result.data:
        raise HTTPException(
            status_code=404,
            detail="User not found — call /auth/sync first",
        )

    return {"character_type": body.character_type}
