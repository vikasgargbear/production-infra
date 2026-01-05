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
                
        # Validate party is a customer
        party = db.execute(
            text("SELECT * FROM parties WHERE party_id = :party_id"),
            {"party_id": note_data["party_id"]}
        ).first()
        
        if not party:
            raise HTTPException(status_code=404, detail="Party not found")
            
        if party.party_type != PartyType.CUSTOMER.value:
            raise HTTPException(
                status_code=400, 
                detail="Credit notes can only be issued to customers"
            )
            
        note_id = str(uuid.uuid4())
        note_number = DocumentNumberService.generate_number(db.session, "credit_note", str(context.org_id))
        
        # Calculate tax if applicable
        subtotal = Decimal(str(note_data["amount"]))
        tax_percent = Decimal(str(note_data.get("tax_percent", 0)))
        tax_amount = subtotal * tax_percent / 100 if tax_percent > 0 else Decimal("0")
        total_amount = subtotal + tax_amount
        
        # Create note record
        db.execute(
            text("""
                INSERT INTO financial_notes (
                    note_id, org_id, note_number, note_type,
                    note_date, party_id, linked_invoice_id,
                    reason, subtotal_amount, tax_percent,
                    tax_amount, total_amount, notes, status
                ) VALUES (
                    :note_id, :org_id, :note_number, 'credit',
                    :note_date, :party_id, :linked_invoice,
                    :reason, :subtotal, :tax_percent,
                    :tax_amount, :total_amount, :notes, 'active'
                )
            """),
            {
                "note_id": note_id,
                "org_id": str(context.org_id),
                "note_number": note_number,
                "note_date": note_data["note_date"],
                "party_id": note_data["party_id"],
                "linked_invoice": note_data.get("linked_invoice_id"),
                "reason": note_data["reason"],
                "subtotal": subtotal,
                "tax_percent": tax_percent,
                "tax_amount": tax_amount,
                "total_amount": total_amount,
                "notes": note_data.get("notes", "")
            }
        )
        
        # Create ledger entry (credit reduces customer balance)
        db.execute(
            text("""
                INSERT INTO party_ledger (
                    ledger_id, org_id, party_id, transaction_date,
                    transaction_type, reference_type, reference_id,
                    debit_amount, credit_amount, description
                ) VALUES (
                    :ledger_id, :org_id, :party_id, :date,
                    'credit', 'credit_note', :note_id,
                    0, :amount, :description
                )
            """),
            {
                "ledger_id": str(uuid.uuid4()),
                "org_id": str(context.org_id),
                "party_id": note_data["party_id"],
                "date": note_data["note_date"],
                "note_id": note_id,
                "amount": total_amount,
                "description": f"Credit Note - {note_number}: {note_data['reason']}"
            }
        )
        
        # TenantAwareSession auto-commits
        
        return {
            "status": "success",
            "note_id": note_id,
            "note_number": note_number,
            "message": f"Credit note {note_number} created successfully"
        }
        
    except HTTPException:
        db.rollback()
        raise
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
                
        # Get party details
        party = db.execute(
            text("SELECT * FROM parties WHERE party_id = :party_id"),
            {"party_id": note_data["party_id"]}
        ).first()
        
        if not party:
            raise HTTPException(status_code=404, detail="Party not found")
            
        note_id = str(uuid.uuid4())
        note_number = DocumentNumberService.generate_number(db.session, "debit_note", str(context.org_id))
        
        # Calculate tax if applicable
        subtotal = Decimal(str(note_data["amount"]))
        tax_percent = Decimal(str(note_data.get("tax_percent", 0)))
        tax_amount = subtotal * tax_percent / 100 if tax_percent > 0 else Decimal("0")
        total_amount = subtotal + tax_amount
        
        # Create note record
        db.execute(
            text("""
                INSERT INTO financial_notes (
                    note_id, org_id, note_number, note_type,
                    note_date, party_id, linked_invoice_id,
                    reason, subtotal_amount, tax_percent,
                    tax_amount, total_amount, notes, status
                ) VALUES (
                    :note_id, :org_id, :note_number, 'debit',
                    :note_date, :party_id, :linked_invoice,
                    :reason, :subtotal, :tax_percent,
                    :tax_amount, :total_amount, :notes, 'active'
                )
            """),
            {
                "note_id": note_id,
                "org_id": str(context.org_id),
                "note_number": note_number,
                "note_date": note_data["note_date"],
                "party_id": note_data["party_id"],
                "linked_invoice": note_data.get("linked_invoice_id"),
                "reason": note_data["reason"],
                "subtotal": subtotal,
                "tax_percent": tax_percent,
                "tax_amount": tax_amount,
                "total_amount": total_amount,
                "notes": note_data.get("notes", "")
            }
        )
        
        # Create appropriate ledger entry based on party type
        if party.party_type == "customer":
            # Debit increases customer balance
            debit_amt = total_amount
            credit_amt = Decimal("0")
            ledger_desc = f"Debit Note - {note_number}: {note_data['reason']}"
        else:  # supplier
            # Debit reduces supplier balance (we owe less)
            debit_amt = total_amount
            credit_amt = Decimal("0")
            ledger_desc = f"Debit Note - {note_number}: {note_data['reason']}"
            
            # Use supplier_ledger table for suppliers
            db.execute(
                text("""
                    INSERT INTO supplier_ledger (
                        ledger_id, org_id, supplier_id, transaction_date,
                        transaction_type, reference_type, reference_id,
                        debit_amount, credit_amount, description
                    ) VALUES (
                        :ledger_id, :org_id, :supplier_id, :date,
                        'debit', 'debit_note', :note_id,
                        :debit, :credit, :description
                    )
                """),
                {
                    "ledger_id": str(uuid.uuid4()),
                    "org_id": str(context.org_id),
                    "supplier_id": note_data["party_id"],
                    "date": note_data["note_date"],
                    "note_id": note_id,
                    "debit": debit_amt,
                    "credit": credit_amt,
                    "description": ledger_desc
                }
            )
        
        if party.party_type == "customer":
            # Create party ledger entry for customers
            db.execute(
                text("""
                    INSERT INTO party_ledger (
                        ledger_id, org_id, party_id, transaction_date,
                        transaction_type, reference_type, reference_id,
                        debit_amount, credit_amount, description
                    ) VALUES (
                        :ledger_id, :org_id, :party_id, :date,
                        'debit', 'debit_note', :note_id,
                        :debit, :credit, :description
                    )
                """),
                {
                    "ledger_id": str(uuid.uuid4()),
                    "org_id": str(context.org_id),
                    "party_id": note_data["party_id"],
                    "date": note_data["note_date"],
                    "note_id": note_id,
                    "debit": debit_amt,
                    "credit": credit_amt,
                    "description": ledger_desc
                }
            )
        
        # TenantAwareSession auto-commits
        
        return {
            "status": "success",
            "note_id": note_id,
            "note_number": note_number,
            "message": f"Debit note {note_number} created successfully"
        }
        
    except HTTPException:
        db.rollback()
        raise
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
        # Get organization details
        org_query = """
            SELECT * FROM master.organizations 
            WHERE org_id = :org_id
        """
        organization = db.execute(text(org_query), {"org_id": context.org_id}).first()
        
        # Get note with all details
        note_data = await get_note_detail(note_id, db)
        
        # Format for printing
        print_data = {
            "organization": dict(organization._mapping) if organization else {},
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
        # Check if note exists
        note = db.execute(
            text("SELECT * FROM financial_notes WHERE note_id = :note_id"),
            {"note_id": note_id}
        ).first()
        
        if not note:
            raise HTTPException(status_code=404, detail="Note not found")
            
        if note.status == ReturnStatus.CANCELLED.value:
            raise HTTPException(status_code=400, detail="Note already cancelled")
            
        # Update note status
        db.execute(
            text("""
                UPDATE financial_notes 
                SET status = :cancelled_status,
                    cancellation_reason = :reason,
                    cancelled_at = CURRENT_TIMESTAMP,
                    updated_at = CURRENT_TIMESTAMP
                WHERE note_id = :note_id
            """),
            {
                "note_id": note_id,
                "reason": cancellation_reason,
                "cancelled_status": ReturnStatus.CANCELLED.value
            }
        )
        
        # Reverse ledger entry
        if note.note_type == "credit":
            # Reverse credit note - debit the customer
            db.execute(
                text("""
                    INSERT INTO party_ledger (
                        ledger_id, org_id, party_id, transaction_date,
                        transaction_type, reference_type, reference_id,
                        debit_amount, credit_amount, description
                    ) VALUES (
                        :ledger_id, :org_id, :party_id, CURRENT_DATE,
                        'debit', 'credit_note_reversal', :note_id,
                        :amount, 0, :description
                    )
                """),
                {
                    "ledger_id": str(uuid.uuid4()),
                    "org_id": str(context.org_id),
                    "party_id": note.party_id,
                    "note_id": note_id,
                    "amount": note.total_amount,
                    "description": f"Credit Note Reversal - {note.note_number}"
                }
            )
        else:  # debit note
            # Check party type
            party = db.execute(
                text("SELECT party_type FROM parties WHERE party_id = :party_id"),
                {"party_id": note.party_id}
            ).first()
            
            if party.party_type == "customer":
                # Reverse debit note for customer - credit them
                db.execute(
                    text("""
                        INSERT INTO party_ledger (
                            ledger_id, org_id, party_id, transaction_date,
                            transaction_type, reference_type, reference_id,
                            debit_amount, credit_amount, description
                        ) VALUES (
                            :ledger_id, :org_id, :party_id, CURRENT_DATE,
                            'credit', 'debit_note_reversal', :note_id,
                            0, :amount, :description
                        )
                    """),
                    {
                        "ledger_id": str(uuid.uuid4()),
                        "org_id": str(context.org_id),
                        "party_id": note.party_id,
                        "note_id": note_id,
                        "amount": note.total_amount,
                        "description": f"Debit Note Reversal - {note.note_number}"
                    }
                )
            else:  # supplier
                # Reverse debit note for supplier
                db.execute(
                    text("""
                        INSERT INTO supplier_ledger (
                            ledger_id, org_id, supplier_id, transaction_date,
                            transaction_type, reference_type, reference_id,
                            debit_amount, credit_amount, description
                        ) VALUES (
                            :ledger_id, :org_id, :supplier_id, CURRENT_DATE,
                            'credit', 'debit_note_reversal', :note_id,
                            0, :amount, :description
                        )
                    """),
                    {
                        "ledger_id": str(uuid.uuid4()),
                        "org_id": str(context.org_id),
                        "supplier_id": note.party_id,
                        "note_id": note_id,
                        "amount": note.total_amount,
                        "description": f"Debit Note Reversal - {note.note_number}"
                    }
                )
        
        # TenantAwareSession auto-commits
        
        return {
            "status": "success",
            "message": f"{note.note_type.title()} note {note.note_number} cancelled successfully"
        }
        
    except HTTPException:
        db.rollback()
        raise
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
        if invoice_type == "sales":
            # First try to find any invoices for this customer
            debug_query = """
                SELECT COUNT(*) as count,
                       string_agg(DISTINCT invoice_status, ', ') as statuses,
                       string_agg(DISTINCT payment_status, ', ') as payment_statuses
                FROM sales.invoices 
                WHERE customer_id = :party_id
            """
            debug_result = db.execute(text(debug_query), {"party_id": party_id}).first()
            logger.info(f"Customer {party_id} debug - Count: {debug_result.count}, Statuses: {debug_result.statuses}, Payment: {debug_result.payment_statuses}")
            
            # Build WHERE conditions
            where_conditions = ["customer_id = :party_id"]
            params = {"party_id": party_id}
            
            if search:
                where_conditions.append("invoice_number ILIKE :search")
                params["search"] = f"%{search}%"
                
            where_clause = " AND ".join(where_conditions)
            
            # Count query for pagination
            count_query = f"""
                SELECT COUNT(*) 
                FROM sales.invoices
                WHERE {where_clause}
            """
            total_count = db.execute(text(count_query), params).scalar()
            
            # Calculate offset
            offset = (page - 1) * limit
            params.update({"limit": limit, "offset": offset})
            
            query = f"""
                SELECT 
                    invoice_id,
                    invoice_number,
                    invoice_date,
                    final_amount as grand_total,
                    COALESCE(paid_amount, 0) as paid_amount,
                    COALESCE(payment_status, 'pending') as payment_status,
                    COALESCE(invoice_status, 'draft') as invoice_status
                FROM sales.invoices
                WHERE {where_clause}
                ORDER BY invoice_date DESC, invoice_id DESC
                LIMIT :limit OFFSET :offset
            """
        else:  # purchase
            # Build WHERE conditions for purchase
            where_conditions = ["supplier_id = :party_id", "purchase_status IN ('received', 'completed')"]
            params = {"party_id": party_id}
            
            if search:
                where_conditions.append("supplier_invoice_number ILIKE :search")
                params["search"] = f"%{search}%"
                
            where_clause = " AND ".join(where_conditions)
            
            # Count query for pagination
            count_query = f"""
                SELECT COUNT(*) 
                FROM procurement.purchases
                WHERE {where_clause}
            """
            total_count = db.execute(text(count_query), params).scalar()
            
            # Calculate offset
            offset = (page - 1) * limit
            params.update({"limit": limit, "offset": offset})
            
            query = f"""
                SELECT 
                    purchase_id as invoice_id,
                    supplier_invoice_number as invoice_number,
                    supplier_invoice_date as invoice_date,
                    final_amount as grand_total,
                    paid_amount,
                    payment_status,
                    'completed' as invoice_status
                FROM procurement.purchases
                WHERE {where_clause}
                ORDER BY supplier_invoice_date DESC
                LIMIT :limit OFFSET :offset
            """
            
        invoices = db.execute(
            text(query),
            params
        ).fetchall()
        
        # For debugging: if no invoices found, check if there are any invoices at all
        if not invoices and invoice_type == "sales":
            total_count = db.execute(
                text("SELECT COUNT(*) FROM sales.invoices")
            ).scalar()
            logger.info(f"No invoices found for customer {party_id}. Total invoices in system: {total_count}")
            
            # Get a sample of customer IDs that do have invoices
            sample_customers = db.execute(
                text("SELECT DISTINCT customer_id FROM sales.invoices LIMIT 5")
            ).fetchall()
            logger.info(f"Sample customer IDs with invoices: {[c.customer_id for c in sample_customers]}")
        
        # Calculate pagination metadata
        total_pages = (total_count + limit - 1) // limit
        has_next = page < total_pages
        has_prev = page > 1
        
        return {
            "party_id": party_id,
            "invoice_type": invoice_type,
            "invoices": [dict(inv._mapping) for inv in invoices],
            "pagination": {
                "page": page,
                "limit": limit,
                "total_count": total_count,
                "total_pages": total_pages,
                "has_next": has_next,
                "has_prev": has_prev
            },
            "search": search
        }
        
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
        query = """
            SELECT 
                ii.invoice_item_id,
                ii.product_id,
                ii.product_name,
                ii.hsn_code,
                ii.batch_number,
                ii.quantity,
                ii.uom,
                ii.pack_type,
                ii.unit_price,
                ii.discount_percent,
                ii.discount_amount,
                ii.taxable_amount,
                ii.igst_rate,
                ii.cgst_rate,
                ii.sgst_rate,
                ii.igst_amount,
                ii.cgst_amount,
                ii.sgst_amount,
                ii.line_total
            FROM sales.invoice_items ii
            WHERE ii.invoice_id = :invoice_id
            ORDER BY ii.display_order, ii.invoice_item_id
        """
        
        items = db.execute(
            text(query),
            {"invoice_id": invoice_id}
        ).fetchall()
        
        if not items:
            # Check if invoice exists
            invoice_check = db.execute(
                text("SELECT COUNT(*) FROM sales.invoices WHERE invoice_id = :invoice_id"),
                {"invoice_id": invoice_id}
            ).scalar()
            
            if invoice_check == 0:
                raise HTTPException(status_code=404, detail="Invoice not found")
            else:
                logger.info(f"Invoice {invoice_id} exists but has no items")
        
        return {
            "invoice_id": invoice_id,
            "items": [dict(item._mapping) for item in items],
            "items_count": len(items)
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching invoice items: {e}")
        raise HTTPException(status_code=500, detail=str(e))
# ============= NEW CREDIT/DEBIT NOTE ENDPOINTS =============
# These endpoints work with the new sales.credit_notes and sales.debit_notes tables


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
        
        # Generate credit note number
        # Use DocumentNumberService for consistent number generation
        credit_note_number = DocumentNumberService.generate_number(db.session, "credit_note", str(context.org_id))
        
        # Calculate total amount
        total_amount = float(data.get('credit_amount', 0)) + float(data.get('tax_amount', 0))
        
        # Create credit note
        result = db.execute(text("""
            INSERT INTO sales.credit_notes (
                org_id, branch_id, credit_note_number, credit_note_date,
                customer_id, reference_type, reference_id, reference_number,
                credit_amount, tax_amount, total_amount,
                reason_code, reason, notes,
                is_gst_applicable, cgst_amount, sgst_amount, igst_amount,
                status, created_by
            ) VALUES (
                :org_id, :branch_id, :credit_note_number, :credit_note_date,
                :customer_id, :reference_type, :reference_id, :reference_number,
                :credit_amount, :tax_amount, :total_amount,
                :reason_code, :reason, :notes,
                :is_gst_applicable, :cgst_amount, :sgst_amount, :igst_amount,
                'draft', 1
            ) RETURNING credit_note_id
        """), {
            "org_id": str(context.org_id),
            "branch_id": branch_id,
            "credit_note_number": credit_note_number,
            "credit_note_date": data.get('credit_note_date', datetime.now().date()),
            "customer_id": data.get('customer_id'),
            "reference_type": data.get('reference_type'),
            "reference_id": data.get('reference_id'),
            "reference_number": data.get('reference_number'),
            "credit_amount": data.get('credit_amount', 0),
            "tax_amount": data.get('tax_amount', 0),
            "total_amount": total_amount,
            "reason_code": mapped_reason_code,
            "reason": data.get('reason', ''),
            "notes": data.get('notes'),
            "is_gst_applicable": data.get('is_gst_applicable', True),
            "cgst_amount": data.get('cgst_amount', 0),
            "sgst_amount": data.get('sgst_amount', 0),
            "igst_amount": data.get('igst_amount', 0)
        })
        
        credit_note_id = result.scalar()
        # TenantAwareSession auto-commits
        
        return {"success": True, "credit_note_id": credit_note_id, "credit_note_number": credit_note_number}
        
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
        
        # Generate debit note number
        # Use DocumentNumberService for consistent number generation
        debit_note_number = DocumentNumberService.generate_number(db.session, "debit_note", str(context.org_id))
        
        # Calculate total amount
        total_amount = float(data.get('debit_amount', 0)) + float(data.get('tax_amount', 0))
        
        # Create debit note
        result = db.execute(text("""
            INSERT INTO sales.debit_notes (
                org_id, branch_id, debit_note_number, debit_note_date,
                customer_id, reference_type, reference_id, reference_number,
                debit_amount, tax_amount, total_amount,
                reason_code, reason, notes,
                is_gst_applicable, cgst_amount, sgst_amount, igst_amount,
                status, created_by
            ) VALUES (
                :org_id, :branch_id, :debit_note_number, :debit_note_date,
                :customer_id, :reference_type, :reference_id, :reference_number,
                :debit_amount, :tax_amount, :total_amount,
                :reason_code, :reason, :notes,
                :is_gst_applicable, :cgst_amount, :sgst_amount, :igst_amount,
                'draft', 1
            ) RETURNING debit_note_id
        """), {
            "org_id": str(context.org_id),
            "branch_id": branch_id,
            "debit_note_number": debit_note_number,
            "debit_note_date": data.get('debit_note_date', datetime.now().date()),
            "customer_id": data.get('customer_id'),
            "reference_type": data.get('reference_type'),
            "reference_id": data.get('reference_id'),
            "reference_number": data.get('reference_number'),
            "debit_amount": data.get('debit_amount', 0),
            "tax_amount": data.get('tax_amount', 0),
            "total_amount": total_amount,
            "reason_code": mapped_reason_code,
            "reason": data.get('reason', ''),
            "notes": data.get('notes'),
            "is_gst_applicable": data.get('is_gst_applicable', True),
            "cgst_amount": data.get('cgst_amount', 0),
            "sgst_amount": data.get('sgst_amount', 0),
            "igst_amount": data.get('igst_amount', 0)
        })
        
        debit_note_id = result.scalar()
        # TenantAwareSession auto-commits
        
        return {"success": True, "debit_note_id": debit_note_id, "debit_note_number": debit_note_number}
        
    except Exception as e:
        db.rollback()
        logger.error(f"Error creating debit note: {e}")
        raise HTTPException(status_code=400, detail=str(e))
