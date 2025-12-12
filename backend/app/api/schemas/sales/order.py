"""
Order schemas for enterprise pharma system
Handles complete order workflow from creation to delivery
"""
from typing import Optional, List, Union
from pydantic import BaseModel, Field, field_validator, model_validator, ConfigDict
from datetime import datetime, date
from decimal import Decimal
from uuid import UUID
from enum import Enum


# =============================================================================
# ENUMS
# =============================================================================

class OrderStatus(str, Enum):
    """Order status lifecycle"""
    DRAFT = "draft"
    PENDING = "pending"
    CONFIRMED = "confirmed"
    PROCESSING = "processing"
    PACKED = "packed"
    SHIPPED = "shipped"
    DELIVERED = "delivered"
    CANCELLED = "cancelled"


class OrderType(str, Enum):
    """Order types"""
    SALES = "sales"
    RETURN = "return"
    REPLACEMENT = "replacement"
    REGULAR = "regular"


class PaymentTerms(str, Enum):
    """Payment terms"""
    CASH = "cash"
    CREDIT = "credit"
    ADVANCE = "advance"


# =============================================================================
# ORDER ITEM SCHEMAS
# =============================================================================

class OrderItemBase(BaseModel):
    """Base order item model"""
    
    product_id: int = Field(..., gt=0, description="Product ID")
    batch_id: Optional[int] = Field(None, gt=0, description="Batch ID")
    batch_number: Optional[str] = Field(None, max_length=50, description="Batch number")
    
    quantity: Decimal = Field(..., gt=0, description="Order quantity")
    free_quantity: Decimal = Field(default=Decimal("0"), ge=0, description="Free goods quantity")
    
    unit_price: Decimal = Field(..., ge=0, description="Unit price")
    mrp: Optional[Decimal] = Field(None, ge=0, description="MRP per unit")
    
    discount_percent: Decimal = Field(default=Decimal("0"), ge=0, le=100)
    discount_amount: Decimal = Field(default=Decimal("0"), ge=0)
    
    tax_percent: Decimal = Field(default=Decimal("0"), ge=0, le=28)
    tax_amount: Decimal = Field(default=Decimal("0"), ge=0)
    
    gst_type: str = Field(default="CGST/SGST", description="CGST/SGST or IGST")
    cgst_amount: Decimal = Field(default=Decimal("0"), ge=0)
    sgst_amount: Decimal = Field(default=Decimal("0"), ge=0)
    igst_amount: Decimal = Field(default=Decimal("0"), ge=0)
    
    uom: Optional[str] = Field(None, max_length=20, description="Unit of measure")
    pack_type: Optional[str] = Field(None, max_length=20)
    product_code: Optional[str] = Field(None, max_length=50)
    
    line_total: Optional[Decimal] = None

    @field_validator("batch_number", "uom", "pack_type", "product_code", mode="before")
    @classmethod
    def convert_null_to_none(cls, v):
        """Convert null/undefined to None"""
        if v in ["null", "undefined", ""]:
            return None
        return v

    model_config = ConfigDict(from_attributes=True)


class OrderItemCreate(OrderItemBase):
    """Schema for creating order item"""
    pass


class OrderItemResponse(OrderItemBase):
    """Schema for order item response"""
    
    order_item_id: int
    order_id: int
    product_name: str
    product_code: Optional[str] = None
    batch_number: Optional[str] = None
    expiry_date: Optional[date] = None

    model_config = ConfigDict(from_attributes=True)


# =============================================================================
# ORDER SCHEMAS
# =============================================================================

class OrderBase(BaseModel):
    """Base order model"""
    
    customer_id: int = Field(..., gt=0, description="Customer ID")
    order_date: date = Field(default_factory=date.today)
    delivery_date: Optional[date] = None
    
    # Billing
    billing_name: Optional[str] = Field(None, max_length=200)
    billing_address_id: Optional[int] = None
    billing_address: Optional[str] = Field(None, max_length=500)
    billing_gstin: Optional[str] = Field(
        None, 
        min_length=15, 
        max_length=15,
        description="15-digit GSTIN"
    )
    
    # Shipping
    shipping_name: Optional[str] = Field(None, max_length=200)
    shipping_address_id: Optional[int] = None
    shipping_address: Optional[str] = Field(None, max_length=500)
    shipping_phone: Optional[str] = Field(None, pattern=r"^\d{10}$")
    
    # Order details
    order_type: str = Field(default="sales", description="Order type")
    payment_terms: str = Field(default="credit", description="Payment terms")
    notes: Optional[str] = Field(None, max_length=1000)
    
    # Charges
    discount_percent: Decimal = Field(default=Decimal("0"), ge=0, le=100)
    discount_amount: Decimal = Field(default=Decimal("0"), ge=0)
    delivery_charges: Decimal = Field(default=Decimal("0"), ge=0)
    other_charges: Decimal = Field(default=Decimal("0"), ge=0)

    model_config = ConfigDict(from_attributes=True, str_strip_whitespace=True)


