"""
Credit/Debit Note API Router
Handles financial adjustments independent of physical returns

MODERNIZED: Uses TenantAwareSession + CreditNoteService
"""
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import text
import logging
from datetime import datetime, date
from decimal import Decimal
import uuid

from .....core.auth.tenant_service import get_tenant_aware_db, with_tenant_context, TenantAwareSession
from .....core.auth.org_context import get_org_context, OrgContext
from .....core.security.permissions import PermissionChecker
from .....core.auth.jwt_auth import get_org_id_string
from .....core.utils.constants import PartyType, ReturnStatus
from .....core.utils.branch_utils import get_default_branch_id  # RBAC
from ....services.document_number_service import DocumentNumberService
from ....services.finance.credit_note.service import CreditNoteService

logger = logging.getLogger(__name__)

router = APIRouter(tags=["credit-debit-notes"])

@router.get("/")
@with_tenant_context
async def get_notes(
    skip: int = Query(0, ge=0),
    limit: int = Query(20, ge=1, le=100),
    note_type: Optional[str] = Query(None, description="credit/debit"),
    party_id: Optional[str] = None,
    from_date: Optional[str] = None,
    to_date: Optional[str] = None,
    _: dict = Depends(PermissionChecker("finance", "view")),
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    context: OrgContext = Depends(get_org_context)
):
    """
    Get list of credit/debit notes with optional filters
    """
    try:
        # Parse dates if provided
        parsed_from = None
        parsed_to = None
        if from_date:
            try:
                parsed_from = datetime.strptime(from_date, "%Y-%m-%d").date()
            except ValueError:
                parsed_from = None
        if to_date:
            try:
                parsed_to = datetime.strptime(to_date, "%Y-%m-%d").date()
            except ValueError:
                parsed_to = None
        
        # Use CreditNoteService
        return CreditNoteService.get_notes(
            db=db,
            org_id=str(context.org_id),
            note_type=note_type,
            party_id=int(party_id) if party_id else None,
            from_date=parsed_from,
            to_date=parsed_to,
            skip=skip,
            limit=limit
        )
        
    except Exception as e:
        logger.error(f"Error fetching notes: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/credit-note")
@with_tenant_context
async def create_credit_note(
    note_data: dict,
    _: dict = Depends(PermissionChecker("finance", "view")),
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    context: OrgContext = Depends(get_org_context)
):
    """
    Create a credit note (reduce customer liability)
    """
    try:
        # Validate required fields
        required_fields = ["party_id", "note_date", "amount", "reason"]
        for field in required_fields:
            if field not in note_data:
                raise HTTPException(
                    status_code=400, 
                    detail=f"Missing required field: {field}"
                )
        
        # Use CreditNoteService for centralized creation logic
        result = CreditNoteService.create_credit_note(
            db=db,
            org_id=str(context.org_id),
            user_id=context.user_id,
            note_data=note_data
        )
        
        return {
            "status": "success",
            "note_id": result["note_id"],
            "note_number": result["note_number"],
            "message": result["message"]
        }
        
    except HTTPException:
        db.rollback()
        raise
    except ValueError as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        db.rollback()
        logger.error(f"Error creating credit note: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/debit-note")
@with_tenant_context
async def create_debit_note(
    note_data: dict,
    _: dict = Depends(PermissionChecker("finance", "view")),
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    context: OrgContext = Depends(get_org_context)
):
    """
    Create a debit note (increase customer liability or reduce supplier liability)
    """
    try:
        # Validate required fields
        required_fields = ["party_id", "note_date", "amount", "reason"]
        for field in required_fields:
            if field not in note_data:
                raise HTTPException(
                    status_code=400, 
                    detail=f"Missing required field: {field}"
                )
        
        # Use CreditNoteService for centralized creation logic
        result = CreditNoteService.create_debit_note(
            db=db,
            org_id=str(context.org_id),
            user_id=context.user_id,
            note_data=note_data
        )
        
        return {
            "status": "success",
            "note_id": result["note_id"],
            "note_number": result["note_number"],
            "message": result["message"]
        }
        
    except HTTPException:
        db.rollback()
        raise
    except ValueError as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        db.rollback()
        logger.error(f"Error creating debit note: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/{note_id}")
