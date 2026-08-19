"""
GRN (Goods Receipt Note) schemas for enterprise pharma system
Handles receiving goods against purchase orders
"""
from typing import Optional, List
from pydantic import BaseModel, Field, field_validator, ConfigDict
from datetime import datetime, date
from decimal import Decimal
from uuid import UUID
from enum import Enum

from ....core.utils.constants import GRNStatus


# =============================================================================
# ENUMS
# =============================================================================

class QCStatus(str, Enum):
    """Quality check status"""
    PENDING = "pending"
    PASSED = "passed"
    FAILED = "failed"
    PARTIAL = "partial"


# =============================================================================
# GRN ITEM SCHEMAS
# =============================================================================

class GRNItemBase(BaseModel):
    """Base GRN item model"""
    
    product_id: int = Field(..., gt=0)
    po_item_id: Optional[int] = None
    
    batch_number: str = Field(..., min_length=1, max_length=50)
    manufacturing_date: Optional[date] = None
    expiry_date: date = Field(..., description="Batch expiry date")
    
    ordered_quantity: Decimal = Field(default=Decimal("0"), ge=0)
    received_quantity: Decimal = Field(..., gt=0, description="Quantity received")
    accepted_quantity: Decimal = Field(default=Decimal("0"), ge=0)
    rejected_quantity: Decimal = Field(default=Decimal("0"), ge=0)
    free_quantity: Decimal = Field(default=Decimal("0"), ge=0)
    
    unit_price: Decimal = Field(..., ge=0)
    mrp: Decimal = Field(..., ge=0)
    ptr: Optional[Decimal] = Field(None, ge=0)
    
    discount_percent: Decimal = Field(default=Decimal("0"), ge=0, le=100)
    discount_amount: Decimal = Field(default=Decimal("0"), ge=0)
    
    gst_percent: Decimal = Field(default=Decimal("0"), ge=0, le=28)
    cgst_amount: Decimal = Field(default=Decimal("0"), ge=0)
    sgst_amount: Decimal = Field(default=Decimal("0"), ge=0)
    igst_amount: Decimal = Field(default=Decimal("0"), ge=0)
    
    taxable_amount: Optional[Decimal] = Field(None, ge=0)
    total_amount: Optional[Decimal] = Field(None, ge=0)
    
    # QC
    qc_status: QCStatus = QCStatus.PENDING
    qc_notes: Optional[str] = Field(None, max_length=500)
    rejection_reason: Optional[str] = Field(None, max_length=200)
    
    # Storage
    location_code: Optional[str] = Field(None, max_length=50)
    notes: Optional[str] = Field(None, max_length=200)

    model_config = ConfigDict(from_attributes=True)


class GRNItemCreate(GRNItemBase):
    """Schema for creating GRN item"""
    pass


class GRNItemResponse(GRNItemBase):
    """Schema for GRN item response"""
    
    grn_item_id: int
    grn_id: int
    product_name: str
    product_code: str
    batch_id: Optional[int] = None

    model_config = ConfigDict(from_attributes=True)


# =============================================================================
# GRN SCHEMAS
# =============================================================================

class GRNBase(BaseModel):
    """Base GRN model"""
    
    po_id: Optional[int] = Field(None, description="Purchase order ID")
    supplier_id: int = Field(..., gt=0)
    grn_date: date = Field(default_factory=date.today)
    
    # Supplier details
    supplier_name: Optional[str] = Field(None, max_length=200)
    supplier_invoice_number: Optional[str] = Field(None, max_length=50)
    supplier_invoice_date: Optional[date] = None
    
    # Transport
    vehicle_number: Optional[str] = Field(None, max_length=20)
    driver_name: Optional[str] = Field(None, max_length=100)
    lr_number: Optional[str] = Field(None, max_length=50, description="Lorry Receipt")
    transporter_name: Optional[str] = Field(None, max_length=100)
    
    # GST
    gst_type: str = Field(default="CGST/SGST")
    
    notes: Optional[str] = Field(None, max_length=1000)

    model_config = ConfigDict(from_attributes=True, str_strip_whitespace=True)


class GRNCreate(GRNBase):
    """Schema for creating GRN"""
    
    items: List[GRNItemCreate] = Field(..., min_length=1)


class GRNUpdate(BaseModel):
    """Schema for updating GRN"""
    
    supplier_invoice_number: Optional[str] = Field(None, max_length=50)
    supplier_invoice_date: Optional[date] = None
    vehicle_number: Optional[str] = Field(None, max_length=20)
    notes: Optional[str] = Field(None, max_length=1000)
    grn_status: Optional[GRNStatus] = None

    model_config = ConfigDict(str_strip_whitespace=True)


class GRNResponse(GRNBase):
    """Schema for GRN response"""
    
    grn_id: int
    org_id: UUID
    grn_number: str
    grn_status: GRNStatus = GRNStatus.DRAFT
    po_number: Optional[str] = None
    
    items: List[GRNItemResponse] = Field(default_factory=list)
    
    # Amounts
    subtotal_amount: Decimal = Decimal("0")
    discount_amount: Decimal = Decimal("0")
    taxable_amount: Decimal = Decimal("0")
    cgst_amount: Decimal = Decimal("0")
    sgst_amount: Decimal = Decimal("0")
    igst_amount: Decimal = Decimal("0")
    total_tax_amount: Decimal = Decimal("0")
    total_amount: Decimal = Decimal("0")
    
    # QC Summary
    items_pending_qc: int = 0
    items_passed_qc: int = 0
    items_failed_qc: int = 0
    
    # Metadata
    created_at: datetime
    updated_at: Optional[datetime] = None
    created_by: Optional[int] = None
    verified_by: Optional[int] = None
    verified_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class GRNSummary(BaseModel):
    """Lightweight GRN for lists"""
    
    grn_id: int
    grn_number: str
    grn_date: date
    supplier_name: str
    po_number: Optional[str] = None
    total_amount: Decimal
    grn_status: GRNStatus
    items_count: int = 0

    model_config = ConfigDict(from_attributes=True)


class GRNListResponse(BaseModel):
    """Paginated GRN list"""
    
    total: int
    page: int = Field(default=1, ge=1)
    per_page: int = Field(default=20, ge=1, le=1000)
    grns: List[GRNSummary] = Field(default_factory=list)


# =============================================================================
# QC SCHEMAS
# =============================================================================

class QCUpdateRequest(BaseModel):
    """Schema for updating QC status"""
    
    grn_item_id: int
    qc_status: QCStatus
    accepted_quantity: Decimal = Field(..., ge=0)
    rejected_quantity: Decimal = Field(default=Decimal("0"), ge=0)
    rejection_reason: Optional[str] = Field(None, max_length=200)
    qc_notes: Optional[str] = Field(None, max_length=500)

    model_config = ConfigDict(str_strip_whitespace=True)


class BulkQCUpdate(BaseModel):
    """Schema for bulk QC update"""
    
    grn_id: int
    items: List[QCUpdateRequest] = Field(..., min_length=1)
