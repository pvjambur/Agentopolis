"""Mission orchestration — runs as a Celery task.

Flow:  parse shopping list → plan route → for each item negotiate against up to
3 candidate vendors → mock-pay on a deal → persist everything.

Runs in the celery-worker container (a separate process from uvicorn), which is
exactly why negotiation events are streamed over Redis pub/sub, not the in-memory
ws_manager. Kept as a plain `run_mission()` callable wrapped by a Celery task so
it can be invoked directly in tests and dispatched via `.delay()` in production.
"""
from __future__ import annotations

import logging

from app.agents.consumer_agent import ConsumerAgent, ConsumerAgentConfig
from app.agents.orchestrator import Orchestrator
from app.agents.vendor_agent import VendorAgent, VendorAgentConfig
from app.celery_app import celery_app
from app.db.supabase_client import get_supabase_client
from app.services.negotiation_repo import update_mission_status
from app.ws.events import publish_mission_event

logger = logging.getLogger(__name__)

MAX_CANDIDATES_PER_ITEM = 3

_DEFAULT_VENDOR_RULES = {
    "max_discount_percent": 15,
    "tone": "friendly",
    "bundling_enabled": True,
    "min_rounds_before_accept": 1,
}


def _load_shop_catalog(sb, shop_id: str) -> list[dict]:
    rows = (
        sb.table("products")
        .select("id,name,price,floor_price,stock_count")
        .eq("shop_id", shop_id)
        .execute()
    )
    catalog = []
    for r in rows.data or []:
        catalog.append(
            {
                "id": r["id"],
                "name": r["name"],
                "price": float(r["price"]),
                "floor_price": float(r["floor_price"]),
                "stock_count": r.get("stock_count", 0),
            }
        )
    return catalog


def _build_vendor_agent(sb, product_id: str) -> tuple[VendorAgent, dict, dict] | None:
    """Returns (vendor_agent, product, shop) or None if data is missing."""
    prod = (
        sb.table("products")
        .select("id,name,price,floor_price,stock_count,shop_id")
        .eq("id", product_id)
        .limit(1)
        .execute()
    )
    if not prod.data:
        return None
    product = prod.data[0]
    product["price"] = float(product["price"])
    product["floor_price"] = float(product["floor_price"])

    shop_row = (
        sb.table("shops")
        .select("id,name,domain,vendor_id,agent_personality")
        .eq("id", product["shop_id"])
        .limit(1)
        .execute()
    )
    if not shop_row.data:
        return None
    shop = shop_row.data[0]

    # Vendor's saved negotiation rules (falls back to sane negotiator defaults)
    cfg_row = (
        sb.table("agent_configs")
        .select("negotiation_rules")
        .eq("user_id", shop["vendor_id"])
        .eq("agent_type", "vendor")
        .limit(1)
        .execute()
    )
    rules = dict(_DEFAULT_VENDOR_RULES)
    if cfg_row.data and cfg_row.data[0].get("negotiation_rules"):
        rules.update(cfg_row.data[0]["negotiation_rules"])

    vconfig = VendorAgentConfig(
        shop_id=shop["id"],
        personality="negotiator",  # Phase 2 scope: negotiator only
        negotiation_rules=rules,
        catalog=_load_shop_catalog(sb, shop["id"]),
        shop_name=shop["name"],
        domain=shop["domain"],
    )
    return VendorAgent(vconfig, product=product), product, shop


