"""
Supplier schemas for enterprise pharma system
Handles GST-compliant supplier management for procurement
"""
from typing import Optional, List, Annotated
from datetime import datetime
from decimal import Decimal
from uuid import UUID
from pydantic import BaseModel, Field, field_validator, model_validator, ConfigDict, EmailStr
import re


# =============================================================================
# SUPPLIER SCHEMAS
# =============================================================================

class SupplierBase(BaseModel):
    """Base supplier model with common fields for create/update operations"""
    
    supplier_name: str = Field(
        ..., 
        min_length=1, 
        max_length=200,
        description="Legal business name of supplier",
        examples=["ABC Pharma Distributors Pvt Ltd"]
    )
    supplier_code: Optional[str] = Field(
        None, 
        max_length=50,
        description="Unique supplier code (auto-generated if not provided)",
        examples=["SUP-001"]
    )
    supplier_type: Optional[str] = Field(
        "distributor",
        description="Type of supplier: manufacturer, distributor, wholesaler, importer",
        examples=["distributor", "manufacturer"]
    )
    
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
    
    # Drug License (Pharma-specific)
    drug_license_number: Optional[str] = Field(
        None,
        max_length=50,
        description="Drug license number for pharma suppliers",
        examples=["DL-20B-1234567"]
    )
    drug_license_validity: Optional[datetime] = Field(
        None,
        description="Drug license expiry date"
    )
    
    # Address
    address_line1: Optional[str] = Field(None, max_length=255, description="Street address")
    address_line2: Optional[str] = Field(None, max_length=255, description="Additional address")
    city: Optional[str] = Field(None, max_length=100, description="City name")
    state: Optional[str] = Field(None, max_length=100, description="State/Province")
    pincode: Optional[str] = Field(
        None, 
        pattern=r"^\d{6}$",
        description="6-digit Indian PIN code",
        examples=["400001"]
    )
    country: str = Field(default="India", max_length=100)
    
    # Contact
    primary_phone: Optional[str] = Field(
        None,
        pattern=r"^\d{10}$",
        description="10-digit mobile number",
        examples=["9876543210"]
    )
    secondary_phone: Optional[str] = Field(None, pattern=r"^\d{10}$")
    primary_email: Optional[EmailStr] = Field(None, description="Primary email address")
    contact_person: Optional[str] = Field(None, max_length=100, description="Contact person name")
    contact_person_phone: Optional[str] = Field(None, pattern=r"^\d{10}$")

    # Banking
    bank_name: Optional[str] = Field(None, max_length=100, description="Bank name")
    account_number: Optional[str] = Field(None, max_length=20, description="Bank account number")
    ifsc_code: Optional[str] = Field(None, max_length=11, description="IFSC code")
    account_holder_name: Optional[str] = Field(None, max_length=200, description="Account holder name")

    # Payment Terms
    payment_terms: Optional[str] = Field(
        "NET30",
        description="Payment terms: CASH, NET15, NET30, NET45, NET60",
        examples=["NET30"]
    )
    payment_days: Optional[int] = Field(default=30, ge=0, le=180, description="Payment period in days")
    credit_days: int = Field(
        default=30,
        ge=0,
        le=180,
        description="Credit period in days"
    )
    credit_limit: Decimal = Field(
        default=Decimal("0"),
        ge=0,
        description="Maximum credit amount allowed"
    )

    # Ratings
    quality_rating: Optional[float] = Field(None, ge=0, le=5, description="Quality rating (0-5)")
    delivery_rating: Optional[float] = Field(None, ge=0, le=5, description="Delivery rating (0-5)")
    compliance_rating: Optional[str] = Field(None, max_length=50, description="Compliance rating")

    # Notes
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


class SupplierCreate(SupplierBase):
    """Schema for creating a new supplier"""
    pass


