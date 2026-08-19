"""
Purchase Order schemas for enterprise pharma system
Handles purchase order creation, approval, and tracking
"""
from typing import Optional, List
from pydantic import BaseModel, Field, field_validator, ConfigDict
from datetime import datetime, date
from decimal import Decimal
from uuid import UUID
from enum import Enum

from ....core.utils.constants import POStatus


# =============================================================================
# ENUMS
# =============================================================================

class POType(str, Enum):
    """Purchase order types"""
    REGULAR = "regular"
    EMERGENCY = "emergency"
    SCHEDULED = "scheduled"
    INDENT = "indent"


# =============================================================================
# PO ITEM SCHEMAS
# =============================================================================

class POItemBase(BaseModel):
    """Base purchase order item model"""
    
    product_id: int = Field(..., gt=0, description="Product ID")
    product_name: Optional[str] = None
    product_code: Optional[str] = Field(None, max_length=50)
    hsn_code: Optional[str] = Field(None, max_length=8)
    
    quantity: Decimal = Field(..., gt=0, description="Order quantity")
    free_quantity: Decimal = Field(default=Decimal("0"), ge=0)
    uom: Optional[str] = Field(None, max_length=20, description="Unit of measure")
    
    unit_price: Decimal = Field(..., ge=0, description="Unit price")
    mrp: Optional[Decimal] = Field(None, ge=0)
    ptr: Optional[Decimal] = Field(None, ge=0, description="Price to Retailer")
    
    discount_percent: Decimal = Field(default=Decimal("0"), ge=0, le=100)
    discount_amount: Decimal = Field(default=Decimal("0"), ge=0)
    
    gst_percent: Decimal = Field(default=Decimal("0"), ge=0, le=28)
    cgst_amount: Decimal = Field(default=Decimal("0"), ge=0)
    sgst_amount: Decimal = Field(default=Decimal("0"), ge=0)
    igst_amount: Decimal = Field(default=Decimal("0"), ge=0)
    
    taxable_amount: Optional[Decimal] = Field(None, ge=0)
    total_amount: Optional[Decimal] = Field(None, ge=0)
    
    notes: Optional[str] = Field(None, max_length=200)

    model_config = ConfigDict(from_attributes=True)


class POItemCreate(POItemBase):
    """Schema for creating PO item"""
    pass


class POItemResponse(POItemBase):
    """Schema for PO item response"""
    
    po_item_id: int
    po_id: int
    received_quantity: Decimal = Decimal("0")
    pending_quantity: Decimal = Decimal("0")
    is_fully_received: bool = False

    model_config = ConfigDict(from_attributes=True)


# =============================================================================
# PURCHASE ORDER SCHEMAS
# =============================================================================

class PurchaseOrderBase(BaseModel):
    """Base purchase order model"""
    
    supplier_id: int = Field(..., gt=0, description="Supplier ID")
    po_date: date = Field(default_factory=date.today)
    expected_delivery_date: Optional[date] = None
    
    po_type: POType = Field(default=POType.REGULAR)
    reference_number: Optional[str] = Field(None, max_length=50)
    
    # Supplier details (denormalized)
    supplier_name: Optional[str] = Field(None, max_length=200)
    supplier_gstin: Optional[str] = Field(None, min_length=15, max_length=15)
    
    # Address
    billing_address: Optional[str] = Field(None, max_length=500)
    shipping_address: Optional[str] = Field(None, max_length=500)
    
    # GST
    gst_type: str = Field(default="CGST/SGST", description="CGST/SGST or IGST")
    place_of_supply: Optional[str] = Field(None, max_length=50)
    
    # Terms
    payment_terms: Optional[str] = Field(None, max_length=100)
    credit_days: int = Field(default=30, ge=0, le=365)
    
    notes: Optional[str] = Field(None, max_length=1000)
    terms_conditions: Optional[str] = Field(None, max_length=2000)

    model_config = ConfigDict(from_attributes=True, str_strip_whitespace=True)


class PurchaseOrderCreate(PurchaseOrderBase):
    """Schema for creating purchase order"""
    
    items: List[POItemCreate] = Field(..., min_length=1)

    @field_validator("expected_delivery_date")
    @classmethod
    def validate_delivery_date(cls, v, info):
        po_date = info.data.get("po_date")
        if v and po_date and v < po_date:
            raise ValueError("Expected delivery date cannot be before PO date")
        return v


class PurchaseOrderUpdate(BaseModel):
    """Schema for updating purchase order"""
    
    expected_delivery_date: Optional[date] = None
    billing_address: Optional[str] = Field(None, max_length=500)
    shipping_address: Optional[str] = Field(None, max_length=500)
    payment_terms: Optional[str] = Field(None, max_length=100)
    notes: Optional[str] = Field(None, max_length=1000)
    po_status: Optional[POStatus] = None

    model_config = ConfigDict(str_strip_whitespace=True)


class PurchaseOrderResponse(PurchaseOrderBase):
    """Schema for purchase order response"""
    
    po_id: int
    org_id: UUID
    po_number: str
    po_status: POStatus = POStatus.DRAFT
    
    items: List[POItemResponse] = Field(default_factory=list)
    
    # Amounts
    subtotal_amount: Decimal = Decimal("0")
    discount_amount: Decimal = Decimal("0")
    taxable_amount: Decimal = Decimal("0")
    cgst_amount: Decimal = Decimal("0")
    sgst_amount: Decimal = Decimal("0")
    igst_amount: Decimal = Decimal("0")
    total_tax_amount: Decimal = Decimal("0")
    total_amount: Decimal = Decimal("0")
    
    # Receipt tracking
    received_amount: Decimal = Decimal("0")
    pending_amount: Decimal = Decimal("0")
    grn_count: int = 0
    
    # Approval
    approved_by: Optional[int] = None
    approved_at: Optional[datetime] = None
    
    # Metadata
    created_at: datetime
    updated_at: Optional[datetime] = None
    created_by: Optional[int] = None

    model_config = ConfigDict(from_attributes=True)


class PurchaseOrderSummary(BaseModel):
    """Lightweight PO for lists"""
    
    po_id: int
    po_number: str
    po_date: date
    supplier_name: str
    total_amount: Decimal
    po_status: POStatus
    items_count: int = 0

    model_config = ConfigDict(from_attributes=True)


class PurchaseOrderListResponse(BaseModel):
    """Paginated PO list"""
    
    total: int
    page: int = Field(default=1, ge=1)
    per_page: int = Field(default=20, ge=1, le=1000)
    orders: List[PurchaseOrderSummary] = Field(default_factory=list)


# =============================================================================
# APPROVAL SCHEMAS
# =============================================================================

class POApprovalRequest(BaseModel):
    """Schema for PO approval"""
    
    action: str = Field(..., description="approve or reject")
    comments: Optional[str] = Field(None, max_length=500)

    @field_validator("action")
    @classmethod
    def validate_action(cls, v):
        if v.lower() not in {"approve", "reject"}:
            raise ValueError("Action must be 'approve' or 'reject'")
        return v.lower()


class POStatusHistory(BaseModel):
    """PO status change record"""
    
    status: POStatus
    changed_at: datetime
    changed_by: Optional[str] = None
    comments: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)