def run_mission(mission_id: str) -> dict:
    """Execute a full shopping mission. Called by the Celery task below."""
    sb = get_supabase_client()
    orchestrator = Orchestrator(max_rounds=5)

    mission_row = (
        sb.table("missions").select("*").eq("id", mission_id).limit(1).execute()
    )
    if not mission_row.data:
        raise ValueError(f"Mission {mission_id} not found")
    mission = mission_row.data[0]
    consumer_id = mission["consumer_id"]
    instruction = mission["instruction_text"]

    publish_mission_event(mission_id, {"event": "mission_started", "mission_id": mission_id})

    # ── Consumer agent config (preferences) ───────────────────────────────────
    cfg_row = (
        sb.table("agent_configs")
        .select("personality")
        .eq("user_id", consumer_id)
        .eq("agent_type", "consumer")
        .limit(1)
        .execute()
    )
    prefs = {"price_weight": 0.7, "quality_weight": 0.3, "default_budget": None}
    if cfg_row.data and cfg_row.data[0].get("personality"):
        prefs.update(cfg_row.data[0]["personality"])

    # Temporary budget to build the agent; corrected right after parsing.
    tmp_budget = float(mission["budget"]) if mission.get("budget") else 1e9
    consumer = ConsumerAgent(
        ConsumerAgentConfig(
            user_id=consumer_id,
            budget=tmp_budget,
            preferences=prefs,
            personal_ratings={},
        )
    )

    # ── 1. Parse shopping list + safety-critical budget extraction ────────────
    shopping_list = consumer.parse_shopping_list(instruction)
    regex_budget = consumer.extract_budget(instruction)
    # Budget precedence: regex from the instruction (safety-critical) > form
    # budget > preference default. Never trust the LLM alone for this number.
    budget = (
        regex_budget
        if regex_budget is not None
        else (float(mission["budget"]) if mission.get("budget") else prefs.get("default_budget"))
    )
    if budget is None:
        budget = 1e9  # no budget stated → effectively unconstrained
    consumer.config.budget = budget
    consumer.remaining_budget = budget

    publish_mission_event(
        mission_id,
        {
            "event": "list_parsed",
            "items": shopping_list,
            "budget": budget,
            "budget_source": "regex" if regex_budget is not None else "form_or_default",
        },
    )
    update_mission_status(mission_id, "active", parsed_list=shopping_list, budget=budget)

    if not shopping_list:
        update_mission_status(mission_id, "failed")
        publish_mission_event(mission_id, {"event": "mission_failed", "reason": "empty_shopping_list"})
        return {"mission_id": mission_id, "status": "failed", "results": []}

    # ── 2. Route planning (Pinecone semantic match + scoring) ─────────────────
    route = consumer.plan_route(shopping_list)
    publish_mission_event(mission_id, {"event": "route_planned", "route": route})

    # ── 3. Negotiate each item against up to 3 candidates ─────────────────────
    results: list[dict] = []
    for leg in route:
        item = leg["item"]
        candidates = leg["candidates"][:MAX_CANDIDATES_PER_ITEM]
        item_result = {"item": item["item"], "outcome": "no_deal", "negotiations": []}

        for cand in candidates:
            built = _build_vendor_agent(sb, cand["product_id"])
            if built is None:
                continue
            vendor_agent, product, shop = built

            # Fresh conversation per vendor (budget persists, memory does not).
            consumer.memory = []

            neg = orchestrator.run_negotiation(consumer, vendor_agent, item, mission_id)
            item_result["negotiations"].append(neg)

            if neg["outcome"] == "deal" and neg["final_price"] is not None:
                # Debit budget reservation so subsequent items are budget-checked correctly,
                # even before the consumer approves the payment in the UI.
                consumer.remaining_budget -= neg["final_price"]
                item_result["outcome"] = "deal"
                item_result["final_price"] = neg["final_price"]
                item_result["shop"] = shop["name"]
                item_result["negotiation_id"] = neg["negotiation_id"]

                # Phase 2: Emit payment_pending — frontend shows PaymentApprovalModal and
                # the user explicitly approves via POST /api/v1/payments/mock-approve.
                # Phase 3 replaces that endpoint's body with real Razorpay MCP calls.
                # No LLM output ever reaches payment execution — Three-Layer Money Rule Layer 3.
                publish_mission_event(
                    mission_id,
                    {
                        "event": "payment_pending",
                        "item": item["item"],
                        "shop": shop["name"],
                        "negotiation_id": neg["negotiation_id"],
                        "product_id": product["id"],
                        "shop_id": shop["id"],
                        "consumer_id": consumer_id,
                        "amount": neg["final_price"],
                        "opening_price": float(product["price"]),
                    },
                )
                break  # deal struck — stop trying candidates for this item

        results.append(item_result)

    update_mission_status(mission_id, "completed")
    publish_mission_event(
        mission_id,
        {
            "event": "mission_complete",
            "mission_id": mission_id,
            "results": results,
            "remaining_budget": consumer.remaining_budget,
        },
    )
    return {"mission_id": mission_id, "status": "completed", "results": results}


@celery_app.task(name="run_mission_task")
def run_mission_task(mission_id: str) -> dict:
    """Celery entrypoint. Robust for the multi-LLM-call duration (survives worker
    restarts, has retry semantics). Phase 3's swarm mode = N of these, not a new
    infra pattern."""
    try:
        return run_mission(mission_id)
    except Exception as exc:
        logger.exception("Mission %s failed", mission_id)
        try:
            update_mission_status(mission_id, "failed")
            publish_mission_event(mission_id, {"event": "mission_failed", "reason": str(exc)})
        except Exception:
            pass
        raise
