"""
Customer schemas for enterprise pharma system
Handles GST-compliant customer management with credit limits
"""
from typing import Optional, List, Annotated, Literal
from pydantic import BaseModel, Field, field_validator, model_validator, ConfigDict, EmailStr
from datetime import datetime, date
from decimal import Decimal
import re
from uuid import UUID


# =============================================================================
# CUSTOMER SCHEMAS
# =============================================================================

class CustomerBase(BaseModel):
    """Base customer model with common fields for create/update"""
    
    customer_name: str = Field(
        ..., 
        min_length=1, 
        max_length=200,
        description="Legal business or individual name",
        examples=["ABC Medical Store", "Dr. Sharma Clinic"]
    )
    customer_code: Optional[str] = Field(
        None, 
        max_length=50,
        description="Unique customer code (auto-generated if not provided)",
        examples=["CUST-001"]
    )
    customer_type: str = Field(
        ...,
        description="Type: retail, wholesale, hospital, clinic, pharmacy, distributor",
        examples=["retail", "wholesale", "pharmacy"]
    )
    business_type: Optional[str] = Field(
        default="retail_pharmacy", 
        max_length=100, 
        description="Business classification"
    )
    
    # Contact - Primary
    primary_phone: str = Field(
        ..., 
        pattern=r"^\d{10}$",
        description="10-digit mobile number (required)",
        examples=["9876543210"]
    )
    secondary_phone: Optional[str] = Field(None, pattern=r"^\d{10}$")
    whatsapp_number: Optional[str] = Field(None, pattern=r"^\d{10}$", description="WhatsApp number")
    primary_email: Optional[EmailStr] = Field(None, description="Primary email address")
    
    # Contact Person
    contact_person_name: Optional[str] = Field(None, max_length=100, description="Contact person name")
    contact_person_phone: Optional[str] = Field(None, pattern=r"^\d{10}$")
    contact_person_email: Optional[EmailStr] = None
    
    # Address (for inline creation - stored in separate table)
    address_line1: Optional[str] = Field(None, max_length=255, description="Street address")
    address_line2: Optional[str] = Field(None, max_length=255, description="Additional address")
    area: Optional[str] = Field(None, max_length=100, description="Area/Locality name")
    city: Optional[str] = Field(None, max_length=100)
    state: Optional[str] = Field(None, max_length=100)
    pincode: Optional[str] = Field(None, pattern=r"^\d{6}$", description="6-digit PIN code")
    
    # GST & Tax Details
    gst_number: Optional[str] = Field(
        None,
        min_length=15,
        max_length=15,
        description="15-digit GST Identification Number",
        examples=["27AAPFU0939F1ZV"]
    )
    pan_number: Optional[str] = Field(
        None,
        min_length=10,
        max_length=10,
        description="10-character PAN number",
        examples=["AAPFU0939F"]
    )
    
    # Pharma Compliance
    drug_license_number: Optional[str] = Field(
        None,
        max_length=50,
        description="Drug license number (20B/21B)",
        examples=["20B-MH-12345"]
    )
    drug_license_validity: Optional[date] = Field(None, description="Drug license expiry date")
    fssai_number: Optional[str] = Field(None, max_length=20, description="FSSAI license number")
    
    # Credit Management
    credit_limit: Decimal = Field(
        default=Decimal("0.00"),
        ge=0,
        description="Maximum credit amount allowed"
    )
    credit_days: int = Field(
        default=0,
        ge=0,
        le=365,
        description="Credit period in days"
    )
    credit_rating: Optional[str] = Field(
        default="NEW",
        max_length=50,
        description="Credit rating: NEW, A, B, C, D, BLACKLIST"
    )
    payment_terms: Optional[str] = Field(
        default="CASH",
        max_length=100,
        description="Payment terms: CASH, NET15, NET30, NET45, NET60"
    )
    discount_percent: Decimal = Field(
        default=Decimal("0.00"),
        ge=0,
        le=100,
        description="Default discount percentage"
    )
    
    # Status
    is_active: bool = Field(default=True, description="Whether customer is active")
    internal_notes: Optional[str] = Field(None, max_length=1000, description="Internal notes")
    
    # Validators
    @field_validator("gst_number")
    @classmethod
    def validate_gst_number(cls, v: Optional[str]) -> Optional[str]:
        """Validate GSTIN format: 2 digits state + 10 chars PAN + 1 entity + 1 Z + 1 checksum"""
        if v is None or v == "":
            return None
        v = v.upper().strip()
        pattern = r"^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$"
        if not re.match(pattern, v):
            raise ValueError("Invalid GSTIN format. Expected: 27AAPFU0939F1ZV")
        return v
    
    @field_validator("pan_number")
    @classmethod
    def validate_pan_number(cls, v: Optional[str]) -> Optional[str]:
        """Validate PAN format: 5 letters + 4 digits + 1 letter"""
        if v is None or v == "":
            return None
        v = v.upper().strip()
        pattern = r"^[A-Z]{5}[0-9]{4}[A-Z]{1}$"
        if not re.match(pattern, v):
            raise ValueError("Invalid PAN format. Expected: AAPFU0939F")
        return v

    model_config = ConfigDict(
        from_attributes=True,
        str_strip_whitespace=True,
        validate_assignment=True
    )


