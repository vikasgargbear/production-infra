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
from ....services.compliance.gst_service import GSTService
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
            # Use service methods for bulk operations
            
            # 1. Bulk update batch quantities
            if batch_deductions:
                InventoryService.bulk_update_batch_quantities(db, batch_deductions, org_id)
                logger.info(f"✅ [BACKGROUND] Updated {len(batch_deductions)} batch quantities for invoice {invoice_id}")
            
            # 2. Bulk insert inventory movements
            if movement_records:
                InventoryService.bulk_insert_movements(db, movement_records, invoice_id, created_by)
                logger.info(f"✅ [BACKGROUND] Inserted {len(movement_records)} inventory movements for invoice {invoice_id}")
            
            # 3. Update invoice totals
            if invoice_totals:
                InvoiceService.update_invoice_totals(db, invoice_id, invoice_totals)
                logger.info(f"✅ [BACKGROUND] Updated totals for invoice {invoice_id}")
            
            # 4. Update customer outstanding balance
            if invoice_totals:
                customer_id = invoice_totals.get("customer_id")
                final_amount = invoice_totals.get("final_amount", 0)
                if customer_id and final_amount:
                    InvoiceService.update_customer_outstanding(db, customer_id, final_amount)
            
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
        # Use service method for all list logic with filters
        return InvoiceService.list_invoices(
            db=db,
            org_id=str(context.org_id),
            limit=limit,
            offset=offset,
            customer_id=customer_id,
            date_from=date_from,
            date_to=date_to,
            payment_status=payment_status,
            invoice_status=invoice_status,
            search=search
        )
        
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
        # Use service method for invoice with items
        invoice_dict = InvoiceService.get_invoice_with_items(
            db=db,
            invoice_id=invoice_id,
            org_id=str(context.org_id)
        )
        
        if not invoice_dict:
            raise HTTPException(status_code=404, detail=f"Invoice {invoice_id} not found")
        
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
        
        # Use service method to check invoice status
        invoice_status_info = InvoiceService.get_invoice_status(db, invoice_id, org_id)
        
        if not invoice_status_info:
            raise HTTPException(status_code=404, detail="Invoice not found")
        
        if invoice_status_info["invoice_status"] != InvoiceStatus.DRAFT.value:
            raise HTTPException(
                status_code=400, 
                detail=f"Cannot edit invoice in '{invoice_status_info['invoice_status']}' status. Only draft invoices can be updated."
            )
        
        # Use service method for draft update with field validation
        if not InvoiceService.update_invoice_draft(db, invoice_id, org_id, invoice_data):
            return {"message": "No fields to update", "invoice_id": invoice_id}
        
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
    request: InvoiceCancelRequest,
    _: dict = Depends(PermissionChecker("sales", "delete")),  # RBAC
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    context: OrgContext = Depends(get_org_context)
):
    """
    Cancel/void an invoice with GST compliance enforcement
    
    Rules:
    - Draft invoices: Can always cancel
    - Posted invoices BEFORE GSTR-1 deadline (11th of next month): Can cancel with warning
    - Posted invoices AFTER GSTR-1 deadline: BLOCKED - must use Credit Note instead
    - Invoices with payments: BLOCKED - must reverse payments first
    
    This ensures compliance with Section 34 of CGST Act.
    """
    try:
        org_id = str(context.org_id)
        
        # Get invoice with date for deadline calculation
        invoice_result = db.execute(text("""
            SELECT invoice_id, invoice_status, invoice_date, paid_amount, final_amount, gstr1_reported_date
            FROM sales.invoices
            WHERE invoice_id = :invoice_id AND org_id = :org_id
        """), {"invoice_id": invoice_id, "org_id": org_id})
        
        invoice = invoice_result.fetchone()
        
        if not invoice:
            raise HTTPException(status_code=404, detail="Invoice not found")
        
        invoice_status = invoice.invoice_status
        invoice_date = invoice.invoice_date
        paid_amount = float(invoice.paid_amount or 0)
        gstr1_reported = invoice.gstr1_reported_date is not None
        
        # Rule 1: Already cancelled
        if invoice_status == InvoiceStatus.CANCELLED.value:
            raise HTTPException(status_code=400, detail="Invoice is already cancelled")
        
        # Rule 2: Cannot cancel if there are payments
        if paid_amount > 0:
            raise HTTPException(
                status_code=400,
                detail=f"Cannot cancel invoice with payments. ₹{paid_amount:.2f} has been paid. Please reverse payments first."
            )
        
        # Rule 3: Check GSTR-1 deadline for posted invoices
        gstr1_blocked = False
        if invoice_status == 'posted':
            # Calculate GSTR-1 deadline: 11th of (invoice_month + 1)
            if invoice_date.month == 12:
                gstr1_deadline = date(invoice_date.year + 1, 1, 11)
            else:
                gstr1_deadline = date(invoice_date.year, invoice_date.month + 1, 11)
            
            today = date.today()
            
            # Block if deadline has passed or already reported in GSTR-1
            if today > gstr1_deadline or gstr1_reported:
                gstr1_blocked = True
                raise HTTPException(
                    status_code=400,
                    detail={
                        "error": "GSTR1_DEADLINE_PASSED",
                        "message": "This invoice cannot be cancelled because the GSTR-1 filing deadline has passed. " +
                                   "As per GST compliance, you must issue a Credit Note to reverse this invoice instead.",
                        "invoice_date": str(invoice_date),
                        "gstr1_deadline": str(gstr1_deadline),
                        "requires_credit_note": True,
                        "help": "Go to Finance → Credit Notes → Create From Invoice"
                    }
                )
        
        # Proceed with cancellation
        InvoiceService.cancel_invoice(
            db=db,
            invoice_id=invoice_id,
            org_id=org_id,
            cancelled_by=context.user_id,
            reason=request.reason,
            reverse_inventory=(invoice_status == 'posted')
        )
        
        credit_note_id = None
        credit_note_number = None
        
        # Generate Credit Note if requested (optional for non-blocked cancellations)
        if request.create_credit_note and invoice_status == 'posted':
            try:
                from ....services.finance.credit_note.credit_note_service import CreditNoteService
                
                credit_note_result = CreditNoteService.create_from_cancelled_invoice(
                    db=db,
                    invoice_id=invoice_id,
                    org_id=org_id,
                    created_by=context.user_id,
                    reason=request.reason or "Invoice cancelled"
                )
                credit_note_id = credit_note_result.get("credit_note_id")
                credit_note_number = credit_note_result.get("credit_note_number")
            except Exception as cn_error:
                # Log but don't fail - invoice is already cancelled
                logger.warning(f"Failed to generate credit note for invoice {invoice_id}: {cn_error}")
        
        db.commit()
        
        response = {
            "success": True,
            "message": "Invoice cancelled successfully",
            "invoice_id": invoice_id,
            "previous_status": invoice_status
        }
        
        if credit_note_id:
            response["credit_note_id"] = credit_note_id
            response["credit_note_number"] = credit_note_number
            response["message"] = f"Invoice cancelled and Credit Note {credit_note_number} generated"
        
        return response
        
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        raise handle_error(e, "cancel invoice", invoice_id)


# REMOVED: /drop-problematic-triggers endpoint - moved to admin scripts
# Use: backend/scripts/maintenance/drop_problematic_triggers.sql

# REMOVED: /fix-invoice-trigger endpoint - moved to admin scripts
# Use: backend/scripts/maintenance/fix_invoice_trigger.sql