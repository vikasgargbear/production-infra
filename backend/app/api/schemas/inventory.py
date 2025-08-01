"""
Inventory schemas for enterprise pharma system
Handles batch tracking, expiry management, and stock movements
"""
from typing import Optional, List
from pydantic import BaseModel, Field, validator
from datetime import datetime, date
from decimal import Decimal
from uuid import UUID


class BatchBase(BaseModel):
    """Base batch model"""
    product_id: int = Field(..., gt=0)
    batch_number: str = Field(..., min_length=1, max_length=50)
    manufacturing_date: Optional[date] = None
    expiry_date: date = Field(..., description="Batch expiry date")
    
    # Quantities
    quantity_received: int = Field(..., ge=0, description="Original quantity")
    quantity_available: int = Field(..., ge=0, description="Current available stock")
    
    # Pricing
    cost_price: Decimal = Field(..., ge=0, description="Cost per unit")
    mrp: Decimal = Field(..., ge=0, description="Maximum retail price")
    
    # Additional info
    supplier_id: Optional[int] = None
    purchase_invoice_number: Optional[str] = Field(None, max_length=50)
    location_code: Optional[str] = Field(None, max_length=100, description="Storage location code")
    notes: Optional[str] = Field(None, max_length=500)
    
    @validator('expiry_date')
    def validate_expiry(cls, v, values):
        """Ensure expiry date is in future for new batches"""
        if v and 'quantity_received' in values:
            # Only validate for new batches
            if v < date.today():
                raise ValueError('Expiry date cannot be in the past')
        return v


class BatchCreate(BatchBase):
    """Schema for creating a batch"""
    org_id: UUID = Field(..., description="Organization ID")


class BatchUpdate(BaseModel):
    """Schema for updating batch details"""
    quantity_available: Optional[int] = Field(None, ge=0)
    location_code: Optional[str] = Field(None, max_length=100)
    notes: Optional[str] = Field(None, max_length=500)


class BatchResponse(BatchBase):
    """Schema for batch response"""
    batch_id: int
    org_id: UUID
    product_name: str
    product_code: str
    
    # Calculated fields
    quantity_sold: int = Field(default=0)
    stock_value: Decimal = Field(default=Decimal("0"))
    days_to_expiry: Optional[int] = None
    is_expired: bool = Field(default=False)
    is_near_expiry: bool = Field(default=False)
    
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True


class StockMovementBase(BaseModel):
    """Base stock movement model"""
    product_id: int = Field(..., gt=0)
    batch_id: Optional[int] = None
    movement_type: str = Field(..., pattern=r"^(purchase|sale|return|adjustment|transfer)$")
    movement_date: date = Field(default_factory=date.today)
    quantity: int = Field(..., description="Positive for IN, negative for OUT")
    
    # Reference info
    reference_type: Optional[str] = Field(None, pattern=r"^(order|purchase|adjustment|transfer)$")
    reference_id: Optional[int] = None
    
    # Additional details
    reason: Optional[str] = Field(None, max_length=200)
    notes: Optional[str] = Field(None, max_length=500)
    performed_by: Optional[str] = Field(None, max_length=100)


class StockMovementCreate(StockMovementBase):
    """Schema for recording stock movement"""
    org_id: UUID = Field(..., description="Organization ID")


class StockMovementResponse(StockMovementBase):
    """Schema for stock movement response"""
    movement_id: int
    org_id: UUID
    product_name: str
    product_code: str
    batch_number: Optional[str] = None
    
    # Stock levels after movement
    stock_before: Optional[int] = None
    stock_after: Optional[int] = None
    
    created_at: datetime
    
    class Config:
        from_attributes = True


class StockAdjustment(BaseModel):
    """Schema for stock adjustment"""
    product_id: int = Field(..., gt=0)
    batch_id: Optional[int] = None
    adjustment_type: str = Field(..., pattern=r"^(damage|expiry|theft|counting|other)$")
    quantity: int = Field(..., description="Positive to add, negative to remove")
    reason: str = Field(..., min_length=1, max_length=200)
    notes: Optional[str] = Field(None, max_length=500)


class StockTransfer(BaseModel):
    """Schema for stock transfer between locations"""
    product_id: int = Field(..., gt=0)
    batch_id: Optional[int] = None
    quantity: int = Field(..., gt=0)
    from_location: str = Field(..., min_length=1, max_length=100)
    to_location: str = Field(..., min_length=1, max_length=100)
    notes: Optional[str] = Field(None, max_length=500)


class CurrentStock(BaseModel):
    """Schema for current stock summary"""
    product_id: int
    product_code: str
    product_name: str
    
    # Stock quantities
    total_quantity: int = Field(default=0)
    available_quantity: int = Field(default=0)
    allocated_quantity: int = Field(default=0)
    
    # Batch summary
    total_batches: int = Field(default=0)
    expired_batches: int = Field(default=0)
    near_expiry_batches: int = Field(default=0)
    
    # Financial
    total_value: Decimal = Field(default=Decimal("0"))
    average_cost: Decimal = Field(default=Decimal("0"))
    
    # Reorder info
    minimum_stock: Optional[int] = None
    reorder_level: Optional[int] = None
    is_below_minimum: bool = Field(default=False)
    is_below_reorder: bool = Field(default=False)
    
    class Config:
        from_attributes = True


class ExpiryAlert(BaseModel):
    """Schema for expiry alerts"""
    batch_id: int
    product_id: int
    product_name: str
    product_code: str
    batch_number: str
    expiry_date: date
    days_to_expiry: int
    quantity_available: int
    stock_value: Decimal
    alert_level: str  # critical, warning, info
    
    class Config:
        from_attributes = True


class StockValuation(BaseModel):
    """Schema for stock valuation report"""
    valuation_date: date
    total_products: int
    total_batches: int
    
    # Stock summary
    total_quantity: int
    expired_quantity: int
    near_expiry_quantity: int
    
    # Financial summary
    total_value: Decimal
    expired_value: Decimal
    near_expiry_value: Decimal
    
    # By category
    category_wise: Optional[List[dict]] = None
    
    class Config:
        from_attributes = True


class InventoryDashboard(BaseModel):
    """Schema for inventory dashboard"""
    # Stock overview
    total_products: int
    total_batches: int
    total_stock_value: Decimal
    
    # Alerts
    expired_products: int
    near_expiry_products: int
    low_stock_products: int
    out_of_stock_products: int
    
    # Recent activity
    todays_movements: int
    pending_orders: int
    
    # Top movers
    fast_moving_products: List[dict]
    slow_moving_products: List[dict]
    
    # Expiry summary
    expiry_alerts: List[ExpiryAlert]