class CustomerCreate(CustomerBase):
    """Schema for creating a new customer"""
    pass


class CanonicalCustomerCreate(BaseModel):
    """Reviewed customer-account creation contract used by the live ERP UI.

    Compliance licences, secondary contacts, notes, discounts, and tenant
    identity are deliberately absent.  Those facts have separate owners and
    must not leak through a convenience create form.
    """

    customer_name: str = Field(min_length=1, max_length=200)
    customer_type: Literal["individual", "organization"]
    primary_phone: str = Field(pattern=r"^\d{10}$")
    primary_email: Optional[EmailStr] = None
    contact_person_name: Optional[str] = Field(default=None, max_length=100)
    address_line1: Optional[str] = Field(default=None, max_length=255)
    address_line2: Optional[str] = Field(default=None, max_length=255)
    city: Optional[str] = Field(default=None, max_length=100)
    state_code: Optional[str] = Field(default=None, pattern=r"^[0-9]{2}$")
    pincode: Optional[str] = Field(default=None, pattern=r"^\d{6}$")
    gst_number: Optional[str] = Field(default=None, min_length=15, max_length=15)
    pan_number: Optional[str] = Field(default=None, min_length=10, max_length=10)
    credit_limit: Decimal = Field(ge=0)
    credit_days: int = Field(ge=0, le=365)

    @field_validator("gst_number")
    @classmethod
    def validate_gst_number(cls, value: Optional[str]) -> Optional[str]:
        return CustomerBase.validate_gst_number(value)

    @field_validator("pan_number")
    @classmethod
    def validate_pan_number(cls, value: Optional[str]) -> Optional[str]:
        return CustomerBase.validate_pan_number(value)

    @model_validator(mode="after")
    def require_complete_address(self):
        address = (self.address_line1, self.city, self.state_code, self.pincode)
        if any(address) and not all(address):
            raise ValueError("Address line, city, state code, and pincode must be supplied together")
        return self

    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class CustomerUpdate(BaseModel):
    """Schema for updating customer - all fields optional"""
    
    customer_name: Optional[str] = Field(None, min_length=1, max_length=200)
    customer_type: Optional[str] = None
    business_type: Optional[str] = Field(None, max_length=100)
    
    primary_phone: Optional[str] = Field(None, pattern=r"^\d{10}$")
    secondary_phone: Optional[str] = Field(None, pattern=r"^\d{10}$")
    whatsapp_number: Optional[str] = Field(None, pattern=r"^\d{10}$")
    primary_email: Optional[EmailStr] = None
    
    contact_person_name: Optional[str] = Field(None, max_length=100)
    contact_person_phone: Optional[str] = Field(None, pattern=r"^\d{10}$")
    contact_person_email: Optional[EmailStr] = None
    
    address_line1: Optional[str] = Field(None, max_length=255)
    address_line2: Optional[str] = Field(None, max_length=255)
    area: Optional[str] = Field(None, max_length=100)
    city: Optional[str] = Field(None, max_length=100)
    state: Optional[str] = Field(None, max_length=100)
    pincode: Optional[str] = Field(None, pattern=r"^\d{6}$")
    
    gst_number: Optional[str] = Field(None, min_length=15, max_length=15)
    pan_number: Optional[str] = Field(None, min_length=10, max_length=10)
    drug_license_number: Optional[str] = Field(None, max_length=50)
    drug_license_validity: Optional[date] = None
    fssai_number: Optional[str] = Field(None, max_length=20)
    
    credit_limit: Optional[Decimal] = Field(None, ge=0)
    credit_days: Optional[int] = Field(None, ge=0, le=365)
    credit_rating: Optional[str] = Field(None, max_length=50)
    payment_terms: Optional[str] = Field(None, max_length=100)
    discount_percent: Optional[Decimal] = Field(None, ge=0, le=100)
    
    is_active: Optional[bool] = None
    internal_notes: Optional[str] = Field(None, max_length=1000)

    model_config = ConfigDict(str_strip_whitespace=True)


