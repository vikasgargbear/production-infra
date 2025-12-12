"""
Return Schemas for Sales and Purchase Returns
Centralized schemas for all return-related operations
"""
from typing import List, Optional
from pydantic import BaseModel, Field
from datetime import date
from decimal import Decimal
from enum import Enum


class ReturnCategory(str, Enum):
    """Categories for return reasons"""
    QUALITY = "QUALITY"
    EXPIRED = "EXPIRED"
    DAMAGED = "DAMAGED"
    WRONG_PRODUCT = "WRONG_PRODUCT"
    EXCESS = "EXCESS"
    SHORT_EXPIRY = "SHORT_EXPIRY"
    OTHER = "OTHER"


class ReturnMethod(str, Enum):
    """Methods for handling returns"""
    CREDIT_NOTE = "credit_note"
    REPLACEMENT = "replacement"
    REFUND = "refund"


class Disposition(str, Enum):
    """Disposition types for returned items"""
    RESTOCK = "RESTOCK"
    QUARANTINE = "QUARANTINE"
    DESTROY = "DESTROY"
    RETURN_TO_SUPPLIER = "RETURN_TO_SUPPLIER"


# =============================================================================
# Sales Return Schemas
# =============================================================================

class SalesReturnItem(BaseModel):
    """Schema for a single item in a sales return"""
    product_id: int
    invoice_item_id: Optional[int] = None
    batch_id: Optional[int] = None
    batch_no: Optional[str] = None
    return_quantity: float
    quantity: Optional[float] = None  # Alias for return_quantity
    rate: float
    tax_percent: float = 0
    discount_percent: float = 0
    unit: str = "PCS"
    return_reason: Optional[str] = None
    restock: Optional[bool] = None


class SalesReturnCreate(BaseModel):
    """Schema for creating a sales return"""
    customer_id: int
    invoice_id: Optional[int] = None
    return_date: str
    return_reason: str
    return_method: str = Field(default="credit_note", pattern="^(credit_note|replacement|refund)$")
    return_category: str = Field(default="QUALITY")
    notes: Optional[str] = ""
    items: List[SalesReturnItem]


class SalesReturnResponse(BaseModel):
    """Response schema for sales return"""
    return_id: int
    return_number: str
    return_date: str
    customer_id: int
    customer_name: Optional[str] = None
    total_amount: Decimal
    credit_note_number: Optional[str] = None
    credit_note_status: Optional[str] = None
    status: str
    items_count: int


# =============================================================================
# Purchase Return Schemas
# =============================================================================

class PurchaseReturnItem(BaseModel):
    """Schema for a single item in a purchase return"""
    product_id: int
    grn_item_id: Optional[int] = None
    batch_id: Optional[int] = None
    batch_number: Optional[str] = None
    return_quantity: float
    unit_price: float
    tax_percent: float = 0
    discount_percent: float = 0
    unit: str = "PCS"
    return_reason: Optional[str] = None
    condition: str = Field(default="good", pattern="^(good|damaged|expired)$")


class PurchaseReturnCreate(BaseModel):
    """Schema for creating a purchase return"""
    supplier_id: int
    grn_id: Optional[int] = None
    supplier_invoice_id: Optional[int] = None
    return_date: str
    return_reason: str
    return_category: str = Field(default="QUALITY")
    notes: Optional[str] = ""
    items: List[PurchaseReturnItem]


class PurchaseReturnResponse(BaseModel):
    """Response schema for purchase return"""
    return_id: int
    return_number: str
    return_date: str
    supplier_id: int
    supplier_name: Optional[str] = None
    total_amount: Decimal
    debit_note_number: Optional[str] = None
    debit_note_status: Optional[str] = None
    status: str
    items_count: int


# =============================================================================
# Common Return Schemas
# =============================================================================

class ReturnListResponse(BaseModel):
    """Response for paginated return list"""
    total: int
    returns: List[dict]


class ReturnSummary(BaseModel):
    """Summary statistics for returns"""
    total_returns: int
    total_amount: Decimal
    pending_count: int
    approved_count: int
    by_category: dict