class OrderCreate(OrderBase):
    """Schema for creating an order"""
    
    items: List[OrderItemCreate] = Field(..., min_length=1)

    @field_validator("delivery_date")
    @classmethod
    def validate_delivery_date(cls, v, info):
        """Ensure delivery date is not before order date"""
        order_date = info.data.get("order_date")
        if v and order_date and v < order_date:
            raise ValueError("Delivery date cannot be before order date")
        return v


class OrderUpdate(BaseModel):
    """Schema for updating order"""
    
    delivery_date: Optional[date] = None
    billing_name: Optional[str] = Field(None, max_length=200)
    billing_address: Optional[str] = Field(None, max_length=500)
    shipping_name: Optional[str] = Field(None, max_length=200)
    shipping_address: Optional[str] = Field(None, max_length=500)
    shipping_phone: Optional[str] = Field(None, pattern=r"^\d{10}$")
    notes: Optional[str] = Field(None, max_length=1000)
    order_status: Optional[str] = None

    model_config = ConfigDict(str_strip_whitespace=True)


class OrderResponse(OrderBase):
    """Schema for order response"""
    
    order_id: int
    org_id: UUID
    order_number: str
    order_status: str
    
    # Customer details
    customer_name: str
    customer_code: Optional[str] = None
    customer_phone: Optional[str] = None
    
    # Financial summary
    subtotal_amount: Decimal = Decimal("0")
    tax_amount: Decimal = Decimal("0")
    total_amount: Decimal = Decimal("0")
    paid_amount: Decimal = Decimal("0")
    balance_amount: Decimal = Decimal("0")
    
    # Items
    items: List[OrderItemResponse] = Field(default_factory=list)
    
    # Timestamps
    created_at: datetime
    updated_at: Optional[datetime] = None
    confirmed_at: Optional[datetime] = None
    delivered_at: Optional[datetime] = None
    created_by: Optional[int] = None

    model_config = ConfigDict(from_attributes=True)


class OrderSummary(BaseModel):
    """Lightweight order for lists"""
    
    order_id: int
    order_number: str
    order_date: date
    customer_name: str
    total_amount: Decimal
    order_status: str
    payment_status: Optional[str] = None
    items_count: int = 0

    model_config = ConfigDict(from_attributes=True)


class OrderListResponse(BaseModel):
    """Paginated order list"""
    
    total: int = Field(..., description="Total orders matching filter")
    page: int = Field(..., ge=1)
    per_page: int = Field(..., ge=1, le=1000)
    orders: List[OrderResponse] = Field(default_factory=list)


# =============================================================================
# INVOICE SCHEMAS
# =============================================================================

class InvoiceRequest(BaseModel):
    """Schema for invoice generation request"""
    
    invoice_date: date = Field(default_factory=date.today)
    invoice_number: Optional[str] = None
    print_copy: bool = Field(default=False, description="Generate printable PDF")
    send_email: bool = Field(default=False, description="Email invoice to customer")


class InvoiceResponse(BaseModel):
    """Schema for invoice response"""
    
    invoice_id: int
    invoice_number: str
    invoice_date: date
    order_id: int
    order_number: str
    
    subtotal_amount: Decimal
    tax_amount: Decimal
    total_amount: Decimal
    
    pdf_url: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


# =============================================================================
# DELIVERY SCHEMAS
# =============================================================================

class DeliveryUpdate(BaseModel):
    """Schema for delivery update"""
    
    delivered_by: str = Field(..., min_length=1, max_length=100)
    delivery_notes: Optional[str] = Field(None, max_length=500)
    delivery_proof: Optional[str] = Field(None, description="Base64 encoded signature/photo")


class ReturnRequest(BaseModel):
    """Schema for order return request"""
    
    return_reason: str = Field(..., min_length=1, max_length=500)
    return_type: str = Field(..., description="full or partial")
    items: Optional[List[dict]] = Field(None, description="Items for partial return")
    refund_method: str = Field(..., description="credit_note, cash, bank_transfer, adjustment")


# =============================================================================
# DASHBOARD & HISTORY
# =============================================================================

class OrderStatusHistory(BaseModel):
    """Order status change record"""
    
    status: str
    changed_at: datetime
    changed_by: Optional[str] = None
    notes: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class OrderDashboard(BaseModel):
    """Order dashboard statistics"""
    
    total_orders: int = 0
    pending_orders: int = 0
    processing_orders: int = 0
    delivered_orders: int = 0
    
    today_orders: int = 0
    today_amount: Decimal = Decimal("0")
    
    week_orders: int = 0
    week_amount: Decimal = Decimal("0")
    
    month_orders: int = 0
    month_amount: Decimal = Decimal("0")
    
    top_products: List[dict] = Field(default_factory=list)
    recent_orders: List[OrderSummary] = Field(default_factory=list)