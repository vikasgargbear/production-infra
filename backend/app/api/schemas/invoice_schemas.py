"""
Optimized Invoice Pydantic Schemas
Fast validation, type-safe, auto-documented
"""
from pydantic import BaseModel, Field, validator, root_validator
from typing import List, Optional, Dict, Any
from decimal import Decimal
from datetime import date, datetime
from enum import Enum


class PaymentTerms(str, Enum):
    """Payment terms enumeration"""
    CASH = "cash"
    CREDIT = "credit"
    ADVANCE = "advance"
    COD = "cod"


class InvoiceStatus(str, Enum):
    """Invoice status enumeration"""
    DRAFT = "draft"
    PENDING = "pending"
    APPROVED = "approved"
    SENT = "sent"
    PAID = "paid"
    PARTIALLY_PAID = "partially_paid"
    OVERDUE = "overdue"
    CANCELLED = "cancelled"


class PaymentStatus(str, Enum):
    """Payment status enumeration"""
    PENDING = "pending"
    PARTIAL = "partial"
    PAID = "paid"
    REFUNDED = "refunded"


# ==================== REQUEST SCHEMAS ====================

class InvoiceItemCreate(BaseModel):
    """Invoice line item creation (optimized with Decimal)"""
    product_id: int = Field(gt=0, description="Product ID")
    quantity: Decimal = Field(gt=0, max_digits=10, decimal_places=3, description="Quantity")
    unit_price: Decimal = Field(ge=0, max_digits=12, decimal_places=2, description="Unit price")
    discount_percent: Decimal = Field(ge=0, le=100, default=Decimal('0'), max_digits=5, decimal_places=2)
    gst_percent: Decimal = Field(ge=0, le=100, default=Decimal('18'), max_digits=5, decimal_places=2)
    base_quantity: Optional[Decimal] = Field(None, gt=0, max_digits=10, decimal_places=3, 
                                             description="Billing quantity (accounts for free items)")
    hsn_code: Optional[str] = Field(None, max_length=20)
    batch_number: Optional[str] = Field(None, max_length=50)
    expiry_date: Optional[date] = None
    
    @validator('base_quantity', always=True)
    def default_base_quantity(cls, v, values):
        """Default base_quantity to quantity if not provided"""
        return v or values.get('quantity')
    
    @validator('unit_price')
    def validate_unit_price(cls, v):
        """Ensure unit price is reasonable"""
        if v > Decimal('1000000'):  # 10 lakh max per item
            raise ValueError("Unit price cannot exceed 10,00,000")
        return v
    
    class Config:
        json_encoders = {Decimal: str}
        schema_extra = {
            "example": {
                "product_id": 123,
                "quantity": "10.000",
                "unit_price": "150.50",
                "discount_percent": "5.00",
                "gst_percent": "18.00",
                "hsn_code": "30049099"
            }
        }


class CreateInvoiceRequest(BaseModel):
    """Create invoice request with full validation"""
    customer_id: int = Field(gt=0, description="Customer ID")
    items: List[InvoiceItemCreate] = Field(min_items=1, max_items=500, description="Invoice line items")
    invoice_date: Optional[date] = Field(default_factory=date.today)
    payment_terms: PaymentTerms = Field(default=PaymentTerms.CASH)
    due_days: Optional[int] = Field(default=0, ge=0, le=365, description="Days until payment due")
    
    # Optional charges
    freight_charges: Decimal = Field(default=Decimal('0'), ge=0, max_digits=10, decimal_places=2)
    delivery_charges: Decimal = Field(default=Decimal('0'), ge=0, max_digits=10, decimal_places=2)
    insurance_charges: Decimal = Field(default=Decimal('0'), ge=0, max_digits=10, decimal_places=2)
    other_charges: Decimal = Field(default=Decimal('0'), ge=0, max_digits=10, decimal_places=2)
    
    # Address IDs (optional, will use default if not provided)
    billing_address_id: Optional[int] = None
    shipping_address_id: Optional[int] = None
    
    # Payment details (optional)
    bank_account_id: Optional[int] = None
    reference_number: Optional[str] = Field(None, max_length=100)
    notes: Optional[str] = Field(None, max_length=1000)
    terms_and_conditions: Optional[str] = Field(None, max_length=2000)
    
    @validator('items')
    def validate_items(cls, v):
        """Ensure invoice has items"""
        if not v or len(v) == 0:
            raise ValueError("Invoice must have at least one item")
        
        # Check for duplicate products
        product_ids = [item.product_id for item in v]
        if len(product_ids) != len(set(product_ids)):
            raise ValueError("Duplicate products found in invoice items")
        
        return v
    
    @root_validator
    def validate_delivery_charges(cls, values):
        """freight_charges and delivery_charges are aliases"""
        freight = values.get('freight_charges', Decimal('0'))
        delivery = values.get('delivery_charges', Decimal('0'))
        
        # Use whichever is non-zero
        if delivery > 0:
            values['freight_charges'] = delivery
        
        return values
    
    class Config:
        json_encoders = {Decimal: str}
        schema_extra = {
            "example": {
                "customer_id": 45,
                "items": [
                    {
                        "product_id": 123,
                        "quantity": "10.000",
                        "unit_price": "150.50",
                        "discount_percent": "5.00",
                        "gst_percent": "18.00"
                    }
                ],
                "payment_terms": "cash",
                "freight_charges": "50.00",
                "notes": "Urgent delivery"
            }
        }


