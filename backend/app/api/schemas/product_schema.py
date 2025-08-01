# Pydantic Models for Product API with New Pack Fields

from typing import Optional, List
from decimal import Decimal
from datetime import datetime
from pydantic import BaseModel, Field, validator

class ProductPackConfig(BaseModel):
    """Embedded pack configuration model"""
    pack_input: Optional[str] = Field(None, description="Raw user input like '10*10' or '1*100ML'")
    pack_quantity: Optional[int] = Field(None, description="Quantity per unit (first number)")
    pack_multiplier: Optional[int] = Field(None, description="Multiplier or units per box (second number)")
    pack_unit_type: Optional[str] = Field(None, description="Unit type like ML, GM, MG")
    unit_count: Optional[int] = Field(None, description="Units per package")
    unit_measurement: Optional[str] = Field(None, description="Measurement with unit like '100ML'")
    packages_per_box: Optional[int] = Field(None, description="Packages per box")

class ProductBase(BaseModel):
    """Base product fields shared across create/update"""
    product_name: str
    product_code: Optional[str] = None
    manufacturer: str
    hsn_code: str
    category: Optional[str] = None
    salt_composition: Optional[str] = None
    
    # Pricing
    mrp: Decimal = Field(..., ge=0)
    sale_price: Decimal = Field(..., ge=0)
    cost_price: Decimal = Field(..., ge=0)
    gst_percent: Decimal = Field(..., ge=0, le=100)
    
    # Units
    base_unit: str = Field(..., description="Base inventory unit (Tablet, ML, Gm)")
    sale_unit: Optional[str] = Field(None, description="Sale unit (Strip, Bottle, Vial)")

class ProductCreate(ProductBase):
    """Product creation request model"""
    # Initial inventory
    quantity_received: int = Field(0, ge=0)
    expiry_date: Optional[str] = Field(None, pattern=r'^\d{4}-\d{2}-\d{2}$')
    
    # Pack configuration
    pack_input: Optional[str] = None
    pack_quantity: Optional[int] = Field(None, ge=1)
    pack_multiplier: Optional[int] = Field(None, ge=1)
    pack_unit_type: Optional[str] = Field(None, max_length=10)
    unit_count: Optional[int] = Field(None, ge=1)
    unit_measurement: Optional[str] = None
    packages_per_box: Optional[int] = Field(None, ge=1)
    
    # Legacy fields (for backward compatibility)
    qty_per_strip: Optional[int] = None
    strips_per_box: Optional[int] = None
    pack_type: Optional[str] = None
    pack_size: Optional[str] = None
    pack_details: Optional[str] = None
    
    @validator('product_code', always=True)
    def generate_product_code(cls, v, values):
        if not v and 'product_name' in values:
            # Auto-generate product code if not provided
            import time
            return f"PRD{int(time.time()) % 1000000}"
        return v
    
    @validator('pack_input', always=True)
    def validate_pack_input(cls, v, values):
        """Ensure pack_input is set from pack_quantity if not provided"""
        if not v and 'pack_quantity' in values:
            qty = values.get('pack_quantity')
            multiplier = values.get('pack_multiplier')
            unit_type = values.get('pack_unit_type')
            
            if qty:
                if multiplier and unit_type:
                    v = f"{qty}*{multiplier}{unit_type}"
                elif multiplier:
                    v = f"{qty}*{multiplier}"
                else:
                    v = str(qty)
        return v

class ProductUpdate(BaseModel):
    """Product update request model - all fields optional"""
    product_name: Optional[str] = None
    manufacturer: Optional[str] = None
    hsn_code: Optional[str] = None
    category: Optional[str] = None
    salt_composition: Optional[str] = None
    
    # Pricing
    mrp: Optional[Decimal] = None
    sale_price: Optional[Decimal] = None
    cost_price: Optional[Decimal] = None
    gst_percent: Optional[Decimal] = None
    
    # Pack configuration
    pack_input: Optional[str] = None
    pack_quantity: Optional[int] = None
    pack_multiplier: Optional[int] = None
    pack_unit_type: Optional[str] = None
    unit_count: Optional[int] = None
    unit_measurement: Optional[str] = None
    packages_per_box: Optional[int] = None

class ProductResponse(ProductBase):
    """Product response model with all fields"""
    product_id: int
    org_id: str
    
    # Pack configuration
    pack_config: ProductPackConfig
    
    # Stock information
    stock_summary: Optional[dict] = None
    
    # Metadata
    is_active: bool = True
    created_at: datetime
    updated_at: datetime
    
    class Config:
        from_attributes = True
        
    @validator('pack_config', pre=True, always=True)
    def build_pack_config(cls, v, values):
        """Build pack_config from individual fields"""
        if isinstance(v, ProductPackConfig):
            return v
        if isinstance(v, dict):
            return ProductPackConfig(**v)
        
        # Build from ORM model fields or response data
        return ProductPackConfig(
            pack_input=values.get('pack_input'),
            pack_quantity=values.get('pack_quantity'),
            pack_multiplier=values.get('pack_multiplier'),
            pack_unit_type=values.get('pack_unit_type'),
            unit_count=values.get('unit_count'),
            unit_measurement=values.get('unit_measurement'),
            packages_per_box=values.get('packages_per_box')
        )

# Example usage in FastAPI endpoint:
"""
@router.post("/products", response_model=ProductResponse)
async def create_product(product: ProductCreate, db: Session = Depends(get_db)):
    # Create product with new pack fields
    db_product = Product(**product.dict())
    db.add(db_product)
    db.commit()
    db.refresh(db_product)
    return db_product
"""