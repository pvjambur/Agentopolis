"""Mission orchestration — Celery tasks for single-agent and swarm modes.

Single: run_mission_task → one agent negotiates all items sequentially.
Swarm:  run_mission_task → parse + plan → dispatch run_scout_task per domain.
        Each scout runs independently. Budget atomically guarded by Redis Lua.

All 5 failure scenarios are genuine code paths reachable through normal operation:
  1. Out of stock        — skip candidate before opening negotiation.
  2. Negotiation deadlock — orchestrator walks_away; recorded in negotiations table.
  3. Insufficient wallet  — wallet check before emitting payment_pending.
  4. Payment failure      — webhook handler publishes payment_failed WS event.
  5. LLM timeout          — orchestrator._call_with_timeout → outcome="timeout".
"""
from __future__ import annotations

import logging
from decimal import Decimal

from app.agents.consumer_agent import ConsumerAgent, ConsumerAgentConfig
from app.agents.orchestrator import Orchestrator
from app.agents.vendor_agent import VendorAgent, VendorAgentConfig
from app.celery_app import celery_app
from app.config import settings
from app.db.supabase_client import get_supabase_client
from app.services.negotiation_repo import get_loyalty_tier, update_mission_status
from app.services.rating_service import auto_rate_negotiation
from app.ws.events import publish_mission_event

logger = logging.getLogger(__name__)

MAX_CANDIDATES_PER_ITEM = 3

_DEFAULT_VENDOR_RULES = {
    "max_discount_percent": 15,
    "tone": "friendly",
    "bundling_enabled": True,
    "min_rounds_before_accept": 1,
}


# ── Redis atomic budget reservation (Scenario: race-condition in swarm) ────────

def _initialize_swarm_budget(mission_id: str, budget: float) -> None:
    """Seed the Redis counter (paise) for atomic swarm budget deductions."""
    from app.services.cache import get_redis_client
    key = f"mission:{mission_id}:remaining_budget"
    get_redis_client().set(key, int(Decimal(str(budget)) * 100), ex=7200)


def try_reserve_budget(mission_id: str, amount: float) -> bool:
    """Atomically deduct amount from the shared swarm budget.

    Lua script runs atomically in Redis — two scouts hitting the last ₹50 at
    the same millisecond cannot both succeed. Returns True if reserved.
    """
    from app.services.cache import get_redis_client
    key = f"mission:{mission_id}:remaining_budget"
    amount_paise = int(Decimal(str(amount)) * 100)
    lua = """
local cur = tonumber(redis.call('get', KEYS[1]))
if cur == nil then return 0 end
if cur >= tonumber(ARGV[1]) then
    redis.call('decrby', KEYS[1], ARGV[1])
    return 1
else
    return 0
end
"""
    result = get_redis_client().eval(lua, 1, key, amount_paise)
    return bool(result)


# ── DB helpers ────────────────────────────────────────────────────────────────

def _load_shop_catalog(sb, shop_id: str) -> list[dict]:
    rows = (
        sb.table("products")
        .select("id,name,price,floor_price,stock_count")
        .eq("shop_id", shop_id)
        .execute()
    )
    return [
        {
            "id": r["id"],
            "name": r["name"],
            "price": float(r["price"]),
            "floor_price": float(r["floor_price"]),
            "stock_count": r.get("stock_count", 0),
        }
        for r in (rows.data or [])
    ]


def _build_vendor_agent(
    sb, product_id: str, consumer_id: str
) -> tuple[VendorAgent, dict, dict] | None:
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

    cfg_row = (
        sb.table("agent_configs")
        .select("personality,negotiation_rules")
        .eq("user_id", shop["vendor_id"])
        .eq("agent_type", "vendor")
        .limit(1)
        .execute()
    )
    rules = dict(_DEFAULT_VENDOR_RULES)
    personality = shop.get("agent_personality") or "negotiator"
    if cfg_row.data:
        cfg = cfg_row.data[0]
        if cfg.get("negotiation_rules"):
            rules.update(cfg["negotiation_rules"])
        cfg_personality = (cfg.get("personality") or {}).get("personality_type")
        if cfg_personality:
            personality = cfg_personality

    loyalty_tier = "new"
    if personality == "loyalty":
        loyalty_tier = get_loyalty_tier(consumer_id, shop["id"])

    vconfig = VendorAgentConfig(
        shop_id=shop["id"],
        personality=personality,
        negotiation_rules=rules,
        catalog=_load_shop_catalog(sb, shop["id"]),
        shop_name=shop["name"],
        domain=shop["domain"],
        loyalty_tier=loyalty_tier,
    )
    return VendorAgent(vconfig, product=product), product, shop


def _get_consumer_wallet_balance(sb, consumer_id: str) -> float:
    """Fetch the consumer's current platform wallet balance."""
    row = (
        sb.table("wallets")
        .select("balance")
        .eq("user_id", consumer_id)
        .limit(1)
        .execute()
    )
    return float(row.data[0]["balance"]) if row.data else 0.0


