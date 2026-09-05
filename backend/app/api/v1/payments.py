"""Payment endpoints.

Phase 2: POST /payments/mock-approve — consumer explicitly approves a negotiated deal.
  Layer 3 of the Three-Layer Money Rule: this is the ONLY place execute_mock_payment()
  is called. It fires only after (1) validate_round passed in the orchestrator and
  (2) the consumer clicked Approve in the React PaymentApprovalModal.

Phase 3 replaces the body of execute_mock_payment() with real Razorpay MCP calls —
  this endpoint's signature and ownership checks stay identical.
"""
from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel

from app.db.supabase_client import get_supabase_client
from app.middleware.auth_middleware import verify_clerk_token
from app.services.payment_service import InsufficientBalanceError, execute_mock_payment

logger = logging.getLogger(__name__)

router = APIRouter()


class MockApproveBody(BaseModel):
    negotiation_id: str


@router.post("/mock-approve")
async def mock_approve_payment(
    body: MockApproveBody,
    request: Request,
    _: dict = Depends(verify_clerk_token),
) -> dict:
    """Consumer approves a negotiated deal, triggering the mock payment.

    Validates:
    - Negotiation exists and has outcome == 'deal'
    - Caller is the mission's consumer (not a different user)
    - Not already paid (idempotent guard)
    """
    sb = get_supabase_client()

    user_row = sb.table("users").select("id").eq("clerk_id", request.state.clerk_id).limit(1).execute()
    if not user_row.data:
        raise HTTPException(status_code=404, detail="User not found")
    consumer_id = user_row.data[0]["id"]

    neg_row = sb.table("negotiations").select("*").eq("id", body.negotiation_id).limit(1).execute()
    if not neg_row.data:
        raise HTTPException(status_code=404, detail="Negotiation not found")
    neg = neg_row.data[0]

    if neg["outcome"] != "deal":
        raise HTTPException(status_code=422, detail="Negotiation did not result in a deal")

    # Idempotent: already paid
    if neg.get("mock_transaction_ref"):
        return {
            "success": True,
            "mock_transaction_ref": neg["mock_transaction_ref"],
            "already_paid": True,
        }

    # Verify the caller owns this mission
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
