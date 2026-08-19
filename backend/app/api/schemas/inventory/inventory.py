"""
Inventory schemas for enterprise pharma system
Handles batch tracking, expiry management, and stock movements
"""
from typing import Optional, List
from pydantic import BaseModel, Field, field_validator, ConfigDict
from datetime import datetime, date
from decimal import Decimal
from uuid import UUID
from enum import Enum


# =============================================================================
# ENUMS
# =============================================================================

class MovementType(str, Enum):
    """Stock movement types"""
    PURCHASE = "purchase"
    SALE = "sale"
    RETURN = "return"
    ADJUSTMENT = "adjustment"
    TRANSFER = "transfer"
    WRITEOFF = "writeoff"
    OPENING = "opening"


class MovementDirection(str, Enum):
    """Stock movement direction"""
    IN = "in"
    OUT = "out"


class InventoryAdjustmentReason(str, Enum):
    """Adjustment reasons used by the legacy inventory contract."""
    DAMAGE = "damage"
    EXPIRY = "expiry"
    THEFT = "theft"
    COUNTING = "counting"
    BREAKAGE = "breakage"
    OTHER = "other"


class AlertLevel(str, Enum):
    """Alert severity levels"""
    CRITICAL = "critical"
    WARNING = "warning"
    INFO = "info"


# =============================================================================
# BATCH SCHEMAS
# =============================================================================

class BatchBase(BaseModel):
    """Base batch model"""
    
    product_id: int = Field(..., gt=0, description="Product ID")
    batch_number: str = Field(..., min_length=1, max_length=50, description="Batch number")
    manufacturing_date: Optional[date] = None
    expiry_date: date = Field(..., description="Batch expiry date")
    
    quantity_received: int = Field(..., ge=0, description="Original quantity")
    quantity_available: int = Field(..., ge=0, description="Current available stock")
    
    cost_price: Decimal = Field(..., ge=0, description="Cost per unit")
    mrp: Decimal = Field(..., ge=0, description="Maximum retail price")
    sale_price: Optional[Decimal] = Field(None, ge=0, description="Sale price")
    
    supplier_id: Optional[int] = None
    purchase_invoice_number: Optional[str] = Field(None, max_length=50)
    grn_id: Optional[int] = Field(None, description="GRN reference")
    location_code: Optional[str] = Field(None, max_length=100, description="Storage location")
    notes: Optional[str] = Field(None, max_length=500)

    model_config = ConfigDict(from_attributes=True)


class BatchCreate(BatchBase):
    """Schema for creating a batch"""
    pass


class BatchUpdate(BaseModel):
    """Schema for updating batch details"""
    
    quantity_available: Optional[int] = Field(None, ge=0)
    location_code: Optional[str] = Field(None, max_length=100)
    sale_price: Optional[Decimal] = Field(None, ge=0)
    notes: Optional[str] = Field(None, max_length=500)

    model_config = ConfigDict(str_strip_whitespace=True)


class BatchResponse(BatchBase):
    """Schema for batch response"""
    
    batch_id: int
    org_id: UUID
    product_name: str
    product_code: str
    
    quantity_sold: int = 0
    quantity_reserved: int = 0
    stock_value: Decimal = Decimal("0")
    days_to_expiry: Optional[int] = None
    is_expired: bool = False
    is_near_expiry: bool = False
    
    created_at: datetime
    updated_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class BatchSummary(BaseModel):
    """Lightweight batch for dropdowns"""
    
    batch_id: int
    batch_number: str
    expiry_date: date
    quantity_available: int
    mrp: Decimal

    model_config = ConfigDict(from_attributes=True)


class BatchListResponse(BaseModel):
    """Paginated batch list"""
    
    total: int
    page: int = Field(default=1, ge=1)
    per_page: int = Field(default=20, ge=1, le=1000)
    batches: List[BatchResponse] = Field(default_factory=list)


# =============================================================================
# STOCK MOVEMENT SCHEMAS
# =============================================================================

class StockMovementBase(BaseModel):
    """Base stock movement model"""
    
    product_id: int = Field(..., gt=0)
    batch_id: Optional[int] = None
    movement_type: str = Field(..., description="purchase, sale, return, adjustment, transfer")
    movement_direction: Optional[str] = Field(None, description="in or out")
    movement_date: date = Field(default_factory=date.today)
    quantity: int = Field(..., gt=0, description="Movement quantity")
    
    # Pack details
    pack_type: Optional[str] = Field(None, max_length=20)
    base_quantity: Optional[int] = Field(None, description="Quantity in base units")
    
    # Costing
    unit_cost: Optional[Decimal] = Field(None, ge=0)
    total_cost: Optional[Decimal] = Field(None, ge=0)
    
    # Reference
    reference_type: Optional[str] = Field(None, description="order, invoice, purchase, grn")
    reference_id: Optional[int] = None
    reference_number: Optional[str] = Field(None, max_length=50)
    
    # Location
    location_id: Optional[int] = None
    from_location_id: Optional[int] = None
    to_location_id: Optional[int] = None
    
    reason: Optional[str] = Field(None, max_length=200)
    notes: Optional[str] = Field(None, max_length=500)
    performed_by: Optional[str] = Field(None, max_length=100)

    model_config = ConfigDict(from_attributes=True)


