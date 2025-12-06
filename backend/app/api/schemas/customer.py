"""
Customer schemas for the enterprise pharma system
Handles GST-compliant customer management with credit limits
"""
from typing import Optional, List
from pydantic import BaseModel, Field, validator
from datetime import datetime, date
from decimal import Decimal
import re
from uuid import UUID


class CustomerBase(BaseModel):
    """Base customer model with common fields"""
    customer_name: str = Field(..., min_length=1, max_length=200)
    customer_code: Optional[str] = Field(None, max_length=50)
    contact_person: Optional[str] = Field(None, max_length=100)
    contact_person_phone: Optional[str] = Field(None, pattern=r"^[0-9]{10}$", description="Contact person phone")
    contact_person_email: Optional[str] = Field(None, pattern=r"^[\w\.-]+@[\w\.-]+\.\w+$", description="Contact person email")
    primary_phone: str = Field(..., pattern=r"^[0-9]{10}$", description="10-digit mobile number")
    secondary_phone: Optional[str] = Field(None, pattern=r"^[0-9]{10}$")
    email: Optional[str] = Field(None, pattern=r"^[\w\.-]+@[\w\.-]+\.\w+$")
    
    # Address fields (optional - stored in separate table)
    address_line1: Optional[str] = Field(None, max_length=200, description="Building/House number and street")
    address_line2: Optional[str] = Field(None, max_length=200, description="Additional address details")
    area: Optional[str] = Field(None, max_length=100, description="Area/Locality name")
    city: Optional[str] = Field(None, max_length=100)
    state: Optional[str] = Field(None, max_length=100)
    pincode: Optional[str] = Field(None, pattern=r"^[0-9]{6}$", description="6-digit pincode")
    
    # GST and Tax details
    gstin: Optional[str] = Field(None, pattern=r"^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$")
    pan_number: Optional[str] = Field(None, pattern=r"^[A-Z]{5}[0-9]{4}[A-Z]{1}$")
    drug_license_number: Optional[str] = Field(None, max_length=50)
    drug_license_validity: Optional[date] = Field(None, description="Drug license expiry date")
    
    # Business details
    customer_type: str = Field(..., pattern=r"^(retail|wholesale|hospital|clinic|pharmacy)$")
    business_type: Optional[str] = Field(default="retail_pharmacy", max_length=100, description="Type of business")
    credit_limit: Decimal = Field(default=Decimal("0.00"), ge=0)
    credit_days: int = Field(default=0, ge=0, le=365)
    credit_rating: Optional[str] = Field(default="NEW", max_length=50)
    payment_terms: Optional[str] = Field(default="CASH", max_length=100)
    discount_percent: Decimal = Field(default=Decimal("0.00"), ge=0, le=100)
    
    # Status
    is_active: bool = Field(default=True)
    notes: Optional[str] = Field(None, max_length=500)
    
    @validator('gstin')
    def validate_gstin(cls, v):
        """Validate GSTIN format"""
        if v and not re.match(r"^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$", v):
            raise ValueError('Invalid GSTIN format')
        return v
    
    @validator('pan_number')
    def validate_pan(cls, v):
        """Validate PAN format"""
        if v and not re.match(r"^[A-Z]{5}[0-9]{4}[A-Z]{1}$", v):
            raise ValueError('Invalid PAN format')
        return v


class CustomerCreate(CustomerBase):
    """Schema for creating a new customer"""
    # org_id removed - it comes from authentication token, not request body
    pass


class CustomerUpdate(BaseModel):
    """Schema for updating customer details"""
    customer_name: Optional[str] = Field(None, min_length=1, max_length=200)
    contact_person: Optional[str] = Field(None, max_length=100)
    primary_phone: Optional[str] = Field(None, pattern=r"^[0-9]{10}$")
    secondary_phone: Optional[str] = Field(None, pattern=r"^[0-9]{10}$")
    email: Optional[str] = Field(None, pattern=r"^[\w\.-]+@[\w\.-]+\.\w+$")
    
    # Address fields
    address_line1: Optional[str] = Field(None, min_length=1, max_length=200, description="Building/House number and street")
    address_line2: Optional[str] = Field(None, max_length=200, description="Additional address details")
    area: Optional[str] = Field(None, max_length=100, description="Area/Locality name")
    city: Optional[str] = Field(None, min_length=1, max_length=100)
    state: Optional[str] = Field(None, min_length=1, max_length=100)
    pincode: Optional[str] = Field(None, pattern=r"^[0-9]{6}$")
    
    # Business details
    credit_limit: Optional[Decimal] = Field(None, ge=0)
    credit_days: Optional[int] = Field(None, ge=0, le=365)
    discount_percent: Optional[Decimal] = Field(None, ge=0, le=100)
    
    # Status
    is_active: Optional[bool] = None
    notes: Optional[str] = Field(None, max_length=500)


