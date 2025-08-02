"""
Products CRUD API Routes
Complete product management with create, read, update, delete operations
"""
from fastapi import APIRouter, Depends, Query, HTTPException, status
from sqlalchemy.orm import Session
from sqlalchemy import text
from typing import List, Optional
from datetime import datetime
from decimal import Decimal
import logging

from ...core.database import get_db
from ...core.config import DEFAULT_ORG_ID
from ..schemas.product_schema import ProductCreate, ProductUpdate, ProductResponse, ProductSearch

logger = logging.getLogger(__name__)

router = APIRouter()

@router.post("/", response_model=ProductResponse, status_code=status.HTTP_201_CREATED)
async def create_product(
    product: ProductCreate,
    db: Session = Depends(get_db)
):
    """
    Create a new product
    
    Required fields:
    - product_name: Name of the product
    - product_code: Unique product code
    - category_id: Product category
    - gst_rate: GST percentage
    - unit_of_measure: Unit (PCS, BOX, STRIP, etc.)
    """
    try:
        # Check if product code already exists
        exists = db.execute(text("""
            SELECT 1 FROM inventory.products 
            WHERE product_code = :product_code AND org_id = :org_id
        """), {"product_code": product.product_code, "org_id": DEFAULT_ORG_ID}).scalar()
        
        if exists:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Product with code {product.product_code} already exists"
            )
        
        # Create product
        result = db.execute(text("""
            INSERT INTO inventory.products (
                org_id, product_code, product_name, brand_name,
                manufacturer, composition, category_id, 
                hsn_code, gst_rate, unit_of_measure,
                pack_size, mrp, sale_price, purchase_price,
                min_stock_level, max_stock_level,
                is_active, created_at, updated_at
            ) VALUES (
                :org_id, :product_code, :product_name, :brand_name,
                :manufacturer, :composition, :category_id,
                :hsn_code, :gst_rate, :unit_of_measure,
                :pack_size, :mrp, :sale_price, :purchase_price,
                :min_stock_level, :max_stock_level,
                :is_active, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
            ) RETURNING product_id
        """), {
            "org_id": DEFAULT_ORG_ID,
            "product_code": product.product_code,
            "product_name": product.product_name,
            "brand_name": product.brand_name,
            "manufacturer": product.manufacturer,
            "composition": product.composition,
            "category_id": product.category_id,
            "hsn_code": product.hsn_code or "3004",  # Default pharma HSN
            "gst_rate": product.gst_rate,
            "unit_of_measure": product.unit_of_measure,
            "pack_size": product.pack_size or 1,
            "mrp": product.mrp,
            "sale_price": product.sale_price,
            "purchase_price": product.purchase_price,
            "min_stock_level": product.min_stock_level or 0,
            "max_stock_level": product.max_stock_level or 0,
            "is_active": product.is_active
        })
        
        product_id = result.scalar()
        db.commit()
        
        # Return created product
        return await get_product(product_id, db)
        
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error creating product: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to create product: {str(e)}"
        )

@router.get("/", response_model=List[ProductResponse])
async def list_products(
    search: Optional[str] = None,
    category_id: Optional[int] = None,
    is_active: Optional[bool] = True,
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db)
):
    """
    List all products with optional filters
    """
    try:
        query = """
            SELECT p.*, 
                   COALESCE(SUM(sb.quantity), 0) as current_stock,
                   c.category_name
            FROM inventory.products p
            LEFT JOIN inventory.stock_batches sb ON p.product_id = sb.product_id
            LEFT JOIN master.categories c ON p.category_id = c.category_id
            WHERE p.org_id = :org_id
        """
        params = {"org_id": DEFAULT_ORG_ID, "limit": limit, "offset": offset}
        
        if search:
            query += """ AND (
                p.product_name ILIKE :search OR 
                p.product_code ILIKE :search OR
                p.brand_name ILIKE :search OR
                p.manufacturer ILIKE :search
            )"""
            params["search"] = f"%{search}%"
        
        if category_id:
            query += " AND p.category_id = :category_id"
            params["category_id"] = category_id
            
        if is_active is not None:
            query += " AND p.is_active = :is_active"
            params["is_active"] = is_active
        
        query += " GROUP BY p.product_id, c.category_name"
        query += " ORDER BY p.product_name LIMIT :limit OFFSET :offset"
        
        result = db.execute(text(query), params)
        
        products = []
        for row in result:
            product_dict = dict(row._mapping)
            # Map database columns to response model
            product_dict["name"] = product_dict.pop("product_name", None)
            product_dict["brand"] = product_dict.pop("brand_name", None)
            product_dict["category"] = product_dict.get("category_name", "")
            product_dict["hsn_code"] = product_dict.get("hsn_code", "3004")
            product_dict["gst_rate"] = float(product_dict.get("gst_rate", 0))
            product_dict["mrp"] = float(product_dict.get("mrp", 0))
            product_dict["sale_rate"] = float(product_dict.get("sale_price", 0))
            product_dict["purchase_rate"] = float(product_dict.get("purchase_price", 0))
            products.append(ProductResponse(**product_dict))
        
        return products
        
    except Exception as e:
        logger.error(f"Error listing products: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to list products: {str(e)}"
        )

