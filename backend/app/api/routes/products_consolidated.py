"""
Products API Routes - Consolidated
Complete product management with search and CRUD operations
"""
from fastapi import APIRouter, Depends, Query, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import text
from typing import List, Optional
from datetime import datetime
from decimal import Decimal
import logging
import random
import json

from ...core.database import get_db
from ...core.config import settings
from ..schemas.product_schema import Product, ProductCreate, ProductUpdate, ProductResponse, ProductSearch

logger = logging.getLogger(__name__)

router = APIRouter()

# Default org_id - should come from auth in production
DEFAULT_ORG_ID = "ad808530-1ddb-4377-ab20-67bef145d80d"

def _format_composition(composition_value):
    """Convert composition to JSONB format for database"""
    if isinstance(composition_value, dict):
        # Already in correct format
        return composition_value
    elif isinstance(composition_value, str) and composition_value:
        # Convert string to dict format
        return {"active": composition_value}
    return {}

@router.get("/search", response_model=List[Product])
async def search_products(
    q: str = Query("", description="Search query"),
    limit: int = Query(10, ge=1, le=100),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db)
):
    """
    Search products by name, brand, or HSN
    """
    try:
        # Try PostgreSQL function first if it exists
        result = db.execute(
            """
            SELECT * FROM api.search_products(
                p_search_term := :search_term,
                p_limit := :limit
            )
            """,
            {"search_term": q, "limit": limit}
        )
        
        products = []
        for row in result:
            products.append({
                "product_id": row.product_id,
                "name": row.name,
                "brand": row.brand,
                "category": row.category,
                "hsn_code": row.hsn_code,
                "gst_rate": float(row.gst_rate) if row.gst_rate else 0,
                "mrp": float(row.mrp) if row.mrp else 0,
                "sale_rate": float(row.sale_rate) if row.sale_rate else 0,
                "purchase_rate": float(row.purchase_rate) if row.purchase_rate else 0,
                "current_stock": row.current_stock or 0,
                "unit_of_measure": row.unit_of_measure or "PCS"
            })
        
        return products
    except Exception as e:
        # Fallback to direct query if function doesn't exist
        logger.warning(f"PostgreSQL function failed, using direct query: {e}")
        
        result = db.execute(text("""
            SELECT 
                product_id,
                product_name as name,
                brand_name as brand,
                'General' as category,
                hsn_code,
                gst_rate,
                mrp,
                sale_price as sale_rate,
                purchase_price as purchase_rate,
                0 as current_stock,
                unit_of_measure
            FROM inventory.products
            WHERE org_id = :org_id
                AND (product_name ILIKE :search OR brand_name ILIKE :search)
            LIMIT :limit
        """), {
            "org_id": DEFAULT_ORG_ID,
            "search": f"%{q}%",
            "limit": limit
        })
        
        products = []
        for row in result:
            products.append({
                "product_id": row.product_id,
                "name": row.name,
                "brand": row.brand,
                "category": row.category,
                "hsn_code": row.hsn_code,
                "gst_rate": float(row.gst_rate) if row.gst_rate else 0,
                "mrp": float(row.mrp) if row.mrp else 0,
                "sale_rate": float(row.sale_rate) if row.sale_rate else 0,
                "purchase_rate": float(row.purchase_rate) if row.purchase_rate else 0,
                "current_stock": row.current_stock or 0,
                "unit_of_measure": row.unit_of_measure or "PCS"
            })
        
        return products

