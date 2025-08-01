"""
Customer schemas for API validation and responses
Aligned with parties.customers table structure
"""
from typing import Optional, List
from datetime import date, datetime
from decimal import Decimal
from pydantic import BaseModel, Field, validator
import re


class CustomerAddressBase(BaseModel):
    """Base address fields"""
    address_type: Optional[str] = Field(None, description="billing/shipping/both")
    address_line1: str = Field(..., min_length=1, max_length=255)
    address_line2: Optional[str] = Field(None, max_length=255)
    area_name: Optional[str] = Field(None, max_length=100)
    city: str = Field(..., min_length=1, max_length=100)
    state: str = Field(..., min_length=1, max_length=100)
    pincode: str = Field(..., regex="^[0-9]{6}$")
    country: Optional[str] = Field("India", max_length=50)
    landmark: Optional[str] = Field(None, max_length=255)
    contact_person: Optional[str] = Field(None, max_length=100)
    contact_phone: Optional[str] = Field(None, regex="^[0-9]{10}$")
    is_primary: Optional[bool] = False
    is_billing: Optional[bool] = True
    is_shipping: Optional[bool] = False


class CustomerAddressCreate(CustomerAddressBase):
    """Address creation schema"""
    pass


class CustomerAddressResponse(CustomerAddressBase):
    """Address response with ID"""
    address_id: int
    customer_id: int
    is_active: bool
    created_at: datetime
    updated_at: datetime

    class Config:
        orm_mode = True


class CustomerBase(BaseModel):
    """Base customer fields"""
    customer_name: str = Field(..., min_length=1, max_length=255)
    customer_type: Optional[str] = Field("retail", description="retail/wholesale/hospital/clinic/pharmacy")
    
    # Contact information
    primary_phone: str = Field(..., regex="^[0-9]{10}$", description="10-digit mobile number")
    primary_email: Optional[str] = Field(None, regex="^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$")
    secondary_phone: Optional[str] = Field(None, regex="^[0-9]{10}$")
    whatsapp_number: Optional[str] = Field(None, regex="^[0-9]{10}$")
    contact_person_name: Optional[str] = Field(None, max_length=100)
    contact_person_phone: Optional[str] = Field(None, regex="^[0-9]{10}$")
    contact_person_email: Optional[str] = Field(None, regex="^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$")
    
    # Business information
    gst_number: Optional[str] = Field(None, regex="^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$")
    pan_number: Optional[str] = Field(None, regex="^[A-Z]{5}[0-9]{4}[A-Z]{1}$")
    drug_license_number: Optional[str] = Field(None, max_length=50)
    drug_license_validity: Optional[date] = None
    fssai_number: Optional[str] = Field(None, max_length=50)
    establishment_year: Optional[int] = Field(None, ge=1900, le=2100)
    business_type: Optional[str] = Field("retail_pharmacy")
    
    # Credit and payment
    credit_limit: Optional[Decimal] = Field(Decimal("0"), ge=0)
    credit_days: Optional[int] = Field(0, ge=0, le=365)
    credit_rating: Optional[str] = Field("C", regex="^[A-D]$")
    payment_terms: Optional[str] = Field("Cash")
    security_deposit: Optional[Decimal] = Field(Decimal("0"), ge=0)
    overdue_interest_rate: Optional[Decimal] = Field(Decimal("0"), ge=0, le=100)
    
    # Classification
    customer_category: Optional[str] = Field("regular", description="vip/regular/new/blacklisted")
    customer_grade: Optional[str] = Field("C", regex="^[A-D]$")
    
    # Geographic
    territory_id: Optional[int] = None
    route_id: Optional[int] = None
    area_code: Optional[str] = Field(None, max_length=20)
    
    # Sales
    assigned_salesperson_id: Optional[int] = None
    price_list_id: Optional[int] = None
    discount_group_id: Optional[int] = None
    
    # Preferences
    preferred_payment_mode: Optional[str] = None
    preferred_delivery_time: Optional[str] = None
    prefer_sms: Optional[bool] = True
    prefer_email: Optional[bool] = False
    prefer_whatsapp: Optional[bool] = True
    
    # Notes
    internal_notes: Optional[str] = None
    
    @validator('gst_number')
    def validate_gst(cls, v):
        if v and not re.match(r'^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$', v):
            raise ValueError('Invalid GST number format')
        return v
    
    @validator('pan_number')
    def validate_pan(cls, v):
        if v and not re.match(r'^[A-Z]{5}[0-9]{4}[A-Z]{1}$', v):
            raise ValueError('Invalid PAN number format')
        return v


