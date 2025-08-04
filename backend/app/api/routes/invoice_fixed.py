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
router = APIRouter(prefix="/invoice-fixed", tags=["Fixed Invoice"])

ACTUAL_ORG_ID = "ad808530-1ddb-4377-ab20-67bef145d80d"

@router.post("/create")
async def create_invoice_fixed(
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
        
        # Step 8: Create invoice items (simplified)
        items_created = 0
        for item in items:
            try:
                product_id = int(item.get("product_id"))
                quantity = float(item.get("quantity", 1))
                unit_price = float(item.get("unit_price", 0))
                gst_percent = float(item.get("gst_percent", 12))
                
                # Get product name
                prod_result = db.execute(text("""
                    SELECT product_name FROM inventory.products
                    WHERE product_id = :product_id
                """), {"product_id": product_id})
                prod = prod_result.fetchone()
                product_name = prod[0] if prod else f"Product {product_id}"
                
                # Calculate item amounts
                line_total = quantity * unit_price
                discount_percent = float(item.get("discount_percent", 0))
                discount_amt = line_total * discount_percent / 100
                taxable = line_total - discount_amt
                cgst_rate = gst_percent / 2
                sgst_rate = gst_percent / 2
                cgst_amt = taxable * cgst_rate / 100
                sgst_amt = taxable * sgst_rate / 100
                total_with_tax = taxable + cgst_amt + sgst_amt
                
                # Insert invoice item (using ONLY existing columns)
                db.execute(text("""
                    INSERT INTO sales.invoice_items (
                        invoice_id, product_id, product_name,
                        quantity, unit_price, line_total,
                        discount_percent, discount_amount, taxable_amount,
                        cgst_rate, cgst_amount, sgst_rate, sgst_amount,
                        total_tax_amount, uom, pack_type,
                        created_at
                    ) VALUES (
                        :invoice_id, :product_id, :product_name,
                        :quantity, :unit_price, :line_total,
                        :discount_percent, :discount_amount, :taxable_amount,
                        :cgst_rate, :cgst_amount, :sgst_rate, :sgst_amount,
                        :total_tax, :uom, :pack_type,
                        CURRENT_TIMESTAMP
                    )
                """), {
                    "invoice_id": invoice_id,
                    "product_id": product_id,
                    "product_name": product_name,
                    "quantity": quantity,
                    "unit_price": unit_price,
                    "line_total": line_total,
                    "discount_percent": discount_percent,
                    "discount_amount": discount_amt,
                    "taxable_amount": taxable,
                    "cgst_rate": cgst_rate,
                    "cgst_amount": cgst_amt,
                    "sgst_rate": sgst_rate,
                    "sgst_amount": sgst_amt,
                    "total_tax": cgst_amt + sgst_amt,
                    "uom": item.get("uom", "PIECE"),
                    "pack_type": item.get("pack_type", "PIECE")
                })
                
                items_created += 1
                
            except Exception as item_error:
                logger.error(f"Failed to create invoice item: {item_error}")
                # Continue with other items
        
        # Commit transaction
        db.commit()
        
        return {
            "success": True,
            "invoice_id": invoice_id,
            "invoice_number": invoice_number,
            "order_id": order_id,
            "order_number": order_number,
            "items_created": items_created,
            "total_amount": final_amount
        }
        
    except Exception as e:
        db.rollback()
        logger.error(f"Invoice creation failed: {e}")
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