class CanonicalSupplierCreate(BaseModel):
    """Reviewed supplier-account creation contract used by the live ERP UI."""

    supplier_name: str = Field(min_length=1, max_length=200)
    supplier_code: Optional[str] = Field(default=None, min_length=1, max_length=50)
    primary_phone: Optional[str] = Field(default=None, pattern=r"^\d{10}$")
    primary_email: Optional[EmailStr] = None
    contact_person: Optional[str] = Field(default=None, max_length=100)
    address_line1: Optional[str] = Field(default=None, max_length=255)
    address_line2: Optional[str] = Field(default=None, max_length=255)
    city: Optional[str] = Field(default=None, max_length=100)
    state: Optional[str] = Field(default=None, max_length=100)
    pincode: Optional[str] = Field(default=None, pattern=r"^\d{6}$")
    gst_number: Optional[str] = Field(default=None, min_length=15, max_length=15)
    pan_number: Optional[str] = Field(default=None, min_length=10, max_length=10)
    payment_days: int = Field(default=30, ge=0, le=180)

    @field_validator("gst_number")
    @classmethod
    def validate_gst_number(cls, value: Optional[str]) -> Optional[str]:
        return SupplierBase.validate_gst_number(value)

    @field_validator("pan_number")
    @classmethod
    def validate_pan_number(cls, value: Optional[str]) -> Optional[str]:
        return SupplierBase.validate_pan_number(value)

    @model_validator(mode="after")
    def require_complete_address(self):
        address = (self.address_line1, self.city, self.state, self.pincode)
        if any(address) and not all(address):
            raise ValueError("Address line, city, state, and pincode must be supplied together")
        return self

    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class SupplierUpdate(BaseModel):
    """Schema for updating supplier - all fields optional"""
    
    supplier_name: Optional[str] = Field(None, min_length=1, max_length=200)
    supplier_type: Optional[str] = None
    gst_number: Optional[str] = Field(None, min_length=15, max_length=15)
    pan_number: Optional[str] = Field(None, min_length=10, max_length=10)
    drug_license_number: Optional[str] = Field(None, max_length=50)
    drug_license_validity: Optional[datetime] = None
    address_line1: Optional[str] = Field(None, max_length=255)
    address_line2: Optional[str] = Field(None, max_length=255)
    city: Optional[str] = Field(None, max_length=100)
    state: Optional[str] = Field(None, max_length=100)
    pincode: Optional[str] = Field(None, pattern=r"^\d{6}$")
    country: Optional[str] = Field(None, max_length=100)
    primary_phone: Optional[str] = Field(None, pattern=r"^\d{10}$")
    secondary_phone: Optional[str] = Field(None, pattern=r"^\d{10}$")
    primary_email: Optional[EmailStr] = None
    contact_person: Optional[str] = Field(None, max_length=100)
    contact_person_phone: Optional[str] = Field(None, pattern=r"^\d{10}$")
    payment_terms: Optional[str] = None
    credit_days: Optional[int] = Field(None, ge=0, le=180)
    credit_limit: Optional[Decimal] = Field(None, ge=0)
    internal_notes: Optional[str] = Field(None, max_length=1000)
    is_active: Optional[bool] = None

    model_config = ConfigDict(str_strip_whitespace=True)


class SupplierResponse(SupplierBase):
    """Schema for supplier response - includes all database fields"""
    
    supplier_id: int = Field(..., description="Unique supplier ID")
    org_id: UUID = Field(..., description="Organization ID")
    is_active: bool = Field(default=True, description="Whether supplier is active")
    created_at: datetime = Field(..., description="Record creation timestamp")
    updated_at: Optional[datetime] = Field(None, description="Last update timestamp")
    created_by: Optional[int] = Field(None, description="User ID who created record")
    
    # Computed fields (from joins)
    total_purchases: Optional[Decimal] = Field(None, description="Total purchase amount")
    pending_payments: Optional[Decimal] = Field(None, description="Pending payment amount")
    last_purchase_date: Optional[datetime] = Field(None, description="Last purchase date")

    model_config = ConfigDict(from_attributes=True)


class SupplierListResponse(BaseModel):
    """Schema for paginated supplier list"""
    
    total: int = Field(..., description="Total number of suppliers matching filter")
    page: int = Field(..., ge=1, description="Current page number")
    per_page: int = Field(..., ge=1, le=1000, description="Items per page")
    suppliers: List[SupplierResponse] = Field(default_factory=list)


class SupplierSummary(BaseModel):
    """Lightweight supplier summary for dropdowns/autocomplete"""
    
    supplier_id: int
    supplier_name: str
    supplier_code: Optional[str] = None
    gst_number: Optional[str] = None
    is_active: bool = True

    model_config = ConfigDict(from_attributes=True)