def _update_negotiation_outcome(sb, negotiation_id: str, outcome: str) -> None:
    sb.table("negotiations").update({"outcome": outcome}).eq("id", negotiation_id).execute()


# ── Core item negotiation loop (shared by single and scout) ───────────────────

def _negotiate_item(
    sb,
    orchestrator: Orchestrator,
    consumer: ConsumerAgent,
    consumer_id: str,
    mission_id: str,
    item: dict,
    candidates: list[dict],
    swarm_mode: bool = False,
    agent_id: str = "consumer",
) -> dict:
    """Try up to MAX_CANDIDATES_PER_ITEM candidates for one item.

    Returns item_result dict. Handles all 5 failure scenarios inline.
    """
    item_result: dict = {"item": item["item"], "outcome": "no_deal", "negotiations": []}

    for cand in candidates[:MAX_CANDIDATES_PER_ITEM]:
        built = _build_vendor_agent(sb, cand["product_id"], consumer_id)
        if built is None:
            continue
        vendor_agent, product, shop = built

        # ── Scenario 1: Out of Stock ──────────────────────────────────────────
        if int(product.get("stock_count") or 0) <= 0:
            publish_mission_event(
                mission_id,
                {
                    "event": "item_skipped",
                    "item": item["item"],
                    "shop": shop["name"],
                    "reason": "out_of_stock",
                    "message": f"{shop['name']} is out of {item['item']}. Trying next option.",
                },
            )
            logger.info("Skipping %s at %s — out of stock", item["item"], shop["name"])
            continue

        consumer.memory = []
        neg = orchestrator.run_negotiation(consumer, vendor_agent, item, mission_id, agent_id=agent_id)
        item_result["negotiations"].append(neg)

        # Auto-rate every completed negotiation (Part B — Haiku, non-blocking)
        try:
            auto_rate_negotiation(
                negotiation_id=neg["negotiation_id"],
                consumer_id=consumer_id,
                shop_id=shop["id"],
                outcome=neg["outcome"],
                round_count=neg["round_count"],
                opening_price=float(product["price"]),
                final_price=neg["final_price"],
            )
        except Exception as exc:
            logger.warning("auto_rate_negotiation raised: %s", exc)

        if neg["outcome"] == "deal" and neg["final_price"] is not None:
            final_price = float(neg["final_price"])

            # ── Scenario 3: Insufficient Wallet Balance ───────────────────────
            wallet_balance = _get_consumer_wallet_balance(sb, consumer_id)
            if wallet_balance < final_price:
                shortfall = final_price - wallet_balance
                _update_negotiation_outcome(sb, neg["negotiation_id"], "insufficient_balance")
                publish_mission_event(
                    mission_id,
                    {
                        "event": "insufficient_balance",
                        "item": item["item"],
                        "shop": shop["name"],
                        "negotiation_id": neg["negotiation_id"],
                        "amount": final_price,
                        "balance": wallet_balance,
                        "shortfall": shortfall,
                        "message": (
                            f"Wallet ₹{wallet_balance:.0f} — ₹{shortfall:.0f} short for "
                            f"{item['item']} at ₹{final_price:.0f}. Item skipped."
                        ),
                    },
                )
                item_result["outcome"] = "insufficient_balance"
                break

            # Swarm: atomically reserve from the shared Redis budget pool
            if swarm_mode:
                if not try_reserve_budget(mission_id, final_price):
                    _update_negotiation_outcome(sb, neg["negotiation_id"], "insufficient_balance")
                    publish_mission_event(
                        mission_id,
                        {
                            "event": "insufficient_balance",
                            "item": item["item"],
                            "shop": shop["name"],
                            "negotiation_id": neg["negotiation_id"],
                            "amount": final_price,
                            "message": f"Shared budget exhausted — {item['item']} skipped.",
                        },
                    )
                    item_result["outcome"] = "insufficient_balance"
                    break

            consumer.remaining_budget -= final_price
            item_result.update(
                {
                    "outcome": "deal",
                    "final_price": final_price,
                    "shop": shop["name"],
                    "negotiation_id": neg["negotiation_id"],
                }
            )
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
                    "amount": final_price,
                    "opening_price": float(product["price"]),
                    "payment_mode": settings.payment_mode,
                },
            )
            break  # deal struck

        # ── Scenario 2: Deadlock (walked_away / no_deal) ─────────────────────
        # Already recorded in negotiations table with the real outcome value.
        # The orchestrator already published a human-readable negotiation_blocked event.

        # ── Scenario 5: LLM Timeout ───────────────────────────────────────────
        if neg["outcome"] == "timeout":
            break  # don't try next candidate — systemic issue

    return item_result


# ── Single-agent mission ──────────────────────────────────────────────────────

