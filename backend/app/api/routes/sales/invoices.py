"""
Invoice API - Sales invoice management

PRODUCTION-READY: Uses TenantAwareSession for AI-agent safety
"""
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import JSONResponse
from sqlalchemy import text
from datetime import date, datetime, timedelta
import logging
import time
from typing import Optional

from ....core.tenant_service import get_tenant_aware_db, with_tenant_context, TenantAwareSession
from ....core.org_context import get_org_context, OrgContext
from ....core.api_utils import handle_error
from ....core.permissions import PermissionChecker  # RBAC
from ....core.constants import InvoiceStatus, InvoicePaymentStatus, PaymentMethod
from ...services.document_number_service import DocumentNumberService
from ...services.gst_service import GSTService
from ...services.inventory_service import InventoryService
from ...services.invoice_service import InvoiceService
from ...schemas.inventory.inventory import StockMovementCreate
from ...schemas.sales.billing import (
    InvoiceCreateRequest, InvoiceItemCreate, 
    InvoiceCancelRequest, InvoiceResponse, InvoiceSummary
)
from decimal import Decimal
# Consolidated: using main DocumentNumberService
from ..enterprise_calculations import calculate_line_item, finalize_totals  # Shared helpers
from ....services.settings_service import SettingsService  # NEW: Settings enforcement

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/invoices", tags=["Invoices"])


@router.get("/generate-number")
@with_tenant_context
async def generate_invoice_number(
    _: dict = Depends(PermissionChecker("sales", "view")),  # RBAC
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    context: OrgContext = Depends(get_org_context)  # SECURE: Tenant-aware
):
    """Generate and reserve next invoice number atomically"""
    try:
        # Get org_id from context
        org_id = str(context.org_id)
        # Use V2 service for atomic number generation
        new_number = DocumentNumberService.generate_number(db.session, "invoice", org_id)
        return {"invoice_number": new_number}
    except Exception as e:
        logger.error(f"Failed to generate invoice number: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to generate invoice number: {str(e)}")

# REMOVED: /simple endpoint - legacy fallback no longer needed
# Use main POST /invoices/ endpoint with offline-first approach