@router.post("/", status_code=status.HTTP_201_CREATED)
async def create_product(
    product: dict,  # Accept dict to handle flexible fields
    db: Session = Depends(get_db)
):
    """
    Create a new product
    """
    try:
        # Map frontend fields to database fields (matching actual table columns)
        product_data = {
            "org_id": DEFAULT_ORG_ID,
            "product_code": product.get("product_code") or f"PROD{random.randint(100000, 999999)}",
            "product_name": product.get("product_name"),
            "generic_name": product.get("generic_name") or product.get("composition", ""),
            "brand": product.get("brand") or product.get("brand_name") or product.get("manufacturer"),
            "manufacturer": product.get("manufacturer"),
            "composition": json.dumps(_format_composition(product.get("composition"))),
            "category_id": product.get("category_id") or 1,  # Default category
            "hsn_code": product.get("hsn_code") or "3004",
            "gst_percentage": product.get("gst_percentage") or product.get("gst_rate") or 12,
            "pack_config": json.dumps({}),  # Default empty JSONB
            "base_uom_id": 1,  # Default UOM
            "maintain_batch": True,
            "maintain_expiry": True,
            "is_active": product.get("is_active", True)
        }
        
        # Check if product code already exists
        exists = db.execute(text("""
            SELECT 1 FROM inventory.products 
            WHERE product_code = :product_code AND org_id = :org_id
        """), {"product_code": product_data["product_code"], "org_id": DEFAULT_ORG_ID}).scalar()
        
        if exists:
            # Return existing product instead of error
            result = db.execute(text("""
                SELECT * FROM inventory.products
                WHERE product_code = :product_code AND org_id = :org_id
            """), {"product_code": product_data["product_code"], "org_id": DEFAULT_ORG_ID})
            
            existing = result.fetchone()
            return {
                "product_id": existing.product_id,
                "product_code": existing.product_code,
                "product_name": existing.product_name,
                "message": "Product already exists"
            }
        
        # Create product
        result = db.execute(text("""
            INSERT INTO inventory.products (
                org_id, product_code, product_name, generic_name,
                brand, manufacturer, composition, category_id, 
                hsn_code, gst_percentage, pack_config, base_uom_id,
                maintain_batch, maintain_expiry,
                is_active, created_at, updated_at
            ) VALUES (
                :org_id, :product_code, :product_name, :generic_name,
                :brand, :manufacturer, CAST(:composition AS jsonb), :category_id,
                :hsn_code, :gst_percentage, CAST(:pack_config AS jsonb), :base_uom_id,
                :maintain_batch, :maintain_expiry,
                :is_active, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
            ) RETURNING product_id, product_code, product_name
        """), product_data)
        
        created = result.fetchone()
        db.commit()
        
        logger.info(f"Product created: {created.product_code} - {created.product_name}")
        
        return {
            "product_id": created.product_id,
            "product_code": created.product_code,
            "product_name": created.product_name,
            "message": "Product created successfully"
        }
        
    except Exception as e:
        db.rollback()
        logger.error(f"Error creating product: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create product: {str(e)}"
        )

@router.get("/{product_id}")
async def get_product(
    product_id: int,
    db: Session = Depends(get_db)
):
    """Get product by ID"""
    try:
        result = db.execute(text("""
            SELECT * FROM inventory.products
            WHERE product_id = :product_id AND org_id = :org_id
        """), {"product_id": product_id, "org_id": DEFAULT_ORG_ID})
        
        product = result.fetchone()
        if not product:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Product {product_id} not found"
            )
        
        return dict(product._mapping)
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting product: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get product: {str(e)}"
        )

@router.put("/{product_id}")
async def update_product(
    product_id: int,
    product: dict,
    db: Session = Depends(get_db)
):
    """Update product"""
    try:
        # Build update query dynamically
        update_fields = []
        params = {"product_id": product_id, "org_id": DEFAULT_ORG_ID}
        
        field_mapping = {
            "product_name": "product_name",
            "brand": "brand_name",
            "brand_name": "brand_name",
            "manufacturer": "manufacturer",
            "hsn_code": "hsn_code",
            "gst_percentage": "gst_rate",
            "gst_rate": "gst_rate",
            "mrp": "mrp",
            "sale_price": "sale_price",
            "purchase_price": "purchase_price",
            "is_active": "is_active"
        }
        
        for frontend_field, db_field in field_mapping.items():
            if frontend_field in product:
                update_fields.append(f"{db_field} = :{db_field}")
                params[db_field] = product[frontend_field]
        
        if not update_fields:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="No fields to update"
            )
        
        update_fields.append("updated_at = CURRENT_TIMESTAMP")
        
        query = f"""
            UPDATE inventory.products
            SET {', '.join(update_fields)}
            WHERE product_id = :product_id AND org_id = :org_id
            RETURNING product_id, product_code, product_name
        """
        
        result = db.execute(text(query), params)
        updated = result.fetchone()
        
        if not updated:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Product {product_id} not found"
            )
        
        db.commit()
        
        return {
            "product_id": updated.product_id,
            "product_code": updated.product_code,
            "product_name": updated.product_name,
            "message": "Product updated successfully"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error updating product: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to update product: {str(e)}"
        )