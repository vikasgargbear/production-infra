"""
Fixed Invoice API - Only uses columns that actually exist in database
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import text
from datetime import date
import logging
from typing import Optional

from ...core.database import get_db

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/invoices", tags=["Invoices"])

ACTUAL_ORG_ID = "ad808530-1ddb-4377-ab20-67bef145d80d"

@router.post("/")
async def create_invoice(
    invoice_data: dict,
    db: Session = Depends(get_db)
):
    """
    Create invoice using only columns that exist in the database
    
    Required fields:
    - customer_id: int
    - items: list of {product_id, quantity, unit_price}
    
    Optional fields:
    - invoice_date: date string (defaults to today)
    - discount_amount: decimal (defaults to 0)
    """
    try:
        logger.info(f"Creating invoice for customer {invoice_data.get('customer_id')}")
        
        # Step 1: Get valid branch_id and created_by
        branch_result = db.execute(text("""
            SELECT branch_id FROM master.org_branches 
            WHERE org_id = :org_id LIMIT 1
        """), {"org_id": ACTUAL_ORG_ID})
        branch = branch_result.fetchone()
        branch_id = branch[0] if branch else 1
        
        user_result = db.execute(text("""
            SELECT user_id FROM master.org_users 
            WHERE org_id = :org_id LIMIT 1
        """), {"org_id": ACTUAL_ORG_ID})
        user = user_result.fetchone()
        created_by = user[0] if user else 1
        
        # Step 2: Generate order number
        order_result = db.execute(text("""
            SELECT COALESCE(MAX(CAST(SUBSTRING(order_number FROM '[0-9]+') AS INTEGER)), 0) + 1
            FROM sales.orders
            WHERE org_id = :org_id
        """), {"org_id": ACTUAL_ORG_ID})
        order_num = order_result.scalar() or 1
        order_number = f"ORD-{order_num:06d}"
        
        # Step 3: Calculate totals from items
        items = invoice_data.get("items", [])
        subtotal = 0
        total_cgst = 0
        total_sgst = 0
        
        for item in items:
            quantity = float(item.get("quantity", 1))
            unit_price = float(item.get("unit_price", 0))
            gst_percent = float(item.get("gst_percent", 12))
            
            line_total = quantity * unit_price
            cgst = line_total * (gst_percent / 2) / 100
            sgst = line_total * (gst_percent / 2) / 100
            
            subtotal += line_total
            total_cgst += cgst
            total_sgst += sgst
        
        discount_amount = float(invoice_data.get("discount_amount", 0))
        taxable_amount = subtotal - discount_amount
        tax_amount = total_cgst + total_sgst
        final_amount = taxable_amount + tax_amount
        
        # Step 4: Create order (using ONLY columns that exist)
        order_create = db.execute(text("""
            INSERT INTO sales.orders (
                org_id, branch_id, order_number, order_date, order_type,
                customer_id, subtotal_amount, discount_amount, taxable_amount,
                cgst_amount, sgst_amount, tax_amount, final_amount,
                created_by, created_at
            ) VALUES (
                :org_id, :branch_id, :order_number, :order_date, 'sales',
                :customer_id, :subtotal, :discount, :taxable,
                :cgst, :sgst, :tax, :final,
                :created_by, CURRENT_TIMESTAMP
            ) RETURNING order_id
        """), {
            "org_id": ACTUAL_ORG_ID,
            "branch_id": branch_id,
            "order_number": order_number,
            "order_date": date.today(),
            "customer_id": invoice_data["customer_id"],
            "subtotal": subtotal,
            "discount": discount_amount,
            "taxable": taxable_amount,
            "cgst": total_cgst,
            "sgst": total_sgst,
            "tax": tax_amount,
            "final": final_amount,
            "created_by": created_by
        })
        order_id = order_create.scalar()
        
        # Step 5: Generate invoice number
        inv_result = db.execute(text("""
            SELECT COALESCE(MAX(CAST(SUBSTRING(invoice_number FROM '[0-9]+') AS INTEGER)), 0) + 1
            FROM sales.invoices
            WHERE org_id = :org_id
        """), {"org_id": ACTUAL_ORG_ID})
        inv_num = inv_result.scalar() or 1
        invoice_number = f"INV-{inv_num:06d}"
        
        # Step 6: Get customer name for invoice
        cust_result = db.execute(text("""
            SELECT customer_name FROM parties.customers
            WHERE customer_id = :customer_id
        """), {"customer_id": invoice_data["customer_id"]})
        cust = cust_result.fetchone()
        customer_name = cust[0] if cust else f"Customer {invoice_data['customer_id']}"
        
        # Step 7: Create invoice (using ONLY columns that exist)
        invoice_create = db.execute(text("""
            INSERT INTO sales.invoices (
                org_id, branch_id, invoice_number, invoice_date, invoice_type,
                order_id, customer_id, customer_name,
                subtotal_amount, discount_amount, taxable_amount,
                cgst_amount, sgst_amount, total_tax_amount, final_amount,
                invoice_status, payment_status,
                created_by, created_at
            ) VALUES (
                :org_id, :branch_id, :invoice_number, :invoice_date, 'tax_invoice',
                :order_id, :customer_id, :customer_name,
                :subtotal, :discount, :taxable,
                :cgst, :sgst, :tax, :final,
                'posted', 'pending',
                :created_by, CURRENT_TIMESTAMP
            ) RETURNING invoice_id
        """), {
            "org_id": ACTUAL_ORG_ID,
            "branch_id": branch_id,
            "invoice_number": invoice_number,
            "invoice_date": date.today(),
            "order_id": order_id,
            "customer_id": invoice_data["customer_id"],
            "customer_name": customer_name,
            "subtotal": subtotal,
            "discount": discount_amount,
            "taxable": taxable_amount,
            "cgst": total_cgst,
            "sgst": total_sgst,
            "tax": tax_amount,
            "final": final_amount,
            "created_by": created_by
        })
        invoice_id = invoice_create.scalar()
        
        # Step 8: Create invoice items
        # With triggers, we only need to insert basic data - triggers will calculate the rest
        items_created = 0
        for item in items:
            product_id = int(item.get("product_id"))
            quantity = float(item.get("quantity", 1))
            unit_price = float(item.get("unit_price", 0))
            
            # Get product name if not provided
            product_name = item.get("product_name")
            if not product_name:
                prod_result = db.execute(text("""
                    SELECT product_name FROM inventory.products
                    WHERE product_id = :product_id
                """), {"product_id": product_id})
                prod = prod_result.fetchone()
                product_name = prod[0] if prod else item.get("product_name", f"Product {product_id}")
            
            # Basic calculations (triggers will recalculate if needed)
            discount_percent = float(item.get("discount_percent", 0))
            discount_amt = quantity * unit_price * discount_percent / 100
            
            # Get batch_id if not provided (for inventory trigger)
            batch_id = item.get("batch_id")
            if not batch_id:
                # Try to get FIFO batch
                batch_result = db.execute(text("""
                    SELECT batch_id FROM inventory.batches
                    WHERE product_id = :product_id
                    AND quantity_available > 0
                    ORDER BY expiry_date NULLS LAST, batch_id
                    LIMIT 1
                """), {"product_id": product_id})
                batch = batch_result.fetchone()
                batch_id = batch[0] if batch else None
            
            # Insert invoice item - let triggers handle calculations
            db.execute(text("""
                INSERT INTO sales.invoice_items (
                    invoice_id, product_id, product_name,
                    quantity, unit_price, 
                    discount_percent, discount_amount,
                    batch_id, uom, pack_type,
                    hsn_code, created_at
                ) VALUES (
                    :invoice_id, :product_id, :product_name,
                    :quantity, :unit_price,
                    :discount_percent, :discount_amount,
                    :batch_id, :uom, :pack_type,
                    :hsn_code, CURRENT_TIMESTAMP
                )
            """), {
                "invoice_id": invoice_id,
                "product_id": product_id,
                "product_name": product_name,
                "quantity": quantity,
                "unit_price": unit_price,
                "discount_percent": discount_percent,
                "discount_amount": discount_amt,
                "batch_id": batch_id,
                "uom": item.get("uom", "PIECE"),
                "pack_type": item.get("pack_type", "PIECE"),
                "hsn_code": item.get("hsn_code")
            })
            
            items_created += 1
        
        # Commit transaction
        db.commit()
        
        # Get updated totals after triggers have run
        updated_result = db.execute(text("""
            SELECT final_amount FROM sales.invoices
            WHERE invoice_id = :invoice_id
        """), {"invoice_id": invoice_id})
        updated = updated_result.fetchone()
        final_amount_updated = float(updated[0]) if updated else final_amount
        
        return {
            "success": True,
            "invoice_id": invoice_id,
            "invoice_number": invoice_number,
            "order_id": order_id,
            "order_number": order_number,
            "items_created": items_created,
            "total_amount": final_amount_updated
        }
        
    except Exception as e:
        db.rollback()
        logger.error(f"Invoice creation failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/")
async def get_invoices(
    limit: int = 50,
    offset: int = 0,
    customer_id: Optional[int] = None,
    db: Session = Depends(get_db)
):
    """Get list of invoices with pagination"""
    try:
        query = """
            SELECT 
                i.invoice_id,
                i.invoice_number,
                i.invoice_date,
                i.customer_id,
                i.customer_name,
                i.final_amount,
                i.payment_status,
                i.invoice_status
            FROM sales.invoices i
            WHERE i.org_id = :org_id
        """
        
        params = {"org_id": ACTUAL_ORG_ID, "limit": limit, "offset": offset}
        
        if customer_id:
            query += " AND i.customer_id = :customer_id"
            params["customer_id"] = customer_id
            
        query += " ORDER BY i.invoice_date DESC, i.created_at DESC LIMIT :limit OFFSET :offset"
        
        result = db.execute(text(query), params)
        invoices = [dict(row._mapping) for row in result]
        
        # Get total count
        count_query = "SELECT COUNT(*) FROM sales.invoices WHERE org_id = :org_id"
        if customer_id:
            count_query += " AND customer_id = :customer_id"
        
        total = db.execute(text(count_query), {"org_id": ACTUAL_ORG_ID, "customer_id": customer_id} if customer_id else {"org_id": ACTUAL_ORG_ID}).scalar()
        
        return {
            "invoices": invoices,
            "total": total,
            "limit": limit,
            "offset": offset
        }
        
    except Exception as e:
        logger.error(f"Error fetching invoices: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/{invoice_id}")
async def get_invoice(
    invoice_id: int,
    db: Session = Depends(get_db)
):
    """Get invoice by ID"""
    try:
        result = db.execute(text("""
            SELECT 
                i.*,
                o.order_number
            FROM sales.invoices i
            LEFT JOIN sales.orders o ON i.order_id = o.order_id
            WHERE i.invoice_id = :invoice_id
        """), {"invoice_id": invoice_id})
        
        invoice = result.fetchone()
        if not invoice:
            raise HTTPException(status_code=404, detail=f"Invoice {invoice_id} not found")
        
        invoice_dict = dict(invoice._mapping)
        
        # Get invoice items
        items_result = db.execute(text("""
            SELECT * FROM sales.invoice_items
            WHERE invoice_id = :invoice_id
        """), {"invoice_id": invoice_id})
        
        invoice_dict["items"] = [dict(item._mapping) for item in items_result]
        
        return invoice_dict
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting invoice: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/list")
async def list_invoices(
    limit: int = 100,
    skip: int = 0,
    db: Session = Depends(get_db)
):
    """List invoices with pagination"""
    try:
        query = text("""
            SELECT 
                i.invoice_id, i.invoice_number, i.invoice_date,
                i.customer_id, i.customer_name,
                i.final_amount, i.payment_status,
                o.order_number, o.order_date,
                i.final_amount as balance_amount
            FROM sales.invoices i
            LEFT JOIN sales.orders o ON i.order_id = o.order_id
            WHERE i.org_id = :org_id
            ORDER BY i.invoice_date DESC
            LIMIT :limit OFFSET :skip
        """)
        
        result = db.execute(query, {"org_id": ACTUAL_ORG_ID, "limit": limit, "skip": skip})
        invoices = [dict(row._mapping) for row in result]
        
        # Get total
        total = db.execute(
            text("SELECT COUNT(*) FROM sales.invoices WHERE org_id = :org_id"),
            {"org_id": ACTUAL_ORG_ID}
        ).scalar()
        
        return {
            "total": total,
            "page": skip // limit + 1,
            "per_page": limit,
            "invoices": invoices
        }
        
    except Exception as e:
        logger.error(f"Error listing invoices: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/drop-problematic-triggers")
async def drop_problematic_triggers(db: Session = Depends(get_db)):
    """Drop all remaining problematic triggers on invoices table"""
    try:
        triggers_to_drop = [
            "trigger_credit_update_on_invoice",
            "trigger_invoice_cash_flow_impact", 
            "trigger_sales_target_tracking",
            "trigger_populate_gstr1",
            "trigger_cache_refresh_invoices"
        ]
        
        dropped = []
        for trigger in triggers_to_drop:
            try:
                db.execute(text(f"DROP TRIGGER IF EXISTS {trigger} ON sales.invoices CASCADE"))
                dropped.append(trigger)
            except:
                pass
        
        db.commit()
        
        return {
            "success": True,
            "dropped_triggers": dropped
        }
        
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))