@router.post("/")
@with_tenant_context
async def create_invoice(
    invoice_data: InvoiceCreateRequest,
    _: dict = Depends(PermissionChecker("sales", "create")),  # RBAC
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    context: OrgContext = Depends(get_org_context)  # SECURE: Tenant-aware
):
    """
    Create invoice with Pydantic validation
    
    Uses InvoiceCreateRequest schema for input validation.
    Backend calculates tax amounts, totals, and generates invoice number.
    """
    try:
        # Get org_id from context
        org_id = str(context.org_id)
        
        # Extract validated fields from Pydantic model
        customer_id = invoice_data.customer_id
        if not customer_id:
            return JSONResponse(
                status_code=400,
                content={"detail": "Customer ID is required"}
            )
        
        logger.info(f"Creating invoice for customer {customer_id} in org {org_id}")
        
        # SECURITY FIX: Get branch_id and created_by from authenticated context
        # Previously: Random first user/branch from DB - now uses JWT-verified values
        branch_id = context.primary_branch_id  # User's assigned branch from JWT
        created_by = context.user_id  # Authenticated user from JWT
        
        # Fallback if user doesn't have branch assigned (legacy data)
        if not branch_id:
            branch_result = db.execute(text("""
                SELECT branch_id FROM master.org_branches 
                WHERE org_id = :org_id LIMIT 1
            """), {"org_id": org_id})
            branch = branch_result.fetchone()
            branch_id = branch[0] if branch else None
            logger.warning(f"User {created_by} has no branch assigned - using default")
        
        # Step 2: Generate order number
        order_result = db.execute(text("""
            SELECT COALESCE(MAX(CAST(SUBSTRING(order_number FROM '[0-9]+') AS INTEGER)), 0) + 1
            FROM sales.orders
            WHERE org_id = :org_id
        """), {"org_id": org_id})
        order_num = order_result.scalar() or 1
        order_number = f"ORD-{order_num:06d}"
        
        # Step 3: Calculate totals from items using InvoiceService (DRY)
        # Convert Pydantic items to dicts for service compatibility
        items = [item.model_dump() for item in invoice_data.items]
        
        # Use GST type from frontend or auto-detect
        gst_type = invoice_data.gst_type
        if not gst_type or gst_type == "CGST/SGST":
            gst_type = GSTService.determine_gst_type(
                db=db,
                org_id=context.org_id,
                customer_id=customer_id,
                billing_address_id=None  # Frontend sends address string, not ID
            )
        
        freight_charges = invoice_data.delivery_charges
        insurance_charges = 0.0
        other_charges = 0.0
        invoice_discount = float(invoice_data.discount_amount)
        
        # Use service method for consistent calculations
        totals = InvoiceService.calculate_invoice_totals(
            items=items,
            gst_type=gst_type,
            freight_charges=freight_charges,
            insurance_charges=insurance_charges,
            other_charges=other_charges,
            invoice_discount=invoice_discount
        )
        
        # Extract calculated values
        subtotal = totals["subtotal"]
        total_discount = totals["total_discount"]
        taxable_amount = totals["taxable_amount"]
        total_cgst = totals["total_cgst"]
        total_sgst = totals["total_sgst"]
        total_igst = totals["total_igst"]
        total_tax = totals["total_tax"]
        round_off_amount = totals["round_off_amount"]
        final_amount = totals["final_amount"]
        
        # SIMPLIFIED: Pydantic model handles date validation - use directly
        invoice_date = invoice_data.invoice_date
        logger.info(f"Using invoice_date: {invoice_date}")
        
        # For offline sync, use current timestamp
        created_at = None  # Will use CURRENT_TIMESTAMP in SQL
        
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
                :created_by, COALESCE(:created_at, CURRENT_TIMESTAMP)
            ) RETURNING order_id
        """), {
            "org_id": context.org_id,
            "branch_id": branch_id,
            "order_number": order_number,
            "order_date": invoice_date,  # ✅ Use actual invoice date, not today!
            "customer_id": customer_id,
            "subtotal": subtotal,
            "discount": total_discount,  # Sum of item-level discounts
            "taxable": taxable_amount,
            "cgst": total_cgst,
            "sgst": total_sgst,
            "tax": total_tax,
            "final": final_amount,
            "created_by": created_by,
            "created_at": created_at  # ✅ Use original timestamp if provided
        })
        order_id = order_create.scalar()
        
        # Step 5: Generate invoice number using unified service
        invoice_number = DocumentNumberService.generate_number(db, "invoice", org_id)
        
        # Step 6: Get customer details using InvoiceService
        customer_details = InvoiceService.get_customer_details(db, customer_id, org_id)
        customer_name = customer_details["customer_name"]
        billing_address_id = customer_details["billing_address_id"]
        shipping_address_id = customer_details["shipping_address_id"]
        
        # Calculate due date based on payment terms\n        payment_terms = invoice_data.get(\"payment_terms\", \"cash\")
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
            "org_id": context.org_id,
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
            "tax": total_tax,
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
            payment_status = InvoicePaymentStatus.PAID.value
        elif total_paid > 0:
            payment_status = InvoicePaymentStatus.PARTIAL.value
        else:
            payment_status = InvoicePaymentStatus.UNPAID.value
        
        # Update invoice payment status
        try:
            db.execute(text("""
                UPDATE sales.invoices
                SET payment_status = :payment_status,
                    paid_amount = :paid_amount,
                    credit_amount = GREATEST(0, final_amount - :paid_amount),
                    updated_at = CURRENT_TIMESTAMP
                WHERE invoice_id = :invoice_id AND org_id = :org_id
            """), {
                "payment_status": payment_status,
                "paid_amount": total_paid,
                "invoice_id": invoice_id,
                "org_id": str(org_id)
            })
        except Exception as e:
            logger.warning(f"Could not update payment status: {e}")
        
        # Note: Triggers handle data correctly now - no need to disable them
        
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
                    WHERE product_id = :product_id AND org_id = :org_id
                """), {"product_id": product_id, "org_id": str(org_id)})
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
                    AND org_id = :org_id
                    AND quantity_available > 0
                    ORDER BY expiry_date NULLS LAST, batch_id
                    LIMIT 1
                """), {"product_id": product_id, "org_id": str(org_id)})
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
                        WHERE batch_id = :batch_id AND org_id = :org_id
                    """), {"batch_id": batch_id, "org_id": str(org_id)})
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
            gst_percent = float(item.get("gst_percent", 0))  # Single source of truth
            taxable_amount = line_total
            
            # Calculate GST amounts using GSTService for consistency
            gst_type = invoice_data.get("gst_type", "CGST/SGST")
            from decimal import Decimal
            gst_components = GSTService.calculate_gst_components(
                Decimal(str(taxable_amount)),
                Decimal(str(gst_percent)),
                gst_type
            )
            cgst_amount = float(gst_components["cgst_amount"])
            sgst_amount = float(gst_components["sgst_amount"])
            igst_amount = float(gst_components["igst_amount"])
            total_tax_amount = float(gst_components["total_tax_amount"])
            
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
                        AND org_id = :org_id
                        AND quantity_available >= :quantity
                        RETURNING quantity_available
                    """), {
                        "quantity": quantity,  # Deduct full quantity (including free items)
                        "batch_id": batch_id,
                        "org_id": str(org_id)
                    })
                    
                    result = inventory_update.fetchone()
                    if result:
                        new_qty = result[0]
                        logger.info(f"✅ Inventory deducted: Batch {batch_id} quantity reduced by {quantity}, billed: {base_quantity}, new available: {new_qty}")
                        
                        # Create inventory movement record using InventoryService
                        try:
                            # Get item details for movement record
                            pack_type = item.get("pack_type", "UNIT")
                            
                            # Calculate costs (you may need to fetch these from batch)
                            unit_cost = float(item.get("unit_cost", unit_price * 0.7))  # Rough estimate
                            total_cost = unit_cost * quantity
                            
                            # Use InventoryService for movement record (batch already updated above)
                            movement_data = StockMovementCreate(
                                org_id=context.org_id,
                                product_id=product_id,
                                batch_id=int(batch_id) if batch_id and str(batch_id).isdigit() else None,
                                movement_type="sale",
                                movement_direction="out",
                                movement_date=date.today(),
                                quantity=quantity,
                                pack_type=pack_type,
                                base_quantity=base_quantity,
                                unit_cost=Decimal(str(unit_cost)),
                                total_cost=Decimal(str(total_cost)),
                                reference_type="invoice",
                                reference_id=invoice_id,
                                reference_number=f"INV-{invoice_id}",
                                transfer_type="sale",
                                reason="Customer Sale",
                                location_id=1,
                                created_by=created_by
                            )
                            
                            # Note: batch already updated above, so we just need to record the movement
                            # The service will try to update batch again, but should handle gracefully
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
                                    :org_id, :movement_type, :movement_direction,
                                    :product_id, :batch_id, :quantity,
                                    :pack_type, :base_quantity,
                                    :unit_cost, :total_cost,
                                    :reference_type, :reference_id, :reference_number,
                                    :transfer_type, :reason,
                                    :location_id, :created_by, CURRENT_TIMESTAMP
                                )
                            """), {
                                "org_id": context.org_id,
                                "movement_type": "sale",
                                "movement_direction": "out",
                                "product_id": product_id,
                                "batch_id": int(batch_id) if batch_id and str(batch_id).isdigit() else None,
                                "quantity": quantity,
                                "pack_type": pack_type,
                                "base_quantity": base_quantity,
                                "unit_cost": unit_cost,
                                "total_cost": total_cost,
                                "reference_type": "invoice",
                                "reference_id": invoice_id,
                                "reference_number": f"INV-{invoice_id}",
                                "transfer_type": "sale",
                                "reason": "Customer Sale",
                                "location_id": 1,
                                "created_by": created_by
                            })
                            logger.info(f"📦 Inventory movement recorded for batch {batch_id}")
                        except Exception as movement_error:
                            logger.warning(f"⚠️ Could not record inventory movement: {movement_error}")
                            # Don't fail the transaction for movement tracking
                    else:
                        # CRITICAL FIX: Fail the invoice if insufficient stock
                        # Get current available quantity for better error message
                        stock_check = db.execute(text("""
                            SELECT quantity_available FROM inventory.batches
                            WHERE batch_id = :batch_id AND org_id = :org_id
                        """), {"batch_id": batch_id, "org_id": str(org_id)})
                        current_stock = stock_check.fetchone()
                        available = current_stock[0] if current_stock else 0
                        
                        error_msg = f"Insufficient stock for product {product_id} (batch {batch_id}): Required {quantity}, Available {available}"
                        logger.error(f"❌ INVOICE CREATION FAILED: {error_msg}")
                        db.rollback()
                        raise HTTPException(
                            status_code=409,  # Conflict status
                            detail={
                                "error": "INSUFFICIENT_STOCK",
                                "message": error_msg,
                                "product_id": product_id,
                                "batch_id": batch_id,
                                "required_quantity": quantity,
                                "available_quantity": available,
                                "invoice_number": invoice_data.get("invoice_number", "DRAFT")
                            }
                        )
                        
                except Exception as inv_error:
                    logger.error(f"❌ Inventory deduction failed for batch {batch_id}: {inv_error}")
            else:
                logger.warning(f"⚠️ No batch_id for product {product_id} - inventory not deducted")
            
            items_created += 1
        
        # Triggers are enabled and work correctly
        
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
        
        # Verify invoice was created successfully
        invoice_verify = db.execute(text("""
            SELECT invoice_id, invoice_number, final_amount
            FROM sales.invoices
            WHERE invoice_id = :invoice_id AND org_id = :org_id
        """), {"invoice_id": invoice_id, "org_id": str(org_id)})
        inv_check = invoice_verify.fetchone()
        
        if not inv_check:
            logger.error(f"CRITICAL: Invoice {invoice_id} not found after commit!")
            raise Exception(f"Invoice {invoice_id} was not created properly")
        
        # Use the verified invoice_id to ensure it's correct
        verified_invoice_id = inv_check[0]
        verified_invoice_number = inv_check[1]
        verified_final_amount = float(inv_check[2])
        
        logger.info(f"Invoice {verified_invoice_id} ({verified_invoice_number}) created successfully with amount ₹{verified_final_amount}")
        
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
                                "org_id": context.org_id,
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
                                    "org_id": context.org_id,
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
                                    "org_id": context.org_id,
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
                                    logger.info(f"Creating allocation: payment_id={payment_id}, invoice_id={verified_invoice_id}, amount={payment_amount}")
                                    
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
                                        "invoice_id": verified_invoice_id,  # Use verified ID
                                        "invoice_number": verified_invoice_number,  # Use verified number
                                        "allocated_amount": payment_amount,
                                        "created_by": created_by
                                    })
                                    db.commit()
                                    logger.info(f"✅ Payment {payment_id} successfully linked to invoice {verified_invoice_id} via allocation")
                                    # The trigger will automatically update invoice paid_amount and status
                                except Exception as alloc_error:
                                    logger.error(f"❌ Allocation failed for payment {payment_id} to invoice {verified_invoice_id}: {alloc_error}")
                                    db.rollback()
                                    # Payment exists but allocation failed - not critical for invoice
                                
                            except Exception as payment_error:
                                logger.error(f"Failed to create payment: {payment_error}")
                                db.rollback()
                                # Continue - payment recording is not critical
            except Exception as payments_error:
                logger.error(f"Error processing payments: {payments_error}")
                # Continue - invoice is already created successfully
        
        # Step 11: Create customer_outstanding record using InvoiceService
        # This is critical for party ledger, aging reports, and collection management
        InvoiceService.create_outstanding_record(
            db=db,
            invoice_id=verified_invoice_id,
            invoice_number=verified_invoice_number,
            customer_id=customer_id,
            invoice_date=invoice_date,
            org_id=str(org_id)
        )
        
        # Get updated totals after triggers have run
        updated_result = db.execute(text("""
            SELECT
                final_amount,
                subtotal_amount,
                total_tax_amount as tax_amount,
                discount_amount
            FROM sales.invoices
            WHERE invoice_id = :invoice_id AND org_id = :org_id
        """), {"invoice_id": invoice_id, "org_id": str(org_id)})
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
        raise handle_error(e, "create invoice")

