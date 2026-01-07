"""
Loyalty Schemas Module
Pydantic models for loyalty points management
"""
from .loyalty import (
    # Loyalty Program
    LoyaltyProgramCreate,
    CustomerTier,
    PointsTransaction,
    PointsRedemption,
    # Schemes
    SchemeCreate,
    SchemeResponse,
    DiscountCalculation,
)

__all__ = [
    "LoyaltyProgramCreate",
    "CustomerTier",
    "PointsTransaction",
    "PointsRedemption",
    "SchemeCreate",
    "SchemeResponse",
    "DiscountCalculation",
]

