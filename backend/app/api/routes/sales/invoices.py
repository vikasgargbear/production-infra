"""
Invoice API - Sales invoice management

PRODUCTION-READY: Uses TenantAwareSession for AI-agent safety
"""
from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
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

def process_inventory_background(
    org_id: str,
    invoice_id: int,
    batch_deductions: list,
    movement_records: list,
    invoice_totals: dict,
    created_by: int
):
    """
    Background task to process inventory updates after invoice is returned.
    This runs AFTER the response is sent to the user for faster perceived performance.
    """
    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker
    import os
    
    try:
        # Create new DB session for background task (can't reuse request session)
        database_url = os.environ.get("DATABASE_URL")
        if not database_url:
            logger.error("DATABASE_URL not set for background task")
            return
        
        engine = create_engine(database_url)
        Session = sessionmaker(bind=engine)
        db = Session()
        
        try:
            # BULK UPDATE: Batch quantities
            if batch_deductions:
                case_parts = []
                batch_ids_to_update = []
                update_params = {"org_id": org_id}
                
                for i, bd in enumerate(batch_deductions):
                    case_parts.append(f"WHEN batch_id = :bid_{i} THEN quantity_available - :qty_{i}")
                    batch_ids_to_update.append(bd["batch_id"])
                    update_params[f"bid_{i}"] = bd["batch_id"]
                    update_params[f"qty_{i}"] = bd["quantity"]
                
                update_params["batch_ids"] = batch_ids_to_update
                
                bulk_update_sql = f"""
                    UPDATE inventory.batches
                    SET 
                        quantity_available = CASE {" ".join(case_parts)} ELSE quantity_available END,
                        last_movement_date = CURRENT_TIMESTAMP,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE batch_id = ANY(:batch_ids) AND org_id = :org_id
                """
                db.execute(text(bulk_update_sql), update_params)
                logger.info(f"✅ [BACKGROUND] Updated {len(batch_deductions)} batch quantities for invoice {invoice_id}")
            
            # BULK INSERT: Inventory Movements
            if movement_records:
                mv_values_list = []
                mv_params = {}
                for i, mv in enumerate(movement_records):
                    mv_values_list.append(f"""(
                        :org_id_{i}, 'sale', 'out',
                        :product_id_{i}, :batch_id_{i}, :quantity_{i},
                        :pack_type_{i}, :base_quantity_{i},
                        :unit_cost_{i}, :total_cost_{i},
                        'invoice', :invoice_id_{i}, :reference_number_{i},
                        'sale', 'Customer Sale',
                        1, :created_by_{i}, CURRENT_TIMESTAMP
                    )""")
                    mv_params[f"org_id_{i}"] = mv["org_id"]
                    mv_params[f"product_id_{i}"] = mv["product_id"]
                    mv_params[f"batch_id_{i}"] = mv["batch_id"]
                    mv_params[f"quantity_{i}"] = mv["quantity"]
                    mv_params[f"pack_type_{i}"] = mv["pack_type"]
                    mv_params[f"base_quantity_{i}"] = mv["base_quantity"]
                    mv_params[f"unit_cost_{i}"] = mv["unit_cost"]
                    mv_params[f"total_cost_{i}"] = mv["total_cost"]
                    mv_params[f"invoice_id_{i}"] = invoice_id
                    mv_params[f"reference_number_{i}"] = f"INV-{invoice_id}"
                    mv_params[f"created_by_{i}"] = created_by
                
                bulk_mv_sql = f"""
                    INSERT INTO inventory.inventory_movements (
                        org_id, movement_type, movement_direction,
                        product_id, batch_id, quantity,
                        pack_type, base_quantity,
                        unit_cost, total_cost,
                        reference_type, reference_id, reference_number,
                        transfer_type, reason,
                        location_id, created_by, movement_date
                    ) VALUES {", ".join(mv_values_list)}
                """
                db.execute(text(bulk_mv_sql), mv_params)
                logger.info(f"✅ [BACKGROUND] Inserted {len(movement_records)} inventory movements for invoice {invoice_id}")
            
            # Update invoice totals (pre-calculated)
            if invoice_totals:
                db.execute(text("""
                    UPDATE sales.invoices
                    SET 
                        items_count = :items_count,
                        total_quantity = :total_qty,
                        subtotal_amount = :subtotal,
                        discount_amount = :item_discount,
                        scheme_discount = :invoice_discount,
                        taxable_amount = :taxable_amount,
                        igst_amount = :igst,
                        cgst_amount = :cgst,
                        sgst_amount = :sgst,
                        total_tax_amount = :total_tax,
                        final_amount = :final_amount,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE invoice_id = :invoice_id
                """), {**invoice_totals, "invoice_id": invoice_id})
                logger.info(f"✅ [BACKGROUND] Updated totals for invoice {invoice_id}")
            
            # Update customer's current_outstanding balance
            if invoice_totals:
                try:
                    customer_id = invoice_totals.get("customer_id")
                    final_amount = invoice_totals.get("final_amount", 0)
                    
                    # Add invoice amount to customer's outstanding balance
                    db.execute(text("""
                        UPDATE parties.customers 
                        SET current_outstanding = COALESCE(current_outstanding, 0) + :amount,
                            updated_at = CURRENT_TIMESTAMP
                        WHERE customer_id = :customer_id
                    """), {
                        "customer_id": customer_id,
                        "amount": final_amount
                    })
                    logger.info(f"✅ [BACKGROUND] Updated customer {customer_id} outstanding by +{final_amount}")
                except Exception as outstanding_error:
                    logger.warning(f"⚠️ [BACKGROUND] Could not create outstanding record: {outstanding_error}")
            
            db.commit()
            logger.info(f"✅ [BACKGROUND] Completed async processing for invoice {invoice_id}")
            
        except Exception as e:
            db.rollback()
            logger.error(f"❌ [BACKGROUND] Failed async processing for invoice {invoice_id}: {e}")
        finally:
            db.close()
            
    except Exception as e:
        logger.error(f"❌ [BACKGROUND] Failed to create session for invoice {invoice_id}: {e}")