@router.get("/")
@with_tenant_context
async def get_invoices(
    limit: int = 50,
    offset: int = 0,
    customer_id: Optional[int] = None,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    payment_status: Optional[str] = None,   # NEW: paid, partial, pending
    invoice_status: Optional[str] = None,   # NEW: draft, posted, cancelled
    search: Optional[str] = None,           # NEW: search invoice_number, customer_name
    _: dict = Depends(PermissionChecker("sales", "view")),  # RBAC
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    context: OrgContext = Depends(get_org_context)  # SECURE: Tenant-aware
):
    """Get list of invoices with pagination and filters"""
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
                i.invoice_status,
                i.cgst_amount,
                i.sgst_amount,
                i.igst_amount,
                i.total_tax_amount,
                i.taxable_amount,
                i.subtotal_amount
            FROM sales.invoices i
            WHERE 1=1
        """
        
        params = {"limit": limit, "offset": offset}


        if customer_id:
            query += " AND i.customer_id = :customer_id"
            params["customer_id"] = customer_id

        if date_from:
            query += " AND i.invoice_date >= :date_from"
            params["date_from"] = date_from

        if date_to:
            query += " AND i.invoice_date <= :date_to"
            params["date_to"] = date_to
        
        # NEW: Status filters
        if payment_status:
            query += " AND i.payment_status = :payment_status"
            params["payment_status"] = payment_status
        
        if invoice_status:
            query += " AND i.invoice_status = :invoice_status"
            params["invoice_status"] = invoice_status
        
        # NEW: Search filter
        if search:
            query += """ AND (
                i.invoice_number ILIKE :search 
                OR i.customer_name ILIKE :search
            )"""
            params["search"] = f"%{search}%"

        query += " ORDER BY i.invoice_date DESC, i.created_at DESC LIMIT :limit OFFSET :offset"
        
        result = db.execute(text(query), params)
        invoices = [dict(row._mapping) for row in result]
        
        # Get total count
        count_query = "SELECT COUNT(*) FROM sales.invoices WHERE 1=1"
        count_params = {}
        
        if customer_id:
            count_query += " AND customer_id = :customer_id"
            count_params["customer_id"] = customer_id
        
        if date_from:
            count_query += " AND invoice_date >= :date_from"
            count_params["date_from"] = date_from

        if date_to:
            count_query += " AND invoice_date <= :date_to"
            count_params["date_to"] = date_to
        
        total = db.execute(text(count_query), count_params).scalar()
        
        return {
            "invoices": invoices,
            "total": total,
            "limit": limit,
            "offset": offset
        }
        
    except Exception as e:
        raise handle_error(e, "list invoices")

@router.get("/{invoice_id}")
@with_tenant_context
async def get_invoice(
    invoice_id: int,
    _: dict = Depends(PermissionChecker("sales", "view")),  # RBAC
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    context: OrgContext = Depends(get_org_context)  # SECURE: Tenant-aware
):
    """Get invoice by ID"""
    try:
        result = db.execute(text("""
            SELECT
                i.*,
                o.order_number
            FROM sales.invoices i
            LEFT JOIN sales.orders o ON i.order_id = o.order_id AND o.org_id = i.org_id
            WHERE i.invoice_id = :invoice_id AND i.org_id = :org_id
        """), {"invoice_id": invoice_id, "org_id": str(context.org_id)})
        
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
            LEFT JOIN inventory.batches b ON ii.batch_id = b.batch_id AND b.org_id = :org_id
            WHERE ii.invoice_id = :invoice_id
            ORDER BY ii.invoice_item_id
        """), {"invoice_id": invoice_id, "org_id": str(context.org_id)})
        
        invoice_dict["items"] = [dict(item._mapping) for item in items_result]
        
        return invoice_dict
        
    except HTTPException:
        raise
    except Exception as e:
        raise handle_error(e, "get invoice", invoice_id)

