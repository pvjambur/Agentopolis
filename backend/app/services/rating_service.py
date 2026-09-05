"""Auto-rating service — Haiku rates every negotiation, real data feeds route planning.

Called after every negotiation completes (deal or no-deal). Cheap: Haiku + one INSERT.
get_avg_rating() replaces the ConsumerAgent's hardcoded 3.0 stub so route-planning
scores now reflect the consumer's actual experience with each shop.
"""
from __future__ import annotations

import json
import logging
import re

from anthropic import Anthropic

from app.config import settings
from app.db.supabase_client import get_supabase_client

logger = logging.getLogger(__name__)

HAIKU_MODEL = "claude-haiku-4-5-20251001"

_OUTCOME_HUMAN = {
    "deal": "successful deal",
    "no_deal": "no deal reached",
    "walked_away": "vendor walked away",
    "insufficient_balance": "deal blocked by insufficient wallet",
    "timeout": "negotiation timed out",
    "payment_failed": "payment failed after deal",
}


def _parse_haiku_rating(text: str) -> dict | None:
    """Extract JSON from Haiku's response — it may wrap it in prose or fences."""
    text = text.strip()
    fence = re.search(r"```(?:json)?\s*(.*?)```", text, re.DOTALL)
    if fence:
        text = fence.group(1).strip()
    start, end = text.find("{"), text.rfind("}")
    if start != -1 and end != -1:
        try:
            return json.loads(text[start : end + 1])
        except json.JSONDecodeError:
            pass
    return None


def auto_rate_negotiation(
    negotiation_id: str,
    consumer_id: str,
    shop_id: str,
    outcome: str,
    round_count: int,
    opening_price: float,
    final_price: float | None,
) -> None:
    """Ask Haiku to auto-rate the negotiation and persist the result.

    Non-blocking: any failure is logged, never re-raised. Route planning degrades
    gracefully to the 3.0 default for shops without a rating row.
    """
    if not settings.anthropic_api_key:
        return

    # Skip if we already have a rating row for this negotiation (idempotent)
    sb = get_supabase_client()
    existing = (
        sb.table("ratings")
        .select("id")
        .eq("negotiation_id", negotiation_id)
        .limit(1)
        .execute()
    )
    if existing.data:
        return

    outcome_label = _OUTCOME_HUMAN.get(outcome, outcome)
    final_str = f"₹{final_price:.0f}" if final_price else "none"
    prompt = (
        f"Rate this vendor negotiation 1-5.\n"
        f"Outcome: {outcome_label}. Rounds: {round_count}. "
        f"Opening: ₹{opening_price:.0f}, Final: {final_str}.\n\n"
        f"Rules: 5 = excellent (great deal, fair rounds), 1 = terrible (walked away or no deal, many rounds).\n"
        f'Return ONLY valid JSON: {{"score": 1-5, "sentiment": "positive"|"neutral"|"negative", "notes": "one sentence"}}'
    )

    try:
        client = Anthropic(api_key=settings.anthropic_api_key)
        response = client.messages.create(
            model=HAIKU_MODEL,
            max_tokens=80,
            messages=[{"role": "user", "content": prompt}],
        )
        raw = response.content[0].text if response.content else ""
        parsed = _parse_haiku_rating(raw)
        if not parsed:
            logger.warning("Haiku returned unparseable rating for %s: %s", negotiation_id, raw)
            return

        score = int(parsed.get("score", 3))
        score = max(1, min(5, score))
        sentiment = parsed.get("sentiment", "neutral")
        if sentiment not in ("positive", "neutral", "negative"):
            sentiment = "neutral"
        notes = str(parsed.get("notes", ""))[:400]

        sb.table("ratings").insert(
            {
                "consumer_id": consumer_id,
                "shop_id": shop_id,
                "negotiation_id": negotiation_id,
                "score": score,
                "sentiment": sentiment,
                "notes": notes,
            }
        ).execute()
        logger.info(
            "Auto-rated negotiation %s: score=%d sentiment=%s", negotiation_id, score, sentiment
        )
    except Exception as exc:
        logger.warning("auto_rate_negotiation failed for %s: %s", negotiation_id, exc)


def get_avg_rating(consumer_id: str, shop_id: str) -> float:
    """Return this consumer's average rating for a shop. Falls back to 3.0 (neutral)."""
    try:
        sb = get_supabase_client()
        rows = (
            sb.table("ratings")
            .select("score")
            .eq("consumer_id", consumer_id)
            .eq("shop_id", shop_id)
            .execute()
        )
        scores = [r["score"] for r in (rows.data or []) if r.get("score")]
        if not scores:
            return 3.0
        return round(sum(scores) / len(scores), 2)
    except Exception:
        return 3.0


def get_consumer_ratings(consumer_id: str) -> list[dict]:
    """All ratings for a consumer, enriched with shop name, most-recent first."""
    try:
        sb = get_supabase_client()
        rows = (
            sb.table("ratings")
            .select("*, shops(name, domain)")
            .eq("consumer_id", consumer_id)
            .order("created_at", desc=True)
            .limit(100)
            .execute()
        )
        return rows.data or []
    except Exception as exc:
        logger.warning("get_consumer_ratings failed: %s", exc)
        return []
