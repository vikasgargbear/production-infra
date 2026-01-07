"""
Billing and GST schemas for enterprise pharma system
Handles invoice generation, GST calculations, and payment tracking
"""
from typing import Optional, List
from pydantic import BaseModel, Field, field_validator, ConfigDict, AliasChoices
from datetime import datetime, date
from decimal import Decimal
from uuid import UUID
from enum import Enum


# =============================================================================
# ENUMS
# =============================================================================

class InvoiceStatus(str, Enum):
    """Invoice lifecycle status"""
    DRAFT = "draft"
    GENERATED = "generated"
    SENT = "sent"
    PAID = "paid"
    PARTIALLY_PAID = "partially_paid"
    OVERDUE = "overdue"
    CANCELLED = "cancelled"


class PaymentMode(str, Enum):
    """Payment modes"""
    CASH = "cash"
    CARD = "card"
    BANK_TRANSFER = "bank_transfer"
    UPI = "upi"
    CHEQUE = "cheque"
    NEFT = "neft"
    RTGS = "rtgs"
    CREDIT = "credit"


class GSTType(str, Enum):
    """GST calculation type"""
    CGST_SGST = "cgst_sgst"  # Within state
    IGST = "igst"  # Inter-state


# =============================================================================
# INVOICE ITEM SCHEMAS
# =============================================================================

class InvoiceItemBase(BaseModel):
    """Base invoice item model"""
    
    product_id: int = Field(..., gt=0, description="Product ID")
    product_name: str = Field(..., description="Product name")
    product_code: Optional[str] = Field(None, max_length=50)
    hsn_code: Optional[str] = Field(None, max_length=8, description="HSN/SAC code")
    
    batch_id: Optional[int] = None
    batch_number: Optional[str] = Field(None, max_length=50)
    expiry_date: Optional[date] = None
    
    # Quantities
    quantity: Decimal = Field(..., gt=0, description="Quantity")
    free_quantity: Decimal = Field(default=Decimal("0"), ge=0)
    unit_price: Decimal = Field(..., ge=0, description="Unit price")
    mrp: Decimal = Field(..., ge=0, description="MRP per unit")
    uom: Optional[str] = Field(None, max_length=20, description="Unit of measure")
    
    # Discounts
    discount_percent: Decimal = Field(default=Decimal("0"), ge=0, le=100)
    discount_amount: Decimal = Field(default=Decimal("0"), ge=0)
    
    # Tax
    gst_percent: Decimal = Field(..., ge=0, le=28, description="GST rate")
    cgst_percent: Decimal = Field(default=Decimal("0"), ge=0, le=14)
    sgst_percent: Decimal = Field(default=Decimal("0"), ge=0, le=14)
    igst_percent: Decimal = Field(default=Decimal("0"), ge=0, le=28)
    cgst_amount: Decimal = Field(default=Decimal("0"), ge=0)
    sgst_amount: Decimal = Field(default=Decimal("0"), ge=0)
    igst_amount: Decimal = Field(default=Decimal("0"), ge=0)
    
    # Totals
    taxable_amount: Decimal = Field(..., ge=0, description="Taxable value")
    total_amount: Decimal = Field(..., ge=0, description="Line total with tax")

    model_config = ConfigDict(from_attributes=True)


class InvoiceItemCreate(BaseModel):
    """Item schema for invoice creation - accepts both canonical and legacy names"""
    
    product_id: int = Field(..., gt=0, description="Product ID")
    batch_id: Optional[int] = Field(None, description="Batch ID for inventory deduction")
    
    quantity: float = Field(..., gt=0, description="Quantity")
    free_quantity: float = Field(default=0, ge=0)
    # Accept both unit_price (canonical) and sale_price (legacy) via AliasChoices
    unit_price: float = Field(..., ge=0, description="Unit price", validation_alias=AliasChoices('unit_price', 'sale_price'))
    mrp: float = Field(default=0, ge=0, description="MRP")
    
    discount_percent: float = Field(default=0, ge=0, le=100)
    gst_percent: float = Field(default=0, ge=0, le=28, description="GST rate")

    @field_validator('batch_id', mode='before')
    @classmethod
    def validate_batch_id(cls, v):
        """Convert invalid batch_id values (like 'default_130') to None"""
        if v is None:
            return None
        if isinstance(v, int):
            return v
        if isinstance(v, str):
            # Handle 'default_XXX' or empty strings
            if v.isdigit():
                return int(v)
            return None  # Convert invalid strings to None
        return None

    model_config = ConfigDict(str_strip_whitespace=True, extra="ignore", populate_by_name=True)


# =============================================================================
# INVOICE SCHEMAS
# =============================================================================

