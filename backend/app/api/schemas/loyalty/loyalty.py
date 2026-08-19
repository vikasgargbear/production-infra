"""
Loyalty and discount schemas
Centralized from inline route definitions
"""
from typing import List, Optional, Dict, Any
from datetime import date, datetime
from decimal import Decimal
from pydantic import BaseModel, ConfigDict, Field


# =============================================================================
# LOYALTY PROGRAM SCHEMAS
# =============================================================================

class LoyaltyProgramCreate(BaseModel):
    """Schema for creating loyalty program"""
    program_name: str = Field(..., min_length=1)
    description: Optional[str] = None
    points_per_rupee: Decimal = Field(default=Decimal("1.0"))
    redemption_value: Decimal = Field(default=Decimal("0.01"))
    min_redemption_points: int = Field(default=100)
    max_discount_percent: Decimal = Field(default=Decimal("10.0"))
    validity_months: int = Field(default=12)
    is_active: bool = True


class LoyaltyProgramCreateResponse(BaseModel):
    """Identifier returned after a loyalty program is created."""

    program_id: int
    message: str

    model_config = ConfigDict(extra="forbid")


class CustomerTier(BaseModel):
    """Schema for customer loyalty tier"""
    tier_name: str
    min_points: int
    max_points: Optional[int] = None
    multiplier: Decimal = Field(default=Decimal("1.0"))
    benefits: Optional[Dict[str, Any]] = None


class PointsTransaction(BaseModel):
    """Schema for points transaction"""
    customer_id: int
    points: int
    transaction_type: str = Field(..., description="earn, redeem, expire, adjust")
    reference_type: Optional[str] = None
    reference_id: Optional[int] = None
    description: Optional[str] = None


class PointsRedemption(BaseModel):
    """Schema for points redemption request"""
    customer_id: int
    points_to_redeem: int = Field(..., gt=0)
    order_id: Optional[int] = None


# =============================================================================
# SCHEME/DISCOUNT SCHEMAS
# =============================================================================

class SchemeCreate(BaseModel):
    """Schema for creating discount scheme"""
    scheme_name: str = Field(..., min_length=1)
    scheme_type: str = Field(..., description="percentage, fixed, buy_get, bundle")
    description: Optional[str] = None
    discount_value: Decimal = Field(default=Decimal("0"))
    min_quantity: int = Field(default=1)
    min_amount: Decimal = Field(default=Decimal("0"))
    max_discount: Optional[Decimal] = None
    valid_from: date
    valid_to: date
    applicable_products: Optional[List[int]] = None
    applicable_categories: Optional[List[int]] = None
    customer_types: Optional[List[str]] = None
    is_active: bool = True
    priority: int = Field(default=0)


class SchemeResponse(BaseModel):
    """Response schema for discount scheme"""
    scheme_id: int
    scheme_name: str
    scheme_type: str
    discount_value: float
    is_active: bool
    valid_from: date
    valid_to: date


class DiscountCalculation(BaseModel):
    """Schema for discount calculation request"""
    product_id: int
    quantity: int
    unit_price: Decimal
    customer_id: Optional[int] = None
    customer_type: Optional[str] = None
