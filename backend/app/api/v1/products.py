"""Product CRUD + image upload + Pinecone embedding. Phase 2."""
from __future__ import annotations

import logging
import uuid
from decimal import Decimal
from typing import Annotated

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile
from pydantic import BaseModel, Field

from app.db.supabase_client import get_supabase_client
from app.middleware.auth_middleware import verify_clerk_token
from app.services.cache import get_redis_client

logger = logging.getLogger(__name__)

router = APIRouter()

ALLOWED_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp"}
MAX_IMAGE_BYTES = 5 * 1024 * 1024  # 5 MB


# ── helpers ──────────────────────────────────────────────────────────────────

def _get_user_id(clerk_id: str) -> str:
    sb = get_supabase_client()
    row = sb.table("users").select("id").eq("clerk_id", clerk_id).limit(1).execute()
    if not row.data:
        raise HTTPException(status_code=404, detail="User not found")
    return row.data[0]["id"]


def _require_shop_ownership(user_id: str, shop_id: str) -> dict:
    """Returns the shop row if user owns it; raises 403 otherwise."""
    sb = get_supabase_client()
    row = sb.table("shops").select("id,vendor_id").eq("id", shop_id).limit(1).execute()
    if not row.data:
        raise HTTPException(status_code=404, detail="Shop not found")
    shop = row.data[0]
    if shop["vendor_id"] != user_id:
        raise HTTPException(status_code=403, detail="You do not own this shop")
    return shop


def _get_product(product_id: str) -> dict:
    sb = get_supabase_client()
    row = sb.table("products").select("*").eq("id", product_id).limit(1).execute()
    if not row.data:
        raise HTTPException(status_code=404, detail="Product not found")
    return row.data[0]


def _invalidate_marketplace_cache() -> None:
    try:
        get_redis_client().delete("marketplace:products:all")
    except Exception as exc:
        logger.warning("Cache invalidation failed: %s", exc)


# ── schemas ───────────────────────────────────────────────────────────────────

class ProductCreate(BaseModel):
    shop_id: str
    name: str = Field(..., min_length=1, max_length=200)
    description: str | None = None
    price: Decimal = Field(..., gt=0)
    floor_price: Decimal = Field(..., gt=0)
    mrp: Decimal | None = None
    stock_count: int = Field(default=0, ge=0)
    category: str | None = None


class ProductUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    description: str | None = None
    price: Decimal | None = Field(default=None, gt=0)
    floor_price: Decimal | None = Field(default=None, gt=0)
    mrp: Decimal | None = None
    stock_count: int | None = Field(default=None, ge=0)
    category: str | None = None


# ── endpoints ─────────────────────────────────────────────────────────────────

@router.post("", status_code=201)
async def create_product(
    body: ProductCreate,
    request: Request,
    _: dict = Depends(verify_clerk_token),
) -> dict:
    user_id = _get_user_id(request.state.clerk_id)
    _require_shop_ownership(user_id, body.shop_id)

    sb = get_supabase_client()
    row = sb.table("products").insert({
        "shop_id": body.shop_id,
        "name": body.name,
        "description": body.description,
        "price": str(body.price),
        "floor_price": str(body.floor_price),
        "mrp": str(body.mrp) if body.mrp else None,
        "stock_count": body.stock_count,
        "category": body.category,
    }).execute()

    product = row.data[0]

    # embed & upsert to Pinecone
    try:
        from app.services.embedding_service import upsert_product_vector
        vector_id = upsert_product_vector(
            product_id=product["id"],
            shop_id=body.shop_id,
            name=body.name,
            description=body.description,
            category=body.category,
            price=float(body.price),
        )
        sb.table("products").update({"pinecone_vector_id": vector_id}).eq("id", product["id"]).execute()
        product["pinecone_vector_id"] = vector_id
    except Exception as exc:
        logger.warning("Pinecone upsert failed for product %s: %s", product["id"], exc)

    _invalidate_marketplace_cache()
    return product


@router.get("/{product_id}")
async def get_product(product_id: str) -> dict:
    return _get_product(product_id)


@router.patch("/{product_id}")
async def update_product(
    product_id: str,
    body: ProductUpdate,
    request: Request,
    _: dict = Depends(verify_clerk_token),
) -> dict:
    user_id = _get_user_id(request.state.clerk_id)
    product = _get_product(product_id)
    _require_shop_ownership(user_id, product["shop_id"])

    updates = body.model_dump(exclude_none=True)
    # Decimal → str for JSON serialisation
    for field in ("price", "floor_price", "mrp"):
        if field in updates:
            updates[field] = str(updates[field])

    if not updates:
        return product

    sb = get_supabase_client()
    row = sb.table("products").update(updates).eq("id", product_id).execute()
    updated = row.data[0]

    # Re-embed if text fields changed
    text_fields = {"name", "description", "category"}
    if text_fields & set(body.model_dump(exclude_none=True).keys()):
        try:
            from app.services.embedding_service import upsert_product_vector
            vector_id = upsert_product_vector(
                product_id=product_id,
                shop_id=updated["shop_id"],
                name=updated["name"],
                description=updated.get("description"),
                category=updated.get("category"),
                price=float(updated["price"]),
            )
            sb.table("products").update({"pinecone_vector_id": vector_id}).eq("id", product_id).execute()
            updated["pinecone_vector_id"] = vector_id
        except Exception as exc:
            logger.warning("Pinecone re-embed failed for product %s: %s", product_id, exc)

    _invalidate_marketplace_cache()
    return updated


@router.delete("/{product_id}")
async def delete_product(
    product_id: str,
    request: Request,
    _: dict = Depends(verify_clerk_token),
) -> dict:
    user_id = _get_user_id(request.state.clerk_id)
    product = _get_product(product_id)
    _require_shop_ownership(user_id, product["shop_id"])

    # Delete Pinecone vector first (non-fatal if it fails)
    try:
        from app.services.embedding_service import delete_product_vector
        delete_product_vector(product_id)
    except Exception as exc:
        logger.warning("Pinecone delete failed for product %s: %s", product_id, exc)

    get_supabase_client().table("products").delete().eq("id", product_id).execute()
    _invalidate_marketplace_cache()
    return {"deleted": product_id}


@router.post("/{product_id}/image")
async def upload_product_image(
    product_id: str,
    request: Request,
    file: Annotated[UploadFile, File(...)],
    _: dict = Depends(verify_clerk_token),
) -> dict:
    user_id = _get_user_id(request.state.clerk_id)
    product = _get_product(product_id)
    _require_shop_ownership(user_id, product["shop_id"])

    if file.content_type not in ALLOWED_IMAGE_TYPES:
        raise HTTPException(
            status_code=422,
            detail=f"File type '{file.content_type}' not allowed. Use jpg, png, or webp.",
        )

    data = await file.read()
    if len(data) > MAX_IMAGE_BYTES:
        raise HTTPException(status_code=422, detail="File exceeds 5 MB limit")

    ext = file.filename.rsplit(".", 1)[-1] if file.filename and "." in file.filename else "jpg"
    path = f"products/{product_id}/{uuid.uuid4().hex}.{ext}"

    sb = get_supabase_client()
    sb.storage.from_("assets").upload(
        path=path,
        file=data,
        file_options={"content-type": file.content_type, "upsert": "true"},
    )

    public_url = sb.storage.from_("assets").get_public_url(path)
    sb.table("products").update({"image_url": public_url}).eq("id", product_id).execute()

    _invalidate_marketplace_cache()
    return {"image_url": public_url}
