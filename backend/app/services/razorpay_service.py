"""Razorpay Route service — linked account creation, order creation, Route transfers.

Layer 3 of the Three-Layer Money Rule:
  ONLY called after orchestrator validates (Layer 2) AND consumer approves in the
  React payment modal. No LLM output ever reaches this code directly — non-negotiable.

PAYMENT_MODE toggle (settings.payment_mode):
  mock → execute_mock_payment() in payment_service.py (Phase 2 path, untouched)
  live → create_payment_order() here + Razorpay webhook confirms execution
"""
from __future__ import annotations

import hashlib
import hmac
import logging
from decimal import Decimal

import razorpay

from app.config import settings

logger = logging.getLogger(__name__)

PLATFORM_COMMISSION_PERCENT = 5  # % kept by Agentopolis per deal


def _client() -> razorpay.Client:
    return razorpay.Client(auth=(settings.razorpay_key_id, settings.razorpay_key_secret))


def create_linked_account(shop_name: str, vendor_email: str, vendor_display_name: str) -> str | None:
    """Create a Razorpay Route linked account for a new vendor shop.

    Called once, automatically, on first shop creation. Returns the linked account ID
    to be stored in shops.razorpay_linked_account_id. Returns None (and logs) on failure
    rather than crashing shop creation — the badge in the dashboard will show 'Pending'.
    Phone is a placeholder; test mode accepts any 10-digit number.
    """
    try:
        client = _client()
        account = client.account.create({
            "email": vendor_email,
            "phone": "9999999999",
            "type": "route",
            "legal_business_name": shop_name,
            "business_type": "individual",
            "contact_name": vendor_display_name,
            "profile": {
                "category": "ecommerce",
                "subcategory": "shop",
                "addresses": {
                    "registered": {
                        "street1": "N/A",
                        "city": "N/A",
                        "state": "MH",
                        "postal_code": "400001",
                        "country": "IN",
                    }
                },
            },
        })
        account_id: str = account["id"]
        logger.info("Created Razorpay linked account %s for shop %s", account_id, shop_name)
        return account_id
    except Exception as exc:
        logger.warning("Razorpay linked account creation failed for %s: %s", shop_name, exc)
        return None


def create_payment_order(
    negotiation_id: str,
    amount: Decimal | float,
    razorpay_linked_account_id: str,
) -> dict:
    """Create a Razorpay order with a Route transfer to the vendor's linked account.

    Returns the full Razorpay order dict — order["id"] goes to the frontend for Checkout.js.
    5% platform commission is retained; the rest transfers to the vendor on payment.captured.
    """
    client = _client()
    amount_paise = int(Decimal(str(amount)) * 100)
    platform_cut = int(amount_paise * PLATFORM_COMMISSION_PERCENT / 100)
    vendor_share = amount_paise - platform_cut

    order = client.order.create({
        "amount": amount_paise,
        "currency": "INR",
        "receipt": f"neg_{negotiation_id[:16]}",
        "notes": {"negotiation_id": negotiation_id},
        "transfers": [
            {
                "account": razorpay_linked_account_id,
                "amount": vendor_share,
                "currency": "INR",
                "notes": {"negotiation_id": negotiation_id},
                "on_hold": 0,
            }
        ],
    })
    logger.info(
        "Created Razorpay order %s for negotiation %s (₹%s, vendor gets ₹%s)",
        order["id"],
        negotiation_id,
        amount,
        vendor_share / 100,
    )
    return order


def verify_webhook_signature(body: bytes, signature: str) -> bool:
    """Verify X-Razorpay-Signature HMAC-SHA256 against our webhook secret.

    Returns False (never raises) so callers can return 401 cleanly.
    """
    if not settings.razorpay_webhook_secret:
        logger.error("RAZORPAY_WEBHOOK_SECRET not configured — rejecting webhook")
        return False
    try:
        expected = hmac.new(
            settings.razorpay_webhook_secret.encode(),
            body,
            hashlib.sha256,
        ).hexdigest()
        return hmac.compare_digest(expected, signature)
    except Exception as exc:
        logger.error("Webhook signature check crashed: %s", exc)
        return False
