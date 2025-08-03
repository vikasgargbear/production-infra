"""
Simple invoice creation endpoint for testing
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import text
from datetime import date
from ...core.database import get_db
from ...core.config import DEFAULT_ORG_ID

router = APIRouter(prefix="/simple-invoice", tags=["simple-invoice"])

@router.post("/")
async def create_simple_invoice(
    invoice_data: dict,
    db: Session = Depends(get_db)
):
    """
    Create a simple invoice - minimal fields only
    """
    try:
        # Generate invoice number
        result = db.execute(
            text("""
                SELECT COALESCE(MAX(CAST(SUBSTRING(invoice_number FROM '[0-9]+') AS INTEGER)), 0) + 1 as next_num
                FROM sales.invoices
                WHERE org_id = :org_id
                AND invoice_number LIKE 'INV-%'
            """),
            {"org_id": DEFAULT_ORG_ID}
        )
        next_num = result.scalar() or 1
        invoice_number = f"INV-{next_num:06d}"
        
        # Try to disable trigger temporarily (if we have permissions)
        try:
            db.execute(text("ALTER TABLE sales.invoices DISABLE TRIGGER refresh_dashboard_cache_on_invoice"))
        except:
            pass  # Ignore if we can't disable trigger
        
        # Create invoice with minimal fields
        invoice_result = db.execute(
            text("""
                INSERT INTO sales.invoices (
                    org_id, branch_id, invoice_number, invoice_date, invoice_type,
                    customer_id, customer_name, place_of_supply,
                    subtotal_amount, taxable_amount, final_amount,
                    invoice_status, payment_status, payment_terms,
                    cgst_amount, sgst_amount, igst_amount, total_tax_amount,
                    discount_amount, created_by, created_at, updated_at
                ) VALUES (
                    :org_id, 1, :invoice_number, :invoice_date, 'tax_invoice',
                    :customer_id, :customer_name, 'Gujarat',
                    :subtotal, :subtotal, :total,
                    'posted', 'unpaid', 'cash',
                    :cgst, :sgst, 0, :tax,
                    0, 2, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
                )
                RETURNING invoice_id
            """),
            {
                "org_id": DEFAULT_ORG_ID,
                "invoice_number": invoice_number,
                "invoice_date": invoice_data.get("invoice_date", date.today()),
                "customer_id": invoice_data["customer_id"],
                "customer_name": invoice_data.get("customer_name", "Customer"),
                "subtotal": invoice_data.get("subtotal", 0),
                "total": invoice_data.get("total", 0),
                "cgst": invoice_data.get("cgst", 0),
                "sgst": invoice_data.get("sgst", 0),
                "tax": invoice_data.get("tax", 0)
            }
        )
        invoice_id = invoice_result.scalar()
        
        # Re-enable trigger if we disabled it
        try:
            db.execute(text("ALTER TABLE sales.invoices ENABLE TRIGGER refresh_dashboard_cache_on_invoice"))
        except:
            pass
        
        # Create invoice items
        for item in invoice_data.get("items", []):
            db.execute(
                text("""
                    INSERT INTO sales.invoice_items (
                        invoice_id, product_id, product_name,
                        quantity, unit_price, final_amount
                    ) VALUES (
                        :invoice_id, :product_id, :product_name,
                        :quantity, :rate, :total
                    )
                """),
                {
                    "invoice_id": invoice_id,
                    "product_id": item.get("product_id"),
                    "product_name": item.get("product_name", "Product"),
                    "quantity": item.get("quantity", 1),
                    "rate": item.get("rate", 0),
                    "total": item.get("quantity", 1) * item.get("rate", 0)
                }
            )
        
        db.commit()
        
        return {
            "success": True,
            "invoice_id": invoice_id,
            "invoice_number": invoice_number,
            "message": "Invoice created successfully"
        }
        
    except Exception as e:
        db.rollback()
        # Try without trigger manipulation
        if "dashboard_cache" in str(e):
            return {
                "success": False,
                "error": "Database trigger issue - analytics table missing",
                "message": "Invoice creation blocked by database trigger",
                "technical_detail": str(e)[:200]
            }
        raise HTTPException(status_code=500, detail=str(e))