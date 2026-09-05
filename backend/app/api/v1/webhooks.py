"""Webhook receivers — Razorpay (payment events) and Clerk (user lifecycle).

Razorpay:
  - Signature verified via HMAC-SHA256 before any processing.
  - payment.captured is the SOLE source of truth for wallet/stock updates.
  - payment.failed logs and marks the negotiation (no state changes needed).

Clerk:
  - Signature verified via svix before any processing.
  - user.created syncs the user row independent of the frontend /auth/sync call.
    Safe to call twice (upsert semantics).
"""
from __future__ import annotations

import logging

from fastapi import APIRouter, HTTPException, Request, Response

from app.services.razorpay_service import verify_webhook_signature

logger = logging.getLogger(__name__)

router = APIRouter()


# ── Razorpay ──────────────────────────────────────────────────────────────────

@router.post("/razorpay")
async def razorpay_webhook(request: Request) -> Response:
    """Receives Razorpay payment events.

    payment.captured: atomically updates wallet/stock via execute_mock_payment RPC.
    payment.failed:   logs; nothing further required (order can be retried by the user).
    All other events: acknowledged with 200, no action.
    """
    body = await request.body()
    signature = request.headers.get("X-Razorpay-Signature", "")

    if not verify_webhook_signature(body, signature):
        logger.warning("Razorpay webhook: invalid signature")
        raise HTTPException(status_code=401, detail="Invalid webhook signature")

    import json

    try:
        payload = json.loads(body)
    except Exception:
        raise HTTPException(status_code=400, detail="Malformed JSON body")

    event_type: str = payload.get("event", "")
    entity: dict = (payload.get("payload") or {}).get("payment", {}).get("entity", {})

    if event_type == "payment.captured":
        await _handle_payment_captured(entity)
    elif event_type == "payment.failed":
        _handle_payment_failed(entity)
    else:
        logger.debug("Razorpay webhook: unhandled event %s — acknowledged", event_type)

    return Response(content='{"status":"ok"}', media_type="application/json")


async def _handle_payment_captured(entity: dict) -> None:
    """Source of truth: money cleared. Atomically update wallet/stock/negotiation."""
    payment_id: str = entity.get("id", "")
    notes: dict = entity.get("notes") or {}
    negotiation_id: str = notes.get("negotiation_id", "")

    if not negotiation_id:
        logger.warning("payment.captured with no negotiation_id in notes — skipped (payment_id=%s)", payment_id)
        return

    from app.db.supabase_client import get_supabase_client
    from app.services.payment_service import InsufficientBalanceError, execute_mock_payment

    sb = get_supabase_client()

    # Load the negotiation to get the params execute_mock_payment needs
    neg_row = sb.table("negotiations").select("*").eq("id", negotiation_id).limit(1).execute()
    if not neg_row.data:
        logger.error("payment.captured: negotiation %s not found (payment_id=%s)", negotiation_id, payment_id)
        return
    neg = neg_row.data[0]

    # Idempotency guard — webhook may fire more than once
    if neg.get("mock_transaction_ref"):
        logger.info("payment.captured: negotiation %s already settled — skipping", negotiation_id)
        return

    # Resolve consumer_id via mission
    mission_row = sb.table("missions").select("consumer_id").eq("id", neg["mission_id"]).limit(1).execute()
    if not mission_row.data:
        logger.error("payment.captured: mission not found for negotiation %s", negotiation_id)
        return
    consumer_id: str = mission_row.data[0]["consumer_id"]

    try:
        execute_mock_payment(
            negotiation_id=negotiation_id,
            consumer_id=consumer_id,
            shop_id=neg["shop_id"],
            product_id=neg["product_id"],
            amount=neg["final_price"],
        )
        logger.info(
            "payment.captured: settled negotiation %s (payment_id=%s, amount=%.2f)",
            negotiation_id,
            payment_id,
            float(neg["final_price"]),
        )
    except InsufficientBalanceError:
        # Rare edge: real money captured but consumer's platform wallet ran dry.
        # Log loudly; stock is not decremented — requires manual reconciliation.
        logger.error(
            "payment.captured: RECONCILIATION NEEDED — consumer %s has insufficient platform wallet "
            "for negotiation %s (payment_id=%s). Real payment captured but platform state not updated.",
            consumer_id,
            negotiation_id,
            payment_id,
        )
    except Exception as exc:
        logger.exception(
            "payment.captured: unexpected error settling negotiation %s (payment_id=%s): %s",
            negotiation_id,
            payment_id,
            exc,
        )


