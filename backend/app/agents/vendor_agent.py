"""VendorAgent — negotiates with consumer agents using Anthropic tool_use.
Personality types: negotiator | fixed_mrp | loyalty | premium.
check_floor_price() is fully implemented (Phase 1).
respond() and _build_system_prompt() are Phase 3.
"""
from dataclasses import dataclass, field

from anthropic import Anthropic

from app.config import settings


@dataclass
class VendorAgentConfig:
    shop_id: str
    personality: str  # negotiator | fixed_mrp | loyalty | premium
    negotiation_rules: dict
    catalog: list[dict]  # each item: {id, name, price, floor_price, ...}


class VendorAgent:
    def __init__(self, config: VendorAgentConfig) -> None:
        self.config = config
        self.client = Anthropic(api_key=settings.anthropic_api_key)
        self.memory: list[dict] = []

    def _build_system_prompt(self) -> str:
        """Phase 3: construct system prompt from personality + catalog + rules."""
        raise NotImplementedError("Phase 3")

    def respond(self, buyer_message: str, context: dict) -> dict:
        """Phase 3: call Claude with tool_use for structured negotiation output.

        Returns dict with keys:
            message, proposed_price, action, reasoning, emotion, timestamp
        """
        raise NotImplementedError("Phase 3")

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