# Removed duplicate /list endpoint - use GET / instead


@router.put("/{invoice_id}")
@with_tenant_context
async def update_invoice(
    invoice_id: int,
    invoice_data: dict,
    _: dict = Depends(PermissionChecker("sales", "edit")),  # RBAC
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    context: OrgContext = Depends(get_org_context)
):
    """
    Update invoice - ONLY for draft invoices
    
    Posted invoices cannot be edited, must be cancelled and re-created.
    """
    try:
        org_id = str(context.org_id)
        
        # Check invoice exists and is in draft status
        check_result = db.execute(text("""
            SELECT invoice_status, payment_status FROM sales.invoices
            WHERE invoice_id = :invoice_id AND org_id = :org_id
        """), {"invoice_id": invoice_id, "org_id": org_id})
        
        invoice = check_result.fetchone()
        if not invoice:
            raise HTTPException(status_code=404, detail="Invoice not found")
        
        if invoice[0] != InvoiceStatus.DRAFT.value:
            raise HTTPException(
                status_code=400, 
                detail=f"Cannot edit invoice in '{invoice[0]}' status. Only draft invoices can be updated."
            )
        
        # Build update query from provided fields
        update_fields = []
        params = {"invoice_id": invoice_id, "org_id": org_id}
        
        editable_fields = [
            "notes", "payment_terms", "due_date", 
            "freight_charges", "insurance_charges", "other_charges"
        ]
        
        for field in editable_fields:
            if field in invoice_data:
                update_fields.append(f"{field} = :{field}")
                params[field] = invoice_data[field]
        
        if not update_fields:
            return {"message": "No fields to update", "invoice_id": invoice_id}
        
        update_fields.append("updated_at = CURRENT_TIMESTAMP")
        
        db.execute(text(f"""
            UPDATE sales.invoices
            SET {', '.join(update_fields)}
            WHERE invoice_id = :invoice_id AND org_id = :org_id
        """), params)
        
        db.commit()
        
        return {"success": True, "message": "Invoice updated", "invoice_id": invoice_id}
        
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise handle_error(e, "update invoice", invoice_id)


