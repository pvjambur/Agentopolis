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

    # ── Phase 2: negotiation loop + audit-trail persistence ───────────────────

    def run_negotiation(
        self,
        consumer_agent: ConsumerAgent,
        vendor_agent: VendorAgent,
        item: dict,
        mission_id: str,
    ) -> dict:
        """Turn-taking loop between ConsumerAgent and VendorAgent.

        Layer 2 of the money rule runs on EVERY turn (validate_round + the
        Phase-1 check_floor_price / check_budget functions at deal time), and
        every round is persisted to the negotiations table so the transcript
        survives WebSocket disconnect. Streams events via Redis pub/sub.

        Returns: {negotiation_id, outcome, final_price, round_count, product_id, shop_id}
        """
        from app.services.negotiation_repo import (
            create_negotiation_row,
            update_negotiation_row,
        )
        from app.ws.events import publish_mission_event

        product = vendor_agent.product
        assert product is not None, "vendor_agent.product must be set"
        floor_price = float(product["floor_price"])
        opening_price = float(product["price"])

        neg_row = create_negotiation_row(
            mission_id=mission_id,
            shop_id=vendor_agent.config.shop_id,
            product_id=product["id"],
            item_requested=item["item"],
            opening_price=opening_price,
        )
        negotiation_id = neg_row["id"]

        rounds_log: list[dict] = []
        round_count = 0
        context = {
            "item": item,
            "floor_price": floor_price,
            "remaining_budget": consumer_agent.remaining_budget,
            "round_count": round_count,
        }

        publish_mission_event(
            mission_id,
            {
                "event": "negotiation_started",
                "negotiation_id": negotiation_id,
                "shop": vendor_agent.shop_name,
                "item": item["item"],
                "opening_price": opening_price,
            },
        )

        current_message = (
            f"Hi! I'm looking for {item['item']}"
            f"{(' (' + item['quantity'] + ')') if item.get('quantity') else ''}. "
            f"What's your best price?"
        )

        outcome = "no_deal"
        final_price: float | None = None

        while round_count < self.max_rounds:
            round_count += 1
            context["round_count"] = round_count
            context["remaining_budget"] = consumer_agent.remaining_budget

            # ── Vendor turn ──────────────────────────────────────────────────
            vendor_response = vendor_agent.respond(current_message, context)
            vendor_response["speaker"] = "vendor_agent"
            valid, reason = self.validate_round(vendor_response, context)
            if not valid:
                publish_mission_event(
                    mission_id,
                    {"event": "negotiation_blocked", "round": round_count, "reason": reason},
                )
                vendor_response["action"] = "walk_away"  # force safe fallback
                vendor_response["blocked_reason"] = reason

            vendor_response["message"] = self.sanitize_message(vendor_response["message"])
            rounds_log.append(vendor_response)
            publish_mission_event(
                mission_id,
                {"event": "negotiation_round", "round": round_count, **vendor_response},
            )

            if vendor_response["action"] == "accept":
                outcome, final_price = "deal", float(vendor_response["proposed_price"])
                break
            if vendor_response["action"] in ("walk_away", "reject"):
                outcome = "walked_away"
                break

            # ── Consumer turn ────────────────────────────────────────────────
            consumer_response = consumer_agent.negotiate_round(vendor_response, context)
            consumer_response["speaker"] = "consumer_agent"
            valid, reason = self.validate_round(consumer_response, context)
            if not valid:
                consumer_response["message"] = self.sanitize_message(consumer_response["message"])
                consumer_response["blocked_reason"] = reason
                rounds_log.append(consumer_response)
                publish_mission_event(
                    mission_id,
                    {"event": "negotiation_blocked", "round": round_count, "reason": reason},
                )
                outcome = "no_deal"
                break

            consumer_response["message"] = self.sanitize_message(consumer_response["message"])
            rounds_log.append(consumer_response)
            publish_mission_event(
                mission_id,
                {"event": "negotiation_round", "round": round_count, **consumer_response},
            )

            if consumer_response["action"] == "accept":
                outcome, final_price = "deal", float(consumer_response["proposed_price"])
                break

            current_message = consumer_response["message"]

        # ── Deal-time defense-in-depth: exercise BOTH Phase-1 guardrails ──────
        if outcome == "deal" and final_price is not None:
            floor_ok = vendor_agent.check_floor_price(final_price, product["id"])
            budget_ok = consumer_agent.check_budget(final_price)
            if not (floor_ok and budget_ok):
                # A price that fails either hard check can never become a deal.
                outcome = "no_deal"
                final_price = None
                publish_mission_event(
                    mission_id,
                    {
                        "event": "negotiation_blocked",
                        "round": round_count,
                        "reason": "floor_check" if not floor_ok else "budget_check",
                    },
                )

        update_negotiation_row(
            negotiation_id=negotiation_id,
            rounds=rounds_log,
            outcome=outcome,
            final_price=final_price,
            round_count=round_count,
        )

        publish_mission_event(
            mission_id,
            {
                "event": "negotiation_complete",
                "negotiation_id": negotiation_id,
                "outcome": outcome,
                "final_price": final_price,
                "round_count": round_count,
            },
        )

        return {
            "negotiation_id": negotiation_id,
            "outcome": outcome,
            "final_price": final_price,
            "round_count": round_count,
            "product_id": product["id"],
            "shop_id": vendor_agent.config.shop_id,
        }

    # ── Phase 4: payment execution ────────────────────────────────────────────

    def execute_payment(self, deal: dict) -> dict:
        """Phase 4: fire Razorpay API call for a validated, consumer-approved deal.

        Only called after:
          1. validate_round() returned (True, "")
          2. Consumer explicitly approved in the React payment modal.
        Returns: {razorpay_order_id, status, amount, currency}
        """
        raise NotImplementedError("Phase 4")
