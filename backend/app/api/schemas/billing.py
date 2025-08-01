"""
Billing and GST schemas for enterprise pharma system
Handles invoice generation, GST calculations, and payment tracking
"""
from typing import Optional, List
from pydantic import BaseModel, Field, validator
from datetime import datetime, date
from decimal import Decimal
from uuid import UUID
from enum import Enum


class InvoiceStatus(str, Enum):
    DRAFT = "draft"
    GENERATED = "generated"
    SENT = "sent"
    PAID = "paid"
    PARTIALLY_PAID = "partially_paid"
    CANCELLED = "cancelled"


class PaymentMode(str, Enum):
    CASH = "cash"
    CARD = "card"
    BANK_TRANSFER = "bank_transfer"
    UPI = "upi"
    CHEQUE = "cheque"
    CREDIT = "credit"


class GSTType(str, Enum):
    CGST_SGST = "cgst_sgst"  # Within state
    IGST = "igst"  # Inter-state


class InvoiceItemBase(BaseModel):
    """Base invoice item model"""
    product_id: int = Field(..., gt=0)
    product_name: str
    hsn_code: Optional[str] = Field(None, max_length=10)
    batch_id: Optional[int] = None
    batch_number: Optional[str] = None
    
    # Quantities and pricing
    quantity: int = Field(..., gt=0)
    unit_price: Decimal = Field(..., ge=0)
    mrp: Decimal = Field(..., ge=0)
    
    # Discounts
    discount_percent: Decimal = Field(default=Decimal("0"), ge=0, le=100)
    discount_amount: Decimal = Field(default=Decimal("0"), ge=0)
    
    # Tax
    gst_percent: Decimal = Field(..., ge=0, le=28)
    cgst_amount: Decimal = Field(default=Decimal("0"), ge=0)
    sgst_amount: Decimal = Field(default=Decimal("0"), ge=0)
    igst_amount: Decimal = Field(default=Decimal("0"), ge=0)
    
    # Totals
    taxable_amount: Decimal = Field(..., ge=0)
    total_amount: Decimal = Field(..., ge=0)


class InvoiceBase(BaseModel):
    """Base invoice model"""
    order_id: int = Field(..., gt=0)
    invoice_date: date = Field(default_factory=date.today)
    due_date: Optional[date] = None
    
    # Customer details
    customer_id: int = Field(..., gt=0)
    customer_name: str
    customer_gstin: Optional[str] = Field(None, pattern=r"^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$")
    
    # Billing address
    billing_name: str
    billing_address: str
    billing_city: str
    billing_state: str
    billing_pincode: str = Field(..., pattern=r"^[0-9]{6}$")
    billing_phone: Optional[str] = Field(None, pattern=r"^[0-9]{10}$")
    
    # Shipping address
    shipping_name: Optional[str] = None
    shipping_address: Optional[str] = None
    shipping_city: Optional[str] = None
    shipping_state: Optional[str] = None
    shipping_pincode: Optional[str] = Field(None, pattern=r"^[0-9]{6}$")
    
    # GST details
    gst_type: GSTType
    place_of_supply: str  # State code
    is_reverse_charge: bool = Field(default=False)
    
    # Additional info
    payment_terms: Optional[str] = None
    notes: Optional[str] = Field(None, max_length=500)
    terms_conditions: Optional[str] = None
    
    @validator('due_date')
    def validate_due_date(cls, v, values):
        """Ensure due date is after invoice date"""
        if v and 'invoice_date' in values and v < values['invoice_date']:
            raise ValueError('Due date must be after invoice date')
        return v


class InvoiceCreate(BaseModel):
    """Schema for creating invoice from order"""
    order_id: int = Field(..., gt=0)
    invoice_date: Optional[date] = None
    payment_terms_days: Optional[int] = Field(None, ge=0, le=365)
    notes: Optional[str] = Field(None, max_length=500)