class InvoiceBase(BaseModel):
    """Base invoice model"""
    
    order_id: Optional[int] = Field(None, gt=0, description="Source order ID (optional for direct invoices)")
    challan_id: Optional[int] = Field(None, gt=0, description="Source challan ID")
    invoice_date: date = Field(default_factory=date.today)
    due_date: Optional[date] = None
    
    # Customer
    customer_id: int = Field(..., gt=0)
    customer_name: str
    customer_gstin: Optional[str] = Field(
        None, 
        pattern=r"^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$",
        description="Customer GSTIN (15 chars)"
    )
    
    # Billing address
    billing_name: str = Field(..., max_length=200)
    billing_address: str = Field(..., max_length=500)
    billing_city: str = Field(..., max_length=100)
    billing_state: str = Field(..., max_length=100)
    billing_pincode: str = Field(..., pattern=r"^\d{6}$")
    billing_phone: Optional[str] = Field(None, pattern=r"^\d{10}$")
    
    # Shipping address
    shipping_name: Optional[str] = Field(None, max_length=200)
    shipping_address: Optional[str] = Field(None, max_length=500)
    shipping_city: Optional[str] = Field(None, max_length=100)
    shipping_state: Optional[str] = Field(None, max_length=100)
    shipping_pincode: Optional[str] = Field(None, pattern=r"^\d{6}$")
    
    # GST details
    gst_type: GSTType = Field(..., description="CGST/SGST or IGST")
    place_of_supply: str = Field(..., description="State code (e.g., 27)")
    is_reverse_charge: bool = Field(default=False)
    
    # Additional
    payment_terms: Optional[str] = Field(None, max_length=100)
    notes: Optional[str] = Field(None, max_length=1000)
    terms_conditions: Optional[str] = Field(None, max_length=2000)

    @field_validator("due_date")
    @classmethod
    def validate_due_date(cls, v, info):
        """Ensure due date is after invoice date"""
        invoice_date = info.data.get("invoice_date")
        if v and invoice_date and v < invoice_date:
            raise ValueError("Due date must be after invoice date")
        return v

    model_config = ConfigDict(from_attributes=True, str_strip_whitespace=True)


class InvoiceCreate(BaseModel):
    """Schema for creating invoice from order (quick conversion)"""
    
    order_id: int = Field(..., gt=0)
    invoice_date: Optional[date] = None
    payment_terms_days: Optional[int] = Field(None, ge=0, le=365)
    notes: Optional[str] = Field(None, max_length=1000)

    model_config = ConfigDict(str_strip_whitespace=True)


class InvoiceCreateRequest(BaseModel):
    """Request schema matching frontend payload structure exactly"""
    
    customer_id: int = Field(..., gt=0, description="Customer ID")
    invoice_date: Optional[str] = Field(None, description="Invoice date (YYYY-MM-DD)")
    due_date: Optional[str] = Field(None, description="Due date (YYYY-MM-DD)")
    
    items: List[InvoiceItemCreate] = Field(..., min_length=1, description="Invoice line items")
    
    # Discounts
    discount_type: Optional[str] = Field(default="percentage", description="'percentage' or 'fixed'")
    discount_percent: float = Field(default=0, ge=0, le=100)
    discount_amount: float = Field(default=0, ge=0)
    
    # Delivery/Freight - accept both canonical and legacy names
    freight_charges: float = Field(default=0, ge=0, validation_alias=AliasChoices('freight_charges', 'delivery_charges'))
    delivery_type: Optional[str] = Field(default="PICKUP")
    
    # Payment
    payment_mode: Optional[str] = Field(default="cash")
    payment_status: Optional[str] = Field(default="pending")
    payments: Optional[List[dict]] = Field(default_factory=list)
    
    # Addresses (strings, not IDs)
    billing_address: Optional[str] = Field(None, max_length=500)
    shipping_address: Optional[str] = Field(None, max_length=500)
    
    # Salesperson / M.R. - accept both naming conventions
    salesperson_id: Optional[int] = Field(None, validation_alias=AliasChoices('salesperson_id', 'sales_person_id'))
    
    # Other
    notes: Optional[str] = Field(None, max_length=1000)
    gst_type: Optional[str] = Field(default="CGST/SGST")

    model_config = ConfigDict(str_strip_whitespace=True, extra="ignore", populate_by_name=True)


class InvoiceUpdate(BaseModel):
    """Update draft invoice (only for unpaid invoices)"""
    
    invoice_date: Optional[date] = None
    due_date: Optional[date] = None
    payment_terms: Optional[str] = Field(None, max_length=100)
    notes: Optional[str] = Field(None, max_length=1000)
    terms_conditions: Optional[str] = Field(None, max_length=2000)
    
    # Address updates
    billing_address_id: Optional[int] = None
    shipping_address_id: Optional[int] = None

    model_config = ConfigDict(str_strip_whitespace=True)