@with_tenant_context
async def get_note_detail(
    note_id: str,
    _: dict = Depends(PermissionChecker("finance", "view")),
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    context: OrgContext = Depends(get_org_context)
):
    """
    Get detailed information about a specific note
    """
    try:
        # Use CreditNoteService instead of inline SQL
        result = CreditNoteService.get_note_detail(
            db=db,
            org_id=str(context.org_id),
            note_id=note_id
        )
        
        if not result:
            raise HTTPException(status_code=404, detail="Note not found")
            
        return result
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching note detail: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/{note_id}/print")
@with_tenant_context
async def get_note_print_data(
    note_id: str,
    _: dict = Depends(PermissionChecker("finance", "view")),
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    context: OrgContext = Depends(get_org_context)
):
    """
    Get note data formatted for printing
    """
    try:
        # Get organization details using service method
        organization = CreditNoteService.get_organization_details(db, str(context.org_id))
        
        # Get note with all details
        note_data = await get_note_detail(note_id, db)
        
        # Format for printing
        print_data = {
            "organization": organization if organization else {},
            "note": note_data,
            "print_date": datetime.now().isoformat(),
            "document_type": "CREDIT NOTE" if note_data["note_type"] == "credit" else "DEBIT NOTE"
        }
        
        return print_data
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting print data: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/{note_id}")
@with_tenant_context
async def cancel_note(
    note_id: str,
    cancellation_reason: str,
    _: dict = Depends(PermissionChecker("finance", "view")),
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    context: OrgContext = Depends(get_org_context)
):
    """
    Cancel a credit/debit note
    """
    try:
        # Use CreditNoteService for centralized cancellation logic
        result = CreditNoteService.cancel_note(
            db=db,
            org_id=str(context.org_id),
            note_id=note_id,
            cancellation_reason=cancellation_reason
        )
        
        return {
            "status": "success",
            "message": result["message"]
        }
        
    except HTTPException:
        db.rollback()
        raise
    except ValueError as e:
        db.rollback()
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        db.rollback()
        logger.error(f"Error cancelling note: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/reasons/list")
@with_tenant_context
async def get_predefined_reasons():
    """
    Get predefined reasons for credit/debit notes
    """
    return {
        "credit_note_reasons": [
            {"value": "discount", "label": "Additional Discount"},
            {"value": "price_adjustment", "label": "Price Adjustment"},
            {"value": "overcharge", "label": "Overcharge Correction"},
            {"value": "quality_issue", "label": "Quality Issue"},
            {"value": "goodwill", "label": "Goodwill Gesture"},
            {"value": "promotional", "label": "Promotional Credit"},
            {"value": "other", "label": "Other"}
        ],
        "debit_note_reasons": [
            {"value": "undercharge", "label": "Undercharge Correction"},
            {"value": "late_payment", "label": "Late Payment Charges"},
            {"value": "service_charge", "label": "Additional Service Charge"},
            {"value": "price_increase", "label": "Price Increase Adjustment"},
            {"value": "penalty", "label": "Penalty Charges"},
            {"value": "other", "label": "Other"}
        ]
    }

@router.get("/linked-invoices/{party_id}")
@with_tenant_context
async def get_party_invoices_for_linking(
    party_id: str,
    invoice_type: str = Query("sales", description="sales/purchase"),
    page: int = Query(1, ge=1, description="Page number (1-based)"),
    limit: int = Query(5, ge=1, le=50, description="Items per page"),
    search: str = Query("", description="Search invoice number"),
    _: dict = Depends(PermissionChecker("finance", "view")),
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    context: OrgContext = Depends(get_org_context)
):
    """
    Get invoices for a party that can be linked to notes
    """
    try:
        # Use CreditNoteService instead of inline SQL
        result = CreditNoteService.get_party_invoices_for_linking(
            db=db,
            org_id=str(context.org_id),
            party_id=int(party_id),
            invoice_type=invoice_type,
            page=page,
            limit=limit
        )
        
        # Add search filter support
        if search:
            result["search"] = search
        else:
            result["search"] = ""
            
        return result
        
    except Exception as e:
        logger.error(f"Error fetching party invoices: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/invoice-items/{invoice_id}")
@with_tenant_context
async def get_invoice_items_for_notes(
    invoice_id: str,
    _: dict = Depends(PermissionChecker("finance", "view")),
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    context: OrgContext = Depends(get_org_context)
):
    """
    Get invoice items for creating credit/debit notes
    """
    try:
        # Use CreditNoteService instead of inline SQL
        result = CreditNoteService.get_invoice_items(db, invoice_id)
        
        if not result["items"]:
            # Check if invoice exists using service method
            if not CreditNoteService.invoice_exists(db, invoice_id):
                raise HTTPException(status_code=404, detail="Invoice not found")
            else:
                logger.info(f"Invoice {invoice_id} exists but has no items")
        
        return result
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching invoice items: {e}")
        raise HTTPException(status_code=500, detail=str(e))
# ============= NEW CREDIT/DEBIT NOTE ENDPOINTS =============
# These endpoints work with the new financial.credit_notes and financial.debit_notes tables


