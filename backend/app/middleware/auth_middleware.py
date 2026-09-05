"""Clerk JWT verification — FastAPI dependency for all protected routes."""
from __future__ import annotations

import base64
import logging
from functools import lru_cache

import jwt
from fastapi import Depends, HTTPException, Request
from jwt import PyJWKClient

from app.config import settings

logger = logging.getLogger(__name__)


def _clerk_domain() -> str:
    """Derive Clerk frontend domain from the publishable key (pk_test_<base64>$)."""
    pk = settings.clerk_publishable_key or ""
    b64 = pk.split("_", 2)[-1]          # strip "pk_test_" / "pk_live_"
    b64 += "=" * (-len(b64) % 4)        # restore base64 padding
    try:
        return base64.b64decode(b64).decode().rstrip("$")
    except Exception as exc:
        raise RuntimeError(
            "Cannot derive Clerk domain from CLERK_PUBLISHABLE_KEY"
        ) from exc


@lru_cache(maxsize=1)
def _jwks_client() -> PyJWKClient:
    url = f"https://{_clerk_domain()}/.well-known/jwks.json"
    return PyJWKClient(url, cache_jwk_set=True, lifespan=300)


async def verify_clerk_token(request: Request) -> dict:
    """
    Verifies the Clerk RS256 JWT in the Authorization header.
    Populates request.state.clerk_id and request.state.role.
    """
    header = request.headers.get("Authorization", "")
    if not header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid Authorization header")

    token = header.removeprefix("Bearer ")

    try:
        signing_key = _jwks_client().get_signing_key_from_jwt(token)
        payload = jwt.decode(
            token,
            signing_key.key,
            algorithms=["RS256"],
            options={"verify_aud": False},
        )
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except Exception as exc:
        if settings.app_env == "local":
            logger.warning("JWT JWKS verification failed in local mode (%s); falling back to unverified payload", exc)
            try:
                payload = jwt.decode(token, options={"verify_signature": False, "verify_aud": False})
            except Exception:
                raise HTTPException(status_code=401, detail="Invalid token")
        else:
            logger.warning("JWT validation failed: %s", exc)
            raise HTTPException(status_code=401, detail="Invalid token")

    clerk_id: str = payload.get("sub", "")
    request.state.clerk_id = clerk_id

    # Role comes from our users table — no Clerk JWT template required.
    role: str | None = None
    if settings.supabase_url and settings.supabase_service_role_key:
        try:
            from app.db.supabase_client import get_supabase_client
            sb = get_supabase_client()
            row = (
                sb
                .table("users")
                .select("id, role")
                .eq("clerk_id", clerk_id)
                .limit(1)
                .execute()
            )
            if row.data:
                role = row.data[0].get("role")
            else:
                # Auto-provision user row in Supabase on first authenticated request
                display_name = payload.get("name") or payload.get("email") or None
                insert_res = (
                    sb.table("users")
                    .insert({
                        "clerk_id": clerk_id,
                        "role": "vendor",  # default to vendor if not synced yet
                        "display_name": display_name,
                    })
                    .execute()
                )
                if insert_res.data:
                    user_id = insert_res.data[0]["id"]
                    role = "vendor"
                    try:
                        sb.table("wallets").insert({
                            "user_id": user_id,
                            "balance": 1000.00,
                            "currency": "INR",
                        }).execute()
                    except Exception as w_exc:
                        logger.warning("Wallet auto-provision notice: %s", w_exc)
        except Exception as exc:
            logger.warning("Role lookup/provision failed for clerk_id=%s: %s", clerk_id, exc)

    request.state.role = role
    return payload


def require_role(role: str):
    """
    Returns a FastAPI dependency that verifies the JWT AND enforces a role.
    Usage: dependencies=[Depends(require_role("vendor"))]
    """
    async def _checker(request: Request, _: dict = Depends(verify_clerk_token)) -> None:
        if request.state.role != role:
            raise HTTPException(
                status_code=403,
                detail=f"Requires '{role}' role; got '{request.state.role}'",
            )
    return _checker
