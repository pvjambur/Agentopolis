"""VendorAgent — negotiates with consumer agents using Anthropic tool_use.

Personality types: negotiator | fixed_mrp | loyalty | premium.
Phase 2 implements the `negotiator` personality only (per scope). The other
three are accepted as config but fall back to negotiator behaviour until the
engine covers them in Phase 3.

check_floor_price() is the Phase 1 Layer-2 guardrail — DO NOT modify it.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone

from anthropic import Anthropic

from app.agents.prompts.negotiation_schema import NEGOTIATION_TOOL_SCHEMA
from app.config import settings

CLAUDE_MODEL = "claude-sonnet-4-6"


@dataclass
class VendorAgentConfig:
    shop_id: str
    personality: str  # negotiator | fixed_mrp | loyalty | premium
    negotiation_rules: dict
    catalog: list[dict]  # each item: {id, name, price, floor_price, ...}
    shop_name: str = ""
    domain: str = ""


class VendorAgent:
    def __init__(self, config: VendorAgentConfig, product: dict | None = None) -> None:
        self.config = config
        self.client = Anthropic(api_key=settings.anthropic_api_key)
        self.memory: list[dict] = []
        # The specific product this agent is negotiating in the current session.
        self.product: dict | None = product

    # convenience accessors over the config's negotiation_rules dict
    @property
    def shop_name(self) -> str:
        return self.config.shop_name or "our shop"

    @property
    def domain(self) -> str:
        return self.config.domain or "general"

    @property
    def _max_discount_percent(self) -> float:
        return float(self.config.negotiation_rules.get("max_discount_percent", 15))

    @property
    def _tone(self) -> str:
        return str(self.config.negotiation_rules.get("tone", "friendly"))

    @property
    def _min_rounds_before_accept(self) -> int:
        return int(self.config.negotiation_rules.get("min_rounds_before_accept", 1))

    def _build_system_prompt(self) -> str:
        """Construct the negotiator system prompt from product + rules."""
        assert self.product is not None, "VendorAgent.product must be set before respond()"
        p = self.product
        return f"""You are the AI negotiation agent for {self.shop_name}, a {self.domain} shop.

PERSONALITY: negotiator
- Be flexible and {self._tone}. You may discount up to {self._max_discount_percent}% off the listed price, and may offer bundles.

PRODUCT: {p['name']}, listed at ₹{float(p['price']):.2f}, floor price ₹{float(p['floor_price']):.2f} (NEVER go below this).

RULES:
- Never state or imply a price below your floor price of ₹{float(p['floor_price']):.2f}.
- Respond with the negotiation_response tool, always.
- Keep messages short (1-2 sentences), natural, in-character.
- After {self._min_rounds_before_accept} round(s) minimum, you may accept a reasonable offer.
- Your proposed_price must always be >= your floor price.
"""

    def respond(self, buyer_message: str, context: dict) -> dict:
        """Call Claude with forced tool_use for a structured negotiation round.

        Returns dict: {message, proposed_price, action, reasoning, emotion, timestamp}
        """
        self.memory.append({"role": "user", "content": buyer_message})

        response = self.client.messages.create(
            model=CLAUDE_MODEL,
            max_tokens=300,
            system=self._build_system_prompt(),
            messages=self.memory,
            tools=[NEGOTIATION_TOOL_SCHEMA],
            tool_choice={"type": "tool", "name": "negotiation_response"},
        )
        tool_use = next(b for b in response.content if b.type == "tool_use")
        result = dict(tool_use.input)
        # Store our own turn as plain text — keeps memory valid across rounds
        # (no dangling tool_use blocks requiring tool_result on the next turn).
        self.memory.append({"role": "assistant", "content": result.get("message", "")})
        result["timestamp"] = datetime.now(timezone.utc).isoformat()
        return result

    # ── Phase 1 guardrail — DO NOT MODIFY ─────────────────────────────────────

    def check_floor_price(self, proposed_price: float, product_id: str) -> bool:
        """Layer 2 guardrail — pure code, no LLM.

        Returns True only if proposed_price >= the product's floor_price.
        Called by the Orchestrator before any price can be accepted.
        """
        product = next(
            (p for p in self.config.catalog if p["id"] == product_id), None
        )
        if not product:
            return False
        return proposed_price >= product["floor_price"]
