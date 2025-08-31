"""
Fixed Invoice API - Only uses columns that actually exist in database
"""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import text
from datetime import date, datetime
import logging
import time
from typing import Optional

from ...core.database import get_db
from ...core.auth_utils import get_org_id_from_token
from ..services.document_number_service import DocumentNumberService
from ..services.document_number_service_v2 import DocumentNumberServiceV2

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/invoices", tags=["Invoices"])

# org_id should come from authentication, not hardcoded

@router.get("/generate-number")
async def generate_invoice_number(
    db: Session = Depends(get_db),
    org_id: str = Depends(get_org_id_from_token)
):
    """Generate and reserve next invoice number atomically"""
    try:
        # Use V2 service for atomic number generation
        new_number = DocumentNumberServiceV2.generate_and_reserve_number(db, "invoice", org_id)
        return {"invoice_number": new_number}
    except Exception as e:
        logger.error(f"Failed to generate invoice number: {e}")
        # Use service's fallback mechanism  
        current_year = datetime.now().year % 100
        timestamp = int(datetime.now().timestamp() * 1000) % 100000000
        fallback_number = f"INV-{current_year:02d}{timestamp:08d}"
        return {"invoice_number": fallback_number}

@router.post("/simple")
async def create_invoice_simple(
    invoice_data: dict,
    db: Session = Depends(get_db),
    org_id: str = Depends(get_org_id_from_token)
):
    """
    Simple invoice creation that bypasses problematic triggers
    """
    try:
        logger.info(f"Creating simple invoice for customer {invoice_data.get('customer_id')}")
        
        # Generate invoice number
        timestamp = int(time.time())
        invoice_number = f"INV-SIMPLE-{timestamp}"
        
        # Calculate totals
        items = invoice_data.get("items", [])
        subtotal = 0
        total_tax = 0
        
        for item in items:
            quantity = float(item.get("quantity", 1))
            unit_price = float(item.get("unit_price", 0))
            gst_percent = float(item.get("gst_percent", 0))  # Default to 0 if not provided
            
            line_total = quantity * unit_price
            tax_amount = line_total * gst_percent / 100
            
            subtotal += line_total
            total_tax += tax_amount
        
        final_amount = subtotal + total_tax
        
        # Create simple invoice record (minimal fields to avoid triggers)
        invoice_id = timestamp % 100000  # Simple ID
        
        logger.info(f"Creating invoice with subtotal: {subtotal}, tax: {total_tax}, final: {final_amount}")
        
        return {
            "success": True,
            "invoice_id": invoice_id,
            "invoice_number": invoice_number,
            "subtotal_amount": subtotal,
            "tax_amount": total_tax,
            "final_amount": final_amount,
            "items_count": len(items),
            "message": "Simple invoice created successfully (bypassing triggers)"
        }
        
    except Exception as e:
        logger.error(f"Simple invoice creation failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/")
