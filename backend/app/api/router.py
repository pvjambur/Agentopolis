"""Aggregates all v1 API routers under /api/v1."""
from fastapi import APIRouter

from app.api.v1 import (
    auth,
    internal,
    marketplace,
    missions,
    negotiations,
    payments,
    products,
    ratings,
    shops,
    users,
    vendor_dashboard,
    wallets,
    webhooks,
)

api_router = APIRouter(prefix="/api/v1")

api_router.include_router(auth.router, prefix="/auth", tags=["auth"])
api_router.include_router(shops.router, prefix="/shops", tags=["shops"])
api_router.include_router(products.router, prefix="/products", tags=["products"])
api_router.include_router(marketplace.router, prefix="/marketplace", tags=["marketplace"])
api_router.include_router(missions.router, prefix="/missions", tags=["missions"])
api_router.include_router(negotiations.router, prefix="/negotiations", tags=["negotiations"])
api_router.include_router(payments.router, prefix="/payments", tags=["payments"])
api_router.include_router(webhooks.router, prefix="/webhooks", tags=["webhooks"])
api_router.include_router(ratings.router, prefix="/ratings", tags=["ratings"])
api_router.include_router(users.router, prefix="/users", tags=["users"])
api_router.include_router(wallets.router, prefix="/wallets", tags=["wallets"])
api_router.include_router(vendor_dashboard.router, prefix="/vendor", tags=["vendor"])
api_router.include_router(internal.router, prefix="/internal", tags=["internal"])
