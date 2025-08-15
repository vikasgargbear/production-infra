"""
Supplier schemas
"""
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime
from uuid import UUID

class SupplierBase(BaseModel):
    """Base supplier schema"""
    name: str
    code: Optional[str] = None
    supplier_type: Optional[str] = None
    gst_number: Optional[str] = None
    pan_number: Optional[str] = None
    drug_license_number: Optional[str] = None
    drug_license_validity: Optional[str] = None
    address: Optional[str] = None
    address_line2: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    pincode: Optional[str] = None
    phone: Optional[str] = None
    secondary_phone: Optional[str] = None
    email: Optional[str] = None
    contact_person: Optional[str] = None
    website: Optional[str] = None
    bank_name: Optional[str] = None
    account_number: Optional[str] = None
    ifsc_code: Optional[str] = None
    account_holder_name: Optional[str] = None
    payment_days: Optional[int] = None

class SupplierCreate(SupplierBase):
    """Schema for creating supplier"""
    pass

class SupplierUpdate(BaseModel):
    """Schema for updating supplier"""
    name: Optional[str] = None
    gst_number: Optional[str] = None
    pan_number: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None
    pincode: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    contact_person: Optional[str] = None

class SupplierResponse(SupplierBase):
    """Schema for supplier response"""
    id: UUID
    created_at: datetime
    updated_at: Optional[datetime] = None
    
    class Config:
        from_attributes = True

class SupplierListResponse(BaseModel):
    """Schema for supplier list response"""
    total: int
    page: int
    per_page: int
    suppliers: List[SupplierResponse]