class CustomerResponse(CustomerBase):
    """Schema for customer response with all database fields"""
    
    customer_id: int = Field(..., description="Unique customer ID")
    org_id: UUID = Field(..., description="Organization ID")
    customer_code: str = Field(..., description="Unique customer code")
    
    # KYC/Compliance
    kyc_status: Optional[str] = Field(default="pending", description="pending/verified/rejected")
    kyc_verified_date: Optional[date] = None
    kyc_documents: Optional[dict] = None
    
    # Credit Management (extended)
    current_outstanding: Decimal = Field(default=Decimal("0.00"), description="Current dues")
    advance_balance: Decimal = Field(default=Decimal("0.00"), description="Unallocated payments")
    net_balance: Decimal = Field(default=Decimal("0.00"), description="Outstanding - Advance")
    security_deposit: Decimal = Field(default=Decimal("0.00"))
    overdue_interest_rate: Optional[Decimal] = None
    preferred_payment_mode: Optional[str] = None
    
    # Sales Assignment
    territory_id: Optional[int] = None
    route_id: Optional[int] = None
    assigned_salesperson_id: Optional[int] = None
    discount_group_id: Optional[int] = None
    
    # Communication Preferences
    prefer_sms: bool = Field(default=False)
    prefer_email: bool = Field(default=False)
    prefer_whatsapp: bool = Field(default=False)
    preferred_delivery_time: Optional[str] = None
    
    # Analytics
    first_transaction_date: Optional[date] = None
    last_transaction_date: Optional[date] = None
    total_business_amount: Decimal = Field(default=Decimal("0.00"))
    total_transactions: int = Field(default=0)
    average_order_value: Decimal = Field(default=Decimal("0.00"))
    
    # Blacklist
    blacklisted: bool = Field(default=False)
    blacklist_reason: Optional[str] = None
    blacklist_date: Optional[date] = None
    
    # Addresses (from JOIN)
    addresses: List[dict] = Field(default_factory=list)
    
    # Metadata
    created_at: datetime
    updated_at: Optional[datetime] = None
    created_by: Optional[int] = None
    updated_by: Optional[int] = None
    
    # Backward Compatibility Aliases
    outstanding_amount: Optional[Decimal] = Field(default=Decimal("0.00"))
    total_business: Optional[Decimal] = Field(default=Decimal("0.00"))
    total_orders: Optional[int] = Field(default=0)
    last_order_date: Optional[date] = None
    email: Optional[str] = None
    gstin: Optional[str] = None
    contact_person: Optional[str] = None
    notes: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class CustomerSummary(BaseModel):
    """Lightweight customer for dropdowns/autocomplete"""
    
    customer_id: int
    customer_name: str
    customer_code: Optional[str] = None
    primary_phone: Optional[str] = None
    gst_number: Optional[str] = None
    credit_limit: Decimal = Decimal("0")
    current_outstanding: Decimal = Decimal("0")
    is_active: bool = True

    model_config = ConfigDict(from_attributes=True)


# =============================================================================
# LEDGER & OUTSTANDING SCHEMAS
# =============================================================================

class CustomerLedgerEntry(BaseModel):
    """Schema for customer ledger entry"""
    
    transaction_date: date
    transaction_type: str = Field(..., description="invoice, payment, credit_note, debit_note")
    reference_number: str
    description: str
    debit_amount: Decimal = Field(default=Decimal("0.00"))
    credit_amount: Decimal = Field(default=Decimal("0.00"))
    running_balance: Decimal

    model_config = ConfigDict(from_attributes=True)