@router.get("/search", response_model=List[ProductSearch])
async def search_products(
    q: str = Query(..., description="Search query"),
    limit: int = Query(10, ge=1, le=100),
    db: Session = Depends(get_db)
):
    """
    Search products by name, brand, or code
    """
    try:
        # Direct query instead of PostgreSQL function
        result = db.execute(text("""
            SELECT 
                p.product_id,
                p.product_name as name,
                p.brand_name as brand,
                c.category_name as category,
                p.hsn_code,
                p.gst_rate,
                p.mrp,
                p.sale_price as sale_rate,
                p.purchase_price as purchase_rate,
                COALESCE(SUM(sb.quantity), 0) as current_stock,
                p.unit_of_measure
            FROM inventory.products p
            LEFT JOIN inventory.stock_batches sb ON p.product_id = sb.product_id
            LEFT JOIN master.categories c ON p.category_id = c.category_id
            WHERE p.org_id = :org_id
                AND p.is_active = true
                AND (
                    p.product_name ILIKE :search OR 
                    p.product_code ILIKE :search OR
                    p.brand_name ILIKE :search
                )
            GROUP BY p.product_id, c.category_name
            ORDER BY p.product_name
            LIMIT :limit
        """), {
            "org_id": DEFAULT_ORG_ID,
            "search": f"%{q}%",
            "limit": limit
        })
        
        return [ProductSearch(**dict(row._mapping)) for row in result]
        
    except Exception as e:
        logger.error(f"Error searching products: {str(e)}")
        # Return empty list on error
        return []

@router.get("/{product_id}", response_model=ProductResponse)
async def get_product(
    product_id: int,
    db: Session = Depends(get_db)
):
    """Get product by ID with current stock"""
    try:
        result = db.execute(text("""
            SELECT p.*, 
                   COALESCE(SUM(sb.quantity), 0) as current_stock,
                   c.category_name
            FROM inventory.products p
            LEFT JOIN inventory.stock_batches sb ON p.product_id = sb.product_id
            LEFT JOIN master.categories c ON p.category_id = c.category_id
            WHERE p.product_id = :product_id AND p.org_id = :org_id
            GROUP BY p.product_id, c.category_name
        """), {"product_id": product_id, "org_id": DEFAULT_ORG_ID}).first()
        
        if not result:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Product {product_id} not found"
            )
        
        product_dict = dict(result._mapping)
        # Map database columns to response model
        product_dict["name"] = product_dict.pop("product_name", None)
        product_dict["brand"] = product_dict.pop("brand_name", None)
        product_dict["category"] = product_dict.get("category_name", "")
        product_dict["hsn_code"] = product_dict.get("hsn_code", "3004")
        product_dict["gst_rate"] = float(product_dict.get("gst_rate", 0))
        product_dict["mrp"] = float(product_dict.get("mrp", 0))
        product_dict["sale_rate"] = float(product_dict.get("sale_price", 0))
        product_dict["purchase_rate"] = float(product_dict.get("purchase_price", 0))
        
        return ProductResponse(**product_dict)
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting product: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to get product: {str(e)}"
        )

@router.put("/{product_id}", response_model=ProductResponse)
async def update_product(
    product_id: int,
    product_update: ProductUpdate,
    db: Session = Depends(get_db)
):
    """Update product details"""
    try:
        # Check if product exists
        exists = db.execute(text("""
            SELECT 1 FROM inventory.products 
            WHERE product_id = :product_id AND org_id = :org_id
        """), {"product_id": product_id, "org_id": DEFAULT_ORG_ID}).scalar()
        
        if not exists:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Product {product_id} not found"
            )
        
        # Build update query
        update_fields = []
        params = {"product_id": product_id, "org_id": DEFAULT_ORG_ID}
        
        for field, value in product_update.dict(exclude_unset=True).items():
            if value is not None:
                # Map schema fields to database columns
                db_field = {
                    "product_name": "product_name",
                    "brand_name": "brand_name",
                    "manufacturer": "manufacturer",
                    "composition": "composition",
                    "category_id": "category_id",
                    "hsn_code": "hsn_code",
                    "gst_rate": "gst_rate",
                    "unit_of_measure": "unit_of_measure",
                    "pack_size": "pack_size",
                    "mrp": "mrp",
                    "sale_price": "sale_price",
                    "purchase_price": "purchase_price",
                    "min_stock_level": "min_stock_level",
                    "max_stock_level": "max_stock_level",
                    "is_active": "is_active"
                }.get(field, field)
                
                update_fields.append(f"{db_field} = :{field}")
                params[field] = value
        
        if update_fields:
            update_fields.append("updated_at = CURRENT_TIMESTAMP")
            query = f"""
                UPDATE inventory.products 
                SET {', '.join(update_fields)}
                WHERE product_id = :product_id AND org_id = :org_id
            """
            
            db.execute(text(query), params)
            db.commit()
        
        # Return updated product
        return await get_product(product_id, db)
        
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error updating product: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to update product: {str(e)}"
        )

@router.delete("/{product_id}")
async def delete_product(
    product_id: int,
    db: Session = Depends(get_db)
):
    """
    Soft delete a product (mark as inactive)
    Products with stock cannot be deleted
    """
    try:
        # Check if product has stock
        stock = db.execute(text("""
            SELECT COALESCE(SUM(quantity), 0) as total_stock
            FROM inventory.stock_batches
            WHERE product_id = :product_id
        """), {"product_id": product_id}).scalar()
        
        if stock and stock > 0:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Cannot delete product with existing stock ({stock} units)"
            )
        
        # Soft delete
        result = db.execute(text("""
            UPDATE inventory.products
            SET is_active = false, updated_at = CURRENT_TIMESTAMP
            WHERE product_id = :product_id AND org_id = :org_id
            RETURNING product_id
        """), {"product_id": product_id, "org_id": DEFAULT_ORG_ID})
        
        if not result.scalar():
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Product {product_id} not found"
            )
        
        db.commit()
        
        return {"message": f"Product {product_id} deleted successfully"}
        
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error deleting product: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to delete product: {str(e)}"
        )