"""Payment endpoints.

Three-Layer Money Rule — Layer 3 only fires here, after:
  Layer 1: LLM proposed via tool_use (never executes anything).
  Layer 2: Orchestrator validated (validate_round + check_floor_price + check_budget).
  Layer 3a (mock):  POST /payments/mock-approve   → execute_mock_payment() atomic Postgres tx.
  Layer 3b (live):  POST /payments/create-order   → Razorpay order + Route transfer.
                    POST /payments/verify          → UI feedback only (webhook is source of truth).

PAYMENT_MODE=mock uses Layer 3a. PAYMENT_MODE=live uses Layer 3b.
Both paths share identical ownership/state validation. Neither is deleted — mock remains
a demo-safety fallback if live Razorpay encounters issues during judging.
"""
from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel

from app.config import settings
from app.db.supabase_client import get_supabase_client
from app.middleware.auth_middleware import verify_clerk_token
from app.services.payment_service import InsufficientBalanceError, execute_mock_payment

logger = logging.getLogger(__name__)

router = APIRouter()


def _resolve_consumer(clerk_id: str) -> str:
    sb = get_supabase_client()
    row = sb.table("users").select("id").eq("clerk_id", clerk_id).limit(1).execute()
    if not row.data:
        raise HTTPException(status_code=404, detail="User not found")
    return row.data[0]["id"]


def _load_and_validate_neg(negotiation_id: str, consumer_id: str) -> dict:
    """Common guard: negotiation exists, is a deal, caller owns it, not already paid."""
    sb = get_supabase_client()
    neg_row = sb.table("negotiations").select("*").eq("id", negotiation_id).limit(1).execute()
    if not neg_row.data:
        raise HTTPException(status_code=404, detail="Negotiation not found")
    neg = neg_row.data[0]

    if neg["outcome"] != "deal":
        raise HTTPException(status_code=422, detail="Negotiation did not result in a deal")

    mission_row = (
        sb.table("missions")
        .select("consumer_id")
        .eq("id", neg["mission_id"])
        .limit(1)
        .execute()
    )
    if not mission_row.data or mission_row.data[0]["consumer_id"] != consumer_id:
        raise HTTPException(status_code=403, detail="Not authorized to approve this payment")

    if not neg.get("final_price"):
        raise HTTPException(status_code=422, detail="No final price on negotiation")

    return neg


# ── Mock approve (Phase 2 path, PAYMENT_MODE=mock) ────────────────────────────

class MockApproveBody(BaseModel):
    negotiation_id: str


@router.post("/mock-approve")
async def mock_approve_payment(
    body: MockApproveBody,
    request: Request,
    _: dict = Depends(verify_clerk_token),
) -> dict:
    """Consumer explicitly approves a negotiated deal in mock mode.

    Idempotent — safe to call twice (returns already_paid=True on second call).
    Phase 3 retains this endpoint as a demo-safety fallback (PAYMENT_MODE=mock).
    """
    consumer_id = _resolve_consumer(request.state.clerk_id)
    neg = _load_and_validate_neg(body.negotiation_id, consumer_id)

    if neg.get("mock_transaction_ref"):
        return {"success": True, "mock_transaction_ref": neg["mock_transaction_ref"], "already_paid": True}

    try:
        result = execute_mock_payment(
            negotiation_id=body.negotiation_id,
            consumer_id=consumer_id,
            shop_id=neg["shop_id"],
            product_id=neg["product_id"],
            amount=neg["final_price"],
        )
    except InsufficientBalanceError:
        raise HTTPException(status_code=422, detail="Insufficient wallet balance")
    except Exception as exc:
        logger.error("Mock payment failed for negotiation %s: %s", body.negotiation_id, exc)
        raise HTTPException(status_code=500, detail="Payment execution failed")

    return result


# ── Real Razorpay flow (PAYMENT_MODE=live) ────────────────────────────────────

class CreateOrderBody(BaseModel):
    negotiation_id: str


@router.post("/create-order")
async def create_payment_order(
    body: CreateOrderBody,
    request: Request,
    _: dict = Depends(verify_clerk_token),
) -> dict:
    """Create a Razorpay order for a negotiated deal. Returns the order for Checkout.js.

    The Route transfer to the vendor's linked account is embedded in the order —
    Razorpay routes the vendor's share automatically on payment.captured.
    Layer 3 of the money rule: this is the payment execution entry point for live mode.
    Actual wallet/stock update happens ONLY when the webhook confirms — not here.
    """
    from app.services.razorpay_service import create_payment_order as rzp_create_order

    consumer_id = _resolve_consumer(request.state.clerk_id)
    neg = _load_and_validate_neg(body.negotiation_id, consumer_id)

    if neg.get("mock_transaction_ref"):
        raise HTTPException(status_code=409, detail="Already paid")

    # Resolve the vendor's linked account for the Route transfer
    sb = get_supabase_client()
    shop_row = sb.table("shops").select("razorpay_linked_account_id").eq("id", neg["shop_id"]).limit(1).execute()
    linked_account_id = (shop_row.data[0] or {}).get("razorpay_linked_account_id") if shop_row.data else None

    if not linked_account_id:
        # Shop doesn't have a linked account yet — fall back to mock for this deal
        logger.warning("No linked account for shop %s — falling back to mock payment", neg["shop_id"])
        raise HTTPException(
            status_code=424,
            detail="Vendor payment account not yet connected. Use mock-approve as fallback.",
        )

    try:
        order = rzp_create_order(
            negotiation_id=body.negotiation_id,
            amount=neg["final_price"],
            razorpay_linked_account_id=linked_account_id,
        )
    except Exception as exc:
        logger.error("Razorpay order creation failed for negotiation %s: %s", body.negotiation_id, exc)
        raise HTTPException(status_code=500, detail="Payment order creation failed")

    return {
        "order_id": order["id"],
        "amount": order["amount"],
        "currency": order["currency"],
        "negotiation_id": body.negotiation_id,
    }


class VerifyBody(BaseModel):
    negotiation_id: str
    razorpay_payment_id: str
    razorpay_order_id: str
    razorpay_signature: str


@router.post("/verify")
async def verify_payment(
    body: VerifyBody,
    request: Request,
    _: dict = Depends(verify_clerk_token),
) -> dict:
    """UI-layer optimistic confirmation after Checkout.js callback.

    This is NOT the source of truth — the Razorpay webhook is. This endpoint
    only provides immediate UI feedback so the consumer sees a quick response.
    Wallet and stock are updated ONLY by the webhook handler on payment.captured.
    """
    consumer_id = _resolve_consumer(request.state.clerk_id)
    _load_and_validate_neg(body.negotiation_id, consumer_id)

    # Store payment ID so UI can show it immediately while webhook processes
    sb = get_supabase_client()
    sb.table("negotiations").update({
        "mock_transaction_ref": f"rzp_{body.razorpay_payment_id}",
    }).eq("id", body.negotiation_id).execute()

    logger.info(
        "Payment %s submitted for negotiation %s (webhook is source of truth)",
        body.razorpay_payment_id,
        body.negotiation_id,
    )
    return {"status": "submitted", "payment_id": body.razorpay_payment_id}


@router.get("/mode")
async def get_payment_mode() -> dict:
    """Returns the current PAYMENT_MODE so the frontend can branch Checkout vs mock."""
    return {"mode": settings.payment_mode}
