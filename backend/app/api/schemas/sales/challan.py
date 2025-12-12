"""
Challan and delivery schemas
For delivery challans and order-to-invoice conversion
"""
from typing import List, Optional
from datetime import date, datetime
from decimal import Decimal
from pydantic import BaseModel, Field, field_validator, ConfigDict
from enum import Enum


# =============================================================================
# ENUMS
# =============================================================================

class ChallanStatus(str, Enum):
    """Challan delivery status"""
    DRAFT = "draft"
    PENDING = "pending"
    DISPATCHED = "dispatched"
    IN_TRANSIT = "in_transit"
    DELIVERED = "delivered"
    PARTIAL = "partial"
    RETURNED = "returned"
    CANCELLED = "cancelled"


# =============================================================================
# CHALLAN ITEM SCHEMAS
# =============================================================================

class ChallanItemRequest(BaseModel):
    """Schema for challan line item"""
    
    product_id: int = Field(..., description="Product ID")
    batch_id: Optional[int] = Field(None, description="Batch ID")
    batch_number: Optional[str] = Field(None, max_length=50)
    
    quantity: Decimal = Field(..., gt=0, description="Quantity")
    unit_price: Decimal = Field(..., ge=0, description="Unit price")
    mrp: Optional[Decimal] = Field(None, ge=0)
    
    discount_percent: Decimal = Field(default=Decimal("0"), ge=0, le=100)
    tax_percent: Decimal = Field(default=Decimal("0"), ge=0, le=28)
    
    hsn_code: Optional[str] = Field(None, max_length=8)
    uom: Optional[str] = Field(None, max_length=20)
    notes: Optional[str] = Field(None, max_length=200)

    model_config = ConfigDict(from_attributes=True)


class ChallanItemResponse(ChallanItemRequest):
    """Response schema for challan item"""
    
    challan_item_id: int
    challan_id: int
    product_name: str
    product_code: Optional[str] = None
    line_total: Decimal = Decimal("0")
    delivered_quantity: Decimal = Decimal("0")
    pending_quantity: Decimal = Decimal("0")

    model_config = ConfigDict(from_attributes=True)


# =============================================================================
# CHALLAN CREATE/RESPONSE SCHEMAS
# =============================================================================

class ChallanCreationRequest(BaseModel):
    """Schema for creating delivery challan"""
    
    customer_id: int = Field(..., description="Customer ID")
    order_id: Optional[int] = Field(None, description="Source order ID")
    
    challan_date: date = Field(default_factory=date.today)
    expected_delivery_date: Optional[date] = None
    
    # Delivery address
    delivery_address_id: Optional[int] = None
    delivery_address: Optional[str] = Field(None, max_length=500)
    delivery_pincode: Optional[str] = Field(None, pattern=r"^\d{6}$")
    
    # Transport details
    vehicle_number: Optional[str] = Field(None, max_length=20)
    driver_name: Optional[str] = Field(None, max_length=100)
    driver_phone: Optional[str] = Field(None, pattern=r"^\d{10}$")
    transporter_name: Optional[str] = Field(None, max_length=100)
    lr_number: Optional[str] = Field(None, max_length=50, description="Lorry Receipt number")
    
    items: List[ChallanItemRequest] = Field(..., min_length=1)
    remarks: Optional[str] = Field(None, max_length=500)

    model_config = ConfigDict(str_strip_whitespace=True)


class ChallanResponse(BaseModel):
    """Response schema for challan"""
    
    challan_id: int
    challan_number: str
    challan_date: date
    expected_delivery_date: Optional[date] = None
    
    customer_id: int
    customer_name: str
    customer_phone: Optional[str] = None
    
    order_id: Optional[int] = None
    order_number: Optional[str] = None
    
    challan_status: str = "pending"
    
    # Financials
    subtotal_amount: Decimal = Decimal("0")
    tax_amount: Decimal = Decimal("0")
    total_amount: Decimal = Decimal("0")
    
    items_count: int = 0
    items: List[ChallanItemResponse] = Field(default_factory=list)
    
    # Transport
    vehicle_number: Optional[str] = None
    driver_name: Optional[str] = None
    transporter_name: Optional[str] = None
    
    # Metadata
    created_at: datetime
    created_by: Optional[int] = None
    delivered_at: Optional[datetime] = None
    delivered_by: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class ChallanSummary(BaseModel):
    """Lightweight challan for lists"""
    
    challan_id: int
    challan_number: str
    challan_date: date
    customer_name: str
    total_amount: Decimal
    challan_status: str
    items_count: int

    model_config = ConfigDict(from_attributes=True)


class ChallanListResponse(BaseModel):
    """Paginated challan list"""
    
    total: int
    page: int = Field(default=1, ge=1)
    per_page: int = Field(default=20, ge=1, le=1000)
    challans: List[ChallanSummary] = Field(default_factory=list)


# =============================================================================
# TRACKING SCHEMAS
# =============================================================================

class ChallanTrackingRequest(BaseModel):
    """Schema for updating challan delivery status"""
    
    status: str = Field(..., description="dispatched, in_transit, delivered, returned")
    location: Optional[str] = Field(None, max_length=200)
    notes: Optional[str] = Field(None, max_length=500)
    
    delivery_date: Optional[date] = None
    received_by: Optional[str] = Field(None, max_length=100)
    signature_image: Optional[str] = Field(None, description="Base64 encoded signature")

    @field_validator("status")
    @classmethod
    def validate_status(cls, v):
        valid = {"dispatched", "in_transit", "delivered", "partial", "returned"}
        if v.lower() not in valid:
            raise ValueError(f"Invalid status. Must be one of: {', '.join(valid)}")
        return v.lower()


class ChallanTrackingHistory(BaseModel):
    """Challan tracking history entry"""
    
    status: str
    location: Optional[str] = None
    updated_at: datetime
    updated_by: Optional[str] = None
    notes: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


# =============================================================================
# CONVERSION SCHEMAS
# =============================================================================

class ConversionRequest(BaseModel):
    """Request to convert order/challan to invoice"""
    
    source_type: str = Field(..., description="order, challan, quotation")
    source_id: int
    include_all_items: bool = True
    selected_item_ids: Optional[List[int]] = None
    invoice_date: date = Field(default_factory=date.today)


class BulkChallanToInvoiceRequest(BaseModel):
    """Request to convert multiple challans to single invoice"""
    
    challan_ids: List[int] = Field(..., min_length=1)
    customer_id: int
    combine_items: bool = Field(default=True, description="Combine same products")
    invoice_date: date = Field(default_factory=date.today)


class ConversionResponse(BaseModel):
    """Response for conversion operation"""
    
    success: bool
    invoice_id: Optional[int] = None
    invoice_number: Optional[str] = None
    converted_count: int = 0
    message: str
