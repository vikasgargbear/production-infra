"""
Inventory Schemas
Pydantic models for stock management operations
"""
from typing import Optional, List
from datetime import datetime, date
from decimal import Decimal
from pydantic import BaseModel, Field
from enum import Enum


# ============================================================================
# ENUMS
# ============================================================================

class StockOperationMovementType(str, Enum):
    """Detailed movement codes emitted by stock-operation endpoints."""
    SALE = "sale"
    PURCHASE = "purchase"
    STOCK_RECEIVE = "stock_receive"
    STOCK_ISSUE = "stock_issue"
    STOCK_TRANSFER = "stock_transfer"
    STOCK_ADJUSTMENT = "stock_adjustment"
    STOCK_DAMAGE = "stock_damage"
    STOCK_EXPIRY = "stock_expiry"
    STOCK_COUNT = "stock_count"
    STOCK_RETURN = "stock_return"
    WRITEOFF = "writeoff"


class StockAdjustmentReason(str, Enum):
    """Adjustment reasons accepted by stock-operation requests."""
    DAMAGE = "damage"
    EXPIRY = "expiry"
    COUNT = "count"
    OTHER = "other"


class WriteOffReason(str, Enum):
    """Reasons for stock write-off"""
    EXPIRED = "expired"
    DAMAGED = "damaged"
    THEFT = "theft"
    SAMPLE = "sample"
    PERSONAL_USE = "personal_use"
    DESTROYED = "destroyed"
    OTHER = "other"


class AlertPriority(str, Enum):
    """Alert priority levels"""
    CRITICAL = "critical"
    HIGH = "high"
    MEDIUM = "medium"
    LOW = "low"


# ============================================================================
# STOCK RECEIVE
# ============================================================================

class StockReceiveRequest(BaseModel):
    """Request model for receiving stock"""
    product_id: int
    batch_number: Optional[str] = None
    quantity: int = Field(..., gt=0, description="Quantity to receive")
    cost_price: Optional[Decimal] = None
    selling_price: Optional[Decimal] = None
    mrp: Optional[Decimal] = None
    expiry_date: Optional[datetime] = None
    supplier_id: Optional[int] = None
    purchase_invoice_number: Optional[str] = None
    notes: Optional[str] = None
    # Pack configuration
    pack_type: Optional[str] = Field(None, description="Pack type (strip, box, bottle)")
    pack_size: Optional[int] = Field(None, description="Pack size (10, 100, etc)")
    pack_uom: Optional[str] = Field(None, description="Pack unit of measure")
    base_uom: Optional[str] = Field(None, description="Base unit of measure")
    units_per_pack: Optional[int] = Field(None, description="Units per pack")
    category_name: Optional[str] = Field(None, description="Product category")


class StockReceiveResponse(BaseModel):
    """Response after receiving stock"""
    batch_id: int
    batch_number: str
    product_id: int
    product_name: str
    quantity_received: int
    quantity_available: int
    expiry_date: datetime
    message: str


# ============================================================================
# WRITE-OFF
# ============================================================================

class WriteOffItem(BaseModel):
    """Single item in a write-off request"""
    product_id: int
    batch_id: Optional[int] = None
    quantity: Decimal = Field(..., gt=0)
    cost_price: Decimal = Field(..., ge=0)
    gst_percent: Optional[Decimal] = Field(default=Decimal("0"), ge=0, le=28)


class WriteOffRequest(BaseModel):
    """Request to create a stock write-off"""
    write_off_date: date
    reason: WriteOffReason
    reason_notes: Optional[str] = None
    items: List[WriteOffItem] = Field(..., min_length=1)


class WriteOffResponse(BaseModel):
    """Response after creating write-off"""
    success: bool
    writeoff_id: str
    writeoff_number: str
    total_cost_value: float
    total_itc_reversal: float
    requires_itc_reversal: bool
    message: str


# ============================================================================
# STOCK ADJUSTMENT
# ============================================================================

class StockAdjustmentItem(BaseModel):
    """Single item in adjustment"""
    product_id: int
    batch_id: Optional[int] = None
    quantity: int = Field(..., gt=0)
    adjustment_type: StockAdjustmentReason
    reason: Optional[str] = None


class StockAdjustmentRequest(BaseModel):
    """Request to create stock adjustment"""
    adjustment_date: date
    adjustment_type: StockAdjustmentReason
    reason: Optional[str] = None
    items: List[StockAdjustmentItem] = Field(..., min_length=1)


# ============================================================================
# CONSTANTS
# ============================================================================

# Mapping of adjustment types to movement types
ADJUSTMENT_TYPE_MAPPING = {
    "damage": "stock_damage",
    "expiry": "stock_expiry",
    "count": "stock_count",
    "other": "stock_adjustment"
}

# ITC reversal rules for write-offs
WRITEOFF_ITC_RULES = {
    "expired": "itc_reversal",
    "damaged": "itc_reversal",
    "theft": "itc_reversal",
    "sample": "no_reversal",
    "personal_use": "itc_reversal",
    "destroyed": "itc_reversal",
    "other": "itc_reversal"
}