class InvoiceFilter(BaseModel):
    """Query filter for invoice list"""
    
    customer_id: Optional[int] = None
    status: Optional[InvoiceStatus] = None
    date_from: Optional[date] = None
    date_to: Optional[date] = None
    min_amount: Optional[Decimal] = Field(None, ge=0)
    max_amount: Optional[Decimal] = Field(None, ge=0)
    overdue_only: bool = False
    unpaid_only: bool = False
    search: Optional[str] = Field(None, max_length=100, description="Search invoice number or customer name")

    model_config = ConfigDict(str_strip_whitespace=True)


class InvoiceCancelRequest(BaseModel):
    """Request to cancel/void an invoice"""
    
    reason: str = Field(..., min_length=1, max_length=500, description="Cancellation reason")
    create_credit_note: bool = Field(default=False, description="Create credit note for customer")
    reverse_inventory: bool = Field(default=True, description="Return items to inventory")

    model_config = ConfigDict(str_strip_whitespace=True)


class InvoiceResponse(InvoiceBase):
    """Schema for invoice response"""
    
    invoice_id: int
    invoice_number: str
    org_id: UUID
    
    items: List[InvoiceItemBase] = Field(default_factory=list)
    
    # Amounts
    subtotal_amount: Decimal = Decimal("0")
    discount_amount: Decimal = Decimal("0")
    taxable_amount: Decimal = Decimal("0")
    cgst_amount: Decimal = Decimal("0")
    sgst_amount: Decimal = Decimal("0")
    igst_amount: Decimal = Decimal("0")
    total_tax_amount: Decimal = Decimal("0")
    round_off_amount: Decimal = Decimal("0")
    total_amount: Decimal = Decimal("0")
    
    # Payment status
    invoice_status: InvoiceStatus = InvoiceStatus.DRAFT
    paid_amount: Decimal = Decimal("0")
    balance_amount: Decimal = Decimal("0")
    
    # E-Invoice
    irn: Optional[str] = Field(None, description="Invoice Reference Number")
    ack_number: Optional[str] = Field(None, description="Acknowledgement number")
    ack_date: Optional[datetime] = None
    qr_code: Optional[str] = Field(None, description="E-invoice QR code data")
    e_way_bill_number: Optional[str] = None
    
    created_at: datetime
    updated_at: Optional[datetime] = None
    created_by: Optional[int] = None

    model_config = ConfigDict(from_attributes=True)


class InvoiceSummary(BaseModel):
    """Lightweight invoice for lists"""
    
    invoice_id: int
    invoice_number: str
    invoice_date: date
    customer_name: str
    total_amount: Decimal
    paid_amount: Decimal
    balance_amount: Decimal
    invoice_status: InvoiceStatus

    model_config = ConfigDict(from_attributes=True)


class InvoiceListResponse(BaseModel):
    """Paginated invoice list"""
    
    total: int
    page: int = Field(default=1, ge=1)
    per_page: int = Field(default=20, ge=1, le=1000)
    invoices: List[InvoiceSummary] = Field(default_factory=list)


# =============================================================================
# PAYMENT SCHEMAS
# =============================================================================

class PaymentCreate(BaseModel):
    """Schema for recording payment against invoice"""
    
    invoice_id: int = Field(..., gt=0)
    payment_date: date = Field(default_factory=date.today)
    amount: Decimal = Field(..., gt=0, description="Payment amount")
    payment_mode: PaymentMode
    
    transaction_reference: Optional[str] = Field(None, max_length=100)
    bank_name: Optional[str] = Field(None, max_length=100)
    cheque_number: Optional[str] = Field(None, max_length=50)
    cheque_date: Optional[date] = None
    
    notes: Optional[str] = Field(None, max_length=500)

    model_config = ConfigDict(str_strip_whitespace=True)


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
    created_by: Optional[int] = None

    model_config = ConfigDict(from_attributes=True)


class GeneralPaymentCreate(BaseModel):
    """Schema for general payment (advance or against multiple invoices)"""
    
    payment_number: Optional[str] = None
    payment_date: date = Field(default_factory=date.today)
    customer_id: Optional[int] = None
    supplier_id: Optional[int] = None
    payment_type: str = Field(..., description="advance_payment, invoice_payment, regular_payment, adjustment_entry")
    amount: Decimal = Field(..., gt=0)
    payment_mode: str = Field(..., description="cash, cheque, upi, bank_transfer, credit_adjustment")
    reference_number: Optional[str] = Field(None, max_length=100)
    bank_name: Optional[str] = Field(None, max_length=100)
    payment_status: str = Field(default="completed")
    cleared_date: Optional[date] = None
    branch_id: Optional[int] = None
    notes: Optional[str] = Field(None, max_length=500)

    model_config = ConfigDict(str_strip_whitespace=True)