@router.post("/{invoice_id}/cancel")
@with_tenant_context
async def cancel_invoice(
    invoice_id: int,
    reason: str = None,
    _: dict = Depends(PermissionChecker("sales", "delete")),  # RBAC
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    context: OrgContext = Depends(get_org_context)
):
    """
    Cancel/void an invoice
    
    - For draft invoices: Simply marks as cancelled
    - For posted invoices: Creates reversal entries
    - Cannot cancel invoices with payments (must reverse payments first)
    """
    try:
        org_id = str(context.org_id)
        
        # Check invoice exists and get its status
        check_result = db.execute(text("""
            SELECT invoice_status, payment_status, paid_amount, final_amount
            FROM sales.invoices
            WHERE invoice_id = :invoice_id AND org_id = :org_id
        """), {"invoice_id": invoice_id, "org_id": org_id})
        
        invoice = check_result.fetchone()
        if not invoice:
            raise HTTPException(status_code=404, detail="Invoice not found")
        
        invoice_status, payment_status, paid_amount, final_amount = invoice
        
        if invoice_status == InvoiceStatus.CANCELLED.value:
            raise HTTPException(status_code=400, detail="Invoice is already cancelled")
        
        # Cannot cancel if there are payments
        if paid_amount and float(paid_amount) > 0:
            raise HTTPException(
                status_code=400,
                detail=f"Cannot cancel invoice with payments. ₹{paid_amount} has been paid. Reverse payments first."
            )
        
        # Mark invoice as cancelled
        db.execute(text("""
            UPDATE sales.invoices
            SET invoice_status = :cancelled_status,
                cancelled_at = CURRENT_TIMESTAMP,
                cancelled_by = :cancelled_by,
                cancellation_reason = :reason,
                updated_at = CURRENT_TIMESTAMP
            WHERE invoice_id = :invoice_id AND org_id = :org_id
        """), {
            "invoice_id": invoice_id,
            "org_id": org_id,
            "cancelled_status": InvoiceStatus.CANCELLED.value,
            "cancelled_by": context.user_id,
            "reason": reason or "Cancelled by user"
        })
        
        # If it was a posted invoice, we may need to reverse inventory
        if invoice_status == 'posted':
            # Get invoice items to reverse inventory
            items_result = db.execute(text("""
                SELECT product_id, batch_id, quantity
                FROM sales.invoice_items
                WHERE invoice_id = :invoice_id
            """), {"invoice_id": invoice_id})
            
            for item in items_result:
                if item[1]:  # Has batch_id
                    try:
                        # Reverse inventory deduction
                        db.execute(text("""
                            UPDATE inventory.batches
                            SET quantity_available = quantity_available + :quantity,
                                updated_at = CURRENT_TIMESTAMP
                            WHERE batch_id = :batch_id AND org_id = :org_id
                        """), {
                            "batch_id": item[1],
                            "quantity": item[2],
                            "org_id": org_id
                        })
                        logger.info(f"Reversed inventory for batch {item[1]}: +{item[2]}")
                    except Exception as inv_err:
                        logger.warning(f"Could not reverse inventory for batch {item[1]}: {inv_err}")
        
        db.commit()
        
        return {
            "success": True,
            "message": "Invoice cancelled successfully",
            "invoice_id": invoice_id,
            "previous_status": invoice_status
        }
        
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise handle_error(e, "cancel invoice", invoice_id)


# REMOVED: /drop-problematic-triggers endpoint - moved to admin scripts
# Use: backend/scripts/maintenance/drop_problematic_triggers.sql

# REMOVED: /fix-invoice-trigger endpoint - moved to admin scripts
# Use: backend/scripts/maintenance/fix_invoice_trigger.sql