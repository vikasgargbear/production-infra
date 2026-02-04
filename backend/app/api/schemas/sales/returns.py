"""
Return schemas for sales and purchase returns
Centralized schemas for all return-related operations
"""
from typing import List, Optional
from pydantic import BaseModel, Field, field_validator, ConfigDict
from datetime import date, datetime
from decimal import Decimal
from enum import Enum


# =============================================================================
# ENUMS
# =============================================================================

class ReturnCategory(str, Enum):
    """Categories for return reasons"""
    QUALITY = "QUALITY"
    EXPIRED = "EXPIRED"
    DAMAGED = "DAMAGED"
    WRONG_PRODUCT = "WRONG_PRODUCT"
    EXCESS = "EXCESS"
    SHORT_EXPIRY = "SHORT_EXPIRY"
    RECALL = "RECALL"
    OTHER = "OTHER"


class ReturnMethod(str, Enum):
    """Methods for handling returns"""
    CREDIT_NOTE = "credit_note"
    REPLACEMENT = "replacement"
    REFUND = "refund"
    ADJUSTMENT = "adjustment"


class Disposition(str, Enum):
    """Disposition types for returned items"""
    RESTOCK = "RESTOCK"
    QUARANTINE = "QUARANTINE"
    DESTROY = "DESTROY"
    RETURN_TO_SUPPLIER = "RETURN_TO_SUPPLIER"


class ReturnStatus(str, Enum):
    """Return processing status"""
    PENDING = "pending"
    APPROVED = "approved"
    PROCESSING = "processing"
    COMPLETED = "completed"
    REJECTED = "rejected"


# =============================================================================
# SALES RETURN SCHEMAS
# =============================================================================

class SalesReturnItem(BaseModel):
    """Schema for a single item in a sales return"""
    
    product_id: int = Field(..., description="Product ID")
    invoice_item_id: Optional[int] = Field(None, description="Original invoice item ID")
    batch_id: Optional[int] = Field(None, description="Batch ID")
    batch_number: Optional[str] = Field(None, max_length=50, description="Batch number")
    
    return_quantity: Decimal = Field(..., gt=0, description="Total quantity being returned (paid + free)")
    quantity: Optional[Decimal] = Field(None, description="Alias for return_quantity")
    free_quantity: Decimal = Field(default=Decimal("0"), ge=0, description="Free items in return (no credit)")
    
    unit_price: Decimal = Field(..., ge=0, description="Unit price")
    mrp: Optional[Decimal] = Field(None, ge=0, description="MRP per unit")
    
    # Optional manual override - if provided, use this instead of calculated value
    return_value: Optional[Decimal] = Field(None, ge=0, description="Manual override for credit amount")
    
    tax_percent: Decimal = Field(default=Decimal("0"), ge=0, le=28)
    discount_percent: Decimal = Field(default=Decimal("0"), ge=0, le=100)
    
    cgst_amount: Decimal = Field(default=Decimal("0"), ge=0)
    sgst_amount: Decimal = Field(default=Decimal("0"), ge=0)
    igst_amount: Decimal = Field(default=Decimal("0"), ge=0)
    
    unit: str = Field(default="PCS", max_length=20)
    return_reason: Optional[str] = Field(None, max_length=200)
    disposition: str = Field(default="RESTOCK", description="RESTOCK, QUARANTINE, DESTROY")
    restock: bool = Field(default=True, description="Whether to return to inventory")
    
    line_total: Optional[Decimal] = None

    model_config = ConfigDict(from_attributes=True)


class SalesReturnCreate(BaseModel):
    """Schema for creating a sales return"""
    
    customer_id: int = Field(..., description="Customer ID")
    invoice_id: Optional[int] = Field(None, description="Original invoice ID")
    invoice_number: Optional[str] = Field(None, description="Original invoice number")
    
    return_date: date = Field(default_factory=date.today)
    return_reason: str = Field(..., min_length=1, max_length=500, description="Reason for return")
    return_method: str = Field(
        default="credit_note",
        description="credit_note, replacement, refund, adjustment"
    )
    return_category: str = Field(default="QUALITY", description="Return category")
    
    notes: Optional[str] = Field(None, max_length=1000)
    
    # B2B GST handling - when true, GST is NOT included in credit/refund amount
    withhold_gst: bool = Field(
        default=False, 
        description="For B2B returns: if True, GST is withheld (not included in return amount)"
    )
    
    items: List[SalesReturnItem] = Field(..., min_length=1)

    @field_validator("return_method")
    @classmethod
    def validate_return_method(cls, v):
        valid = {"credit_note", "replacement", "refund", "adjustment"}
        if v.lower() not in valid:
            raise ValueError(f"Invalid return method. Must be one of: {', '.join(valid)}")
        return v.lower()

    model_config = ConfigDict(str_strip_whitespace=True)