class StockMovementCreate(StockMovementBase):
    """Schema for recording stock movement"""
    org_id: Optional[UUID] = Field(None, description="Organization ID (set by service if not provided)")
    created_by: Optional[int] = Field(None, description="User ID who created the movement")
    transfer_type: Optional[str] = Field(None, description="Type of transfer (internal, external)")


class StockMovementResponse(StockMovementBase):
    """Schema for stock movement response"""
    
    movement_id: int
    org_id: Optional[UUID] = None
    product_name: str = ""
    product_code: str = ""
    batch_number: Optional[str] = None
    
    stock_before: Optional[int] = None
    stock_after: Optional[int] = None
    
    created_at: Optional[datetime] = None
    created_by: Optional[int] = None

    model_config = ConfigDict(from_attributes=True)


class StockMovementListResponse(BaseModel):
    """Paginated movement list"""
    
    total: int
    page: int = Field(default=1, ge=1)
    per_page: int = Field(default=20, ge=1, le=1000)
    movements: List[StockMovementResponse] = Field(default_factory=list)


# =============================================================================
# ADJUSTMENT & TRANSFER SCHEMAS
# =============================================================================

class StockAdjustment(BaseModel):
    """Schema for stock adjustment"""
    
    product_id: int = Field(..., gt=0)
    batch_id: Optional[int] = None
    adjustment_type: str = Field(..., description="damage, expiry, theft, counting, other")
    quantity: int = Field(..., description="Positive to add, negative to remove")
    reason: str = Field(..., min_length=1, max_length=200)
    notes: Optional[str] = Field(None, max_length=500)

    model_config = ConfigDict(str_strip_whitespace=True)


class StockTransfer(BaseModel):
    """Schema for stock transfer between locations"""
    
    product_id: int = Field(..., gt=0)
    batch_id: Optional[int] = None
    quantity: int = Field(..., gt=0)
    from_location_id: int = Field(..., description="Source location/branch ID")
    to_location_id: int = Field(..., description="Destination location/branch ID")
    transfer_date: date = Field(default_factory=date.today)
    notes: Optional[str] = Field(None, max_length=500)

    model_config = ConfigDict(str_strip_whitespace=True)


# =============================================================================
# STOCK SUMMARY SCHEMAS
# =============================================================================

class CurrentStock(BaseModel):
    """Schema for current stock summary"""
    
    product_id: int
    product_code: str
    product_name: str
    
    total_quantity: int = 0
    available_quantity: int = 0
    reserved_quantity: int = 0
    
    total_batches: int = 0
    expired_batches: int = 0
    near_expiry_batches: int = 0
    
    total_value: Decimal = Decimal("0")
    average_cost: Decimal = Decimal("0")
    
    minimum_stock: Optional[int] = None
    reorder_level: Optional[int] = None
    is_below_minimum: bool = False
    is_below_reorder: bool = False

    model_config = ConfigDict(from_attributes=True)


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

    model_config = ConfigDict(from_attributes=True)


class LowStockAlert(BaseModel):
    """Schema for low stock alerts"""
    
    product_id: int
    product_name: str
    product_code: str
    current_stock: int
    reorder_level: int
    minimum_stock: int
    shortage_quantity: int
    alert_level: str

    model_config = ConfigDict(from_attributes=True)


# =============================================================================
# VALUATION & DASHBOARD SCHEMAS
# =============================================================================

class StockValuation(BaseModel):
    """Schema for stock valuation report"""
    
    valuation_date: date
    valuation_method: str = Field(default="FIFO", description="FIFO, LIFO, WAC")
    
    total_products: int = 0
    total_batches: int = 0
    
    total_quantity: int = 0
    expired_quantity: int = 0
    near_expiry_quantity: int = 0
    
    total_value: Decimal = Decimal("0")
    expired_value: Decimal = Decimal("0")
    near_expiry_value: Decimal = Decimal("0")
    
    category_wise: List[dict] = Field(default_factory=list)

    model_config = ConfigDict(from_attributes=True)


class InventoryDashboard(BaseModel):
    """Schema for inventory dashboard"""
    
    total_products: int = 0
    total_batches: int = 0
    total_stock_value: Decimal = Decimal("0")
    
    expired_products: int = 0
    near_expiry_products: int = 0
    low_stock_products: int = 0
    out_of_stock_products: int = 0
    
    todays_movements: int = 0
    pending_orders: int = 0
    
    fast_moving_products: List[dict] = Field(default_factory=list)
    slow_moving_products: List[dict] = Field(default_factory=list)
    
    expiry_alerts: List[ExpiryAlert] = Field(default_factory=list)
    low_stock_alerts: List[LowStockAlert] = Field(default_factory=list)