class CustomerCreate(CustomerBase):
    """Customer creation schema with optional address"""
    address: Optional[CustomerAddressCreate] = None


class CustomerUpdate(BaseModel):
    """Customer update schema - all fields optional"""
    customer_name: Optional[str] = Field(None, min_length=1, max_length=255)
    customer_type: Optional[str] = None
    
    # Contact information
    primary_phone: Optional[str] = Field(None, regex="^[0-9]{10}$")
    primary_email: Optional[str] = None
    secondary_phone: Optional[str] = None
    whatsapp_number: Optional[str] = None
    contact_person_name: Optional[str] = None
    contact_person_phone: Optional[str] = None
    contact_person_email: Optional[str] = None
    
    # Business information
    gst_number: Optional[str] = None
    pan_number: Optional[str] = None
    drug_license_number: Optional[str] = None
    drug_license_validity: Optional[date] = None
    
    # Credit
    credit_limit: Optional[Decimal] = None
    credit_days: Optional[int] = None
    credit_rating: Optional[str] = None
    payment_terms: Optional[str] = None
    
    # Classification
    customer_category: Optional[str] = None
    customer_grade: Optional[str] = None
    
    # Notes
    internal_notes: Optional[str] = None
    is_active: Optional[bool] = None


class CustomerResponse(BaseModel):
    """Customer response with all details"""
    customer_id: int
    customer_code: str
    customer_name: str
    customer_type: str
    
    # Contact
    primary_phone: str
    primary_email: Optional[str]
    secondary_phone: Optional[str]
    whatsapp_number: Optional[str]
    contact_person_name: Optional[str]
    contact_person_phone: Optional[str]
    contact_person_email: Optional[str]
    
    # Business
    gst_number: Optional[str]
    pan_number: Optional[str]
    drug_license_number: Optional[str]
    drug_license_validity: Optional[date]
    
    # Credit
    credit_limit: Decimal
    credit_days: int
    current_outstanding: Decimal
    credit_rating: str
    payment_terms: str
    
    # Classification
    customer_category: str
    customer_grade: str
    
    # Metrics
    total_business_amount: Decimal
    total_transactions: int
    average_order_value: Decimal
    last_transaction_date: Optional[date]
    
    # Status
    is_active: bool
    blacklisted: bool
    loyalty_points: Decimal
    loyalty_tier: str
    
    # Timestamps
    created_at: datetime
    updated_at: datetime
    
    # Addresses (from join)
    addresses: List[CustomerAddressResponse] = []
    
    # For backward compatibility
    address_line1: Optional[str] = None
    address_line2: Optional[str] = None
    area_name: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    pincode: Optional[str] = None

    class Config:
        orm_mode = True


class CustomerListResponse(BaseModel):
    """Paginated customer list response"""
    total: int
    page: int
    per_page: int
    customers: List[CustomerResponse]


class OutstandingInvoice(BaseModel):
    """Outstanding invoice details"""
    invoice_id: int
    invoice_number: str
    invoice_date: date
    due_date: date
    total_amount: Decimal
    paid_amount: Decimal
    outstanding_amount: Decimal
    days_overdue: int


class CustomerOutstandingResponse(BaseModel):
    """Customer outstanding details"""
    customer_id: int
    customer_name: str
    credit_limit: Decimal
    credit_days: int
    current_outstanding: Decimal
    available_credit: Decimal
    outstanding_invoices: List[OutstandingInvoice]


# For backward compatibility with old API
class CustomerCreateLegacy(BaseModel):
    """Legacy customer creation format"""
    customer_name: str
    phone: str  # Maps to primary_phone
    email: Optional[str] = None  # Maps to primary_email
    contact_person: Optional[str] = None  # Maps to contact_person_name
    alternate_phone: Optional[str] = None  # Maps to secondary_phone
    gstin: Optional[str] = None  # Maps to gst_number
    address_line1: Optional[str] = None
    address_line2: Optional[str] = None
    area: Optional[str] = None  # Maps to area_name
    city: Optional[str] = None
    state: Optional[str] = None
    pincode: Optional[str] = None
    pan_number: Optional[str] = None
    drug_license_number: Optional[str] = None
    customer_type: Optional[str] = "retail"
    credit_limit: Optional[Decimal] = Decimal("0")
    credit_days: Optional[int] = 0
    discount_percent: Optional[Decimal] = Decimal("0")  # Maps to discount_group_id lookup
    notes: Optional[str] = None  # Maps to internal_notes
    is_active: Optional[bool] = True