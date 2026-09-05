"""Vendor reports — computed from negotiations + products, no new schema.

All aggregations done in Python over supabase-py row fetches. Small dataset
at hackathon scale; replace with Postgres functions pre-launch if needed.

Spot-check baseline (Fresh Fruits Co, 2026-09-05):
  7 deals, 3 walked_away, total_sales=860, net_revenue=817, avg_rounds≈2.86
  avg_discount_pct≈-18.4% (test data has final>opening on Gala Apples runs)
  Top products: Nagpur Oranges (4 deals ₹269), Gala Apples (3 deals ₹591)
"""
from __future__ import annotations

import logging
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from typing import Literal

from app.db.supabase_client import get_supabase_client

logger = logging.getLogger(__name__)

PLATFORM_COMMISSION = 0.05  # 5% kept by Agentopolis per deal
LOW_STOCK_THRESHOLD = 5
Period = Literal["week", "month", "all"]

_PERIOD_DAYS: dict[str, int | None] = {"week": 7, "month": 30, "all": None}


def _since(period: Period) -> str | None:
    days = _PERIOD_DAYS.get(period)
    if days is None:
        return None
    return (datetime.now(timezone.utc) - timedelta(days=days)).isoformat()


def get_vendor_report(shop_id: str, period: Period = "week") -> dict:
    """Return all metrics for the vendor reports page."""
    sb = get_supabase_client()
    since = _since(period)

    # ── Fetch all negotiations for this shop in period ────────────────────────
    q = sb.table("negotiations").select(
        "id,outcome,opening_price,final_price,round_count,product_id,created_at"
    ).eq("shop_id", shop_id)
    if since:
        q = q.gte("created_at", since)
    rows = q.order("created_at").execute().data or []

    deals = [r for r in rows if r["outcome"] == "deal"]
    total_count = len(rows)
    deal_count = len(deals)
    walked_away_count = sum(1 for r in rows if r["outcome"] == "walked_away")

    total_sales = sum(float(r["final_price"] or 0) for r in deals)
    net_revenue = round(total_sales * (1 - PLATFORM_COMMISSION), 2)

    avg_rounds = (
        round(sum(r["round_count"] for r in deals) / deal_count, 2) if deals else 0.0
    )
    walk_away_rate = round(walked_away_count / total_count, 4) if total_count else 0.0

    # avg_discount_percent: (opening - final) / opening * 100
    # Negative = vendor sold above opening price (unusual in test data)
    discount_pcts = [
        (float(r["opening_price"]) - float(r["final_price"])) / float(r["opening_price"]) * 100
        for r in deals
        if float(r.get("opening_price") or 0) > 0
    ]
    avg_discount_pct = round(sum(discount_pcts) / len(discount_pcts), 2) if discount_pcts else 0.0

    # ── Top products ──────────────────────────────────────────────────────────
    product_ids = list({r["product_id"] for r in deals})
    product_names: dict[str, str] = {}
    if product_ids:
        prods = (
            sb.table("products")
            .select("id,name")
            .in_("id", product_ids)
            .execute()
            .data or []
        )
        product_names = {p["id"]: p["name"] for p in prods}

    by_product: dict[str, dict] = defaultdict(
        lambda: {"deal_count": 0, "total_revenue": 0.0}
    )
    for r in deals:
        pid = r["product_id"]
        by_product[pid]["deal_count"] += 1
        by_product[pid]["total_revenue"] += float(r["final_price"] or 0)
        by_product[pid]["product_name"] = product_names.get(pid, pid)
        by_product[pid]["product_id"] = pid

    top_products = sorted(
        by_product.values(), key=lambda x: x["deal_count"], reverse=True
    )[:10]
    for tp in top_products:
        tp["total_revenue"] = round(tp["total_revenue"], 2)

    # ── Daily chart data ──────────────────────────────────────────────────────
    daily: dict[str, dict] = defaultdict(lambda: {"deal_count": 0, "revenue": 0.0})
    for r in deals:
        day = r["created_at"][:10]  # "YYYY-MM-DD"
        daily[day]["deal_count"] += 1
        daily[day]["revenue"] += float(r["final_price"] or 0)
    chart_data = sorted(
        [{"date": d, **v, "revenue": round(v["revenue"], 2)} for d, v in daily.items()],
        key=lambda x: x["date"],
    )

    # ── Low-stock alerts ──────────────────────────────────────────────────────
    low_stock = (
        sb.table("products")
        .select("id,name,stock_count,price")
        .eq("shop_id", shop_id)
        .lt("stock_count", LOW_STOCK_THRESHOLD)
        .order("stock_count")
        .execute()
        .data or []
    )

    return {
        "period": period,
        "shop_id": shop_id,
        "total_sales": round(total_sales, 2),
        "net_revenue": net_revenue,
        "deal_count": deal_count,
        "total_negotiations": total_count,
        "avg_discount_pct": avg_discount_pct,
        "avg_rounds": avg_rounds,
        "walk_away_rate": walk_away_rate,
        "walked_away_count": walked_away_count,
        "top_products": top_products,
        "chart_data": chart_data,
        "low_stock_alerts": low_stock,
    }


