"""
Supplier Schemas - PRODUCTION READY
Uses database field names directly (no aliases)
"""
from pydantic import BaseModel, Field, field_validator
from typing import Optional, List
from datetime import datetime, date
from uuid import UUID


class SupplierCreate(BaseModel):
    """Schema for creating a supplier. Uses exact database column names."""
    
    # Required
    supplier_name: str = Field(..., description="Supplier's business name")
    
    # Optional - auto-generated if not provided
    supplier_code: Optional[str] = Field(None, description="Unique code (auto-generated if empty)")
    
    # Type and classification
    supplier_type: Optional[str] = Field("distributor", description="Type: manufacturer, distributor, wholesaler, importer")
    
    # Compliance
    gst_number: Optional[str] = Field(None, description="15-digit GST number")
    pan_number: Optional[str] = Field(None, description="10-digit PAN")
    drug_license_number: Optional[str] = Field(None, description="Drug license number")
    drug_license_validity: Optional[date] = Field(None, description="Drug license expiry date")
    
    # Contact
    primary_phone: Optional[str] = Field(None, description="Primary phone number")
    secondary_phone: Optional[str] = Field(None, description="Secondary/alternate phone")
    primary_email: Optional[str] = Field(None, description="Primary email address")
    contact_person_name: Optional[str] = Field(None, description="Contact person's full name")
    contact_person_phone: Optional[str] = Field(None, description="Contact person's phone")
    
    # Address (stored in master.addresses, but accepted for convenience)
    address_line1: Optional[str] = Field(None, description="Street address line 1")
    address_line2: Optional[str] = Field(None, description="Street address line 2")
    city: Optional[str] = None
    state_name: Optional[str] = Field(None, description="State name (auto-maps to state_code)")
    pincode: Optional[str] = None
    
    # Banking
    bank_name: Optional[str] = None
    account_number: Optional[str] = None
    ifsc_code: Optional[str] = None
    account_holder_name: Optional[str] = None
    
    # Terms and ratings
    payment_days: Optional[int] = Field(30, description="Credit period in days")
    quality_rating: Optional[float] = Field(4.0, ge=0, le=5)
    delivery_rating: Optional[float] = Field(4.0, ge=0, le=5)
    compliance_rating: Optional[str] = Field("good", description="good, average, poor")
    
    # Notes
    internal_notes: Optional[str] = None


class SupplierUpdate(BaseModel):
    """Schema for updating supplier. All fields optional."""
    
    supplier_name: Optional[str] = None
    supplier_type: Optional[str] = None
    gst_number: Optional[str] = None
    pan_number: Optional[str] = None
    drug_license_number: Optional[str] = None
    drug_license_validity: Optional[date] = None
    primary_phone: Optional[str] = None
    secondary_phone: Optional[str] = None
    primary_email: Optional[str] = None
    contact_person_name: Optional[str] = None
    contact_person_phone: Optional[str] = None
    payment_days: Optional[int] = None
    quality_rating: Optional[float] = None
    delivery_rating: Optional[float] = None
    compliance_rating: Optional[str] = None
    internal_notes: Optional[str] = None
    is_active: Optional[bool] = None


class SupplierResponse(BaseModel):
    """Response schema - returns all database columns."""
    
    supplier_id: int
    supplier_code: str
    supplier_name: str
    supplier_type: Optional[str] = None
    gst_number: Optional[str] = None
    pan_number: Optional[str] = None
    drug_license_number: Optional[str] = None
    drug_license_validity: Optional[date] = None
    primary_phone: Optional[str] = None
    secondary_phone: Optional[str] = None
    primary_email: Optional[str] = None
    contact_person_name: Optional[str] = None
    contact_person_phone: Optional[str] = None
    bank_name: Optional[str] = None
    account_number: Optional[str] = None
    ifsc_code: Optional[str] = None
    account_holder_name: Optional[str] = None
    payment_days: Optional[int] = None
    quality_rating: Optional[float] = None
    delivery_rating: Optional[float] = None
    compliance_rating: Optional[str] = None
    internal_notes: Optional[str] = None
    is_active: bool = True
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    
    # Addresses returned as nested array
    addresses: Optional[List[dict]] = None
    
    class Config:
        from_attributes = True


class SupplierListResponse(BaseModel):
    """Paginated response"""
    total: int
    page: int
    per_page: int
    suppliers: List[SupplierResponse]