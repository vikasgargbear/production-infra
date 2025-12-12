"""
Supplier Invoice schemas for enterprise pharma system
Handles supplier invoice receipt and payment tracking
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

class SupplierInvoiceStatus(str, Enum):
    """Supplier invoice status"""
    DRAFT = "draft"
    PENDING_VERIFICATION = "pending_verification"
    VERIFIED = "verified"
    DISPUTED = "disputed"
    PAID = "paid"
    PARTIALLY_PAID = "partially_paid"
    CANCELLED = "cancelled"


class PaymentStatus(str, Enum):
    """Payment status"""
    PENDING = "pending"
    OVERDUE = "overdue"
    PAID = "paid"
    PARTIALLY_PAID = "partially_paid"


# =============================================================================
# INVOICE ITEM SCHEMAS
# =============================================================================

class SupplierInvoiceItemBase(BaseModel):
    """Base supplier invoice item"""
    
    product_id: int = Field(..., gt=0)
    grn_item_id: Optional[int] = None
    
    product_name: Optional[str] = None
    product_code: Optional[str] = Field(None, max_length=50)
    hsn_code: Optional[str] = Field(None, max_length=8)
    batch_number: Optional[str] = Field(None, max_length=50)
    
    quantity: Decimal = Field(..., gt=0)
    unit_price: Decimal = Field(..., ge=0)
    mrp: Optional[Decimal] = Field(None, ge=0)
    
    discount_percent: Decimal = Field(default=Decimal("0"), ge=0, le=100)
    discount_amount: Decimal = Field(default=Decimal("0"), ge=0)
    
    gst_percent: Decimal = Field(default=Decimal("0"), ge=0, le=28)
    cgst_amount: Decimal = Field(default=Decimal("0"), ge=0)
    sgst_amount: Decimal = Field(default=Decimal("0"), ge=0)
    igst_amount: Decimal = Field(default=Decimal("0"), ge=0)
    
    taxable_amount: Decimal = Field(default=Decimal("0"), ge=0)
    total_amount: Decimal = Field(default=Decimal("0"), ge=0)

    model_config = ConfigDict(from_attributes=True)


class SupplierInvoiceItemCreate(SupplierInvoiceItemBase):
    """Schema for creating invoice item"""
    pass


class SupplierInvoiceItemResponse(SupplierInvoiceItemBase):
    """Schema for invoice item response"""
    
    item_id: int
    invoice_id: int

    model_config = ConfigDict(from_attributes=True)


# =============================================================================
# SUPPLIER INVOICE SCHEMAS
# =============================================================================

class SupplierInvoiceBase(BaseModel):
    """Base supplier invoice model"""
    
    supplier_id: int = Field(..., gt=0)
    grn_id: Optional[int] = None
    po_id: Optional[int] = None
    
    invoice_number: str = Field(..., min_length=1, max_length=50)
    invoice_date: date = Field(...)
    due_date: Optional[date] = None
    
    supplier_name: Optional[str] = Field(None, max_length=200)
    supplier_gstin: Optional[str] = Field(None, min_length=15, max_length=15)
    
    # GST
    gst_type: str = Field(default="CGST/SGST")
    place_of_supply: Optional[str] = Field(None, max_length=50)
    is_reverse_charge: bool = Field(default=False)
    
    # E-Invoice (if applicable)
    irn: Optional[str] = Field(None, description="Invoice Reference Number")
    e_invoice_status: Optional[str] = None
    
    notes: Optional[str] = Field(None, max_length=1000)

    model_config = ConfigDict(from_attributes=True, str_strip_whitespace=True)


class SupplierInvoiceCreate(SupplierInvoiceBase):
    """Schema for creating supplier invoice"""
    
    items: List[SupplierInvoiceItemCreate] = Field(..., min_length=1)

    @field_validator("due_date")
    @classmethod
    def validate_due_date(cls, v, info):
        invoice_date = info.data.get("invoice_date")
        if v and invoice_date and v < invoice_date:
            raise ValueError("Due date cannot be before invoice date")
        return v


class SupplierInvoiceUpdate(BaseModel):
    """Schema for updating supplier invoice"""
    
    due_date: Optional[date] = None
    notes: Optional[str] = Field(None, max_length=1000)
    invoice_status: Optional[SupplierInvoiceStatus] = None

    model_config = ConfigDict(str_strip_whitespace=True)


class SupplierInvoiceResponse(SupplierInvoiceBase):
    """Schema for supplier invoice response"""
    
    invoice_id: int
    org_id: UUID
    invoice_status: SupplierInvoiceStatus = SupplierInvoiceStatus.DRAFT
    payment_status: PaymentStatus = PaymentStatus.PENDING
    
    grn_number: Optional[str] = None
    po_number: Optional[str] = None
    
    items: List[SupplierInvoiceItemResponse] = Field(default_factory=list)
    
    # Amounts
    subtotal_amount: Decimal = Decimal("0")
    discount_amount: Decimal = Decimal("0")
    taxable_amount: Decimal = Decimal("0")
    cgst_amount: Decimal = Decimal("0")
    sgst_amount: Decimal = Decimal("0")
    igst_amount: Decimal = Decimal("0")
    total_tax_amount: Decimal = Decimal("0")
    round_off: Decimal = Decimal("0")
    total_amount: Decimal = Decimal("0")
    
    # Payment
    paid_amount: Decimal = Decimal("0")
    balance_amount: Decimal = Decimal("0")
    days_overdue: int = 0
    
    # Metadata
    created_at: datetime
    updated_at: Optional[datetime] = None
    created_by: Optional[int] = None
    verified_by: Optional[int] = None
    verified_at: Optional[datetime] = None

    model_config = ConfigDict(from_attributes=True)


class SupplierInvoiceSummary(BaseModel):
    """Lightweight invoice for lists"""
    
    invoice_id: int
    invoice_number: str
    invoice_date: date
    supplier_name: str
    total_amount: Decimal
    balance_amount: Decimal
    invoice_status: SupplierInvoiceStatus
    payment_status: PaymentStatus
    due_date: Optional[date] = None
    days_overdue: int = 0

    model_config = ConfigDict(from_attributes=True)


class SupplierInvoiceListResponse(BaseModel):
    """Paginated invoice list"""
    
    total: int
    page: int = Field(default=1, ge=1)
    per_page: int = Field(default=20, ge=1, le=1000)
    invoices: List[SupplierInvoiceSummary] = Field(default_factory=list)


# =============================================================================
# PAYMENT SCHEMAS
# =============================================================================

class SupplierPaymentCreate(BaseModel):
    """Schema for recording supplier payment"""
    
    supplier_id: int = Field(..., gt=0)
    invoice_id: Optional[int] = None
    payment_date: date = Field(default_factory=date.today)
    amount: Decimal = Field(..., gt=0)
    payment_mode: str = Field(..., description="cash, cheque, neft, rtgs, upi")
    reference_number: Optional[str] = Field(None, max_length=100)
    bank_name: Optional[str] = Field(None, max_length=100)
    cheque_number: Optional[str] = Field(None, max_length=50)
    cheque_date: Optional[date] = None
    notes: Optional[str] = Field(None, max_length=500)

    model_config = ConfigDict(str_strip_whitespace=True)


class SupplierPaymentResponse(BaseModel):
    """Schema for supplier payment response"""
    
    payment_id: int
    supplier_id: int
    supplier_name: str
    invoice_id: Optional[int] = None
    invoice_number: Optional[str] = None
    payment_date: date
    amount: Decimal
    payment_mode: str
    reference_number: Optional[str] = None
    created_at: datetime
    created_by: Optional[int] = None

    model_config = ConfigDict(from_attributes=True)


# =============================================================================
# AGING REPORT SCHEMAS
# =============================================================================

class SupplierAgingBucket(BaseModel):
    """Aging bucket for a supplier"""
    
    supplier_id: int
    supplier_name: str
    current: Decimal = Decimal("0")
    days_1_30: Decimal = Decimal("0")
    days_31_60: Decimal = Decimal("0")
    days_61_90: Decimal = Decimal("0")
    over_90: Decimal = Decimal("0")
    total: Decimal = Decimal("0")


class SupplierAgingReport(BaseModel):
    """Supplier aging report"""
    
    as_of_date: date
    total_payable: Decimal = Decimal("0")
    current: Decimal = Decimal("0")
    overdue: Decimal = Decimal("0")
    suppliers: List[SupplierAgingBucket] = Field(default_factory=list)
