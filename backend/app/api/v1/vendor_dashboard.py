"""Vendor dashboard routes — protected by vendor role."""
from fastapi import APIRouter, Depends

from app.middleware.auth_middleware import require_role

router = APIRouter()


@router.get("/ping")
async def vendor_ping(_: None = Depends(require_role("vendor"))) -> dict:
    """Vendor-only health probe — used to verify 401/403 enforcement."""
    return {"ok": True, "role": "vendor"}