@router.get("/credit-note-reasons")
@with_tenant_context
async def get_credit_note_reasons():
    """Get available credit note reason codes"""
    return [
        {"value": "SALES_RETURN", "label": "Sales Return"},
        {"value": "DAMAGED_GOODS", "label": "Damaged Goods"},
        {"value": "EXPIRED_GOODS", "label": "Expired Goods"},
        {"value": "WRONG_BILLING", "label": "Wrong Billing"},
        {"value": "RATE_DIFFERENCE", "label": "Rate Difference"},
        {"value": "QUALITY_ISSUE", "label": "Quality Issue"},
        {"value": "SHORT_SUPPLY", "label": "Short Supply"},
        {"value": "DISCOUNT_ADJUSTMENT", "label": "Discount Adjustment"},
        {"value": "OTHER", "label": "Other"}
    ]

@router.get("/debit-note-reasons")
@with_tenant_context
async def get_debit_note_reasons():
    """Get available debit note reason codes"""
    return [
        {"value": "RATE_CORRECTION", "label": "Rate Correction"},
        {"value": "QUANTITY_CORRECTION", "label": "Quantity Correction"},
        {"value": "TAX_CORRECTION", "label": "Tax Correction"},
        {"value": "FREIGHT_CHARGES", "label": "Freight Charges"},
        {"value": "LOADING_CHARGES", "label": "Loading Charges"},
        {"value": "INTEREST_CHARGES", "label": "Interest Charges"},
        {"value": "PENALTY_CHARGES", "label": "Penalty Charges"},
        {"value": "SERVICE_CHARGES", "label": "Service Charges"},
        {"value": "OTHER", "label": "Other"}
    ]

@router.post("/credit-notes")
@with_tenant_context
async def create_sales_credit_note(
    data: dict,
    _: dict = Depends(PermissionChecker("finance", "view")),
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    context: OrgContext = Depends(get_org_context)
):
    """Create a new credit note"""
    try:
        # Map frontend reason codes to backend reason codes
        reason_code_mapping = {
            'EXPIRED': 'EXPIRED_GOODS',
            'DAMAGED': 'DAMAGED_GOODS',
            'WRONG_PRODUCT': 'WRONG_BILLING',
            'QUALITY_ISSUE': 'QUALITY_ISSUE',
            'NOT_REQUIRED': 'OTHER',
            'DUPLICATE_ORDER': 'OTHER',
            'PRICE_ISSUE': 'RATE_DIFFERENCE',
            'OTHER': 'OTHER'
        }
        
        # Get the reason code from data and map it
        frontend_reason = data.get('reason', 'OTHER')
        mapped_reason_code = reason_code_mapping.get(frontend_reason, 'OTHER')
        
        # Get default branch
        branch_id = get_default_branch_id(db, str(context.org_id))
        
        # Prepare data for service method
        note_data = {
            **data,
            'credit_note_date': data.get('credit_note_date', datetime.now().date()),
            'reason_code': mapped_reason_code
        }
        
        # Use service method for credit note creation
        result = CreditNoteService.create_sales_credit_note(
            db=db.session,
            org_id=str(context.org_id),
            branch_id=branch_id,
            data=note_data,
            created_by=1
        )
        
        # TenantAwareSession auto-commits
        
        return result
        
    except Exception as e:
        db.rollback()
        logger.error(f"Error creating credit note: {e}")
        raise HTTPException(status_code=400, detail=str(e))

@router.post("/debit-notes")
@with_tenant_context
async def create_sales_debit_note(
    data: dict,
    _: dict = Depends(PermissionChecker("finance", "view")),
    db: TenantAwareSession = Depends(get_tenant_aware_db),
    context: OrgContext = Depends(get_org_context)
):
    """Create a new debit note"""
    try:
        # Map frontend reason codes to backend reason codes
        reason_code_mapping = {
            'EXPIRED': 'OTHER',
            'DAMAGED': 'OTHER',
            'WRONG_PRODUCT': 'OTHER',
            'QUALITY_ISSUE': 'OTHER',
            'NOT_REQUIRED': 'OTHER',
            'DUPLICATE_ORDER': 'OTHER',
            'PRICE_ISSUE': 'RATE_CORRECTION',
            'OTHER': 'OTHER'
        }
        
        # Get the reason code from data and map it
        frontend_reason = data.get('reason', 'OTHER')
        mapped_reason_code = reason_code_mapping.get(frontend_reason, 'OTHER')
        
        # Get default branch
        branch_id = get_default_branch_id(db, str(context.org_id))
        
        # Prepare data for service method
        note_data = {
            **data,
            'debit_note_date': data.get('debit_note_date', datetime.now().date()),
            'reason_code': mapped_reason_code
        }
        
        # Use service method for debit note creation
        result = CreditNoteService.create_sales_debit_note(
            db=db.session,
            org_id=str(context.org_id),
            branch_id=branch_id,
            data=note_data,
            created_by=1
        )
        
        # TenantAwareSession auto-commits
        
        return result
        
    except Exception as e:
        db.rollback()
        logger.error(f"Error creating debit note: {e}")
        raise HTTPException(status_code=400, detail=str(e))
