"""Marketplace feed — all products across all shops, filterable. Phase 2."""
from __future__ import annotations

import json
import logging

from fastapi import APIRouter, Query

from app.db.supabase_client import get_supabase_client
from app.services.cache import get_redis_client

logger = logging.getLogger(__name__)

router = APIRouter()

CACHE_KEY = "marketplace:products:all"
CACHE_TTL = 60  # seconds


@router.get("/products")
async def get_marketplace_products(
    domain: str | None = Query(default=None),
    search: str | None = Query(default=None),
) -> list:
    # Only cache the unfiltered feed
    if not domain and not search:
        try:
            cached = get_redis_client().get(CACHE_KEY)
            if cached:
                logger.debug("Marketplace cache hit")
                return json.loads(cached)
        except Exception as exc:
            logger.warning("Redis get failed: %s", exc)

    sb = get_supabase_client()
    query = sb.table("products").select(
        "id,name,description,price,floor_price,mrp,stock_count,image_url,category,"
        "pinecone_vector_id,created_at,updated_at,"
        "shops!inner(id,name,domain,description,grid_x,grid_y)"
    ).eq("shops.is_active", True)

    if domain:
        query = query.eq("shops.domain", domain)

    if search:
        query = query.ilike("name", f"%{search}%")

    result = query.order("created_at", desc=True).execute()
    products = result.data or []

    if not domain and not search:
        try:
            get_redis_client().set(CACHE_KEY, json.dumps(products), ex=CACHE_TTL)
            logger.debug("Marketplace cache set (TTL=%ds)", CACHE_TTL)
        except Exception as exc:
            logger.warning("Redis set failed: %s", exc)

    return products