class UpdateInvoiceRequest(BaseModel):
    """Update invoice (partial updates allowed)"""
    invoice_status: Optional[InvoiceStatus] = None
    payment_status: Optional[PaymentStatus] = None
    notes: Optional[str] = Field(None, max_length=1000)
    reference_number: Optional[str] = Field(None, max_length=100)


# ==================== RESPONSE SCHEMAS ====================

class InvoiceItemResponse(BaseModel):
    """Invoice line item response"""
    item_id: int
    product_id: int
    product_name: Optional[str] = None
    quantity: Decimal
    unit_price: Decimal
    discount_percent: Decimal
    discount_amount: Decimal
    taxable_amount: Decimal
    gst_percent: Decimal
    cgst_amount: Decimal
    sgst_amount: Decimal
    igst_amount: Decimal
    line_total: Decimal
    hsn_code: Optional[str] = None
    
    class Config:
        orm_mode = True
        json_encoders = {Decimal: str}


class InvoiceTotals(BaseModel):
    """Invoice totals breakdown"""
    subtotal: Decimal
    discount_amount: Decimal
    taxable_amount: Decimal
    cgst_amount: Decimal
    sgst_amount: Decimal
    igst_amount: Decimal
    total_tax: Decimal
    freight_charges: Decimal
    other_charges: Decimal
    round_off: Decimal
    final_amount: Decimal
    
    class Config:
        json_encoders = {Decimal: str}


class InvoiceResponse(BaseModel):
    """Complete invoice response"""
    invoice_id: int
    invoice_number: str
    invoice_date: date
    due_date: Optional[date] = None
    
    # Customer info
    customer_id: int
    customer_name: str
    customer_gstin: Optional[str] = None
    
    # Status
    invoice_status: str
    payment_status: str
    
    # Amounts
    totals: InvoiceTotals
    
    # Items
    items: List[InvoiceItemResponse] = []
    
    # Metadata
    created_at: datetime
    created_by: Optional[int] = None
    updated_at: Optional[datetime] = None
    
    class Config:
        orm_mode = True
        json_encoders = {
            Decimal: str,
            date: lambda v: v.isoformat(),
            datetime: lambda v: v.isoformat()
        }


class InvoiceListItem(BaseModel):
    """Lightweight invoice for list view"""
    invoice_id: int
    invoice_number: str
    invoice_date: date
    customer_id: int
    customer_name: str
    final_amount: Decimal
    payment_status: str
    invoice_status: str
    created_at: datetime
    
    class Config:
        orm_mode = True
        json_encoders = {
            Decimal: str,
            date: lambda v: v.isoformat(),
            datetime: lambda v: v.isoformat()
        }


class InvoiceListResponse(BaseModel):
    """Paginated invoice list"""
    items: List[InvoiceListItem]
    total: int
    page: int
    page_size: int
    total_pages: int
    
    class Config:
        schema_extra = {
            "example": {
                "items": [],
                "total": 150,
                "page": 1,
                "page_size": 20,
                "total_pages": 8
            }
        }


class InvoiceNumberResponse(BaseModel):
    """Invoice number generation response"""
    invoice_number: str
    
    class Config:
        schema_extra = {
            "example": {
                "invoice_number": "INV-2025-00123"
            }
        }


class InvoiceStatsResponse(BaseModel):
    """Invoice statistics"""
    total_invoices: int
    total_amount: Decimal
    paid_amount: Decimal
    pending_amount: Decimal
    overdue_amount: Decimal
    
    class Config:
        json_encoders = {Decimal: str}


# ==================== CALCULATION SCHEMAS ====================

class CalculatedItem(BaseModel):
    """Item with calculated values (internal use)"""
    product_id: int
    quantity: Decimal
    unit_price: Decimal
    discount_percent: Decimal
    gst_percent: Decimal
    base_quantity: Decimal
    
    # Calculated fields
    line_total: Decimal
    discount_amount: Decimal
    taxable_amount: Decimal
    cgst_amount: Decimal
    sgst_amount: Decimal
    igst_amount: Decimal = Decimal('0')
    
    class Config:
        json_encoders = {Decimal: str}
