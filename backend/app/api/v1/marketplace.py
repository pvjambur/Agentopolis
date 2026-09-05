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

    if not products and not domain and not search:
        _seed_default_shops_and_products(sb)
        result = query.order("created_at", desc=True).execute()
        products = result.data or []

    if not domain and not search:
        try:
            get_redis_client().set(CACHE_KEY, json.dumps(products), ex=CACHE_TTL)
            logger.debug("Marketplace cache set (TTL=%ds)", CACHE_TTL)
        except Exception as exc:
            logger.warning("Redis set failed: %s", exc)

    return products


def _seed_default_shops_and_products(sb) -> None:
    """Auto-provision default active mock shops and products for immediate out-of-the-box demo."""
    try:
        # 1. Ensure system vendor user exists
        user_res = sb.table("users").select("id").eq("clerk_id", "system_vendor_seed").limit(1).execute()
        if not user_res.data:
            u_ins = sb.table("users").insert({
                "clerk_id": "system_vendor_seed",
                "role": "vendor",
                "display_name": "Agentopolis Marketplace Merchant",
            }).execute()
            vendor_id = u_ins.data[0]["id"]
            try:
                sb.table("wallets").insert({"user_id": vendor_id, "balance": 10000.00, "currency": "INR"}).execute()
            except Exception:
                pass
        else:
            vendor_id = user_res.data[0]["id"]

        # 2. Seed default shops
        shops_def = [
            {"name": "Verdure Greens & Pharma", "domain": "pharma", "description": "Quality medicines and fresh organic greens", "grid_x": 5, "grid_y": 5},
            {"name": "Tech Vault Electronics", "domain": "electronics", "description": "Premium gadgets and audio gear", "grid_x": 28, "grid_y": 5},
            {"name": "Fresh Fruits Co", "domain": "fruits", "description": "Farm-fresh fruits delivered daily", "grid_x": 5, "grid_y": 18},
        ]
        created_shops = {}
        for s in shops_def:
            s_res = sb.table("shops").select("id").eq("vendor_id", vendor_id).eq("name", s["name"]).limit(1).execute()
            if not s_res.data:
                ins_s = sb.table("shops").insert({
                    "vendor_id": vendor_id,
                    "name": s["name"],
                    "domain": s["domain"],
                    "description": s["description"],
                    "grid_x": s["grid_x"],
                    "grid_y": s["grid_y"],
                    "razorpay_linked_account_id": f"acc_seed_{s['domain']}",
                    "is_active": True,
                }).execute()
                created_shops[s["domain"]] = ins_s.data[0]["id"]
            else:
                created_shops[s["domain"]] = s_res.data[0]["id"]

        # 3. Seed default products
        products_def = [
            {"shop_domain": "pharma", "name": "Paracetamol 500mg (10 Tabs)", "description": "Fever and pain relief medication", "price": 50.00, "floor_price": 35.00, "mrp": 60.00, "stock_count": 100, "category": "pharma"},
            {"shop_domain": "pharma", "name": "Vitamin C 1000mg Chewable", "description": "Immunity booster tablets", "price": 120.00, "floor_price": 90.00, "mrp": 150.00, "stock_count": 80, "category": "pharma"},
            {"shop_domain": "electronics", "name": "Wireless Noise Cancelling Earbuds", "description": "High-fidelity Bluetooth 5.3 earbuds", "price": 2499.00, "floor_price": 1899.00, "mrp": 2999.00, "stock_count": 30, "category": "electronics"},
            {"shop_domain": "electronics", "name": "65W GaN Fast Wall Charger", "description": "Multi-device dual USB-C fast charger", "price": 899.00, "floor_price": 699.00, "mrp": 1199.00, "stock_count": 45, "category": "electronics"},
            {"shop_domain": "fruits", "name": "Shimla Premium Apples (1kg)", "description": "Crisp and sweet fresh Shimla apples", "price": 180.00, "floor_price": 135.00, "mrp": 200.00, "stock_count": 50, "category": "fruits"},
        ]
        for p in products_def:
            s_id = created_shops.get(p["shop_domain"])
            if not s_id:
                continue
            p_res = sb.table("products").select("id").eq("shop_id", s_id).eq("name", p["name"]).limit(1).execute()
            if not p_res.data:
                sb.table("products").insert({
                    "shop_id": s_id,
                    "name": p["name"],
                    "description": p["description"],
                    "price": p["price"],
                    "floor_price": p["floor_price"],
                    "mrp": p["mrp"],
                    "stock_count": p["stock_count"],
                    "category": p["category"],
                }).execute()
        logger.info("Auto-seeded default mock shops and products successfully")
    except Exception as exc:
        logger.warning("Failed to auto-seed default marketplace items: %s", exc)
