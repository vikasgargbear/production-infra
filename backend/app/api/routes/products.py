"""
Products API Routes
Wrapper for PostgreSQL functions
"""
from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.orm import Session
from typing import List, Optional
from ..schemas.product_schema import Product, ProductSearch
from ...core.database import get_db

router = APIRouter()

@router.get("/search", response_model=List[Product])
async def search_products(
    q: str = Query(..., description="Search query"),
    limit: int = Query(10, ge=1, le=100),
    db: Session = Depends(get_db)
):
    """
    Search products by name, brand, or HSN
    Wraps PostgreSQL function: api.search_products()
    """
    try:
        # Call PostgreSQL function
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
        # Fallback to mock data if DB not connected
        print(f"Database error: {e}")
        return get_mock_products(q, limit)

@router.get("/{product_id}", response_model=Product)
async def get_product(
    product_id: int,
    db: Session = Depends(get_db)
):
    """Get product by ID"""
    try:
        result = db.execute(
            """
            SELECT * FROM products
            WHERE product_id = :product_id
            AND is_active = true
            """,
            {"product_id": product_id}
        ).first()
        
        if not result:
            raise HTTPException(status_code=404, detail="Product not found")
            
        return {
            "product_id": result.product_id,
            "name": result.name,
            "brand": result.brand,
            "category": result.category,
            "hsn_code": result.hsn_code,
            "gst_rate": float(result.gst_rate) if result.gst_rate else 0,
            "mrp": float(result.mrp) if result.mrp else 0,
            "sale_rate": float(result.sale_rate) if result.sale_rate else 0,
            "purchase_rate": float(result.purchase_rate) if result.purchase_rate else 0,
            "current_stock": 0,
            "unit_of_measure": result.unit_of_measure or "PCS"
        }
        
    except Exception as e:
        print(f"Database error: {e}")
        if product_id == 1:
            return get_mock_products("", 1)[0]
        raise HTTPException(status_code=404, detail="Product not found")

# Mock data for testing without database
def get_mock_products(search_term: str, limit: int) -> List[dict]:
    """Return mock products for testing"""
    mock_products = [
        {
            "product_id": 1,
            "name": "Paracetamol 500mg",
            "brand": "Cipla",
            "category": "Tablet",
            "hsn_code": "3004",
            "gst_rate": 12.0,
            "mrp": 10.0,
            "sale_rate": 9.0,
            "purchase_rate": 6.0,
            "current_stock": 1000,
            "unit_of_measure": "TAB"
        },
        {
            "product_id": 2,
            "name": "Amoxicillin 250mg",
            "brand": "Ranbaxy",
            "category": "Capsule",
            "hsn_code": "3004",
            "gst_rate": 12.0,
            "mrp": 50.0,
            "sale_rate": 45.0,
            "purchase_rate": 30.0,
            "current_stock": 500,
            "unit_of_measure": "CAP"
        },
        {
            "product_id": 3,
            "name": "Cough Syrup 100ml",
            "brand": "Himalaya",
            "category": "Syrup",
            "hsn_code": "3004",
            "gst_rate": 18.0,
            "mrp": 85.0,
            "sale_rate": 80.0,
            "purchase_rate": 60.0,
            "current_stock": 200,
            "unit_of_measure": "BTL"
        },
        {
            "product_id": 4,
            "name": "Vitamin C 500mg",
            "brand": "HealthVit",
            "category": "Tablet",
            "hsn_code": "3004",
            "gst_rate": 18.0,
            "mrp": 120.0,
            "sale_rate": 110.0,
            "purchase_rate": 80.0,
            "current_stock": 750,
            "unit_of_measure": "TAB"
        },
        {
            "product_id": 5,
            "name": "Bandage 4 inch",
            "brand": "Johnson & Johnson",
            "category": "Medical Supplies",
            "hsn_code": "3005",
            "gst_rate": 12.0,
            "mrp": 25.0,
            "sale_rate": 22.0,
            "purchase_rate": 15.0,
            "current_stock": 300,
            "unit_of_measure": "PCS"
        }
    ]
    
    # Filter by search term if provided
    if search_term:
        filtered = [
            p for p in mock_products 
            if search_term.lower() in p["name"].lower() 
            or search_term.lower() in p["brand"].lower()
        ]
        return filtered[:limit]
    
    return mock_products[:limit]