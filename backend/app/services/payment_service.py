"""Mock payment execution for Phase 2.

Phase 3 replaces the BODY of execute_mock_payment() with real Razorpay MCP
calls — the signature and the atomic-transaction shape stay identical, so
nothing else in the codebase changes when that swap happens.

The atomicity here is real: the debit / credit / stock-decrement all run inside
a single Postgres function (execute_mock_payment SQL), so a partial failure
(wallet debited but stock not decremented) is impossible.
"""
from __future__ import annotations

import logging
from decimal import Decimal

from app.db.supabase_client import get_supabase_client

logger = logging.getLogger(__name__)


class InsufficientBalanceError(Exception):
    pass


class PaymentError(Exception):
    pass


def execute_mock_payment(
    negotiation_id: str,
    consumer_id: str,
    shop_id: str,
    product_id: str,
    amount: Decimal | float,
) -> dict:
    """Atomic mocked payment: debit consumer, credit vendor, decrement stock.

    Delegates to the execute_mock_payment() Postgres function which runs the
    whole thing in one transaction — all or nothing.
    """
    sb = get_supabase_client()
    try:
        result = sb.rpc(
            "execute_mock_payment",
            {
                "p_negotiation_id": negotiation_id,
                "p_consumer_id": consumer_id,
                "p_shop_id": shop_id,
                "p_product_id": product_id,
                "p_amount": float(amount),
            },
        ).execute()
    except Exception as exc:
        msg = str(exc)
        if "insufficient_balance" in msg:
            raise InsufficientBalanceError("Consumer wallet balance is insufficient") from exc
        logger.error("Mock payment failed: %s", msg)
        raise PaymentError(msg) from exc

    return result.data
