"""
Product schemas for enterprise pharma system
Handles GST-compliant product management with batch tracking
"""
from typing import Optional, List, Literal
from decimal import Decimal
from datetime import datetime
from uuid import UUID
from pydantic import BaseModel, Field, model_validator, ConfigDict


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
    """Safe draft product identity accepted by the legacy API boundary.

    Tax, Drugs Rules schedules, NDPS classification, Schedule H2 traceability,
    composition, pricing and stock are intentionally absent. Those facts need
    their own reviewed, versioned commands and must never be inferred here.
    """

    product_name: str = Field(..., min_length=1, max_length=255)
    product_code: Optional[str] = Field(
        None,
        min_length=1,
        max_length=64,
        pattern=r"^[A-Za-z0-9][A-Za-z0-9._/-]*$",
    )
    generic_name: Optional[str] = Field(None, max_length=255)
    brand: Optional[str] = Field(None, max_length=100)
    manufacturer: Optional[str] = Field(None, max_length=200)
    category_id: Optional[int] = Field(None, gt=0)
    type_id: Optional[int] = Field(None, gt=0)
    product_kind: Literal["medicine", "medical_device", "consumable"] = "medicine"
    reorder_level: Optional[Decimal] = Field(None, ge=0)
    min_stock_quantity: Optional[Decimal] = Field(None, ge=0)
    max_stock_quantity: Optional[Decimal] = Field(None, ge=0)
    maintain_batch: bool = True
    maintain_expiry: bool = True

    model_config = ConfigDict(
        extra="forbid",
        from_attributes=True,
        str_strip_whitespace=True,
    )

    @model_validator(mode="after")
    def validate_stock_levels(self):
        if (
            self.min_stock_quantity is not None
            and self.max_stock_quantity is not None
            and self.min_stock_quantity > self.max_stock_quantity
        ):
            raise ValueError("min_stock_quantity cannot exceed max_stock_quantity")
        return self


class ProductCreate(ProductBase):
    """Create a non-saleable product draft; code generation is server-owned."""


class ProductUpdate(BaseModel):
    """Update mutable draft identity fields only."""

    product_name: Optional[str] = Field(None, min_length=1, max_length=255)
    generic_name: Optional[str] = Field(None, max_length=255)
    brand: Optional[str] = Field(None, max_length=100)
    manufacturer: Optional[str] = Field(None, max_length=200)
    category_id: Optional[int] = Field(None, gt=0)
    type_id: Optional[int] = Field(None, gt=0)
    product_kind: Optional[Literal["medicine", "medical_device", "consumable"]] = None
    reorder_level: Optional[Decimal] = Field(None, ge=0)
    min_stock_quantity: Optional[Decimal] = Field(None, ge=0)
    max_stock_quantity: Optional[Decimal] = Field(None, ge=0)
    maintain_batch: Optional[bool] = None
    maintain_expiry: Optional[bool] = None

    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    @model_validator(mode="after")
    def validate_update(self):
        if not self.model_fields_set:
            raise ValueError("At least one product field is required")
        if (
            self.min_stock_quantity is not None
            and self.max_stock_quantity is not None
            and self.min_stock_quantity > self.max_stock_quantity
        ):
            raise ValueError("min_stock_quantity cannot exceed max_stock_quantity")
        return self


class ProductMutationResponse(BaseModel):
    """Stable response for draft product mutations."""

    product_id: int
    product_code: str
    product_name: str
    lifecycle_status: Literal["draft"] = "draft"
    message: str

    model_config = ConfigDict(extra="forbid")


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
