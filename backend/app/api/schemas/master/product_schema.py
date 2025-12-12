"""
Product schemas for enterprise pharma system
Handles GST-compliant product management with batch tracking
"""
from typing import Optional, List, Annotated
from decimal import Decimal
from datetime import datetime, date
from uuid import UUID
from pydantic import BaseModel, Field, field_validator, model_validator, ConfigDict
import re


# =============================================================================
# PACK CONFIGURATION
# =============================================================================

class ProductPackConfig(BaseModel):
    """Pack configuration for pharmaceutical products"""
    
    pack_input: Optional[str] = Field(
        None, 
        description="Raw user input like '10*10' or '1*100ML'",
        examples=["10*10", "1*100ML", "30*1"]
    )
    pack_quantity: Optional[int] = Field(
        None, 
        ge=1,
        description="Quantity per unit (first number)",
        examples=[10, 30]
    )
    pack_multiplier: Optional[int] = Field(
        None, 
        ge=1,
        description="Multiplier or units per box (second number)",
        examples=[10, 1]
    )
    pack_unit_type: Optional[str] = Field(
        None, 
        max_length=10,
        description="Unit type: ML, GM, MG, L, KG",
        examples=["ML", "GM", "TAB"]
    )
    unit_count: Optional[int] = Field(None, ge=1, description="Units per package")
    unit_measurement: Optional[str] = Field(None, description="Measurement with unit like '100ML'")
    packages_per_box: Optional[int] = Field(None, ge=1, description="Packages per box")

    model_config = ConfigDict(from_attributes=True)


# =============================================================================
# PRODUCT SCHEMAS
# =============================================================================

class ProductBase(BaseModel):
    """Base product model with common fields"""
    
    product_name: str = Field(
        ..., 
        min_length=1, 
        max_length=255,
        description="Product name as per label",
        examples=["Paracetamol 500mg Tablets"]
    )
    product_code: Optional[str] = Field(
        None, 
        max_length=50,
        description="Unique product code (auto-generated if not provided)",
        examples=["PRD-001", "MED-12345"]
    )
    
    # Manufacturer & Classification
    manufacturer: str = Field(
        ..., 
        min_length=1, 
        max_length=200,
        description="Manufacturer/Brand name",
        examples=["Sun Pharma", "Cipla"]
    )
    brand: Optional[str] = Field(None, max_length=100, description="Brand name if different")
    generic_name: Optional[str] = Field(
        None, 
        max_length=255,
        description="Generic/Salt composition",
        examples=["Paracetamol", "Amoxicillin Trihydrate"]
    )
    category_id: Optional[int] = Field(None, description="Product category ID")
    
    # Pharma Classification
    product_type: Optional[str] = Field(
        "medicine",
        description="Type: medicine, surgical, cosmetic, fmcg, equipment",
        examples=["medicine", "surgical"]
    )
    product_class: Optional[str] = Field(
        None,
        description="Class: tablet, capsule, syrup, injection, cream, drops",
        examples=["tablet", "syrup"]
    )
    schedule: Optional[str] = Field(
        None,
        description="Drug schedule: H, H1, X, G, OTC",
        examples=["H", "H1", "OTC"]
    )
    is_controlled: bool = Field(
        default=False,
        description="Whether this is a controlled substance"
    )
    requires_prescription: bool = Field(
        default=False,
        description="Whether prescription is required"
    )
    
    # GST & Tax
    hsn_code: str = Field(
        ..., 
        min_length=4, 
        max_length=8,
        description="8-digit HSN/SAC code for GST",
        examples=["30049099", "3004"]
    )
    gst_percent: Decimal = Field(
        ..., 
        ge=0, 
        le=28,
        description="GST rate percentage (0, 5, 12, 18, 28)",
        examples=[12, 18]
    )
    
    # Pricing
    mrp: Decimal = Field(
        ..., 
        ge=0,
        description="Maximum Retail Price (inclusive of taxes)",
        examples=[150.00, 299.50]
    )
    sale_price: Decimal = Field(
        ..., 
        ge=0,
        description="Default sale price",
        examples=[140.00, 275.00]
    )
    cost_price: Decimal = Field(
        ..., 
        ge=0,
        description="Purchase/cost price",
        examples=[100.00, 200.00]
    )
    ptr: Optional[Decimal] = Field(None, ge=0, description="Price to Retailer")
    pts: Optional[Decimal] = Field(None, ge=0, description="Price to Stockist")
    
    # Units & Packing
    base_unit: str = Field(
        ..., 
        max_length=20,
        description="Base inventory unit: Tablet, ML, Gm, Piece",
        examples=["Tablet", "ML", "Gm"]
    )
    sale_unit: Optional[str] = Field(
        None, 
        max_length=20,
        description="Sale unit: Strip, Bottle, Vial, Box",
        examples=["Strip", "Bottle"]
    )
    conversion_factor: Decimal = Field(
        default=Decimal("1"),
        ge=0,
        description="Conversion from sale_unit to base_unit"
    )
    
    # Inventory Settings
    reorder_level: int = Field(
        default=10,
        ge=0,
        description="Minimum stock level for reorder alert"
    )
    minimum_order_qty: int = Field(
        default=1,
        ge=1,
        description="Minimum order quantity"
    )
    
    # Product Info
    storage_conditions: Optional[str] = Field(
        None,
        max_length=100,
        description="Storage: Store below 25°C, Refrigerate",
        examples=["Store below 25°C", "Keep refrigerated"]
    )
    shelf_life_months: Optional[int] = Field(
        None,
        ge=0,
        description="Shelf life in months from manufacture"
    )
    
    model_config = ConfigDict(
        from_attributes=True,
        str_strip_whitespace=True
    )