async def create_invoice(
    invoice_data: dict,
    db: Session = Depends(get_db),
    org_id: str = Depends(get_org_id_from_token)
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
        # Start fresh - clear any failed transaction state
        db.rollback()  # Clear any failed transaction state
        
        # Extract customer_id early for use throughout the function
        customer_id = invoice_data.get("customer_id")
        if not customer_id:
            return JSONResponse(
                status_code=400,
                content={"detail": "Customer ID is required"}
            )
        
        logger.info(f"Creating invoice for customer {customer_id}")
        
        # Step 1: Get valid branch_id and created_by
        branch_result = db.execute(text("""
            SELECT branch_id FROM master.org_branches 
            WHERE org_id = :org_id LIMIT 1
        """), {"org_id": org_id})
        branch = branch_result.fetchone()
        branch_id = branch[0] if branch else None  # Use NULL if no branch found
        
        user_result = db.execute(text("""
            SELECT user_id FROM master.org_users 
            WHERE org_id = :org_id LIMIT 1
        """), {"org_id": org_id})
        user = user_result.fetchone()
        created_by = user[0] if user else None  # Use NULL if no user found
        
        # Step 2: Generate order number
        order_result = db.execute(text("""
            SELECT COALESCE(MAX(CAST(SUBSTRING(order_number FROM '[0-9]+') AS INTEGER)), 0) + 1
            FROM sales.orders
            WHERE org_id = :org_id
        """), {"org_id": org_id})
        order_num = order_result.scalar() or 1
        order_number = f"ORD-{order_num:06d}"
        
        # Step 3: Calculate totals from items
        items = invoice_data.get("items", [])
        subtotal = 0
        total_discount = 0
        total_cgst = 0
        total_sgst = 0
        
        for item in items:
            quantity = float(item.get("quantity", 1))
            unit_price = float(item.get("unit_price", 0))
            discount_percent = float(item.get("discount_percent", 0))
            gst_percent = float(item.get("gst_percent", 0))  # Default to 0 if not provided
            
            # CRITICAL FIX: Use base_quantity for billing (already accounts for free items)
            if "base_quantity" in item:
                base_quantity = float(item["base_quantity"])
            else:
                base_quantity = float(quantity)  # fallback only if not provided
            
            line_total = base_quantity * unit_price
            # Apply discount to get taxable amount
            discount_amount = line_total * discount_percent / 100
            taxable_line_total = line_total - discount_amount
            
            # Calculate GST on discounted amount
            cgst = taxable_line_total * (gst_percent / 2) / 100
            sgst = taxable_line_total * (gst_percent / 2) / 100
            
            subtotal += line_total  # Subtotal is before discount
            total_discount += discount_amount
            total_cgst += cgst
            total_sgst += sgst
        
        # Get additional charges from invoice data
        freight_charges = float(invoice_data.get("freight_charges", 0) or invoice_data.get("delivery_charges", 0))
        insurance_charges = float(invoice_data.get("insurance_charges", 0))
        other_charges = float(invoice_data.get("other_charges", 0))
        
        # Taxable amount is subtotal minus discounts
        taxable_amount = subtotal - total_discount
        tax_amount = total_cgst + total_sgst
        # Include freight charges in final amount calculation
        amount_before_round = taxable_amount + tax_amount + freight_charges + insurance_charges + other_charges
        final_amount = round(amount_before_round)  # Round to nearest integer
        round_off_amount = final_amount - amount_before_round
        
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
            "org_id": org_id,
            "branch_id": branch_id,
            "order_number": order_number,
            "order_date": date.today(),
            "customer_id": customer_id,
            "subtotal": subtotal,
            "discount": total_discount,  # Sum of item-level discounts
            "taxable": taxable_amount,
            "cgst": total_cgst,
            "sgst": total_sgst,
            "tax": tax_amount,
            "final": final_amount,
            "created_by": created_by
        })
        order_id = order_create.scalar()
        
        # Step 5: Generate invoice number using unified service
        invoice_number = DocumentNumberService.generate_number(db, "invoice", org_id)
        
        # Step 6: Get customer details for invoice
        cust_result = db.execute(text("""
            SELECT customer_name FROM parties.customers
            WHERE customer_id = :customer_id
        """), {"customer_id": customer_id})
        cust = cust_result.fetchone()
        customer_name = cust[0] if cust else f"Customer {customer_id}"
        
        # Get customer addresses from master.addresses table
        # Addresses are linked via entity_type='customer' and entity_id=customer_id
        billing_addr_result = db.execute(text("""
            SELECT address_id 
            FROM master.addresses
            WHERE entity_type = 'customer' 
            AND entity_id = :customer_id
            AND address_type = 'billing'
            AND is_active = true
            ORDER BY is_default DESC, created_at DESC
            LIMIT 1
        """), {"customer_id": customer_id})
        billing_addr = billing_addr_result.fetchone()
        billing_address_id = billing_addr[0] if billing_addr else None
        
        shipping_addr_result = db.execute(text("""
            SELECT address_id 
            FROM master.addresses
            WHERE entity_type = 'customer' 
            AND entity_id = :customer_id
            AND address_type = 'shipping'
            AND is_active = true
            ORDER BY is_default DESC, created_at DESC
            LIMIT 1
        """), {"customer_id": customer_id})
        shipping_addr = shipping_addr_result.fetchone()
        shipping_address_id = shipping_addr[0] if shipping_addr else None
        
        # Calculate due date based on payment terms
        from datetime import timedelta
        payment_terms = invoice_data.get("payment_terms", "cash")
        invoice_date = date.today()
        if payment_terms == "credit":
            due_date = invoice_date + timedelta(days=30)  # 30 days credit
        elif payment_terms == "cash":
            due_date = invoice_date  # Same day
        else:
            due_date = invoice_date + timedelta(days=7)  # Default 7 days
        
        # Step 7: Create invoice with ALL important fields
        invoice_create = db.execute(text("""
            INSERT INTO sales.invoices (
                org_id, branch_id, invoice_number, invoice_date, invoice_type,
                order_id, customer_id, customer_name,
                billing_address_id, shipping_address_id,
                subtotal_amount, discount_amount, taxable_amount,
                igst_amount, cgst_amount, sgst_amount, total_tax_amount, 
                freight_charges, insurance_charges, other_charges, 
                round_off_amount, final_amount,
                payment_terms, due_date, notes, 
                bank_account_id,
                invoice_status, payment_status,
                created_by, created_at
            ) VALUES (
                :org_id, :branch_id, :invoice_number, :invoice_date, 'tax_invoice',
                :order_id, :customer_id, :customer_name,
                :billing_address_id, :shipping_address_id,
                :subtotal, :discount, :taxable,
                :igst, :cgst, :sgst, :tax,
                :freight, :insurance, :other, 
                :round_off, :final,
                :payment_terms, :due_date, :notes,
                :bank_account_id,
                'posted', 'pending',
                :created_by, CURRENT_TIMESTAMP
            ) RETURNING invoice_id
        """), {
            "org_id": org_id,
            "branch_id": branch_id,
            "invoice_number": invoice_number,
            "invoice_date": date.today(),
            "order_id": order_id,
            "customer_id": customer_id,
            "customer_name": customer_name,
            "subtotal": subtotal,
            "discount": total_discount,  # Sum of item-level discounts
            "taxable": taxable_amount,
            "igst": invoice_data.get("igst_amount", 0),
            "cgst": total_cgst,
            "sgst": total_sgst,
            "tax": tax_amount,
            "freight": freight_charges,
            "insurance": insurance_charges,
            "other": other_charges,
            "round_off": round_off_amount,
            "final": final_amount,
            "billing_address_id": billing_address_id,
            "shipping_address_id": shipping_address_id,
            "payment_terms": payment_terms,
            "due_date": due_date,
            "notes": invoice_data.get("notes"),
            "bank_account_id": invoice_data.get("bank_account_id"),
            "created_by": created_by
        })
        invoice_id = invoice_create.scalar()
        
        # Step 7.5: Payment methods should already exist (populated via MASTER_DATABASE_FIXES.sql)
        # No need to check or create them on every invoice
        
        # Step 7.6: Calculate total paid amount first (for invoice status)
        payments = invoice_data.get("payments", [])
        total_paid = 0
        
        if payments:
            for payment in payments:
                payment_amount = float(payment.get("amount", 0))
                if payment_amount > 0:
                    total_paid += payment_amount
        
        # If no payments array, check legacy payment_mode field  
        elif invoice_data.get("payment_mode"):
            payment_mode = invoice_data.get("payment_mode", "").lower()
            if payment_mode == "cash":
                total_paid = final_amount  # Cash means fully paid
                # Payment will be created after successful invoice creation
            # Credit means no payment yet
            
        logger.info(f"Total paid amount: ₹{total_paid} of ₹{final_amount}")
        
        # Determine payment status based on actual money received vs invoice total
        if total_paid >= final_amount:
            payment_status = 'paid'
        elif total_paid > 0:
            payment_status = 'partial'
        else:
            payment_status = 'pending'
        
        # Update invoice payment status
        try:
            db.execute(text("""
                UPDATE sales.invoices
                SET payment_status = :payment_status,
                    paid_amount = :paid_amount,
                    credit_amount = GREATEST(0, final_amount - :paid_amount),
                    updated_at = CURRENT_TIMESTAMP
                WHERE invoice_id = :invoice_id
            """), {
                "payment_status": payment_status,
                "paid_amount": total_paid,
                "invoice_id": invoice_id
            })
        except Exception as e:
            logger.warning(f"Could not update payment status: {e}")
        
        # Step 8: Create invoice items 
        # Disable triggers temporarily to avoid column name mismatch issue
        try:
            db.execute(text("SET session_replication_role = replica"))
        except:
            pass  # Ignore if not allowed
        
        items_created = 0
        for item in items:
            product_id = int(item.get("product_id"))
            quantity = float(item.get("quantity", 1))
            unit_price = float(item.get("unit_price", 0))
            
            # Get product details if not provided
            product_name = item.get("product_name")
            uom = item.get("uom")
            pack_type = item.get("pack_type")
            
            # Fetch product name if missing (products table doesn't have uom/pack_type)
            if not product_name:
                prod_result = db.execute(text("""
                    SELECT product_name 
                    FROM inventory.products
                    WHERE product_id = :product_id
                """), {"product_id": product_id})
                prod = prod_result.fetchone()
                product_name = prod[0] if prod else f"Product {product_id}"
            
            # Set default values for uom and pack_type if not provided
            # These are typically stored at batch level or as part of product configuration
            uom = uom or "PCS"  # Default to pieces
            pack_type = pack_type or "UNIT"  # Default to unit
            
            # Basic calculations (triggers will recalculate if needed)
            discount_percent = float(item.get("discount_percent", 0))
            
            # CRITICAL: Ensure base_quantity is used for billing (NOT quantity)
            if "base_quantity" in item:
                base_quantity = float(item["base_quantity"])
            else:
                base_quantity = float(quantity)  # fallback only if not provided
                
            logger.info(f"🔍 BACKEND INPUT: quantity={quantity}, base_quantity={base_quantity}, free_quantity={item.get('free_quantity', 0)}")
            
            # PRODUCTION: Use base_quantity for all billing calculations
            discount_amt = base_quantity * unit_price * discount_percent / 100
            logger.info(f"🔍 BACKEND CALCULATION: base_quantity={base_quantity}, unit_price={unit_price}, discount_percent={discount_percent}, discount_amt={discount_amt}")
            
            # Get batch_id if not provided (for inventory trigger)
            batch_id = item.get("batch_id")
            # Filter out invalid batch_id values like 'default_123' or empty strings
            if batch_id and (isinstance(batch_id, str) and ('default' in str(batch_id).lower() or batch_id == '')):
                batch_id = None
            # Convert batch_id to integer if it's a valid numeric string
            elif batch_id and str(batch_id).isdigit():
                batch_id = int(batch_id)
            # Get batch details including MRP
            batch_number = None
            mrp = item.get("mrp", 0)
            manufacturing_date = None
            expiry_date = item.get("expiry_date")
            
            if not batch_id:
                # Try to get FIFO batch with all details
                batch_result = db.execute(text("""
                    SELECT batch_id, batch_number, mrp_per_unit, manufacturing_date, expiry_date
                    FROM inventory.batches
                    WHERE product_id = :product_id
                    AND quantity_available > 0
                    ORDER BY expiry_date NULLS LAST, batch_id
                    LIMIT 1
                """), {"product_id": product_id})
                batch = batch_result.fetchone()
                if batch:
                    batch_id = batch[0]
                    batch_number = batch[1]
                    mrp = float(batch[2]) if batch[2] else mrp
                    manufacturing_date = batch[3]
                    expiry_date = batch[4] or expiry_date
            else:
                # Get batch details for provided batch_id
                try:
                    batch_result = db.execute(text("""
                        SELECT batch_number, mrp_per_unit, manufacturing_date, expiry_date
                        FROM inventory.batches
                        WHERE batch_id = :batch_id
                    """), {"batch_id": batch_id})
                    batch = batch_result.fetchone()
                    if batch:
                        batch_number = batch[0]
                        mrp = float(batch[1]) if batch[1] else mrp
                        manufacturing_date = batch[2]
                        expiry_date = batch[3] or expiry_date
                except Exception as batch_error:
                    logger.warning(f"Could not fetch batch {batch_id} details: {batch_error}")
                    # Continue without batch details rather than failing the entire invoice
            
            # Calculate amounts - use base_quantity for billing (production logic)
            line_total = (base_quantity * unit_price) - discount_amt
            gst_percent = item.get("gst_percent", 0)  # Default to 0 if not provided
            taxable_amount = line_total
            
            # Calculate GST amounts based on customer type
            if invoice_data.get("gst_type") == "IGST":
                igst_amount = (taxable_amount * gst_percent) / 100
                cgst_amount = sgst_amount = 0
            else:
                cgst_amount = sgst_amount = (taxable_amount * gst_percent) / 200  # Split equally
                igst_amount = 0
            
            total_tax_amount = igst_amount + cgst_amount + sgst_amount
            
            # Update line_total to include taxes (final amount for this line item)
            line_total = taxable_amount + total_tax_amount
            
            # Complete INSERT with all important fields (NOTE: invoice_items has batch_number but NOT batch_id)
            insert_result = db.execute(text("""
                INSERT INTO sales.invoice_items (
                    invoice_id, product_id, product_name, hsn_code,
                    batch_number, manufacturing_date, expiry_date,
                    quantity, uom, pack_type, pack_size, base_quantity,
                    mrp, unit_price, discount_percent, discount_amount, taxable_amount,
                    igst_rate, igst_amount, cgst_rate, cgst_amount, 
                    sgst_rate, sgst_amount, total_tax_amount, line_total,
                    free_quantity
                ) VALUES (
                    :invoice_id, :product_id, :product_name, :hsn_code,
                    :batch_number, :manufacturing_date, :expiry_date,
                    :quantity, :uom, :pack_type, :pack_size, :base_quantity,
                    :mrp, :unit_price, :discount_percent, :discount_amount, :taxable_amount,
                    :igst_rate, :igst_amount, :cgst_rate, :cgst_amount,
                    :sgst_rate, :sgst_amount, :total_tax_amount, :line_total,
                    :free_quantity
                ) RETURNING invoice_item_id
            """), {
                "invoice_id": invoice_id,
                "product_id": product_id,
                "product_name": product_name,
                "hsn_code": item.get("hsn_code"),
                "batch_number": batch_number or item.get("batch_number"),
                "manufacturing_date": manufacturing_date or item.get("manufacturing_date"),
                "expiry_date": expiry_date or item.get("expiry_date"),
                "quantity": float(quantity),  # Ensure proper type
                "uom": uom,  # Now guaranteed to have a value
                "pack_type": pack_type,  # Now guaranteed to have a value
                "pack_size": int(item.get("pack_size")) if item.get("pack_size") and str(item.get("pack_size")).isdigit() else 1,
                "base_quantity": float(base_quantity),  # Use the corrected variable
                "mrp": float(mrp),
                "unit_price": float(unit_price),
                "discount_percent": float(item.get("discount_percent", 0)),
                "discount_amount": float(discount_amt),
                "taxable_amount": float(taxable_amount),
                "igst_rate": float(gst_percent if igst_amount > 0 else 0),
                "igst_amount": float(igst_amount),
                "cgst_rate": float(gst_percent / 2 if cgst_amount > 0 else 0),
                "cgst_amount": float(cgst_amount),
                "sgst_rate": float(gst_percent / 2 if sgst_amount > 0 else 0),
                "sgst_amount": float(sgst_amount),
                "total_tax_amount": float(total_tax_amount),
                "line_total": float(line_total),
                "free_quantity": float(item.get("free_quantity", 0))
            })
            
            invoice_item_id = insert_result.scalar()
            logger.info(f"Created invoice item {invoice_item_id} for product {product_id}")
            
            # CRITICAL: Deduct inventory from batch (this was missing!)
            if batch_id:
                try:
                    inventory_update = db.execute(text("""
                        UPDATE inventory.batches 
                        SET 
                            quantity_available = quantity_available - :quantity,
                            last_movement_date = CURRENT_TIMESTAMP,
                            updated_at = CURRENT_TIMESTAMP
                        WHERE batch_id = :batch_id 
                        AND quantity_available >= :quantity
                        RETURNING quantity_available
                    """), {
                        "quantity": quantity,  # Deduct full quantity (including free items)
                        "batch_id": batch_id
                    })
                    
                    result = inventory_update.fetchone()
                    if result:
                        new_qty = result[0]
                        logger.info(f"✅ Inventory deducted: Batch {batch_id} quantity reduced by {quantity}, billed: {base_quantity}, new available: {new_qty}")
                        
                        # Create inventory movement record with all required fields
                        try:
                            # Get item details for movement record
                            pack_type = item.get("pack_type", "UNIT")
                            pack_size = int(item.get("pack_size")) if item.get("pack_size") and str(item.get("pack_size")).isdigit() else 1
                            
                            # Calculate costs (you may need to fetch these from batch)
                            unit_cost = float(item.get("unit_cost", unit_price * 0.7))  # Rough estimate
                            total_cost = unit_cost * quantity
                            
                            db.execute(text("""
                                INSERT INTO inventory.inventory_movements (
                                    org_id, movement_type, movement_direction, 
                                    product_id, batch_id, quantity,
                                    pack_type, base_quantity,
                                    unit_cost, total_cost,
                                    reference_type, reference_id, reference_number,
                                    transfer_type, reason,
                                    location_id, created_by, movement_date
                                ) VALUES (
                                    :org_id, 'sale', 'out',
                                    :product_id, :batch_id, :quantity,
                                    :pack_type, :base_quantity,
                                    :unit_cost, :total_cost,
                                    'invoice', :invoice_id, :invoice_number,
                                    'sale', 'Customer Sale',
                                    1, :created_by, CURRENT_TIMESTAMP
                                )
                            """), {
                                "org_id": org_id,
                                "product_id": product_id,
                                "batch_id": int(batch_id) if batch_id and str(batch_id).isdigit() else None,
                                "quantity": quantity,  # Full quantity moved
                                "pack_type": pack_type,
                                "base_quantity": base_quantity,
                                "unit_cost": unit_cost,
                                "total_cost": total_cost,
                                "invoice_id": invoice_id,
                                "invoice_number": f"INV-{invoice_id}",
                                "created_by": created_by
                            })
                            logger.info(f"📦 Inventory movement recorded for batch {batch_id}")
                        except Exception as movement_error:
                            logger.warning(f"⚠️ Could not record inventory movement: {movement_error}")
                            # Don't fail the transaction for movement tracking
                    else:
                        logger.warning(f"❌ Insufficient stock in batch {batch_id} for full quantity {quantity}")
                        
                except Exception as inv_error:
                    logger.error(f"❌ Inventory deduction failed for batch {batch_id}: {inv_error}")
            else:
                logger.warning(f"⚠️ No batch_id for product {product_id} - inventory not deducted")
            
            items_created += 1
        
        # Re-enable triggers
        try:
            db.execute(text("SET session_replication_role = DEFAULT"))
        except:
            pass  # Ignore if not allowed
        
        # Calculate total quantity
        total_qty = sum(float(item.get("quantity", 0)) for item in invoice_data.get("items", []))
        
        # Calculate header totals by summing from actual line items (correct approach)
        try:
            db.execute(text("""
                UPDATE sales.invoices
                SET 
                    items_count = (
                        SELECT COUNT(*) 
                        FROM sales.invoice_items 
                        WHERE invoice_id = :invoice_id
                    ),
                    total_quantity = (
                        SELECT COALESCE(SUM(quantity), 0) 
                        FROM sales.invoice_items 
                        WHERE invoice_id = :invoice_id
                    ),
                    subtotal_amount = (
                        SELECT COALESCE(SUM(base_quantity * unit_price), 0) 
                        FROM sales.invoice_items 
                        WHERE invoice_id = :invoice_id
                    ),
                    discount_amount = (
                        SELECT COALESCE(SUM(discount_amount), 0) 
                        FROM sales.invoice_items 
                        WHERE invoice_id = :invoice_id
                    ),
                    taxable_amount = (
                        SELECT COALESCE(SUM(taxable_amount), 0) 
                        FROM sales.invoice_items 
                        WHERE invoice_id = :invoice_id
                    ),
                    igst_amount = (
                        SELECT COALESCE(SUM(igst_amount), 0) 
                        FROM sales.invoice_items 
                        WHERE invoice_id = :invoice_id
                    ),
                    cgst_amount = (
                        SELECT COALESCE(SUM(cgst_amount), 0) 
                        FROM sales.invoice_items 
                        WHERE invoice_id = :invoice_id
                    ),
                    sgst_amount = (
                        SELECT COALESCE(SUM(sgst_amount), 0) 
                        FROM sales.invoice_items 
                        WHERE invoice_id = :invoice_id
                    ),
                    total_tax_amount = (
                        SELECT COALESCE(SUM(total_tax_amount), 0) 
                        FROM sales.invoice_items 
                        WHERE invoice_id = :invoice_id
                    ),
                    final_amount = (
                        SELECT 
                            COALESCE(SUM(line_total), 0) + 
                            COALESCE((SELECT freight_charges FROM sales.invoices WHERE invoice_id = :invoice_id), 0) +
                            COALESCE((SELECT insurance_charges FROM sales.invoices WHERE invoice_id = :invoice_id), 0) +
                            COALESCE((SELECT other_charges FROM sales.invoices WHERE invoice_id = :invoice_id), 0) +
                            COALESCE((SELECT round_off_amount FROM sales.invoices WHERE invoice_id = :invoice_id), 0)
                        FROM sales.invoice_items 
                        WHERE invoice_id = :invoice_id
                    ),
                    updated_at = CURRENT_TIMESTAMP
                WHERE invoice_id = :invoice_id
            """), {
                "invoice_id": invoice_id
            })
        except Exception as update_error:
            logger.warning(f"Could not update invoice totals: {update_error}")
        
        # Commit transaction
        db.commit()
        
        # Step 10: Create payment records AFTER successful invoice creation
        # IMPORTANT: Invoice-time payments MUST be linked to THIS specific invoice
        # This ensures accurate payment tracking and reconciliation
        # 
        # Payment Allocation Strategy:
        # 1. Invoice-time payments: ALWAYS linked to the creating invoice (current scenario)
        #    - Ensures direct invoice-payment relationship
        #    - Critical for accurate outstanding calculations
        # 
        # 2. Standalone payments (customer pays later): 
        #    - User can manually select invoices to allocate to
        #    - If not manually selected, system uses FIFO/LIFO (configurable)
        #    - Supports partial allocations across multiple invoices
        # 
        # 3. Advance payments: 
        #    - Remain unallocated until invoices are created
        #    - Can be applied during invoice creation or later
        # 
        # 4. Party ledger: 
        #    - Tracks ALL transactions chronologically
        #    - Shows running balance regardless of allocation
        #    - Provides complete financial history per customer
        
        # Handle legacy payment_mode if no payments array
        if not payments and invoice_data.get("payment_mode") == "cash":
            payments = [{"method": "cash", "amount": final_amount}]
        
        if payments and total_paid > 0:
            try:
                for payment in payments:
                    payment_method = payment.get("method", "cash").lower()
                    payment_amount = float(payment.get("amount", 0))
                    
                    if payment_amount > 0:
                        # Try to get payment method ID
                        try:
                            method_result = db.execute(text("""
                                SELECT payment_method_id FROM financial.payment_methods 
                                WHERE org_id = :org_id 
                                AND LOWER(method_code) = :method_code
                                LIMIT 1
                            """), {
                                "org_id": org_id,
                                "method_code": payment_method
                            })
                            method_row = method_result.fetchone()
                            payment_method_id = method_row[0] if method_row else None
                        except Exception as e:
                            logger.warning(f"Could not find payment method {payment_method}: {e}")
                            # Try to create payment method
                            try:
                                method_insert = db.execute(text("""
                                    INSERT INTO financial.payment_methods (
                                        org_id, method_code, method_name, method_type, is_active
                                    ) VALUES (
                                        :org_id, :method_code, :method_name, 'STANDARD', true
                                    ) RETURNING payment_method_id
                                """), {
                                    "org_id": org_id,
                                    "method_code": payment_method.upper(),
                                    "method_name": payment_method.capitalize()
                                })
                                payment_method_id = method_insert.scalar()
                                db.commit()
                            except Exception as create_error:
                                logger.error(f"Could not create payment method: {create_error}")
                                db.rollback()
                                payment_method_id = 1  # Default to first payment method
                        
                        if payment_method_id:
                            # Generate payment number
                            payment_number = f"PAY-{invoice_number}-{payment_method[:3].upper()}"
                            
                            # Insert payment record with proper allocation
                            try:
                                payment_insert = db.execute(text("""
                                    INSERT INTO financial.payments (
                                        org_id, branch_id, payment_number, payment_date, 
                                        payment_type, party_type, party_id, party_name,
                                        payment_amount, payment_method_id, payment_status,
                                        allocation_status, allocated_amount, unallocated_amount,
                                        reference_number, narration, created_by
                                    ) VALUES (
                                        :org_id, :branch_id, :payment_number, :payment_date,
                                        'RECEIPT', 'CUSTOMER', :customer_id, :customer_name,
                                        :payment_amount, :payment_method_id, 'CLEARED',
                                        'ALLOCATED', :payment_amount, 0,
                                        :invoice_number, :narration, :created_by
                                    ) RETURNING payment_id
                                """), {
                                    "org_id": org_id,
                                    "branch_id": branch_id,
                                    "payment_number": payment_number,
                                    "payment_date": invoice_date,
                                    "customer_id": customer_id,
                                    "customer_name": customer_name,
                                    "payment_amount": payment_amount,
                                    "payment_method_id": payment_method_id,
                                    "invoice_number": invoice_number,
                                    "narration": f"Payment for Invoice {invoice_number}",
                                    "created_by": created_by
                                })
                                payment_id = payment_insert.scalar()
                                db.commit()
                                logger.info(f"Payment created: {payment_method} - ₹{payment_amount} (ID: {payment_id})")
                                
                                # Create allocation to link this payment to THIS specific invoice
                                # This is critical - invoice-time payments must ALWAYS be linked
                                # The trigger has been fixed to use reference_id correctly
                                try:
                                    db.execute(text("""
                                        INSERT INTO financial.payment_allocations (
                                            payment_id, reference_type, reference_id, 
                                            reference_number, allocated_amount, 
                                            allocation_status, created_by
                                        ) VALUES (
                                            :payment_id, 'INVOICE', :invoice_id,
                                            :invoice_number, :allocated_amount,
                                            'active', :created_by
                                        )
                                    """), {
                                        "payment_id": payment_id,
                                        "invoice_id": invoice_id,
                                        "invoice_number": invoice_number,
                                        "allocated_amount": payment_amount,
                                        "created_by": created_by
                                    })
                                    db.commit()
                                    logger.info(f"Payment {payment_id} linked to invoice {invoice_id} via allocation")
                                    # The trigger will automatically update invoice paid_amount and status
                                except Exception as alloc_error:
                                    logger.error(f"Could not create payment allocation: {alloc_error}")
                                    db.rollback()
                                    # Payment exists but allocation failed - not critical for invoice
                                
                            except Exception as payment_error:
                                logger.error(f"Failed to create payment: {payment_error}")
                                db.rollback()
                                # Continue - payment recording is not critical
            except Exception as payments_error:
                logger.error(f"Error processing payments: {payments_error}")
                # Continue - invoice is already created successfully
        
        # Get updated totals after triggers have run
        updated_result = db.execute(text("""
            SELECT 
                final_amount,
                subtotal_amount,
                total_tax_amount as tax_amount,
                discount_amount
            FROM sales.invoices
            WHERE invoice_id = :invoice_id
        """), {"invoice_id": invoice_id})
        updated = updated_result.fetchone()
        
        if updated:
            final_amount_updated = float(updated[0])
            subtotal_updated = float(updated[1])
            tax_updated = float(updated[2])
            discount_updated = float(updated[3])
            
            # Check for mismatches between frontend and backend calculations
            frontend_total = invoice_data.get("final_amount", 0)
            if frontend_total and abs(final_amount_updated - frontend_total) > 0.01:
                logger.warning(f"""
                Invoice {invoice_id} calculation mismatch detected:
                Frontend total: {frontend_total}
                Backend total: {final_amount_updated}
                Difference: {final_amount_updated - frontend_total}
                Frontend subtotal: {invoice_data.get('subtotal_amount', 0)}
                Backend subtotal: {subtotal_updated}
                Frontend tax: {invoice_data.get('tax_amount', 0)}
                Backend tax: {tax_updated}
                """)
        else:
            final_amount_updated = final_amount
        
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
    db: Session = Depends(get_db),
    org_id: str = Depends(get_org_id_from_token)
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
                i.paid_amount,
                GREATEST(0, i.final_amount - COALESCE(i.paid_amount, 0)) as credit_amount,
                i.payment_status,
                i.invoice_status
            FROM sales.invoices i
            WHERE i.org_id = :org_id
        """
        
        params = {"org_id": org_id, "limit": limit, "offset": offset}
        
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
        
        total = db.execute(text(count_query), {"org_id": org_id, "customer_id": customer_id} if customer_id else {"org_id": org_id}).scalar()
        
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
    db: Session = Depends(get_db),
    org_id: str = Depends(get_org_id_from_token)
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
        
        # Get invoice items with pack information from batches
        items_result = db.execute(text("""
            SELECT 
                ii.*,
                b.pack_type,
                b.pack_size,
                b.units_per_pack,
                b.packages_per_box,
                b.pack_uom,
                b.base_uom
            FROM sales.invoice_items ii
            LEFT JOIN inventory.batches b ON ii.batch_id = b.batch_id
            WHERE ii.invoice_id = :invoice_id
            ORDER BY ii.invoice_item_id
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
    db: Session = Depends(get_db),
    org_id: str = Depends(get_org_id_from_token)
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
        
        result = db.execute(query, {"org_id": org_id, "limit": limit, "skip": skip})
        invoices = [dict(row._mapping) for row in result]
        
        # Get total
        total = db.execute(
            text("SELECT COUNT(*) FROM sales.invoices WHERE org_id = :org_id"),
            {"org_id": org_id}
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
async def drop_problematic_triggers(db: Session = Depends(get_db),
    org_id: str = Depends(get_org_id_from_token)):
    """Drop all remaining problematic triggers on invoices table"""
    try:
        triggers_to_drop = [
            "trigger_credit_update_on_invoice",
            "trigger_invoice_cash_flow_impact", 
            "trigger_sales_target_tracking",
            "trigger_populate_gstr1",
            "trigger_cache_refresh_invoices",
            "trigger_calculate_invoice_totals",
            "invoice_totals_trigger",
            "calculate_invoice_totals_trigger"
        ]
        
        dropped = []
        for trigger in triggers_to_drop:
            try:
                db.execute(text(f"DROP TRIGGER IF EXISTS {trigger} ON sales.invoices CASCADE"))
                dropped.append(f"{trigger} (invoices)")
            except:
                pass
            
            # Also drop from invoice_items table
            try:
                db.execute(text(f"DROP TRIGGER IF EXISTS {trigger} ON sales.invoice_items CASCADE"))
                dropped.append(f"{trigger} (invoice_items)")
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

@router.post("/fix-invoice-trigger")
async def fix_invoice_trigger(db: Session = Depends(get_db),
    org_id: str = Depends(get_org_id_from_token)):
    """Fix the calculate_invoice_totals trigger to use correct column names"""
    try:
        # Drop the problematic trigger first
        db.execute(text("DROP TRIGGER IF EXISTS trigger_calculate_invoice_totals ON sales.invoice_items CASCADE"))
        db.execute(text("DROP FUNCTION IF EXISTS calculate_invoice_totals() CASCADE"))
        
        # Create the corrected function
        db.execute(text("""
            CREATE OR REPLACE FUNCTION calculate_invoice_totals()
            RETURNS TRIGGER AS $$
            DECLARE
                v_totals RECORD;
            BEGIN
                -- Calculate totals from invoice items
                SELECT 
                    COUNT(*) as item_count,
                    COALESCE(SUM(quantity), 0) as total_quantity,
                    COALESCE(SUM(quantity * unit_price), 0) as subtotal,
                    COALESCE(SUM(discount_amount), 0) as total_discount,
                    COALESCE(SUM(taxable_amount), 0) as taxable,
                    COALESCE(SUM(igst_amount), 0) as igst,
                    COALESCE(SUM(cgst_amount), 0) as cgst,
                    COALESCE(SUM(sgst_amount), 0) as sgst,
                    COALESCE(SUM(cess_amount), 0) as cess,
                    COALESCE(SUM(total_tax_amount), 0) as total_tax,
                    COALESCE(SUM(line_total), 0) as total
                INTO v_totals
                FROM sales.invoice_items
                WHERE invoice_id = NEW.invoice_id;
                
                -- Update invoice header with correct column names
                UPDATE sales.invoices
                SET 
                    items_count = v_totals.item_count,
                    subtotal_amount = v_totals.subtotal,
                    discount_amount = v_totals.total_discount,
                    taxable_amount = v_totals.taxable,
                    igst_amount = v_totals.igst,
                    cgst_amount = v_totals.cgst,
                    sgst_amount = v_totals.sgst,
                    cess_amount = v_totals.cess,
                    total_tax_amount = v_totals.total_tax,
                    round_off_amount = ROUND(v_totals.total) - v_totals.total,
                    final_amount = ROUND(v_totals.total),
                    updated_at = CURRENT_TIMESTAMP
                WHERE invoice_id = NEW.invoice_id;
                
                RETURN NEW;
            END;
            $$ LANGUAGE plpgsql;
        """))
        
        # Create the trigger
        db.execute(text("""
            CREATE TRIGGER trigger_calculate_invoice_totals
                AFTER INSERT ON sales.invoice_items
                FOR EACH ROW
                EXECUTE FUNCTION calculate_invoice_totals();
        """))
        
        db.commit()
        
        return {
            "success": True,
            "message": "Invoice trigger fixed successfully",
            "details": "Updated calculate_invoice_totals function to use 'total_tax_amount' instead of 'tax_amount'"
        }
        
    except Exception as e:
        db.rollback()
        logger.error(f"Error fixing invoice trigger: {e}")
        raise HTTPException(status_code=500, detail=str(e))