@router.post("/")
@with_tenant_context
async def create_invoice(
    invoice_data: InvoiceCreateRequest,
    background_tasks: BackgroundTasks,
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
        
        # Step 2: Generate order number using centralized service
        from ...services.document_number_service import DocumentNumberService
        order_number = DocumentNumberService.generate_number(db, "sales_order", str(org_id))
        
        # Step 3: Calculate totals from items using InvoiceService (DRY)
        # Convert Pydantic items to dicts for service compatibility
        items = [item.model_dump() for item in invoice_data.items]
        
        
        # Use GST type from frontend directly (auto-detection disabled - org_branches schema issue)
        # Frontend already sends gst_type: "CGST/SGST" or "IGST" based on customer location
        gst_type = invoice_data.gst_type or "CGST/SGST"
        
        freight_charges = float(invoice_data.freight_charges or 0)  # Canonical name from schema
        insurance_charges = 0.0
        other_charges = 0.0
        
        # Invoice-level discount parameters (will be calculated by service)
        discount_type = invoice_data.discount_type or "percentage"
        discount_percent = float(invoice_data.discount_percent or 0)
        discount_amount_fixed = float(invoice_data.discount_amount or 0)
        
        # GST type from frontend directly (auto-detection disabled)
        gst_type = invoice_data.gst_type or "CGST/SGST"
        
        # Call service ONCE for ALL calculations (single source of truth)
        # Service handles item-level discounts, invoice-level discount, GST, rounding
        totals = InvoiceService.calculate_invoice_totals(
            items=items,
            gst_type=gst_type,
            freight_charges=freight_charges,
            insurance_charges=insurance_charges,
            other_charges=other_charges,
            discount_type=discount_type,
            discount_percent=discount_percent,
            discount_amount=discount_amount_fixed
        )
        
        # Extract calculated values (using database-aligned field names)
        subtotal = totals["subtotal_amount"]            # DB: subtotal_amount
        total_discount = totals["discount_amount"]      # DB: discount_amount (item-level)
        invoice_discount = totals["scheme_discount"]    # DB: scheme_discount (invoice-level)
        taxable_amount = totals["taxable_amount"]       # DB: taxable_amount
        total_cgst = totals["cgst_amount"]              # DB: cgst_amount
        total_sgst = totals["sgst_amount"]              # DB: sgst_amount
        total_igst = totals["igst_amount"]              # DB: igst_amount
        total_tax = totals["total_tax_amount"]          # DB: total_tax_amount
        round_off_amount = totals["round_off_amount"]   # DB: round_off_amount
        final_amount = totals["final_amount"]           # DB: final_amount
        
        # Extracted line calculations for inserting later (AVOIDS REDUNDANT RE-CALCULATION)
        line_item_details = totals.get("line_calculations", [])
        
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
        
        # Due date: Use frontend value if provided, otherwise calculate from payment terms
        payment_terms = invoice_data.payment_mode or "cash"
        invoice_date_obj = invoice_date if isinstance(invoice_date, date) else date.today()
        
        if invoice_data.due_date:
            # Frontend provided due_date - respect it
            due_date = invoice_data.due_date
        elif payment_terms == "credit":
            due_date = invoice_date_obj + timedelta(days=30)  # Default 30 days for credit
        elif payment_terms == "cash":
            due_date = invoice_date_obj  # Same day for cash
        else:
            due_date = invoice_date_obj + timedelta(days=7)  # Default 7 days
        
        # Step 7: Create invoice with ALL important fields
        invoice_create = db.execute(text("""
            INSERT INTO sales.invoices (
                org_id, branch_id, invoice_number, invoice_date, invoice_type,
                order_id, customer_id, customer_name,
                billing_address_id, shipping_address_id,
                subtotal_amount, discount_amount, scheme_discount, taxable_amount,
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
                :subtotal, :item_discount, :scheme_discount, :taxable,
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
            "item_discount": total_discount,  # Sum of item-level discounts
            "scheme_discount": invoice_discount,  # Invoice-level discount
            "taxable": taxable_amount,
            "igst": 0,  # IGST calculated by service based on gst_type
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
            "notes": invoice_data.notes,
            "bank_account_id": None,  # Not in current schema
            "created_by": created_by
        })
        invoice_id = invoice_create.scalar()
        
        # Step 7.5: Payment methods should already exist (populated via MASTER_DATABASE_FIXES.sql)
        # No need to check or create them on every invoice
        
        # Step 7.6: Calculate total paid amount first (for invoice status)
        payments = invoice_data.payments or []
        total_paid = 0
        
        if payments:
            for payment in payments:
                payment_amount = float(payment.get("amount", 0))
                if payment_amount > 0:
                    total_paid += payment_amount
        
        # If no payments array, check legacy payment_mode field  
        elif invoice_data.payment_mode:
            payment_mode = (invoice_data.payment_mode or "").lower()
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
        
        # PERFORMANCE: Batch lookup all products and batches BEFORE item loop (eliminates N+1)
        product_ids = [int(item.get("product_id")) for item in items]
        batch_ids = [int(item.get("batch_id")) for item in items if item.get("batch_id") and str(item.get("batch_id")).isdigit()]
        
        # Batch fetch product names
        products_lookup = {}
        if product_ids:
            prod_result = db.execute(text("""
                SELECT product_id, product_name
                FROM inventory.products
                WHERE product_id = ANY(:product_ids) AND org_id = :org_id
            """), {"product_ids": product_ids, "org_id": str(org_id)})
            products_lookup = {row[0]: row[1] for row in prod_result.fetchall()}
        
        # Batch fetch batch details
        batches_lookup = {}
        if batch_ids:
            batch_result = db.execute(text("""
                SELECT batch_id, batch_number, mrp_per_unit, manufacturing_date, expiry_date, cost_per_unit
                FROM inventory.batches
                WHERE batch_id = ANY(:batch_ids) AND org_id = :org_id
            """), {"batch_ids": batch_ids, "org_id": str(org_id)})
            batches_lookup = {row[0]: {"batch_number": row[1], "mrp": row[2], "mfg_date": row[3], "exp_date": row[4], "cost_per_unit": row[5]} for row in batch_result.fetchall()}
        
        # For items without batch_id, get FIFO batches in one query
        products_needing_batches = [int(item.get("product_id")) for item in items if not item.get("batch_id") or not str(item.get("batch_id")).isdigit()]
        fifo_batches = {}
        if products_needing_batches:
            fifo_result = db.execute(text("""
                SELECT DISTINCT ON (product_id) product_id, batch_id, batch_number, mrp_per_unit, manufacturing_date, expiry_date, cost_per_unit
                FROM inventory.batches
                WHERE product_id = ANY(:product_ids) AND org_id = :org_id AND quantity_available > 0
                ORDER BY product_id, expiry_date NULLS LAST, batch_id
            """), {"product_ids": products_needing_batches, "org_id": str(org_id)})
            fifo_batches = {row[0]: {"batch_id": row[1], "batch_number": row[2], "mrp": row[3], "mfg_date": row[4], "exp_date": row[5], "cost_per_unit": row[6]} for row in fifo_result.fetchall()}
        
        # =========================================================================
        # OPTIMIZED: BULK OPERATIONS - Prepare all data first, then bulk INSERT
        # Before: 3N queries (N items × 3 operations each)
        # After: 3 queries total (1 bulk INSERT + 1 bulk UPDATE + 1 bulk INSERT)
        # =========================================================================
        
        # Data preparation lists
        invoice_items_data = []
        batch_deductions = []  # (batch_id, quantity_to_deduct, product_id)
        movement_records = []
        
        from decimal import Decimal
        gst_type = invoice_data.gst_type or "CGST/SGST"
        
        for i, item in enumerate(items):
            product_id = int(item.get("product_id"))
            quantity = float(item.get("quantity", 1))
            unit_price = float(item.get("unit_price", 0))
            
            # Get product details - use pre-fetched lookup
            product_name = item.get("product_name") or products_lookup.get(product_id, f"Product {product_id}")
            uom = item.get("uom") or "PCS"
            pack_type = item.get("pack_type") or "UNIT"
            
            # Calculate quantities
            discount_percent = float(item.get("discount_percent", 0))
            base_quantity = float(item.get("base_quantity", quantity))
            free_quantity = float(item.get("free_quantity", 0))
            total_quantity = base_quantity + free_quantity
            
            # Get batch_id - use pre-fetched lookups
            batch_id = item.get("batch_id")
            if batch_id and (isinstance(batch_id, str) and ('default' in str(batch_id).lower() or batch_id == '')):
                batch_id = None
            elif batch_id and str(batch_id).isdigit():
                batch_id = int(batch_id)
            
            batch_number = None
            mrp = item.get("mrp", 0)
            manufacturing_date = None
            expiry_date = item.get("expiry_date")
            cost_per_unit = 0  # Will be set from batch lookup if available
            
            if not batch_id:
                fifo = fifo_batches.get(product_id)
                if fifo:
                    batch_id = fifo["batch_id"]
                    batch_number = fifo["batch_number"]
                    mrp = float(fifo["mrp"]) if fifo["mrp"] else mrp
                    manufacturing_date = fifo["mfg_date"]
                    expiry_date = fifo["exp_date"] or expiry_date
                    cost_per_unit = float(fifo["cost_per_unit"]) if fifo.get("cost_per_unit") else 0
            else:
                batch_details = batches_lookup.get(batch_id)
                if batch_details:
                    batch_number = batch_details["batch_number"]
                    mrp = float(batch_details["mrp"]) if batch_details["mrp"] else mrp
                    manufacturing_date = batch_details["mfg_date"]
                    expiry_date = batch_details["exp_date"] or expiry_date
                    cost_per_unit = float(batch_details["cost_per_unit"]) if batch_details.get("cost_per_unit") else 0
                else:
                    cost_per_unit = 0
            
            # Retrieve Pre-Calculated Data (DRY Principle)
            # Instead of calling calculate_line_item again, we use the values from the service call above.
            # This guarantees that the sum of line items EXACTLY matches invoice totals.
            if i < len(line_item_details):
                calc = line_item_details[i]
            else:
                # Fallback only if index mismatch (should never happen)
                logger.warning(f"Index mismatch for item {i}, recalculating line item")
                calc = calculate_line_item(
                    base_quantity, 
                    unit_price, 
                    discount_percent, 
                    float(item.get("gst_percent", 0)), 
                    gst_type
                )
            
            # Prepare invoice item data using calculated values
            invoice_items_data.append({
                "invoice_id": invoice_id,
                "product_id": product_id,
                "product_name": product_name,
                "hsn_code": item.get("hsn_code"),
                "batch_number": batch_number or item.get("batch_number"),
                "manufacturing_date": manufacturing_date or item.get("manufacturing_date"),
                "expiry_date": expiry_date,
                "quantity": total_quantity,
                "uom": uom,
                "pack_type": pack_type,
                "pack_size": int(item.get("pack_size")) if item.get("pack_size") and str(item.get("pack_size")).isdigit() else 1,
                "base_quantity": base_quantity,
                "mrp": float(mrp) if mrp else 0,
                "unit_price": unit_price,
                "discount_percent": discount_percent,
                "discount_amount": calc["discount_amount"],
                "taxable_amount": calc["taxable_amount"],
                "igst_rate": float(item.get("gst_percent", 0)) if calc["igst_amount"] > 0 else 0,
                "igst_amount": calc["igst_amount"],
                "cgst_rate": float(item.get("gst_percent", 0)) / 2 if calc["cgst_amount"] > 0 else 0,
                "cgst_amount": calc["cgst_amount"],
                "sgst_rate": float(item.get("gst_percent", 0)) / 2 if calc["sgst_amount"] > 0 else 0,
                "sgst_amount": calc["sgst_amount"],
                "total_tax_amount": calc["total_tax"],
                "line_total": calc["line_total"],
                "free_quantity": free_quantity
            })
            
            # Prepare batch deduction (only if batch exists)
            if batch_id:
                batch_deductions.append({
                    "batch_id": batch_id,
                    "quantity": total_quantity,
                    "product_id": product_id,
                    "base_quantity": base_quantity
                })
            
            # Use cost_per_unit from batch (fetched from DB), or 0 if not available
            unit_cost = cost_per_unit
            movement_records.append({
                "org_id": context.org_id,
                "product_id": product_id,
                "batch_id": batch_id,  # Can be None for non-batched products
                "quantity": total_quantity,
                "pack_type": pack_type,
                "base_quantity": base_quantity,
                "unit_cost": unit_cost,
                "total_cost": unit_cost * total_quantity
            })
            
            if not batch_id:
                logger.warning(f"⚠️ No batch_id for product {product_id} - movement recorded but no batch deduction")
        
        items_created = len(invoice_items_data)
        
        # =========================================================================
        # CRITICAL: BULK STOCK CHECK before deduction
        # =========================================================================
        if batch_deductions:
            deduction_batch_ids = [bd["batch_id"] for bd in batch_deductions]
            
            # Fetch current available quantities for all relevant batches
            stock_check_result = db.execute(text("""
                SELECT batch_id, product_id, quantity_available
                FROM inventory.batches
                WHERE batch_id = ANY(:batch_ids) AND org_id = :org_id
            """), {"batch_ids": deduction_batch_ids, "org_id": str(org_id)})
            
            current_stock_map = {row[0]: {"product_id": row[1], "available": row[2]} for row in stock_check_result.fetchall()}
            
            for deduction in batch_deductions:
                batch_id = deduction["batch_id"]
                required_quantity = deduction["quantity"]
                product_id = deduction["product_id"]
                
                stock_info = current_stock_map.get(batch_id)
                
                if not stock_info:
                    error_msg = f"Batch {batch_id} not found for product {product_id} during stock check."
                    logger.error(f"❌ INVOICE CREATION FAILED: {error_msg}")
                    db.rollback()
                    raise HTTPException(
                        status_code=404,
                        detail={
                            "error": "BATCH_NOT_FOUND",
                            "message": error_msg,
                            "product_id": product_id,
                            "batch_id": batch_id,
                            "invoice_number": getattr(invoice_data, 'invoice_number', None) or "DRAFT"
                        }
                    )
                
                available_quantity = stock_info["available"]
                
                if available_quantity < required_quantity:
                    error_msg = f"Insufficient stock for product {product_id} (batch {batch_id}): Required {required_quantity}, Available {available_quantity}"
                    logger.error(f"❌ INVOICE CREATION FAILED: {error_msg}")
                    db.rollback()
                    raise HTTPException(
                        status_code=409,  # Conflict status
                        detail={
                            "error": "INSUFFICIENT_STOCK",
                            "message": error_msg,
                            "product_id": product_id,
                            "batch_id": batch_id,
                            "required_quantity": required_quantity,
                            "available_quantity": available_quantity,
                            "invoice_number": getattr(invoice_data, 'invoice_number', None) or "DRAFT"
                        }
                    )
            logger.info(f"✅ All stock checks passed for {len(batch_deductions)} items.")
        
        # =========================================================================
        # BULK INSERT: Invoice Items (single query for all items)
        # =========================================================================
        if invoice_items_data:
            values_list = []
            params = {}
            for i, item_data in enumerate(invoice_items_data):
                values_list.append(f"""(
                    :invoice_id_{i}, :product_id_{i}, :product_name_{i}, :hsn_code_{i},
                    :batch_number_{i}, :manufacturing_date_{i}, :expiry_date_{i},
                    :quantity_{i}, :uom_{i}, :pack_type_{i}, :pack_size_{i}, :base_quantity_{i},
                    :mrp_{i}, :unit_price_{i}, :discount_percent_{i}, :discount_amount_{i}, :taxable_amount_{i},
                    :igst_rate_{i}, :igst_amount_{i}, :cgst_rate_{i}, :cgst_amount_{i},
                    :sgst_rate_{i}, :sgst_amount_{i}, :total_tax_amount_{i}, :line_total_{i},
                    :free_quantity_{i}
                )""")
                for key, value in item_data.items():
                    params[f"{key}_{i}"] = value
            
            bulk_insert_sql = f"""
                INSERT INTO sales.invoice_items (
                    invoice_id, product_id, product_name, hsn_code,
                    batch_number, manufacturing_date, expiry_date,
                    quantity, uom, pack_type, pack_size, base_quantity,
                    mrp, unit_price, discount_percent, discount_amount, taxable_amount,
                    igst_rate, igst_amount, cgst_rate, cgst_amount,
                    sgst_rate, sgst_amount, total_tax_amount, line_total,
                    free_quantity
                ) VALUES {", ".join(values_list)}
            """
            db.execute(text(bulk_insert_sql), params)
            logger.info(f"✅ Bulk inserted {len(invoice_items_data)} invoice items")
        
        # =========================================================================
        # ASYNC: Process batch updates, movements, and totals in BACKGROUND
        # This runs AFTER the response is sent to user for faster perceived performance
        # =========================================================================
        
        # Prepare invoice totals for background task
        invoice_totals_data = {
            "items_count": items_created,
            "total_qty": sum(float(item.get("base_quantity", item.get("quantity", 0))) + float(item.get("free_quantity", 0)) for item in items),
            "subtotal": subtotal,
            "item_discount": total_discount,
            "invoice_discount": invoice_discount,
            "taxable_amount": taxable_amount,
            "igst": total_igst,
            "cgst": total_cgst,
            "sgst": total_sgst,
            "total_tax": total_tax,
            "final_amount": final_amount,
            # For outstanding record creation
            "customer_id": customer_id,
            "invoice_number": invoice_number,
            "invoice_date": invoice_date
        }
        
        # Add background task for inventory processing
        background_tasks.add_task(
            process_inventory_background,
            org_id=str(org_id),
            invoice_id=invoice_id,
            batch_deductions=batch_deductions,
            movement_records=movement_records,
            invoice_totals=invoice_totals_data,
            created_by=created_by
        )
        logger.info(f"📦 Queued background task for invoice {invoice_id} inventory processing")
        
        # Commit transaction (invoice header + items only)
        db.commit()
        
        logger.info(f"✅ Invoice {invoice_id} ({invoice_number}) created - returning immediately")
        
        # =========================================================================
        # INSTANT RETURN - All post-processing happens in background
        # =========================================================================
        return {
            "success": True,
            "invoice_id": invoice_id,
            "invoice_number": invoice_number,
            "order_id": order_id,
            "order_number": order_number,
            "items_created": items_created,
            "total_amount": final_amount,
            "processing_async": True  # Flag indicating background processing pending
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