class InvoiceResponse(InvoiceBase):
    """Schema for invoice response"""
    invoice_id: int
    invoice_number: str
    org_id: UUID
    
    # Items
    items: List[InvoiceItemBase]
    
    # Amounts
    subtotal_amount: Decimal
    discount_amount: Decimal
    taxable_amount: Decimal
    cgst_amount: Decimal
    sgst_amount: Decimal
    igst_amount: Decimal
    total_tax_amount: Decimal
    round_off_amount: Decimal
    total_amount: Decimal
    
    # Payment status
    invoice_status: InvoiceStatus
    paid_amount: Decimal = Field(default=Decimal("0"))
    balance_amount: Decimal
    
    # E-Invoice details
    irn: Optional[str] = None
    ack_number: Optional[str] = None
    ack_date: Optional[datetime] = None
    qr_code: Optional[str] = None
    
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True


class PaymentCreate(BaseModel):
    """Schema for recording payment"""
    invoice_id: int = Field(..., gt=0)
    payment_date: date = Field(default_factory=date.today)
    amount: Decimal = Field(..., gt=0)
    payment_mode: PaymentMode
    
    # Payment details
    transaction_reference: Optional[str] = Field(None, max_length=100)
    bank_name: Optional[str] = Field(None, max_length=100)
    cheque_number: Optional[str] = Field(None, max_length=50)
    cheque_date: Optional[date] = None
    
    notes: Optional[str] = Field(None, max_length=500)


class PaymentResponse(BaseModel):
    """Schema for payment response"""
    payment_id: int
    invoice_id: int
    invoice_number: str
    customer_name: str
    
    payment_date: date
    amount: Decimal
    payment_mode: PaymentMode
    
    transaction_reference: Optional[str] = None
    bank_name: Optional[str] = None
    cheque_number: Optional[str] = None
    cheque_date: Optional[date] = None
    
    notes: Optional[str] = None
    created_at: datetime
    
    class Config:
        from_attributes = True


class GSTReportRequest(BaseModel):
    """Schema for GST report request"""
    from_date: date
    to_date: date
    report_type: str = Field(..., pattern=r"^(gstr1|gstr3b)$")
    
    @validator('to_date')
    def validate_date_range(cls, v, values):
        """Ensure to_date is after from_date"""
        if 'from_date' in values and v < values['from_date']:
            raise ValueError('To date must be after from date')
        return v


class GSTR1Summary(BaseModel):
    """GSTR-1 summary for outward supplies"""
    period: str  # MM-YYYY
    
    # B2B supplies
    b2b_invoices: int
    b2b_taxable_value: Decimal
    b2b_cgst: Decimal
    b2b_sgst: Decimal
    b2b_igst: Decimal
    
    # B2C supplies
    b2c_invoices: int
    b2c_taxable_value: Decimal
    b2c_cgst: Decimal
    b2c_sgst: Decimal
    b2c_igst: Decimal
    
    # Nil rated supplies
    nil_rated_supplies: Decimal
    exempted_supplies: Decimal
    
    # Total
    total_invoices: int
    total_taxable_value: Decimal
    total_tax: Decimal


class GSTR3BSummary(BaseModel):
    """GSTR-3B summary for monthly return"""
    period: str  # MM-YYYY
    
    # Outward supplies
    outward_taxable_supplies: Decimal
    outward_zero_rated: Decimal
    outward_exempted: Decimal
    
    # Inward supplies
    inward_supplies_from_isd: Decimal
    all_other_itc: Decimal
    
    # Tax payable
    cgst_payable: Decimal
    sgst_payable: Decimal
    igst_payable: Decimal
    cess_payable: Decimal
    
    # Interest and late fee
    interest: Decimal
    late_fee: Decimal
    
    # Total tax payable
    total_tax_payable: Decimal


class InvoiceSummary(BaseModel):
    """Invoice summary for dashboard"""
    total_invoices: int
    total_amount: Decimal
    paid_amount: Decimal
    outstanding_amount: Decimal
    overdue_amount: Decimal
    
    # By status
    draft_count: int
    generated_count: int
    paid_count: int
    partially_paid_count: int
    cancelled_count: int
    
    # This month
    current_month_invoices: int
    current_month_amount: Decimal
    current_month_collected: Decimal