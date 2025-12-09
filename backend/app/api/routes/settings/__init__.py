"""
Settings Package - Combined Settings Router

Consolidates:
- features.py: Feature toggles
- business.py: Business rules (billing/inventory/compliance)

Note: Organization settings handled by /company API
"""
from fastapi import APIRouter

from .features import router as features_router
from .business import router as business_router

router = APIRouter(tags=["Settings"])

# Mount sub-routers
router.include_router(features_router, prefix="/features", tags=["Settings - Features"])
router.include_router(business_router, prefix="/business", tags=["Settings - Business"])
