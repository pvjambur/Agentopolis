"""ConsumerAgent — personal digital twin, orchestrates shopping missions.

Phase 2 implements:
  - parse_shopping_list()  (Groq Llama, JSON, regex budget fallback)
  - extract_budget()       (safety-critical figure — regex, not LLM-trusted)
  - plan_route()           (Pinecone semantic search + multi-factor scoring)
  - get_personal_rating()  (intentional stub — no ratings table until Phase 3)
  - negotiate_round()      (Claude tool_use counter-offer)

check_budget() is the Phase 1 Layer-2 guardrail — DO NOT modify it.
"""
from __future__ import annotations

import json
import logging
import re
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import TYPE_CHECKING

from anthropic import Anthropic
from groq import Groq

from app.agents.prompts.negotiation_schema import NEGOTIATION_TOOL_SCHEMA
from app.config import settings

if TYPE_CHECKING:
    from app.agents.vendor_agent import VendorAgent

logger = logging.getLogger(__name__)

CLAUDE_MODEL = "claude-sonnet-4-6"
# Doc specifies llama-3.3-70b-versatile, but that model is not provisioned on
# this Groq account. openai/gpt-oss-120b is the strongest instruct model this
# key can access and follows the JSON-only parsing prompt reliably.
GROQ_MODEL = "openai/gpt-oss-120b"

# ₹350 / Rs 350 / 350 rupees / budget 350 — first currency-ish figure wins
_BUDGET_PATTERNS = [
    r"₹\s*([0-9]+(?:\.[0-9]+)?)",
    r"(?:rs\.?|inr|rupees?)\s*([0-9]+(?:\.[0-9]+)?)",
    r"budget\s*(?:of|is|:)?\s*([0-9]+(?:\.[0-9]+)?)",
]


@dataclass
class ConsumerAgentConfig:
    user_id: str
    budget: float
    preferences: dict          # price_weight, quality_weight, brand_prefs
    personal_ratings: dict     # vendor_id -> {score, notes}


def _extract_json_array(text: str) -> list[dict]:
    """Groq sometimes wraps JSON in prose / markdown fences. Extract the array."""
    text = text.strip()
    # strip ```json ... ``` fences
    fence = re.search(r"```(?:json)?\s*(.*?)```", text, re.DOTALL)
    if fence:
        text = fence.group(1).strip()
    # find the outermost [ ... ]
    start = text.find("[")
    end = text.rfind("]")
    if start != -1 and end != -1 and end > start:
        text = text[start : end + 1]
    return json.loads(text)


