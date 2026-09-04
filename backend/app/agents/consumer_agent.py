"""ConsumerAgent — personal digital twin, orchestrates shopping missions.
parse_shopping_list(), plan_route(), negotiate() are Phase 3.
check_budget() is fully implemented (Phase 1).
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import TYPE_CHECKING

from anthropic import Anthropic

from app.config import settings

if TYPE_CHECKING:
    from app.agents.vendor_agent import VendorAgent


@dataclass
class ConsumerAgentConfig:
    user_id: str
    budget: float
    preferences: dict  # price_weight, quality_weight, brand_prefs
    personal_ratings: dict  # vendor_id -> {score, notes}


class ConsumerAgent:
    def __init__(self, config: ConsumerAgentConfig) -> None:
        self.config = config
        self.client = Anthropic(api_key=settings.anthropic_api_key)
        self.remaining_budget: float = config.budget

    def parse_shopping_list(self, instruction_text: str) -> list[dict]:
        """Phase 3: use Groq Llama to parse natural-language instruction into
        structured item list [{name, quantity, max_price, priority}]."""
        raise NotImplementedError("Phase 3")

    def plan_route(self, marketplace: list[dict]) -> list[dict]:
        """Phase 3: score and rank vendors per shopping item.

        Factors: price, personal_rating, stock, domain_match, vendor_type.
        Returns ordered list of {vendor_id, item, score, reason}.
        """
        raise NotImplementedError("Phase 3")

    def negotiate(self, vendor_agent: VendorAgent, item: dict) -> dict:
        """Phase 3: multi-round negotiation loop (max 5 rounds) against a VendorAgent.

        Returns: {status, final_price, rounds, transcript}
        """
        raise NotImplementedError("Phase 3")

    def check_budget(self, proposed_price: float) -> bool:
        """Layer 2 guardrail — pure code, no LLM.

        Returns True only if proposed_price <= remaining_budget.
        Called by the Orchestrator before any spend can be accepted.
        """
        return proposed_price <= self.remaining_budget