class SalesReturnResponse(BaseModel):
    """Response schema for sales return"""
    
    return_id: int
    return_number: str
    return_date: date
    
    customer_id: int
    customer_name: Optional[str] = None
    invoice_id: Optional[int] = None
    invoice_number: Optional[str] = None
    
    return_reason: Optional[str] = None
    return_category: Optional[str] = None
    return_method: Optional[str] = None
    
    subtotal_amount: Decimal = Decimal("0")
    tax_amount: Decimal = Decimal("0")
    total_amount: Decimal = Decimal("0")
    
    credit_note_number: Optional[str] = None
    credit_note_status: Optional[str] = None
    
    status: str = "pending"
    items_count: int = 0
    
    created_at: Optional[datetime] = None
    created_by: Optional[int] = None

    model_config = ConfigDict(from_attributes=True)


# =============================================================================
# PURCHASE RETURN SCHEMAS
# =============================================================================

class PurchaseReturnItem(BaseModel):
    """Schema for a single item in a purchase return"""
    
    product_id: int = Field(..., description="Product ID")
    grn_item_id: Optional[int] = Field(None, description="Original GRN item ID")
    batch_id: Optional[int] = Field(None, description="Batch ID")
    batch_number: Optional[str] = Field(None, max_length=50)
    
    return_quantity: Decimal = Field(..., gt=0, description="Quantity being returned")
    unit_price: Decimal = Field(..., ge=0, description="Unit price")
    
    tax_percent: Decimal = Field(default=Decimal("0"), ge=0, le=28)
    discount_percent: Decimal = Field(default=Decimal("0"), ge=0, le=100)
    
    unit: str = Field(default="PCS", max_length=20)
    return_reason: Optional[str] = Field(None, max_length=200)
    condition: str = Field(default="good", description="good, damaged, expired")

    model_config = ConfigDict(from_attributes=True)


class PurchaseReturnCreate(BaseModel):
    """Schema for creating a purchase return"""
    
    supplier_id: int = Field(..., description="Supplier ID")
    grn_id: Optional[int] = Field(None, description="Original GRN ID")
    supplier_invoice_id: Optional[int] = Field(None, description="Original supplier invoice ID")
    
    return_date: date = Field(default_factory=date.today)
    return_reason: str = Field(..., min_length=1, max_length=500)
    return_category: str = Field(default="QUALITY")
    
    notes: Optional[str] = Field(None, max_length=1000)
    items: List[PurchaseReturnItem] = Field(..., min_length=1)

    model_config = ConfigDict(str_strip_whitespace=True)


class PurchaseReturnResponse(BaseModel):
    """Response schema for purchase return"""
    
    return_id: int
    return_number: str
    return_date: date
    
    supplier_id: int
    supplier_name: Optional[str] = None
    grn_id: Optional[int] = None
    grn_number: Optional[str] = None
    
    subtotal_amount: Decimal = Decimal("0")
    tax_amount: Decimal = Decimal("0")
    total_amount: Decimal = Decimal("0")
    
    debit_note_number: Optional[str] = None
    debit_note_status: Optional[str] = None
    
    status: str = "pending"
    items_count: int = 0
    
    created_at: Optional[datetime] = None
    created_by: Optional[int] = None

    model_config = ConfigDict(from_attributes=True)


# =============================================================================
# LIST & SUMMARY SCHEMAS
# =============================================================================

class ReturnListResponse(BaseModel):
    """Paginated return list response"""
    
    total: int = Field(..., description="Total returns matching filter")
    page: int = Field(default=1, ge=1)
    per_page: int = Field(default=20, ge=1, le=1000)
    returns: List[dict] = Field(default_factory=list)


class ReturnSummary(BaseModel):
    """Summary statistics for returns"""
    
    total_returns: int = 0
    total_amount: Decimal = Decimal("0")
    pending_count: int = 0
    approved_count: int = 0
    completed_count: int = 0
    rejected_count: int = 0
    by_category: dict = Field(default_factory=dict)
    by_method: dict = Field(default_factory=dict)