def run_mission(mission_id: str) -> dict:
    """Execute a full shopping mission. Called by the Celery task below."""
    sb = get_supabase_client()
    orchestrator = Orchestrator(max_rounds=5)

    mission_row = sb.table("missions").select("*").eq("id", mission_id).limit(1).execute()
    if not mission_row.data:
        raise ValueError(f"Mission {mission_id} not found")
    mission = mission_row.data[0]
    consumer_id = mission["consumer_id"]
    instruction = mission["instruction_text"]

    publish_mission_event(mission_id, {"event": "mission_started", "mission_id": mission_id})

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

    tmp_budget = float(mission["budget"]) if mission.get("budget") else 1e9
    consumer = ConsumerAgent(
        ConsumerAgentConfig(
            user_id=consumer_id,
            budget=tmp_budget,
            preferences=prefs,
            personal_ratings={},
        )
    )

    shopping_list = consumer.parse_shopping_list(instruction)
    regex_budget = consumer.extract_budget(instruction)
    budget = (
        regex_budget
        if regex_budget is not None
        else (float(mission["budget"]) if mission.get("budget") else prefs.get("default_budget"))
    )
    if budget is None:
        budget = 1e9
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

    route = consumer.plan_route(shopping_list)
    publish_mission_event(mission_id, {"event": "route_planned", "route": route})

    is_swarm = mission.get("mode") == "swarm"
    if is_swarm:
        _initialize_swarm_budget(mission_id, budget)
        return _dispatch_swarm(sb, mission_id, consumer_id, consumer, route, budget)

    results: list[dict] = []
    for leg in route:
        result = _negotiate_item(
            sb, orchestrator, consumer, consumer_id, mission_id,
            leg["item"], leg["candidates"], swarm_mode=False,
        )
        results.append(result)

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


# ── Swarm dispatch ────────────────────────────────────────────────────────────

def _get_shop_domain(sb, shop_id: str) -> str:
    row = sb.table("shops").select("domain").eq("id", shop_id).limit(1).execute()
    return row.data[0]["domain"] if row.data else "general"


def _dispatch_swarm(
    sb, mission_id: str, consumer_id: str, consumer: ConsumerAgent,
    route: list[dict], budget: float,
) -> dict:
    """Group route legs by domain and dispatch one Celery scout per domain."""
    by_domain: dict[str, list[dict]] = {}
    for leg in route:
        candidates = leg.get("candidates", [])
        if not candidates:
            continue
        domain = _get_shop_domain(sb, candidates[0]["shop_id"])
        by_domain.setdefault(domain, []).append(leg)

    domains_dispatched = list(by_domain.keys())
    publish_mission_event(
        mission_id,
        {
            "event": "swarm_dispatched",
            "domains": domains_dispatched,
            "scout_count": len(domains_dispatched),
            "message": f"Dispatching {len(domains_dispatched)} scouts: {', '.join(domains_dispatched)}",
        },
    )

    for domain, legs in by_domain.items():
        run_scout_task.delay(
            mission_id,
            consumer_id,
            domain,
            legs,
            consumer.config.preferences,
            budget,
        )

    update_mission_status(mission_id, "active")
    return {"mission_id": mission_id, "status": "active", "mode": "swarm", "domains": domains_dispatched}


@celery_app.task(name="run_scout_task")
def run_scout_task(
    mission_id: str,
    consumer_id: str,
    domain: str,
    legs: list[dict],
    prefs: dict,
    budget: float,
) -> dict:
    """One scout, one domain — runs in parallel with other scouts.

    Budget is guarded by Redis Lua (try_reserve_budget) — scouts cannot
    collectively overspend even when running simultaneously.
    """
    try:
        sb = get_supabase_client()
        orchestrator = Orchestrator(max_rounds=5)

        consumer = ConsumerAgent(
            ConsumerAgentConfig(
                user_id=consumer_id,
                budget=budget,
                preferences=prefs,
                personal_ratings={},
            )
        )
        consumer.remaining_budget = budget

        publish_mission_event(
            mission_id,
            {
                "event": "scout_started",
                "domain": domain,
                "items": [leg["item"]["item"] for leg in legs],
                "message": f"Scout dispatched to {domain} zone",
            },
        )

        scout_agent_id = f"scout_{domain}"
        results: list[dict] = []
        for leg in legs:
            result = _negotiate_item(
                sb, orchestrator, consumer, consumer_id, mission_id,
                leg["item"], leg["candidates"], swarm_mode=True, agent_id=scout_agent_id,
            )
            results.append(result)

        publish_mission_event(
            mission_id,
            {
                "event": "scout_complete",
                "domain": domain,
                "results": results,
                "message": f"Scout done in {domain} — {sum(1 for r in results if r['outcome'] == 'deal')} deal(s)",
            },
        )
        return {"domain": domain, "results": results}
    except Exception as exc:
        logger.exception("Scout %s for mission %s failed", domain, mission_id)
        publish_mission_event(
            mission_id,
            {"event": "scout_failed", "domain": domain, "reason": str(exc)},
        )
        raise


# ── Celery entry points ───────────────────────────────────────────────────────

@celery_app.task(name="run_mission_task")
def run_mission_task(mission_id: str) -> dict:
    """Celery entrypoint for single and swarm missions."""
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
