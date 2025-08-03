"""
Debug endpoint for invoice creation
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import text
from datetime import date
import logging

from ...core.database import get_db

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/debug", tags=["Debug"])

ACTUAL_ORG_ID = "ad808530-1ddb-4377-ab20-67bef145d80d"

@router.get("/check-invoice-items")
async def check_invoice_items(db: Session = Depends(get_db)):
    """Check if invoice_items table is accessible and what columns it has"""
    try:
        # Check table exists
        result = db.execute(text("""
            SELECT column_name, data_type, is_nullable
            FROM information_schema.columns
            WHERE table_schema = 'sales'
            AND table_name = 'invoice_items'
            ORDER BY ordinal_position
            LIMIT 10
        """))
        
        columns = [{"name": row[0], "type": row[1], "nullable": row[2]} for row in result]
        
        # Check if we can insert
        test_result = db.execute(text("""
            SELECT COUNT(*) FROM sales.invoice_items
        """))
        count = test_result.scalar()
        
        # Get latest invoice
        invoice_result = db.execute(text("""
            SELECT invoice_id, invoice_number 
            FROM sales.invoices 
            ORDER BY invoice_id DESC 
            LIMIT 1
        """))
        latest_invoice = invoice_result.fetchone()
        
        return {
            "table_exists": True,
            "columns_sample": columns,
            "total_items": count,
            "latest_invoice": {
                "id": latest_invoice[0] if latest_invoice else None,
                "number": latest_invoice[1] if latest_invoice else None
            }
        }
        
    except Exception as e:
        logger.error(f"Error checking invoice_items: {e}")
        return {"error": str(e)}

@router.post("/test-item-insert")
async def test_item_insert(db: Session = Depends(get_db)):
    """Test inserting a single invoice item"""
    try:
        # Get latest invoice
        invoice_result = db.execute(text("""
            SELECT invoice_id FROM sales.invoices 
            ORDER BY invoice_id DESC LIMIT 1
        """))
        invoice = invoice_result.fetchone()
        
        if not invoice:
            return {"error": "No invoices found"}
        
        invoice_id = invoice[0]
        
        # Try simple insert
        db.execute(text("""
            INSERT INTO sales.invoice_items (
                invoice_id, product_id, product_name,
                quantity, unit_price, line_total,
                created_at
            ) VALUES (
                :invoice_id, 1, 'Test Product',
                1, 10, 10,
                CURRENT_TIMESTAMP
            )
        """), {"invoice_id": invoice_id})
        
        db.commit()
        
        return {
            "success": True,
            "invoice_id": invoice_id,
            "message": "Test item inserted"
        }
        
    except Exception as e:
        db.rollback()
        logger.error(f"Insert failed: {e}")
        return {
            "success": False,
            "error": str(e),
            "error_type": type(e).__name__
        }

@router.get("/test-batch-query/{product_id}")
async def test_batch_query(product_id: int, db: Session = Depends(get_db)):
    """Test the batch query that's failing"""
    try:
        result = db.execute(text("""
            SELECT b.batch_id, b.product_id, b.batch_number, 
                   b.sale_price_per_unit, b.mrp, b.quantity_available
            FROM inventory.batches b
            WHERE b.product_id = :product_id
            AND b.quantity_available > 0
            ORDER BY b.expiry_date NULLS LAST, b.batch_id
            LIMIT 1
        """), {"product_id": product_id})
        
        batch = result.fetchone()
        
        if batch:
            return {
                "found": True,
                "batch_id": batch[0],
                "product_id": batch[1],
                "batch_number": batch[2],
                "sale_price": float(batch[3]) if batch[3] else None,
                "mrp": float(batch[4]) if batch[4] else None,
                "quantity": float(batch[5]) if batch[5] else None
            }
        else:
            return {"found": False, "product_id": product_id}
            
    except Exception as e:
        return {"error": str(e), "product_id": product_id}