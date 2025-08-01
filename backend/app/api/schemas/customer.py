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
    phone: str = Field(..., pattern=r"^[0-9]{10}$", description="10-digit mobile number")
    alternate_phone: Optional[str] = Field(None, pattern=r"^[0-9]{10}$")
    email: Optional[str] = Field(None, pattern=r"^[\w\.-]+@[\w\.-]+\.\w+$")
    
    # Address fields
    address_line1: str = Field(..., min_length=1, max_length=200, description="Building/House number and street")
    address_line2: Optional[str] = Field(None, max_length=200, description="Additional address details")
    area: Optional[str] = Field(None, max_length=100, description="Area/Locality name")
    city: str = Field(..., min_length=1, max_length=100)
    state: str = Field(..., min_length=1, max_length=100)
    pincode: str = Field(..., pattern=r"^[0-9]{6}$", description="6-digit pincode")
    
    # GST and Tax details
    gstin: Optional[str] = Field(None, pattern=r"^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$")
    pan_number: Optional[str] = Field(None, pattern=r"^[A-Z]{5}[0-9]{4}[A-Z]{1}$")
    drug_license_number: Optional[str] = Field(None, max_length=50)
    
    # Business details
    customer_type: str = Field(..., pattern=r"^(retail|wholesale|hospital|clinic|pharmacy)$")
    credit_limit: Decimal = Field(default=Decimal("0.00"), ge=0)
    credit_days: int = Field(default=0, ge=0, le=365)
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
    org_id: UUID = Field(..., description="Organization ID")


class CustomerUpdate(BaseModel):
    """Schema for updating customer details"""
    customer_name: Optional[str] = Field(None, min_length=1, max_length=200)
    contact_person: Optional[str] = Field(None, max_length=100)
    phone: Optional[str] = Field(None, pattern=r"^[0-9]{10}$")
    alternate_phone: Optional[str] = Field(None, pattern=r"^[0-9]{10}$")
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
    """Schema for customer response with additional computed fields"""
    customer_id: int
    org_id: UUID
    customer_code: str
    
    # Computed fields
    outstanding_amount: Decimal = Field(default=Decimal("0.00"))
    total_business: Decimal = Field(default=Decimal("0.00"))
    last_order_date: Optional[date] = None
    
    # Timestamps
    created_at: datetime
    updated_at: datetime
    
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