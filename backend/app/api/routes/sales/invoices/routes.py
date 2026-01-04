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

from .....core.auth.tenant_service import get_tenant_aware_db, with_tenant_context, TenantAwareSession
from .....core.auth.org_context import get_org_context, OrgContext
from .....core.utils.api_utils import handle_error
from .....core.security.permissions import PermissionChecker  # RBAC
from .....core.utils.constants import InvoiceStatus, InvoicePaymentStatus, PaymentMethod
from ....services.document_number_service import DocumentNumberService
from ....services.gst_service import GSTService
from ....services.inventory.inventory_service import InventoryService
from ....services.sales.invoice import InvoiceService
from ....schemas.inventory.inventory import StockMovementCreate
from ....schemas.sales.billing import (
    InvoiceCreateRequest, InvoiceItemCreate, 
    InvoiceCancelRequest, InvoiceResponse, InvoiceSummary
)
from decimal import Decimal
# Consolidated: using main DocumentNumberService
from .....api.shared.calculations import calculate_line_item, finalize_totals  # Shared helpers
from ....services.settings.settings_service import SettingsService  # NEW: Settings enforcement

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
    Create invoice - delegates to InvoiceService
    
    This is a THIN HTTP ADAPTER - all business logic is in the service layer.
    Route only handles: request validation, context extraction, response formatting.
    """
    try:
        # Extract context from JWT
        org_id = str(context.org_id)
        user_id = context.user_id
        branch_id = context.primary_branch_id
        
        logger.info(f"📝 Creating invoice for customer {invoice_data.customer_id} in org {org_id}")
        
        # Delegate to service (all business logic here)
        result = InvoiceService.create_invoice_with_items(
            db=db,
            org_id=org_id,
            user_id=user_id,
            branch_id=branch_id,
            invoice_data=invoice_data
        )
        
        logger.info(f"✅ Invoice {result['invoice_number']} created successfully")
        
        # Return success response
        return JSONResponse(
            status_code=201,
            content={
                "success": True,
                "message": "Invoice created successfully",
                "invoice_id": result["invoice_id"],
                "invoice_number": result["invoice_number"],
                "order_id": result["order_id"],
                "order_number": result["order_number"],
                "final_amount": result["final_amount"],
                "items_count": result["items_created"]
            }
        )
        
    except ValueError as e:
        # Business rule validation errors
        logger.warning(f"⚠️ Validation error: {e}")
        return JSONResponse(
            status_code=400,
            content={
                "success": False,
                "error": "VALIDATION_ERROR",
                "message": str(e)
            }
        )
    except Exception as e:
        # Unexpected errors
        logger.error(f"❌ Error creating invoice: {e}", exc_info=True)
        return handle_error(e, "create invoice")

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
                i.credit_amount,  # Use actual DB column, not computed
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