def _handle_payment_failed(entity: dict) -> None:
    payment_id: str = entity.get("id", "")
    error_reason: str = entity.get("error_reason", "unknown")
    error_desc: str = entity.get("error_description", error_reason)
    notes: dict = entity.get("notes") or {}
    negotiation_id: str = notes.get("negotiation_id", "")

    logger.warning(
        "payment.failed: payment_id=%s negotiation_id=%s reason=%s",
        payment_id,
        negotiation_id or "N/A",
        error_reason,
    )

    if not negotiation_id:
        return

    from app.db.supabase_client import get_supabase_client
    from app.ws.events import publish_mission_event

    sb = get_supabase_client()

    # Mark the negotiation so the transcript shows the failure
    sb.table("negotiations").update({"outcome": "payment_failed"}).eq(
        "id", negotiation_id
    ).execute()

    # Publish WS event so the frontend renders a clear failure message
    neg_row = sb.table("negotiations").select("mission_id").eq("id", negotiation_id).limit(1).execute()
    if neg_row.data:
        mission_id = neg_row.data[0]["mission_id"]
        publish_mission_event(
            mission_id,
            {
                "event": "payment_failed",
                "negotiation_id": negotiation_id,
                "payment_id": payment_id,
                "reason": error_desc,
                "message": f"Payment failed: {error_desc}. You can retry from the transcript.",
            },
        )


# ── Clerk ─────────────────────────────────────────────────────────────────────

@router.post("/clerk")
async def clerk_webhook(request: Request) -> Response:
    """Receives Clerk user lifecycle events.

    user.created: upsert user row into Supabase — independent of /auth/sync.
    All other events: acknowledged with 200, no action.
    """
    from app.config import settings

    body = await request.body()

    # Verify via svix
    if not settings.clerk_webhook_secret:
        logger.error("CLERK_WEBHOOK_SECRET not configured — rejecting webhook")
        raise HTTPException(status_code=500, detail="Webhook secret not configured")

    try:
        from svix.webhooks import Webhook, WebhookVerificationError

        wh = Webhook(settings.clerk_webhook_secret)
        headers = dict(request.headers)
        payload = wh.verify(body, headers)
    except Exception as exc:
        logger.warning("Clerk webhook: verification failed: %s", exc)
        raise HTTPException(status_code=401, detail="Invalid webhook signature")

    import json

    if isinstance(payload, bytes):
        payload = json.loads(payload)

    event_type: str = payload.get("type", "")
    data: dict = payload.get("data", {})

    if event_type == "user.created":
        _handle_clerk_user_created(data)
    else:
        logger.debug("Clerk webhook: unhandled event %s — acknowledged", event_type)

    return Response(content='{"status":"ok"}', media_type="application/json")


def _handle_clerk_user_created(data: dict) -> None:
    """Sync a newly-created Clerk user into the Supabase users table.

    Upsert semantics — safe if /auth/sync already ran first.
    Role defaults to 'consumer'; the frontend role-selection flow updates it afterward.
    """
    clerk_id: str = data.get("id", "")
    if not clerk_id:
        logger.warning("Clerk user.created: missing user id in payload")
        return

    # Prefer primary email address
    email_addresses: list[dict] = data.get("email_addresses") or []
    primary_email_id: str = data.get("primary_email_address_id", "")
    email = ""
    for ea in email_addresses:
        if ea.get("id") == primary_email_id:
            email = ea.get("email_address", "")
            break
    if not email and email_addresses:
        email = email_addresses[0].get("email_address", "")

    first_name: str = data.get("first_name") or ""
    last_name: str = data.get("last_name") or ""
    display_name = (f"{first_name} {last_name}".strip()) or None

    from app.db.supabase_client import get_supabase_client

    sb = get_supabase_client()
    try:
        sb.table("users").upsert(
            {
                "clerk_id": clerk_id,
                "email": email,
                "display_name": display_name,
                "role": "consumer",  # default; frontend role-select updates this
            },
            on_conflict="clerk_id",
        ).execute()
        logger.info("Clerk webhook: upserted user clerk_id=%s email=%s", clerk_id, email)
    except Exception as exc:
        logger.error("Clerk webhook: failed to upsert user clerk_id=%s: %s", clerk_id, exc)
