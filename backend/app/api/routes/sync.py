"""
Offline Sync API Routes
Provides bulk data endpoints for offline-first operation
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import text
from typing import Dict, Any
import logging

from ...core.database import get_db
from ...core.jwt_auth import get_user_context_secure

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/sync", tags=["Offline Sync"])


@router.get("/full-data")
async def get_full_sync_data(
    db=Depends(get_db),
    current_user: dict = Depends(get_user_context_secure)
) -> Dict[str, Any]:
    """
    Get all data needed for offline operation.
    
    Called after login to populate IndexedDB.
    Returns products, batches, and customers for the user's org.
    
    Typical response size: 1-5MB depending on org size.
    """
    org_id = current_user.get("org_id")
    
    if not org_id:
        raise HTTPException(status_code=400, detail="No organization ID found")
    
    try:
        # Get products with current stock
        # NOTE: mrp and sale_price are on batches table, not products
        # We get latest batch pricing like products.py does
        products_result = db.execute(text("""
            SELECT 
                p.product_id,
                p.product_name,
                p.product_code,
                p.hsn_code,
                p.category_id,
                p.gst_percent,
                p.is_active,
                COALESCE(SUM(ib.quantity_available), 0) as current_stock,
                -- Get pricing from most recent batch
                (SELECT b.mrp_per_unit 
                 FROM inventory.batches b 
                 WHERE b.product_id = p.product_id 
                   AND b.mrp_per_unit IS NOT NULL
                 ORDER BY b.batch_id DESC 
                 LIMIT 1) as mrp,
                (SELECT b.sale_price_per_unit 
                 FROM inventory.batches b 
                 WHERE b.product_id = p.product_id 
                   AND b.sale_price_per_unit IS NOT NULL
                 ORDER BY b.batch_id DESC 
                 LIMIT 1) as sale_price
            FROM inventory.products p
            LEFT JOIN inventory.batches ib ON p.product_id = ib.product_id
            WHERE p.org_id = :org_id AND p.is_active = true
            GROUP BY p.product_id
            ORDER BY p.product_name
            LIMIT 5000
        """), {"org_id": org_id})
        
        products = [dict(row._mapping) for row in products_result.fetchall()]
        logger.info(f"[Sync] Fetched {len(products)} products for org {org_id}")
        
        # Get all active batches with stock
        # Column names from existing API code (products.py, writeoff.py, orders.py)
        batches_result = db.execute(text("""
            SELECT 
                ib.batch_id,
                ib.product_id,
                ib.batch_number,
                ib.expiry_date,
                ib.manufacturing_date,
                ib.quantity_available,
                ib.mrp_per_unit as mrp,
                ib.sale_price_per_unit as selling_price,
                ib.cost_per_unit
            FROM inventory.batches ib
            JOIN inventory.products p ON ib.product_id = p.product_id
            WHERE p.org_id = :org_id 
              AND ib.quantity_available > 0
              AND p.is_active = true
            ORDER BY ib.expiry_date ASC
            LIMIT 10000
        """), {"org_id": org_id})
        
        batches = [dict(row._mapping) for row in batches_result.fetchall()]
        logger.info(f"[Sync] Fetched {len(batches)} batches for org {org_id}")
        
        # Get customers
        customers_result = db.execute(text("""
            SELECT 
                c.customer_id,
                c.customer_name,
                c.customer_code,
                c.phone,
                c.email,
                c.gst_number,
                c.address,
                c.city,
                c.state,
                c.customer_type,
                c.is_active
            FROM sales.customers c
            WHERE c.org_id = :org_id AND c.is_active = true
            ORDER BY c.customer_name
            LIMIT 5000
        """), {"org_id": org_id})
        
        customers = [dict(row._mapping) for row in customers_result.fetchall()]
        logger.info(f"[Sync] Fetched {len(customers)} customers for org {org_id}")
        
        # Get employees (for salesperson selection in invoices)
        employees_result = db.execute(text("""
            SELECT 
                e.employee_id,
                e.full_name,
                e.employee_code,
                e.email,
                e.phone,
                e.designation,
                e.is_active
            FROM org.employees e
            WHERE e.org_id = :org_id AND e.is_active = true
            ORDER BY e.full_name
            LIMIT 500
        """), {"org_id": org_id})
        
        employees = [dict(row._mapping) for row in employees_result.fetchall()]
        logger.info(f"[Sync] Fetched {len(employees)} employees for org {org_id}")
        
        return {
            "products": products,
            "batches": batches,
            "customers": customers,
            "employees": employees,
            "sync_timestamp": "now",
            "counts": {
                "products": len(products),
                "batches": len(batches),
                "customers": len(customers),
                "employees": len(employees)
            }
        }
        
    except Exception as e:
        logger.error(f"[Sync] Full sync failed for org {org_id}: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to fetch sync data: {str(e)}"
        )
