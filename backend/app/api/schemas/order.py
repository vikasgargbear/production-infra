"""
Order schemas for the enterprise pharma system
Handles complete order workflow from creation to delivery
"""
from typing import Optional, List
from pydantic import BaseModel, Field, validator
from datetime import datetime, date
from decimal import Decimal
from uuid import UUID


class OrderItemBase(BaseModel):
    """Base order item model"""
    product_id: int = Field(..., gt=0)
    batch_id: Optional[int] = Field(None, gt=0)
    batch_number: Optional[str] = None  # Add batch_number!
    quantity: int = Field(..., gt=0)
    free_quantity: Optional[int] = Field(default=0, ge=0)  # Add free_quantity!
    unit_price: Decimal = Field(..., ge=0)
    mrp: Optional[Decimal] = Field(None, ge=0)  # Add MRP!
    discount_percent: Decimal = Field(default=Decimal("0.00"), ge=0, le=100)
    discount_amount: Decimal = Field(default=Decimal("0.00"), ge=0)
    tax_percent: Optional[Decimal] = Field(None, ge=0)
    tax_amount: Optional[Decimal] = Field(None, ge=0)
    gst_type: Optional[str] = Field(default="CGST/SGST")  # Add GST type!
    uom: Optional[str] = None  # Add UOM!
    pack_type: Optional[str] = None  # Add pack_type!
    pack_size: Optional[str] = None  # Add pack_size!
    product_code: Optional[str] = None  # Add product_code!
    
    # Computed fields
    line_total: Optional[Decimal] = None
    
    @validator('line_total', always=True)
    def calculate_line_total(cls, v, values):
        """Calculate line total"""
        quantity = values.get('quantity', 0)
        unit_price = values.get('unit_price', Decimal("0"))
        discount_amount = values.get('discount_amount', Decimal("0"))
        tax_amount = values.get('tax_amount') or Decimal("0")  # Handle None
        
        subtotal = quantity * unit_price
        return subtotal - discount_amount + tax_amount


class OrderItemCreate(OrderItemBase):
    """Schema for creating order item"""
    # Override to make tax fields optional for creation
    tax_percent: Optional[Decimal] = Field(default=Decimal("0.00"), ge=0)
    tax_amount: Optional[Decimal] = Field(default=Decimal("0.00"), ge=0)


class OrderItemResponse(OrderItemBase):
    """Schema for order item response"""
    order_item_id: int
    order_id: int
    product_name: str
    product_code: str
    batch_number: Optional[str]
    expiry_date: Optional[date] = None
    
    class Config:
        from_attributes = True


class OrderBase(BaseModel):
    """Base order model"""
    customer_id: int = Field(..., gt=0)
    order_date: date = Field(default_factory=date.today)
    delivery_date: Optional[date] = None
    
    # Billing details
    billing_name: Optional[str] = Field(None, max_length=200)
    billing_address: Optional[str] = Field(None, max_length=500)
    billing_gstin: Optional[str] = Field(None, pattern=r"^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$")
    
    # Shipping details
    shipping_name: Optional[str] = Field(None, max_length=200)
    shipping_address: Optional[str] = Field(None, max_length=500)
    shipping_phone: Optional[str] = Field(None, pattern=r"^[0-9]{10}$")
    
    # Order details
    order_type: str = Field(default="sales", pattern=r"^(sales|return|replacement|regular)$")
    payment_terms: Optional[str] = Field(default="credit", pattern=r"^(cash|credit|advance)$")
    notes: Optional[str] = Field(None, max_length=500)
    
    # Discount and charges
    discount_percent: Decimal = Field(default=Decimal("0.00"), ge=0, le=100)
    discount_amount: Decimal = Field(default=Decimal("0.00"), ge=0)
    delivery_charges: Decimal = Field(default=Decimal("0.00"), ge=0)
    other_charges: Decimal = Field(default=Decimal("0.00"), ge=0)


class OrderCreate(OrderBase):
    """Schema for creating an order"""
    org_id: Optional[UUID] = Field(None, description="Organization ID - optional, derived from token")
    items: List[OrderItemCreate] = Field(..., min_items=1)
    
    @validator('delivery_date')
    def validate_delivery_date(cls, v, values):
        """Ensure delivery date is not before order date"""
        order_date = values.get('order_date')
        if v and order_date and v < order_date:
            raise ValueError('Delivery date cannot be before order date')
        return v


class OrderUpdate(BaseModel):
    """Schema for updating order"""
    delivery_date: Optional[date] = None
    billing_name: Optional[str] = Field(None, max_length=200)
    billing_address: Optional[str] = Field(None, max_length=500)
    shipping_name: Optional[str] = Field(None, max_length=200)
    shipping_address: Optional[str] = Field(None, max_length=500)
    shipping_phone: Optional[str] = Field(None, pattern=r"^[0-9]{10}$")
    notes: Optional[str] = Field(None, max_length=500)
    
    # Status updates
    order_status: Optional[str] = Field(None, pattern=r"^(draft|confirmed|processing|packed|shipped|delivered|cancelled)$")


class OrderResponse(OrderBase):
    """Schema for order response"""
    order_id: int
    org_id: UUID
    order_number: str
    order_status: str
    
    # Customer details
    customer_name: str
    customer_code: str
    customer_phone: str
    
    # Financial summary
    subtotal_amount: Decimal
    tax_amount: Decimal
    total_amount: Decimal
    paid_amount: Decimal
    balance_amount: Decimal
    
    # Items
    items: List[OrderItemResponse]
    
    # Timestamps
    created_at: datetime
    updated_at: datetime
    confirmed_at: Optional[datetime]
    delivered_at: Optional[datetime]
    
    class Config:
        from_attributes = True


class OrderListResponse(BaseModel):
    """Schema for order list with pagination"""
    total: int
    page: int
    per_page: int
    orders: List[OrderResponse]


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
    
    # Financial details
    subtotal_amount: Decimal
    tax_amount: Decimal
    total_amount: Decimal
    
    # PDF details
    pdf_url: Optional[str] = None
    
    class Config:
        from_attributes = True


class DeliveryUpdate(BaseModel):
    """Schema for delivery update"""
    delivered_by: str = Field(..., min_length=1, max_length=100)
    delivery_notes: Optional[str] = Field(None, max_length=500)
    delivery_proof: Optional[str] = Field(None, description="Base64 encoded signature/photo")


class ReturnRequest(BaseModel):
    """Schema for order return request"""
    return_reason: str = Field(..., min_length=1, max_length=500)
    return_type: str = Field(..., pattern=r"^(full|partial)$")
    items: Optional[List[dict]] = Field(None, description="Items to return for partial return")
    refund_method: str = Field(..., pattern=r"^(credit_note|cash|bank_transfer|adjustment)$")


class OrderStatusHistory(BaseModel):
    """Schema for order status history"""
    status: str
    changed_at: datetime
    changed_by: Optional[str]
    notes: Optional[str]
    
    class Config:
        from_attributes = True


class OrderDashboard(BaseModel):
    """Schema for order dashboard stats"""
    total_orders: int
    pending_orders: int
    processing_orders: int
    delivered_orders: int
    
    today_orders: int
    today_amount: Decimal
    
    week_orders: int
    week_amount: Decimal
    
    month_orders: int
    month_amount: Decimal
    
    top_products: List[dict]
    recent_orders: List[OrderResponse]