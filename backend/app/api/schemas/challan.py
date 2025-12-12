"""
Challan and delivery schemas
Centralized from inline route definitions
"""
from typing import List, Optional, Dict, Any
from datetime import date, datetime
from decimal import Decimal
from pydantic import BaseModel, Field


# =============================================================================
# CHALLAN ITEM SCHEMAS
# =============================================================================

class ChallanItemRequest(BaseModel):
    """Schema for challan line item"""
    product_id: int
    batch_id: Optional[int] = None
    quantity: int = Field(..., gt=0)
    unit_price: Decimal
    discount_percent: Decimal = Field(default=Decimal("0"))
    tax_percent: Decimal = Field(default=Decimal("0"))
    hsn_code: Optional[str] = None
    notes: Optional[str] = None


# =============================================================================
# CHALLAN CREATE/RESPONSE SCHEMAS
# =============================================================================

class ChallanCreationRequest(BaseModel):
    """Schema for creating delivery challan"""
    customer_id: int
    order_id: Optional[int] = None
    challan_date: date = Field(default_factory=date.today)
    delivery_address_id: Optional[int] = None
    delivery_address: Optional[str] = None
    vehicle_number: Optional[str] = None
    driver_name: Optional[str] = None
    driver_phone: Optional[str] = None
    transporter_name: Optional[str] = None
    lr_number: Optional[str] = None
    items: List[ChallanItemRequest] = Field(..., min_items=1)
    remarks: Optional[str] = None


class ChallanResponse(BaseModel):
    """Response schema for challan"""
    challan_id: int
    challan_number: str
    challan_date: date
    customer_id: int
    customer_name: str
    challan_status: str
    total_amount: float
    items_count: int
    created_at: datetime


class ChallanTrackingRequest(BaseModel):
    """Schema for updating challan delivery status"""
    status: str = Field(..., description="dispatched, in_transit, delivered, returned")
    location: Optional[str] = None
    notes: Optional[str] = None
    delivery_date: Optional[date] = None
    received_by: Optional[str] = None


# =============================================================================
# CONVERSION SCHEMAS
# =============================================================================

class ConversionRequest(BaseModel):
    """Request to convert order/challan to invoice"""
    source_type: str = Field(..., description="order, challan, quotation")
    source_id: int
    include_all_items: bool = True
    selected_item_ids: Optional[List[int]] = None


class BulkChallanToInvoiceRequest(BaseModel):
    """Request to convert multiple challans to invoice"""
    challan_ids: List[int] = Field(..., min_items=1)
    customer_id: int
    combine_items: bool = True


class ConversionResponse(BaseModel):
    """Response for conversion operation"""
    success: bool
    invoice_id: Optional[int] = None
    invoice_number: Optional[str] = None
    message: str
