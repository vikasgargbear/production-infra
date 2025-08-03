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
        # Direct query with correct column names
        if q:
            # Search with filter
            result = db.execute(text("""
                SELECT 
                    product_id,
                    product_name as name,
                    brand,
                    manufacturer,
                    hsn_code,
                    gst_percentage as gst_rate,
                    0 as mrp,
                    0 as sale_rate,
                    0 as purchase_rate,
                    0 as current_stock,
                    'PCS' as unit_of_measure,
                    'General' as category
                FROM inventory.products
                WHERE org_id = :org_id
                    AND (product_name ILIKE :search 
                         OR brand ILIKE :search 
                         OR manufacturer ILIKE :search
                         OR hsn_code ILIKE :search)
                    AND is_active = true
                ORDER BY product_name
                LIMIT :limit OFFSET :offset
            """), {
                "org_id": DEFAULT_ORG_ID,
                "search": f"%{q}%",
                "limit": limit,
                "offset": offset
            })
        else:
            # Get all products
            result = db.execute(text("""
                SELECT 
                    product_id,
                    product_name as name,
                    brand,
                    manufacturer,
                    hsn_code,
                    gst_percentage as gst_rate,
                    0 as mrp,
                    0 as sale_rate,
                    0 as purchase_rate,
                    0 as current_stock,
                    'PCS' as unit_of_measure,
                    'General' as category
                FROM inventory.products
                WHERE org_id = :org_id
                    AND is_active = true
                ORDER BY product_name
                LIMIT :limit OFFSET :offset
            """), {
                "org_id": DEFAULT_ORG_ID,
                "limit": limit,
                "offset": offset
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
    except Exception as e:
        logger.error(f"Product search failed: {str(e)}")
        # Return empty list on error rather than 500
        return []

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
        # Handle composition - could be dict or string
        composition_value = product.get("composition", "")
        if isinstance(composition_value, dict):
            # Extract active ingredient for generic_name
            generic_name_default = composition_value.get("active", "")
        else:
            generic_name_default = str(composition_value) if composition_value else ""
        
        product_data = {
            "org_id": DEFAULT_ORG_ID,
            "product_code": product.get("product_code") or f"PROD{random.randint(100000, 999999)}",
            "product_name": product.get("product_name"),
            "generic_name": product.get("generic_name") or generic_name_default,
            "brand": product.get("brand") or product.get("brand_name") or product.get("manufacturer"),
            "manufacturer": product.get("manufacturer"),
            "composition": json.dumps(_format_composition(composition_value)),
            "category_id": None,  # Let it be NULL if no categories exist
            "hsn_code": product.get("hsn_code") or "3004",
            "gst_percentage": product.get("gst_percentage") or product.get("gst_rate") or 12,
            "pack_config": json.dumps({}),  # Default empty JSONB
            "base_uom_id": None,  # Let it be NULL if no UOMs exist
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
        # Build INSERT with only non-NULL foreign keys
        columns = ["org_id", "product_code", "product_name", "generic_name",
                  "brand", "manufacturer", "composition", "hsn_code", 
                  "gst_percentage", "pack_config", "maintain_batch", 
                  "maintain_expiry", "is_active", "created_at", "updated_at"]
        values = [":org_id", ":product_code", ":product_name", ":generic_name",
                 ":brand", ":manufacturer", "CAST(:composition AS jsonb)", ":hsn_code",
                 ":gst_percentage", "CAST(:pack_config AS jsonb)", ":maintain_batch",
                 ":maintain_expiry", ":is_active", "CURRENT_TIMESTAMP", "CURRENT_TIMESTAMP"]
        
        # Only add foreign keys if they're not None
        if product_data.get("category_id") is not None:
            columns.insert(7, "category_id")
            values.insert(7, ":category_id")
        
        if product_data.get("base_uom_id") is not None:
            columns.insert(-2, "base_uom_id")
            values.insert(-2, ":base_uom_id")
        
        result = db.execute(text(f"""
            INSERT INTO inventory.products ({', '.join(columns)})
            VALUES ({', '.join(values)})
            RETURNING product_id, product_code, product_name
        """), product_data)
        
        created = result.fetchone()
        
        # If quantity OR price is provided, create an initial batch (simplified workflow for non-technical users)
        if (product.get("quantity_available") and float(product.get("quantity_available", 0)) > 0) or \
           (product.get("mrp") and float(product.get("mrp", 0)) > 0):
            
            # Use provided prices or set defaults
            mrp = float(product.get("mrp", 100))  # Default MRP ₹100
            sale_price = float(product.get("sale_price", 0)) or float(product.get("selling_price", 0)) or (mrp * 0.8)  # 20% discount from MRP
            cost_price = float(product.get("cost_price", 0)) or float(product.get("purchase_price", 0)) or (sale_price * 0.6)  # 40% margin
            quantity = float(product.get("quantity_available", 100))  # Default 100 units
            
            # Calculate expiry date if not provided (default 1 year from now)
            from datetime import datetime, timedelta
            if product.get("expiry_date"):
                expiry_date = product.get("expiry_date")
            else:
                expiry_date = (datetime.now() + timedelta(days=365)).strftime("%Y-%m-%d")
            
            batch_data = {
                "org_id": DEFAULT_ORG_ID,
                "product_id": created.product_id,
                "batch_number": product.get("batch_number") or f"BATCH{random.randint(100000, 999999)}",
                "manufacturing_date": product.get("manufacturing_date") or datetime.now().strftime("%Y-%m-%d"),
                "expiry_date": expiry_date,
                "initial_quantity": quantity,
                "quantity_available": quantity,
                "cost_per_unit": cost_price,
                "sale_price_per_unit": sale_price,
                "mrp_per_unit": mrp
            }
            
            try:
                batch_result = db.execute(text("""
                    INSERT INTO inventory.batches (
                        org_id, product_id, batch_number,
                        manufacturing_date, expiry_date,
                        initial_quantity, quantity_available,
                        cost_per_unit, sale_price_per_unit, mrp_per_unit,
                        created_at, updated_at
                    ) VALUES (
                        :org_id, :product_id, :batch_number,
                        :manufacturing_date, :expiry_date,
                        :initial_quantity, :quantity_available,
                        :cost_per_unit, :sale_price_per_unit, :mrp_per_unit,
                        CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
                    ) RETURNING batch_id
                """), batch_data)
                
                batch = batch_result.fetchone()
                logger.info(f"Initial batch created for product {created.product_code}: Batch ID {batch.batch_id}, MRP: {mrp}, Selling: {sale_price}")
            except Exception as batch_error:
                logger.warning(f"Could not create initial batch: {str(batch_error)}")
                # Don't fail product creation if batch fails
        
        db.commit()
        
        logger.info(f"Product created: {created.product_code} - {created.product_name}")
        
        return {
            "product_id": created.product_id,
            "product_code": created.product_code,
            "product_name": created.product_name,
            "message": "Product created successfully with initial stock" if product.get("quantity_available") else "Product created successfully"
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