class ProductCreate(ProductBase):
    """Schema for creating a new product"""
    
    # Initial inventory (optional)
    initial_quantity: int = Field(0, ge=0, description="Initial stock quantity")
    batch_number: Optional[str] = Field(None, max_length=50, description="Initial batch number")
    expiry_date: Optional[date] = Field(None, description="Expiry date for initial batch")
    
    # Pack configuration
    pack_input: Optional[str] = Field(None, examples=["10*10", "1*100ML"])
    pack_quantity: Optional[int] = Field(None, ge=1)
    pack_multiplier: Optional[int] = Field(None, ge=1)
    pack_unit_type: Optional[str] = Field(None, max_length=10)
    unit_count: Optional[int] = Field(None, ge=1)
    unit_measurement: Optional[str] = None
    packages_per_box: Optional[int] = Field(None, ge=1)
    
    @field_validator("product_code", mode="before")
    @classmethod
    def generate_product_code(cls, v, info):
        """Auto-generate product code if not provided"""
        if not v:
            import time
            return f"PRD{int(time.time()) % 1000000}"
        return v
    
    @field_validator("hsn_code")
    @classmethod
    def validate_hsn_code(cls, v):
        """Validate HSN code is numeric"""
        if v and not v.isdigit():
            raise ValueError("HSN code must contain only digits")
        return v


class ProductUpdate(BaseModel):
    """Schema for updating product - all fields optional"""
    
    product_name: Optional[str] = Field(None, min_length=1, max_length=255)
    manufacturer: Optional[str] = Field(None, min_length=1, max_length=200)
    brand: Optional[str] = Field(None, max_length=100)
    generic_name: Optional[str] = Field(None, max_length=255)
    category_id: Optional[int] = None
    
    product_type: Optional[str] = None
    product_class: Optional[str] = None
    schedule: Optional[str] = None
    is_controlled: Optional[bool] = None
    requires_prescription: Optional[bool] = None
    
    hsn_code: Optional[str] = Field(None, min_length=4, max_length=8)
    gst_percent: Optional[Decimal] = Field(None, ge=0, le=28)
    
    mrp: Optional[Decimal] = Field(None, ge=0)
    sale_price: Optional[Decimal] = Field(None, ge=0)
    cost_price: Optional[Decimal] = Field(None, ge=0)
    ptr: Optional[Decimal] = Field(None, ge=0)
    pts: Optional[Decimal] = Field(None, ge=0)
    
    base_unit: Optional[str] = Field(None, max_length=20)
    sale_unit: Optional[str] = Field(None, max_length=20)
    conversion_factor: Optional[Decimal] = Field(None, ge=0)
    
    reorder_level: Optional[int] = Field(None, ge=0)
    minimum_order_qty: Optional[int] = Field(None, ge=1)
    
    storage_conditions: Optional[str] = Field(None, max_length=100)
    shelf_life_months: Optional[int] = Field(None, ge=0)
    
    is_active: Optional[bool] = None
    
    # Pack configuration
    pack_input: Optional[str] = None
    pack_quantity: Optional[int] = None
    pack_multiplier: Optional[int] = None
    pack_unit_type: Optional[str] = None
    unit_count: Optional[int] = None
    unit_measurement: Optional[str] = None
    packages_per_box: Optional[int] = None

    model_config = ConfigDict(str_strip_whitespace=True)


class ProductResponse(ProductBase):
    """Schema for product response with all fields"""
    
    product_id: int = Field(..., description="Unique product ID")
    org_id: UUID = Field(..., description="Organization ID")
    
    # Pack configuration (computed)
    pack_config: Optional[ProductPackConfig] = None
    
    # Stock summary (from joins)
    current_stock: int = Field(default=0, description="Current available stock")
    reserved_stock: int = Field(default=0, description="Reserved/allocated stock")
    total_batches: int = Field(default=0, description="Number of active batches")
    
    # Metadata
    is_active: bool = Field(default=True)
    created_at: datetime
    updated_at: Optional[datetime] = None
    created_by: Optional[int] = None

    model_config = ConfigDict(from_attributes=True)


class ProductSummary(BaseModel):
    """Lightweight product for dropdowns/autocomplete"""
    
    product_id: int
    product_name: str
    product_code: Optional[str] = None
    manufacturer: Optional[str] = None
    mrp: Optional[Decimal] = None
    sale_price: Optional[Decimal] = None
    gst_percent: Optional[Decimal] = None
    current_stock: int = 0
    base_unit: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class ProductListResponse(BaseModel):
    """Paginated product list response"""
    
    total: int = Field(..., description="Total products matching filter")
    page: int = Field(..., ge=1)
    per_page: int = Field(..., ge=1, le=1000)
    products: List[ProductResponse] = Field(default_factory=list)


class ProductSearch(BaseModel):
    """Product search/filter parameters"""
    
    q: Optional[str] = Field(None, min_length=1, description="Search query")
    category_id: Optional[int] = None
    manufacturer: Optional[str] = None
    product_type: Optional[str] = None
    schedule: Optional[str] = None
    is_active: Optional[bool] = True
    low_stock: Optional[bool] = Field(None, description="Only show low stock items")
    limit: int = Field(default=10, ge=1, le=100)
    offset: int = Field(default=0, ge=0)


# Legacy alias for backward compatibility
Product = ProductSummary