class InvoicePaymentCreate(BaseModel):
    """Schema for recording payment against specific invoice"""
    
    invoice_id: int
    payment_date: date = Field(default_factory=date.today)
    payment_mode: str = Field(..., description="cash, cheque, online, card, upi, neft, rtgs")
    amount: Decimal = Field(..., gt=0)
    transaction_reference: Optional[str] = Field(None, max_length=100)
    bank_name: Optional[str] = Field(None, max_length=100)
    cheque_number: Optional[str] = Field(None, max_length=50)
    cheque_date: Optional[date] = None
    notes: Optional[str] = Field(None, max_length=500)

    model_config = ConfigDict(str_strip_whitespace=True)


class PaymentListResponse(BaseModel):
    """Paginated payment list"""
    
    total: int
    page: int = Field(default=1, ge=1)
    per_page: int = Field(default=20, ge=1, le=1000)
    payments: List[PaymentResponse] = Field(default_factory=list)


class PaymentSummaryResponse(BaseModel):
    """Payment summary statistics"""
    
    total_payments: int = 0
    invoices_paid: int = 0
    total_collected: Decimal = Decimal("0")
    payment_modes: dict = Field(default_factory=dict)
    pending: dict = Field(default_factory=dict)


# =============================================================================
# GST REPORT SCHEMAS
# =============================================================================

class GSTReportRequest(BaseModel):
    """Schema for GST report request"""
    
    from_date: date
    to_date: date
    report_type: str = Field(..., description="gstr1, gstr3b, gstr2a")

    @field_validator("to_date")
    @classmethod
    def validate_date_range(cls, v, info):
        """Ensure to_date is after from_date"""
        from_date = info.data.get("from_date")
        if from_date and v < from_date:
            raise ValueError("To date must be after from date")
        return v


class GSTR1Summary(BaseModel):
    """GSTR-1 summary for outward supplies"""
    
    period: str  # MM-YYYY
    
    # B2B supplies
    b2b_invoices: int = 0
    b2b_taxable_value: Decimal = Decimal("0")
    b2b_cgst: Decimal = Decimal("0")
    b2b_sgst: Decimal = Decimal("0")
    b2b_igst: Decimal = Decimal("0")
    
    # B2C supplies
    b2c_invoices: int = 0
    b2c_taxable_value: Decimal = Decimal("0")
    b2c_cgst: Decimal = Decimal("0")
    b2c_sgst: Decimal = Decimal("0")
    b2c_igst: Decimal = Decimal("0")
    
    # Exempt/Nil
    nil_rated_supplies: Decimal = Decimal("0")
    exempted_supplies: Decimal = Decimal("0")
    
    # Totals
    total_invoices: int = 0
    total_taxable_value: Decimal = Decimal("0")
    total_tax: Decimal = Decimal("0")


class GSTR3BSummary(BaseModel):
    """GSTR-3B summary for monthly return"""
    
    period: str  # MM-YYYY
    
    # Outward supplies
    outward_taxable_supplies: Decimal = Decimal("0")
    outward_zero_rated: Decimal = Decimal("0")
    outward_exempted: Decimal = Decimal("0")
    
    # Inward supplies
    inward_supplies_from_isd: Decimal = Decimal("0")
    all_other_itc: Decimal = Decimal("0")
    
    # Tax payable
    cgst_payable: Decimal = Decimal("0")
    sgst_payable: Decimal = Decimal("0")
    igst_payable: Decimal = Decimal("0")
    cess_payable: Decimal = Decimal("0")
    
    # Interest and late fee
    interest: Decimal = Decimal("0")
    late_fee: Decimal = Decimal("0")
    
    total_tax_payable: Decimal = Decimal("0")


# =============================================================================
# DASHBOARD SCHEMAS
# =============================================================================

class InvoiceDashboard(BaseModel):
    """Invoice summary for dashboard"""
    
    total_invoices: int = 0
    total_amount: Decimal = Decimal("0")
    paid_amount: Decimal = Decimal("0")
    outstanding_amount: Decimal = Decimal("0")
    overdue_amount: Decimal = Decimal("0")
    
    # By status
    draft_count: int = 0
    generated_count: int = 0
    paid_count: int = 0
    partially_paid_count: int = 0
    cancelled_count: int = 0
    
    # Current month
    current_month_invoices: int = 0
    current_month_amount: Decimal = Decimal("0")
    current_month_collected: Decimal = Decimal("0")


# Legacy alias
InvoiceSummary_Dashboard = InvoiceDashboard