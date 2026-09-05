"""VendorAgent — negotiates with consumer agents using Anthropic tool_use.

Personality types: negotiator | fixed_mrp | loyalty | premium (all four live
as of Phase 3). `respond()` dispatches to a personality-specific system prompt;
every path shares the SAME NEGOTIATION_TOOL_SCHEMA and the SAME Orchestrator
guardrails. The per-personality discount caps (0% fixed_mrp, tiered loyalty,
5% premium) are behavioural bounds baked into the prompt via an effective
minimum price — they never replace the hard floor_price guardrail, which is
enforced identically for all four personalities in Orchestrator.validate_round.

check_floor_price() is the Phase 1 Layer-2 guardrail — DO NOT modify it.
"""
from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone

from anthropic import Anthropic

from app.agents.prompts.negotiation_schema import NEGOTIATION_TOOL_SCHEMA
from app.config import settings

CLAUDE_MODEL = "claude-sonnet-4-6"

# loyalty tier → maximum discount the vendor may offer that tier (percent off list)
LOYALTY_DISCOUNT_MAP: dict[str, int] = {"new": 5, "returning": 12, "frequent": 20}

# premium personality is capped at a firm 5% courtesy discount, no exceptions
PREMIUM_MAX_DISCOUNT_PERCENT = 5.0


@dataclass
class VendorAgentConfig:
    shop_id: str
    personality: str  # negotiator | fixed_mrp | loyalty | premium
    negotiation_rules: dict
    catalog: list[dict]  # each item: {id, name, price, floor_price, ...}
    shop_name: str = ""
    domain: str = ""
    # Only meaningful for the loyalty personality — the buyer's standing with
    # this shop, computed from prior completed deals before the agent is built.
    loyalty_tier: str = "new"


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

    # ── System-prompt construction (personality dispatch) ─────────────────────

    def _effective_min_price(self, max_discount_percent: float) -> float:
        """Lowest price this personality may propose: the deeper of its own
        discount cap and the hard floor_price. Floor always wins if it's higher
        than the personality's cap — the guardrail is never softened."""
        p = self.product
        assert p is not None
        floor = float(p["floor_price"])
        discounted = round(float(p["price"]) * (1 - max_discount_percent / 100.0), 2)
        return max(floor, discounted)

    def _build_system_prompt(self) -> str:
        """Dispatch to the personality-specific system prompt."""
        assert self.product is not None, "VendorAgent.product must be set before respond()"
        personality = self.config.personality
        if personality == "fixed_mrp":
            return self._build_system_prompt_fixed_mrp()
        if personality == "loyalty":
            return self._build_system_prompt_loyalty(self.config.loyalty_tier)
        if personality == "premium":
            return self._build_system_prompt_premium()
        return self._build_system_prompt_negotiator()

    def _build_system_prompt_negotiator(self) -> str:
        """Flexible haggler — the Phase 2 personality."""
        p = self.product
        assert p is not None
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

    def _build_system_prompt_fixed_mrp(self) -> str:
        """No negotiation at all — the listed price IS the floor."""
        p = self.product
        assert p is not None
        price = float(p["price"])
        return f"""You are the AI agent for {self.shop_name}. This shop does NOT negotiate.

PERSONALITY: fixed_mrp
PRODUCT: {p['name']} at ₹{price:.2f} (this IS the price — no discounts, ever).

RULES:
- Your FIRST response: state the fixed price with action "offer" and proposed_price ₹{price:.2f}, politely: "This is our fixed price of ₹{price:.2f}, I'm not able to negotiate on it."
- Never accept or propose a price below ₹{price:.2f}. proposed_price must ALWAYS equal ₹{price:.2f}.
- If the buyer counters or asks for a discount, action = "reject" (never "counter").
- Respond with the negotiation_response tool, always. Keep messages 1-2 sentences.
"""

    def _build_system_prompt_loyalty(self, tier: str) -> str:
        """Rewards returning buyers with tiered discount caps."""
        p = self.product
        assert p is not None
        discount = LOYALTY_DISCOUNT_MAP.get(tier, LOYALTY_DISCOUNT_MAP["new"])
        min_price = self._effective_min_price(discount)
        greeting = (
            'Greet warmly — "Ah, good to see you again!" — and reward their loyalty with a strong opening offer.'
            if tier in ("returning", "frequent")
            else "Be friendly but, as a first-time buyer, open closer to the list price."
        )
        return f"""You are the AI agent for {self.shop_name}. PERSONALITY: warm, loyalty-driven.

This buyer's loyalty tier: {tier}. Maximum discount you may offer this tier: {discount}%.
{greeting}

PRODUCT: {p['name']}, listed at ₹{float(p['price']):.2f}, your absolute minimum price ₹{min_price:.2f} (NEVER go below this — floor price ₹{float(p['floor_price']):.2f}).

RULES:
- Never state or imply a price below ₹{min_price:.2f}. proposed_price must always be >= ₹{min_price:.2f}.
- After {self._min_rounds_before_accept} round(s) minimum, you may accept a reasonable offer.
- Respond with the negotiation_response tool, always. Keep messages 1-2 sentences, warm and personal.
"""

    def _build_system_prompt_premium(self) -> str:
        """Premium-positioned — firm, minimal (max 5%) discount."""
        p = self.product
        assert p is not None
        min_price = self._effective_min_price(PREMIUM_MAX_DISCOUNT_PERCENT)
        return f"""You are the AI agent for {self.shop_name}, a premium-positioned shop.

PERSONALITY: professional, confident, minimal negotiation (max {PREMIUM_MAX_DISCOUNT_PERCENT:.0f}% off).
PRODUCT: {p['name']}, listed at ₹{float(p['price']):.2f}, your absolute minimum price ₹{min_price:.2f} (a strict {PREMIUM_MAX_DISCOUNT_PERCENT:.0f}% cap — NEVER go below this; floor price ₹{float(p['floor_price']):.2f}).

RULES:
- Never sound desperate. Frame quality as the justification: "Our quality speaks for itself, but I can offer a small courtesy discount."
- Never state or imply a price below ₹{min_price:.2f}. proposed_price must always be >= ₹{min_price:.2f}.
- Respond with the negotiation_response tool, always. Keep messages 1-2 sentences, poised and confident.
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