class CustomerResponse(CustomerBase):
    """Schema for customer response with ALL database fields (enterprise standard)"""
    customer_id: int
    org_id: UUID
    customer_code: str
    
    # CORE FIELDS (from CustomerBase)
    # Inherited: customer_name, customer_type, business_type, primary_phone, etc.
    
    # ADDITIONAL CONTACT FIELDS (not in base)
    whatsapp_number: Optional[str] = None
    
    # COMPLIANCE FIELDS (additional to base)
    fssai_number: Optional[str] = None
    kyc_status: Optional[str] = Field(default="pending", description="pending/verified/rejected")
    kyc_verified_date: Optional[date] = None
    kyc_documents: Optional[dict] = None
    
    # CREDIT MANAGEMENT (additional)
    current_outstanding: Decimal = Field(default=Decimal("0.00"), description="Current dues")
    security_deposit: Decimal = Field(default=Decimal("0.00"))
    overdue_interest_rate: Optional[Decimal] = None
    preferred_payment_mode: Optional[str] = None
    
    # SALES ASSIGNMENT
    territory_id: Optional[int] = None
    route_id: Optional[int] = None
    assigned_salesperson_id: Optional[int] = None
    price_list_id: Optional[int] = None
    discount_group_id: Optional[int] = None
    
    # COMMUNICATION PREFERENCES
    prefer_sms: bool = Field(default=False)
    prefer_email: bool = Field(default=False)
    prefer_whatsapp: bool = Field(default=False)
    preferred_delivery_time: Optional[str] = None
    
    # ANALYTICS (transaction history)
    first_transaction_date: Optional[date] = None
    last_transaction_date: Optional[date] = None
    total_business_amount: Decimal = Field(default=Decimal("0.00"))
    total_transactions: int = Field(default=0)
    average_order_value: Decimal = Field(default=Decimal("0.00"))
    
    # LOYALTY PROGRAM
    loyalty_points: Decimal = Field(default=Decimal("0.00"))
    loyalty_tier: Optional[str] = Field(default="bronze", description="bronze/silver/gold/platinum")
    
    # STATUS FLAGS
    blacklisted: bool = Field(default=False)
    blacklist_reason: Optional[str] = None
    blacklist_date: Optional[date] = None
    
    # LEGACY COMPUTED FIELDS (kept for backward compatibility)
    outstanding_amount: Optional[Decimal] = Field(default=Decimal("0.00"), description="Alias for current_outstanding")
    advance_balance: Optional[Decimal] = Field(default=Decimal("0.00"), description="Unallocated payment amount")
    net_balance: Optional[Decimal] = Field(default=Decimal("0.00"), description="Outstanding - Advance")
    total_business: Optional[Decimal] = Field(default=Decimal("0.00"), description="Alias for total_business_amount")
    total_orders: Optional[int] = Field(default=0, description="Alias for total_transactions")
    last_order_date: Optional[date] = Field(default=None, description="Alias for last_transaction_date")
    
    # ADDRESSES (from JOIN)
    addresses: Optional[List[dict]] = Field(default_factory=list)
    
    # METADATA
    created_at: datetime
    updated_at: datetime
    created_by: Optional[int] = None
    updated_by: Optional[int] = None
    
    # BACKWARD COMPATIBILITY: Keep old field names temporarily
    # These will be populated from the correct database fields
    email: Optional[str] = Field(default=None, description="Alias for primary_email")
    gstin: Optional[str] = Field(default=None, description="Alias for gst_number (via parent)")
    contact_person: Optional[str] = Field(default=None, description="Alias for contact_person_name")
    
    class Config:
        from_attributes = True


class CustomerLedgerEntry(BaseModel):
    """Schema for customer ledger entries"""
    transaction_date: date
    transaction_type: str  # invoice, payment, credit_note, debit_note
    reference_number: str
    description: str
    debit_amount: Decimal = Field(default=Decimal("0.00"))
    credit_amount: Decimal = Field(default=Decimal("0.00"))
    running_balance: Decimal
    
    class Config:
        from_attributes = True


class CustomerLedgerResponse(BaseModel):
    """Schema for customer ledger response"""
    customer_id: int
    customer_name: str
    opening_balance: Decimal
    total_debit: Decimal
    total_credit: Decimal
    closing_balance: Decimal
    entries: List[CustomerLedgerEntry]
    
    class Config:
        from_attributes = True


class OutstandingInvoice(BaseModel):
    """Schema for outstanding invoice details"""
    order_id: int
    order_number: str
    order_date: date
    invoice_amount: Decimal
    paid_amount: Decimal
    outstanding_amount: Decimal
    days_overdue: int
    
    class Config:
        from_attributes = True


class CustomerOutstandingResponse(BaseModel):
    """Schema for customer outstanding response"""
    customer_id: int
    customer_name: str
    credit_limit: Decimal
    credit_days: int
    total_outstanding: Decimal
    advance_balance: Decimal = Field(default=Decimal("0.00"), description="Total unallocated payments")
    net_balance: Decimal = Field(default=Decimal("0.00"), description="Outstanding - Advance")
    available_credit: Decimal
    overdue_amount: Decimal
    invoices: List[OutstandingInvoice]
    
    class Config:
        from_attributes = True


class PaymentRecord(BaseModel):
    """Schema for recording customer payment"""
    customer_id: int
    payment_date: date = Field(default_factory=date.today)
    amount: Decimal = Field(..., gt=0)
    payment_mode: str = Field(..., pattern=r"^(cash|cheque|bank_transfer|upi|card)$")
    reference_number: Optional[str] = Field(None, max_length=100)
    notes: Optional[str] = Field(None, max_length=500)
    
    # For payment allocation
    allocate_to_invoices: Optional[List[int]] = Field(None, description="List of order IDs to allocate payment")
    

class PaymentResponse(BaseModel):
    """Schema for payment response"""
    payment_id: int
    customer_id: int
    payment_date: date
    amount: Decimal
    payment_mode: str
    reference_number: Optional[str]
    allocated_amount: Decimal
    unallocated_amount: Decimal
    created_at: datetime
    
    class Config:
        from_attributes = True


class CustomerListResponse(BaseModel):
    """Schema for customer list with pagination"""
    total: int
    page: int
    per_page: int
    customers: List[CustomerResponse]