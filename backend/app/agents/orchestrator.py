"""Orchestrator — manages turn-taking negotiation loop with hard safety guardrails.

Layer 2 of the Three-Layer Money Rule:
  sanitize_message() and validate_round() are fully implemented (Phase 1).
  run_negotiation() is Phase 3.
  execute_payment() is Phase 4 — only called after validate_round passes AND
  the consumer explicitly approves in the React UI.

No LLM output ever touches Razorpay directly — non-negotiable.
"""
from __future__ import annotations

import re
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from app.agents.consumer_agent import ConsumerAgent
    from app.agents.vendor_agent import VendorAgent

# Patterns that indicate prompt-injection attempts from untrusted message content.
# Vendor/consumer message text passes through sanitize_message() before any LLM sees it.
INJECTION_PATTERNS: list[str] = [
    # One or more qualifier words before "instructions" ("ignore all previous instructions")
    r"ignore\s+(?:(?:your|all|previous)\s+)+instructions",
    r"you\s+must\s+(accept|agree|pay)",
    r"system\s*prompt",
    r"<\s*system\s*>",
    r"override",
]


class Orchestrator:
    def __init__(self, max_rounds: int = 5) -> None:
        self.max_rounds = max_rounds

    # ── Phase 1: fully implemented guardrails ─────────────────────────────────

    def sanitize_message(self, message: str) -> str:
        """Block injection attempts in message text before forwarding to LLM.

        Any match against INJECTION_PATTERNS replaces the entire message with a
        blocked sentinel. Called on every inbound turn in the negotiation loop.
        """
        for pattern in INJECTION_PATTERNS:
            if re.search(pattern, message, re.IGNORECASE):
                return "[BLOCKED: injection attempt detected]"
        return message

    def validate_round(
        self, response: dict, context: dict
    ) -> tuple[bool, str]:
        """Hard code checks — the three-layer money rule Layer 2.

        Args:
            response: agent output dict with at minimum {speaker, proposed_price}
            context:  round state dict with {round_count, floor_price, remaining_budget}

        Returns:
            (True, "") if the round is valid.
            (False, reason_string) for any guardrail violation.
        """
        if context["round_count"] > self.max_rounds:
            return False, "max_rounds_exceeded"

        if response.get("speaker") == "vendor_agent":
            if response.get("proposed_price", 0) < context["floor_price"]:
                return False, "below_floor_price"

        if response.get("speaker") == "consumer_agent":
            if response.get("proposed_price", 0) > context["remaining_budget"]:
                return False, "exceeds_budget"

        return True, ""

    # ── Phase 3: negotiation loop ─────────────────────────────────────────────

    def run_negotiation(
        self,
        consumer_agent: ConsumerAgent,
        vendor_agent: VendorAgent,
        item: dict,
    ) -> dict:
        """Phase 3: turn-taking loop between ConsumerAgent and VendorAgent.

        Calls validate_round() on every turn. Terminates on accept/reject/walk_away
        or when max_rounds is reached.
        Returns: {status, final_price, rounds, transcript}
        """
        raise NotImplementedError("Phase 3")

    # ── Phase 4: payment execution ────────────────────────────────────────────

    def execute_payment(self, deal: dict) -> dict:
        """Phase 4: fire Razorpay API call for a validated, consumer-approved deal.

        Only called after:
          1. validate_round() returned (True, "")
          2. Consumer explicitly approved in the React payment modal.
        Returns: {razorpay_order_id, status, amount, currency}
        """
        raise NotImplementedError("Phase 4")