def get_transactions_vendor(
    shop_id: str, page: int = 1, limit: int = 20
) -> dict:
    """Paginated deal transactions for a vendor's shop."""
    sb = get_supabase_client()
    offset = (page - 1) * limit

    result = (
        sb.table("negotiations")
        .select("id,product_id,outcome,opening_price,final_price,round_count,is_mocked_payment,mock_transaction_ref,created_at,mission_id,products(name),missions(consumer_id)", count="exact")
        .eq("shop_id", shop_id)
        .eq("outcome", "deal")
        .order("created_at", desc=True)
        .range(offset, offset + limit - 1)
        .execute()
    )

    total = result.count or 0
    items = []
    for r in result.data or []:
        items.append({
            "id": r["id"],
            "item": (r.get("products") or {}).get("name", "Unknown"),
            "final_price": float(r["final_price"] or 0),
            "opening_price": float(r["opening_price"] or 0),
            "round_count": r["round_count"],
            "is_mocked_payment": r.get("is_mocked_payment", True),
            "transaction_ref": r.get("mock_transaction_ref"),
            "created_at": r["created_at"],
            "negotiation_id": r["id"],
            "mission_id": r["mission_id"],
        })

    return {"items": items, "total": total, "page": page, "limit": limit, "pages": max(1, -(-total // limit))}


def get_transactions_consumer(
    consumer_id: str, page: int = 1, limit: int = 20
) -> dict:
    """Paginated deal transactions for a consumer (resolved via missions)."""
    sb = get_supabase_client()

    # Get all mission IDs for this consumer
    missions = (
        sb.table("missions")
        .select("id")
        .eq("consumer_id", consumer_id)
        .execute()
        .data or []
    )
    mission_ids = [m["id"] for m in missions]
    if not mission_ids:
        return {"items": [], "total": 0, "page": page, "limit": limit, "pages": 1}

    offset = (page - 1) * limit
    result = (
        sb.table("negotiations")
        .select("id,shop_id,product_id,outcome,opening_price,final_price,round_count,is_mocked_payment,mock_transaction_ref,created_at,mission_id,products(name),shops(name)", count="exact")
        .in_("mission_id", mission_ids)
        .eq("outcome", "deal")
        .order("created_at", desc=True)
        .range(offset, offset + limit - 1)
        .execute()
    )

    total = result.count or 0
    items = []
    for r in result.data or []:
        items.append({
            "id": r["id"],
            "item": (r.get("products") or {}).get("name", "Unknown"),
            "shop_name": (r.get("shops") or {}).get("name", "Unknown"),
            "final_price": float(r["final_price"] or 0),
            "opening_price": float(r["opening_price"] or 0),
            "round_count": r["round_count"],
            "is_mocked_payment": r.get("is_mocked_payment", True),
            "transaction_ref": r.get("mock_transaction_ref"),
            "created_at": r["created_at"],
            "negotiation_id": r["id"],
            "mission_id": r["mission_id"],
        })

    return {"items": items, "total": total, "page": page, "limit": limit, "pages": max(1, -(-total // limit))}


def get_consumer_basket(consumer_id: str) -> list[dict]:
    """All deals for a consumer, grouped by mission, newest first."""
    sb = get_supabase_client()

    missions = (
        sb.table("missions")
        .select("id,instruction_text,created_at,status")
        .eq("consumer_id", consumer_id)
        .order("created_at", desc=True)
        .execute()
        .data or []
    )
    if not missions:
        return []

    mission_ids = [m["id"] for m in missions]
    negs = (
        sb.table("negotiations")
        .select("id,mission_id,shop_id,product_id,final_price,opening_price,is_mocked_payment,mock_transaction_ref,created_at,shops(name),products(name)")
        .in_("mission_id", mission_ids)
        .eq("outcome", "deal")
        .order("created_at", desc=True)
        .execute()
        .data or []
    )

    by_mission: dict[str, list] = defaultdict(list)
    for n in negs:
        by_mission[n["mission_id"]].append({
            "negotiation_id": n["id"],
            "item": (n.get("products") or {}).get("name", "Unknown"),
            "shop_name": (n.get("shops") or {}).get("name", "Unknown"),
            "price_paid": float(n["final_price"] or 0),
            "opening_price": float(n["opening_price"] or 0),
            "is_mocked_payment": n.get("is_mocked_payment", True),
            "transaction_ref": n.get("mock_transaction_ref"),
            "purchased_at": n["created_at"],
        })

    result = []
    for m in missions:
        items = by_mission.get(m["id"], [])
        if not items:
            continue
        result.append({
            "mission_id": m["id"],
            "instruction_text": m["instruction_text"],
            "mission_date": m["created_at"],
            "mission_status": m["status"],
            "items": items,
            "total_spent": round(sum(i["price_paid"] for i in items), 2),
            "item_count": len(items),
        })
    return result