class CustomerLedgerResponse(BaseModel):
    """Schema for customer ledger response"""
    
    customer_id: int
    customer_name: str
    from_date: Optional[date] = None
    to_date: Optional[date] = None
    opening_balance: Decimal
    total_debit: Decimal
    total_credit: Decimal
    closing_balance: Decimal
    entries: List[CustomerLedgerEntry] = Field(default_factory=list)

    model_config = ConfigDict(from_attributes=True)


class OutstandingInvoice(BaseModel):
    """Schema for outstanding invoice details"""
    
    invoice_id: int
    invoice_number: str
    invoice_date: date
    due_date: Optional[date] = None
    invoice_amount: Decimal
    paid_amount: Decimal
    outstanding_amount: Decimal
    days_overdue: int = Field(default=0)

    model_config = ConfigDict(from_attributes=True)


class CustomerOutstandingResponse(BaseModel):
    """Schema for customer outstanding summary"""
    
    customer_id: int
    customer_name: str
    credit_limit: Decimal
    credit_days: int
    total_outstanding: Decimal
    advance_balance: Decimal = Field(default=Decimal("0.00"), description="Unallocated payments")
    net_balance: Decimal = Field(default=Decimal("0.00"), description="Outstanding - Advance")
    available_credit: Decimal
    overdue_amount: Decimal
    invoices: List[OutstandingInvoice] = Field(default_factory=list)

    model_config = ConfigDict(from_attributes=True)


# =============================================================================
# PAYMENT SCHEMAS
# =============================================================================

class PaymentRecord(BaseModel):
    """Schema for recording customer payment"""
    
    customer_id: int
    payment_date: date = Field(default_factory=date.today)
    amount: Decimal = Field(..., gt=0, description="Payment amount")
    payment_mode: str = Field(
        ...,
        description="Payment mode: cash, cheque, bank_transfer, upi, card",
        examples=["cash", "upi", "bank_transfer"]
    )
    reference_number: Optional[str] = Field(None, max_length=100, description="Transaction reference")
    bank_name: Optional[str] = Field(None, max_length=100, description="Bank name for cheque/transfer")
    notes: Optional[str] = Field(None, max_length=500)
    allocate_to_invoices: Optional[List[int]] = Field(
        None, 
        description="List of invoice IDs to allocate payment"
    )

    @field_validator("payment_mode")
    @classmethod
    def validate_payment_mode(cls, v: str) -> str:
        valid_modes = {"cash", "cheque", "bank_transfer", "upi", "card", "neft", "rtgs", "imps"}
        if v.lower() not in valid_modes:
            raise ValueError(f"Invalid payment mode. Must be one of: {', '.join(valid_modes)}")
        return v.lower()

    model_config = ConfigDict(str_strip_whitespace=True)


class PaymentResponse(BaseModel):
    """Schema for payment response"""
    
    payment_id: int
    customer_id: int
    customer_name: Optional[str] = None
    payment_date: date
    amount: Decimal
    payment_mode: str
    reference_number: Optional[str] = None
    allocated_amount: Decimal = Decimal("0")
    unallocated_amount: Decimal = Decimal("0")
    created_at: datetime
    created_by: Optional[int] = None

    model_config = ConfigDict(from_attributes=True)


# =============================================================================
# LIST RESPONSES
# =============================================================================

class CustomerListResponse(BaseModel):
    """Paginated customer list response"""
    
    total: int = Field(..., description="Total customers matching filter")
    page: int = Field(..., ge=1)
    per_page: int = Field(..., ge=1, le=1000)
    customers: List[CustomerResponse] = Field(default_factory=list)


class CustomerSearch(BaseModel):
    """Customer search/filter parameters"""
    
    q: Optional[str] = Field(None, min_length=1, description="Search query")
    customer_type: Optional[str] = None
    city: Optional[str] = None
    has_gstin: Optional[bool] = None
    is_active: Optional[bool] = True
    has_outstanding: Optional[bool] = None
    territory_id: Optional[int] = None
    limit: int = Field(default=20, ge=1, le=100)
    offset: int = Field(default=0, ge=0)