class ConsumerAgent:
    def __init__(self, config: ConsumerAgentConfig) -> None:
        self.config = config
        self.client = Anthropic(api_key=settings.anthropic_api_key)
        self.groq = Groq(api_key=settings.groq_api_key)
        self.remaining_budget: float = config.budget
        self.memory: list[dict] = []

    # ── 1. Shopping-list parsing (Groq Llama) ─────────────────────────────────

    def parse_shopping_list(self, instruction_text: str) -> list[dict]:
        """Groq Llama → structured item list. Returns [{item, quantity, notes}]."""
        response = self.groq.chat.completions.create(
            model=GROQ_MODEL,
            messages=[
                {
                    "role": "system",
                    "content": (
                        "Extract a shopping list from natural language. Return ONLY "
                        'valid JSON: [{"item": "apples", "quantity": "2 kg", "notes": ""}]. '
                        "No other text, no markdown."
                    ),
                },
                {"role": "user", "content": instruction_text},
            ],
            temperature=0.1,
        )
        raw = response.choices[0].message.content or "[]"
        try:
            items = _extract_json_array(raw)
        except json.JSONDecodeError:
            logger.warning("Groq returned unparseable list: %s", raw)
            items = []
        # normalise keys — guarantee an "item" key downstream code relies on
        cleaned: list[dict] = []
        for it in items:
            if not isinstance(it, dict):
                continue
            name = it.get("item") or it.get("name")
            if not name:
                continue
            cleaned.append(
                {
                    "item": str(name),
                    "quantity": str(it.get("quantity", "")),
                    "notes": str(it.get("notes", "")),
                }
            )
        return cleaned

    def extract_budget(self, instruction_text: str) -> float | None:
        """Safety-critical: pull the budget figure with regex, NOT the LLM.

        This number feeds directly into check_budget(), a Layer-2 guardrail, so
        we never trust the LLM to separate it from item quantities. First
        currency-anchored figure wins.
        """
        for pattern in _BUDGET_PATTERNS:
            m = re.search(pattern, instruction_text, re.IGNORECASE)
            if m:
                try:
                    return float(m.group(1))
                except ValueError:
                    continue
        return None

    # ── 2. Route planning (Pinecone + multi-factor scoring) ───────────────────

    def get_personal_rating(self, shop_id: str) -> float:
        """Stub for this phase — ratings table doesn't exist until Phase 3.

        Always returns a neutral default so the scoring formula still works
        correctly (personal rating is just a no-op weight this phase, not a
        bug — the formula degrades gracefully to price + semantic-match only).
        """
        return 3.0

    def plan_route(self, shopping_list: list[dict]) -> list[dict]:
        """Semantic-match each item to candidate products, score, rank top 3.

        score = (1 - price_norm) * price_weight * 0.5
              + semantic_similarity      * 0.3
              + (personal_rating / 5)    * 0.2
        """
        from app.services.embedding_service import embed_text
        from app.db.pinecone_client import get_pinecone_index

        index = get_pinecone_index()
        price_weight = float(self.config.preferences.get("price_weight", 0.7))

        route: list[dict] = []
        for item in shopping_list:
            query_vector = embed_text(item["item"])
            matches = index.query(
                vector=query_vector, top_k=5, include_metadata=True
            )
            raw = list(matches.matches)
            if not raw:
                route.append({"item": item, "candidates": []})
                continue

            prices = [float(m.metadata.get("price", 0)) for m in raw]
            p_min, p_max = min(prices), max(prices)
            span = (p_max - p_min) or 1.0  # avoid /0 when all prices equal

            scored: list[dict] = []
            for m in raw:
                meta = m.metadata
                if not meta.get("product_id"):
                    continue  # skip vectors lacking product metadata (stale/partial)
                price = float(meta.get("price", 0))
                price_norm = (price - p_min) / span
                personal_rating = self.get_personal_rating(meta.get("shop_id", ""))
                score = (
                    (1 - price_norm) * price_weight * 0.5
                    + float(m.score) * 0.3
                    + (personal_rating / 5) * 0.2
                )
                scored.append(
                    {
                        "product_id": meta.get("product_id"),
                        "shop_id": meta.get("shop_id"),
                        "name": meta.get("name"),
                        "price": price,
                        "semantic_score": round(float(m.score), 4),
                        "score": round(score, 4),
                    }
                )

            scored.sort(key=lambda x: x["score"], reverse=True)
            route.append({"item": item, "candidates": scored[:3]})
        return route

    # ── 3. Counter-offer round (Claude tool_use) ──────────────────────────────

    def _build_system_prompt(self, item: dict, context: dict) -> str:
        prefs = self.config.preferences
        price_weight = float(prefs.get("price_weight", 0.7))
        quality_weight = round(1.0 - price_weight, 2)
        return f"""You are a savvy personal shopping agent negotiating on behalf of your owner.

GOAL: buy "{item['item']}" (quantity: {item.get('quantity', 'unspecified')}) at the best price.
REMAINING BUDGET: ₹{self.remaining_budget:.2f} — you MUST NOT propose a price above this.
PRIORITY: price weight {price_weight}, quality weight {quality_weight}
  - Higher price weight = haggle harder for a lower price.
  - Higher quality weight = accept a fair price sooner if the product is good.

RULES:
- Respond with the negotiation_response tool, always.
- Counter-offer below the vendor's price, but stay realistic — lowball once, then move toward a fair middle.
- Keep messages short (1-2 sentences), natural, in-character.
- Accept ("action": "accept") when the vendor's price is reasonable and within budget.
- Never propose a price above your remaining budget of ₹{self.remaining_budget:.2f}.
"""

    def negotiate_round(self, vendor_response: dict, context: dict) -> dict:
        """One consumer counter-offer, structured via NEGOTIATION_TOOL_SCHEMA."""
        vendor_msg = (
            f'The vendor said: "{vendor_response.get("message", "")}" '
            f'and proposed ₹{vendor_response.get("proposed_price")}.'
        )
        self.memory.append({"role": "user", "content": vendor_msg})

        item = context.get("item", {"item": "the item"})
        response = self.client.messages.create(
            model=CLAUDE_MODEL,
            max_tokens=300,
            system=self._build_system_prompt(item, context),
            messages=self.memory,
            tools=[NEGOTIATION_TOOL_SCHEMA],
            tool_choice={"type": "tool", "name": "negotiation_response"},
        )
        tool_use = next(b for b in response.content if b.type == "tool_use")
        result = dict(tool_use.input)
        # Store our own turn as plain text — keeps memory valid (no dangling
        # tool_use blocks that would require tool_result on the next turn).
        self.memory.append({"role": "assistant", "content": result.get("message", "")})
        result["timestamp"] = datetime.now(timezone.utc).isoformat()
        return result

    # ── Phase 1 guardrail — DO NOT MODIFY ─────────────────────────────────────

    def check_budget(self, proposed_price: float) -> bool:
        """Layer 2 guardrail — pure code, no LLM.

        Returns True only if proposed_price <= remaining_budget.
        Called by the Orchestrator before any spend can be accepted.
        """
        return proposed_price <= self.remaining_budget
