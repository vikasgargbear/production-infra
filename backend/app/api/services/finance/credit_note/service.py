"""
Credit Note Service - Credit and debit note management

SECURITY: Uses TenantAwareSession for automatic org_id/branch_id filtering
Do NOT manually filter by org_id - TenantAwareSession handles it

Provides business logic for:
- Creating credit notes (reduces customer liability)
- Creating debit notes (increases customer/reduces supplier liability)
- Note cancellation with ledger reversal
- Linking notes to invoices
"""
from typing import Dict, Any, List, Optional
from datetime import date, datetime
from decimal import Decimal
from sqlalchemy.orm import Session
from sqlalchemy import text
import logging
import uuid

from ...document_number_service import DocumentNumberService
from .....core.utils.constants import (
    PartyType, CreditNoteReason, InvoicePaymentStatus
)

logger = logging.getLogger(__name__)


# Predefined reasons for credit/debit notes
CREDIT_NOTE_REASONS = [
    {"value": "discount", "label": "Additional Discount"},
    {"value": "price_adjustment", "label": "Price Adjustment"},
    {"value": "overcharge", "label": "Overcharge Correction"},
    {"value": "quality_issue", "label": "Quality Issue"},
    {"value": "sales_return", "label": "Sales Return"},
    {"value": "goodwill", "label": "Goodwill Gesture"},
    {"value": "promotional", "label": "Promotional Credit"},
    {"value": "other", "label": "Other"}
]

DEBIT_NOTE_REASONS = [
    {"value": "undercharge", "label": "Undercharge Correction"},
    {"value": "late_payment", "label": "Late Payment Charges"},
    {"value": "service_charge", "label": "Additional Service Charge"},
    {"value": "price_increase", "label": "Price Increase Adjustment"},
    {"value": "penalty", "label": "Penalty Charges"},
    {"value": "other", "label": "Other"}
]


class CreditNoteService:
    """
    Service for credit and debit note management
    
    SECURITY NOTE: All methods expect TenantAwareSession which auto-filters by:
    - org_id: Always (hard tenant boundary)
    - branch_id: Based on user's branch_scope
    """
    
    @staticmethod
    def get_organization_details(db: Session, org_id: str) -> Optional[Dict[str, Any]]:
        """
        Get organization details for printing/display purposes.
        """
        query = """
            SELECT * FROM master.organizations 
            WHERE org_id = :org_id
        """
        result = db.execute(text(query), {"org_id": org_id}).first()
        return dict(result._mapping) if result else None
    
    @staticmethod
    def invoice_exists(db: Session, invoice_id: str) -> bool:
        """
        Check if an invoice exists.
        """
        count = db.execute(
            text("SELECT COUNT(*) FROM sales.invoices WHERE invoice_id = :invoice_id"),
            {"invoice_id": invoice_id}
        ).scalar()
        return count > 0
    
    @staticmethod
    def get_notes(
        db: Session,
        org_id: str,
        note_type: Optional[str] = None,
        party_id: Optional[int] = None,
        from_date: Optional[date] = None,
        to_date: Optional[date] = None,
        skip: int = 0,
        limit: int = 20
    ) -> Dict[str, Any]:
        """
        Get list of credit/debit notes with filters.
        TenantAwareSession auto-filters by org_id.
        """
        # Build union query for both credit and debit notes from returns
        # TenantAwareSession auto-adds org_id filter
        base_query = """
            SELECT 
                'credit' as note_type,
                sr.return_id as note_id,
                sr.credit_note_number as note_number,
                sr.credit_note_date as note_date,
                sr.customer_id as party_id,
                'customer' as party_type,
                c.customer_name as party_name,
                c.gst_number as party_gst,
                sr.total_amount,
                sr.return_reason as reason,
                sr.credit_note_status as status,
                sr.created_at
            FROM sales.sales_returns sr
            LEFT JOIN parties.customers c ON sr.customer_id = c.customer_id
            WHERE sr.credit_note_number IS NOT NULL
            
            UNION ALL
            
            SELECT 
                'debit' as note_type,
                pr.return_id as note_id,
                pr.debit_note_number as note_number,
                pr.debit_note_date as note_date,
                pr.supplier_id as party_id,
                'supplier' as party_type,
                s.supplier_name as party_name,
                s.gst_number as party_gst,
                pr.total_amount,
                pr.return_reason as reason,
                pr.debit_note_status as status,
                pr.created_at
            FROM procurement.purchase_returns pr
            LEFT JOIN parties.suppliers s ON pr.supplier_id = s.supplier_id
            WHERE pr.debit_note_number IS NOT NULL
        """
        
        params = {"skip": skip, "limit": limit}
        filter_conditions = []
        
        if note_type:
            filter_conditions.append("note_type = :note_type")
            params["note_type"] = note_type
            
        if party_id:
            filter_conditions.append("party_id = :party_id")
            params["party_id"] = party_id
            
        if from_date:
            filter_conditions.append("note_date >= :from_date")
            params["from_date"] = from_date
            
        if to_date:
            filter_conditions.append("note_date <= :to_date")
            params["to_date"] = to_date
        
        # Wrap and apply filters
        if filter_conditions:
            query = f"SELECT * FROM ({base_query}) as notes WHERE " + " AND ".join(filter_conditions)
        else:
            query = f"SELECT * FROM ({base_query}) as notes"
            
        query += " ORDER BY note_date DESC, created_at DESC LIMIT :limit OFFSET :skip"
        
        notes = db.execute(text(query), params).fetchall()
        
        # Get total count
        count_query = f"SELECT COUNT(*) FROM ({base_query}) as notes"
        if filter_conditions:
            count_query += " WHERE " + " AND ".join(filter_conditions)
        
        total = db.execute(text(count_query), params).scalar()
        
        return {
            "total": total,
            "notes": [dict(note._mapping) for note in notes]
        }
    
    @staticmethod
    def create_credit_note(
        db: Session,
        org_id: str,
        user_id: int,
        note_data: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Create a credit note (reduces customer liability).
        org_id parameter used for INSERT (creating new record).
        """
        note_id = str(uuid.uuid4())
        note_number = DocumentNumberService.generate_number(db, "credit_note", org_id)
        
        # Calculate amounts
        subtotal = Decimal(str(note_data["amount"]))
        tax_percent = Decimal(str(note_data.get("tax_percent", 0)))
        tax_amount = subtotal * tax_percent / 100 if tax_percent > 0 else Decimal("0")
        total_amount = subtotal + tax_amount
        
        # Create note record
        db.execute(text("""
            INSERT INTO financial.credit_debit_notes (
                note_id, org_id, note_number, note_type,
                note_date, party_id, party_type, linked_invoice_id,
                reason, subtotal_amount, tax_percent,
                tax_amount, amount, notes, status,
                created_by, created_at, updated_at
            ) VALUES (
                :note_id, :org_id, :note_number, 'credit',
                :note_date, :party_id, :party_type, :linked_invoice,
                :reason, :subtotal, :tax_percent,
                :tax_amount, :total_amount, :notes, 'approved',
                :created_by, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
            )
        """), {
            "note_id": note_id,
            "org_id": org_id,
            "note_number": note_number,
            "note_date": note_data["note_date"],
            "party_id": note_data["party_id"],
            "party_type": PartyType.CUSTOMER.value,
            "linked_invoice": note_data.get("linked_invoice_id"),
            "reason": note_data["reason"],
            "subtotal": subtotal,
            "tax_percent": tax_percent,
            "tax_amount": tax_amount,
            "total_amount": total_amount,
            "notes": note_data.get("notes", ""),
            "created_by": user_id
        })
        
        logger.info(f"Created credit note {note_number} for amount {total_amount}")
        
        return {
            "note_id": note_id,
            "note_number": note_number,
            "total_amount": float(total_amount),
            "message": f"Credit note {note_number} created successfully"
        }
    
    @staticmethod
    def create_debit_note(
        db: Session,
        org_id: str,
        user_id: int,
        note_data: Dict[str, Any]
    ) -> Dict[str, Any]:
        """
        Create a debit note.
        org_id parameter used for INSERT (creating new record).
        """
        party_type = note_data.get("party_type", PartyType.CUSTOMER.value)
        
        note_id = str(uuid.uuid4())
        note_number = DocumentNumberService.generate_number(db, "debit_note", org_id)
        
        # Calculate amounts
        subtotal = Decimal(str(note_data["amount"]))
        tax_percent = Decimal(str(note_data.get("tax_percent", 0)))
        tax_amount = subtotal * tax_percent / 100 if tax_percent > 0 else Decimal("0")
        total_amount = subtotal + tax_amount
        
        # Create note record
        db.execute(text("""
            INSERT INTO financial.credit_debit_notes (
                note_id, org_id, note_number, note_type,
                note_date, party_id, party_type, linked_invoice_id,
                reason, subtotal_amount, tax_percent,
                tax_amount, amount, notes, status,
                created_by, created_at, updated_at
            ) VALUES (
                :note_id, :org_id, :note_number, 'debit',
                :note_date, :party_id, :party_type, :linked_invoice,
                :reason, :subtotal, :tax_percent,
                :tax_amount, :total_amount, :notes, 'approved',
                :created_by, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
            )
        """), {
            "note_id": note_id,
            "org_id": org_id,
            "note_number": note_number,
            "note_date": note_data["note_date"],
            "party_id": note_data["party_id"],
            "party_type": party_type,
            "linked_invoice": note_data.get("linked_invoice_id"),
            "reason": note_data["reason"],
            "subtotal": subtotal,
            "tax_percent": tax_percent,
            "tax_amount": tax_amount,
            "total_amount": total_amount,
            "notes": note_data.get("notes", ""),
            "created_by": user_id
        })
        
        logger.info(f"Created debit note {note_number} for amount {total_amount}")
        
        return {
            "note_id": note_id,
            "note_number": note_number,
            "total_amount": float(total_amount),
            "message": f"Debit note {note_number} created successfully"
        }
    
    @staticmethod
    def get_note_detail(
        db: Session,
        org_id: str,
        note_id: str
    ) -> Optional[Dict[str, Any]]:
        """
        Get detailed info about a specific note.
        TenantAwareSession auto-filters by org_id.
        """
        note = db.execute(text("""
            SELECT 
                n.*,
                CASE 
                    WHEN n.party_type = 'customer' THEN c.customer_name
                    ELSE s.supplier_name
                END as party_name,
                CASE 
                    WHEN n.party_type = 'customer' THEN c.gst_number
                    ELSE s.gst_number
                END as party_gst
            FROM financial.credit_debit_notes n
            LEFT JOIN parties.customers c ON n.party_id = c.customer_id AND n.party_type = 'customer'
            LEFT JOIN parties.suppliers s ON n.party_id = s.supplier_id AND n.party_type = 'supplier'
            WHERE n.note_id = :note_id
        """), {"note_id": note_id}).fetchone()
        
        if not note:
            return None
            
        return dict(note._mapping)
    
    @staticmethod
    def cancel_note(
        db: Session,
        org_id: str,
        note_id: str,
        reason: str,
        user_id: int
    ) -> Dict[str, Any]:
        """
        Cancel a credit/debit note.
        TenantAwareSession auto-filters by org_id.
        """
        # Get note details
        note = db.execute(text("""
            SELECT * FROM financial.credit_debit_notes
            WHERE note_id = :note_id
        """), {"note_id": note_id}).fetchone()
        
        if not note:
            raise ValueError("Note not found")
            
        if note.status == "cancelled":
            raise ValueError("Note already cancelled")
        
        # Update note status
        db.execute(text("""
            UPDATE financial.credit_debit_notes 
            SET status = 'cancelled',
                cancellation_reason = :reason,
                cancelled_by = :user_id,
                cancelled_at = CURRENT_TIMESTAMP,
                updated_at = CURRENT_TIMESTAMP
            WHERE note_id = :note_id
        """), {
            "note_id": note_id,
            "reason": reason,
            "user_id": user_id
        })
        
        logger.info(f"Cancelled note {note.note_number} by user {user_id}. Reason: {reason}")
        
        return {
            "note_id": note_id,
            "note_number": note.note_number,
            "status": "cancelled",
            "message": f"{note.note_type.title()} note {note.note_number} cancelled successfully"
        }
    
    @staticmethod
    def get_party_invoices_for_linking(
        db: Session,
        org_id: str,
        party_id: int,
        invoice_type: str = "sales",
        page: int = 1,
        limit: int = 10
    ) -> Dict[str, Any]:
        """
        Get invoices for a party that can be linked to notes.
        TenantAwareSession auto-filters by org_id.
        """
        offset = (page - 1) * limit
        
        if invoice_type == "sales":
            query = """
                SELECT 
                    invoice_id,
                    invoice_number,
                    invoice_date,
                    final_amount as grand_total,
                    COALESCE(paid_amount, 0) as paid_amount,
                    COALESCE(payment_status, 'pending') as payment_status,
                    COALESCE(invoice_status, 'draft') as invoice_status
                FROM sales.invoices
                WHERE customer_id = :party_id
                ORDER BY invoice_date DESC, invoice_id DESC
                LIMIT :limit OFFSET :offset
            """
            count_query = """
                SELECT COUNT(*) FROM sales.invoices
                WHERE customer_id = :party_id
            """
        else:
            query = """
                SELECT 
                    invoice_id,
                    invoice_number,
                    invoice_date,
                    final_amount as grand_total,
                    COALESCE(paid_amount, 0) as paid_amount,
                    payment_status,
                    invoice_status
                FROM purchases.supplier_invoices
                WHERE supplier_id = :party_id
                ORDER BY invoice_date DESC
                LIMIT :limit OFFSET :offset
            """
            count_query = """
                SELECT COUNT(*) FROM purchases.supplier_invoices
                WHERE supplier_id = :party_id
            """
        
        params = {"party_id": party_id, "limit": limit, "offset": offset}
        
        invoices = db.execute(text(query), params).fetchall()
        total_count = db.execute(text(count_query), {"party_id": party_id}).scalar()
        
        total_pages = (total_count + limit - 1) // limit
        
        return {
            "party_id": party_id,
            "invoice_type": invoice_type,
            "invoices": [dict(inv._mapping) for inv in invoices],
            "pagination": {
                "page": page,
                "limit": limit,
                "total_count": total_count,
                "total_pages": total_pages,
                "has_next": page < total_pages,
                "has_prev": page > 1
            }
        }
    
    @staticmethod
    def get_credit_note_reasons() -> List[Dict[str, str]]:
        """Get predefined credit note reasons"""
        return CREDIT_NOTE_REASONS
    
    @staticmethod
    def get_debit_note_reasons() -> List[Dict[str, str]]:
        """Get predefined debit note reasons"""
        return DEBIT_NOTE_REASONS
    
    @staticmethod
    def get_invoice_items(
        db: Session,
        invoice_id: str
    ) -> Dict[str, Any]:
        """
        Get invoice items for creating credit/debit notes.
        TenantAwareSession auto-filters by org_id.
        """
        result = db.execute(text("""
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
        """), {"invoice_id": invoice_id})
        
        items = [dict(row._mapping) for row in result]
        
        return {
            "invoice_id": invoice_id,
            "items": items,
            "items_count": len(items)
        }
    
    @staticmethod
    def create_sales_credit_note(
        db: Session,
        org_id: str,
        branch_id: int,
        data: Dict[str, Any],
        created_by: int = 1
    ) -> Dict[str, Any]:
        """
        Create a credit note in sales.credit_notes table.
        Used by sales module for customer credit notes.
        """
        # Generate credit note number
        credit_note_number = DocumentNumberService.generate_number(db, "credit_note", org_id)
        
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
                'draft', :created_by
            ) RETURNING credit_note_id
        """), {
            "org_id": org_id,
            "branch_id": branch_id,
            "credit_note_number": credit_note_number,
            "credit_note_date": data.get('credit_note_date'),
            "customer_id": data.get('customer_id'),
            "reference_type": data.get('reference_type'),
            "reference_id": data.get('reference_id'),
            "reference_number": data.get('reference_number'),
            "credit_amount": data.get('credit_amount', 0),
            "tax_amount": data.get('tax_amount', 0),
            "total_amount": total_amount,
            "reason_code": data.get('reason_code', 'OTHER'),
            "reason": data.get('reason', ''),
            "notes": data.get('notes'),
            "is_gst_applicable": data.get('is_gst_applicable', True),
            "cgst_amount": data.get('cgst_amount', 0),
            "sgst_amount": data.get('sgst_amount', 0),
            "igst_amount": data.get('igst_amount', 0),
            "created_by": created_by
        })
        
        credit_note_id = result.scalar()
        
        return {
            "success": True,
            "credit_note_id": credit_note_id,
            "credit_note_number": credit_note_number
        }
    
    @staticmethod
    def create_sales_debit_note(
        db: Session,
        org_id: str,
        branch_id: int,
        data: Dict[str, Any],
        created_by: int = 1
    ) -> Dict[str, Any]:
        """
        Create a debit note in sales.debit_notes table.
        Used by sales module for customer debit notes.
        """
        # Generate debit note number
        debit_note_number = DocumentNumberService.generate_number(db, "debit_note", org_id)
        
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
                'draft', :created_by
            ) RETURNING debit_note_id
        """), {
            "org_id": org_id,
            "branch_id": branch_id,
            "debit_note_number": debit_note_number,
            "debit_note_date": data.get('debit_note_date'),
            "customer_id": data.get('customer_id'),
            "reference_type": data.get('reference_type'),
            "reference_id": data.get('reference_id'),
            "reference_number": data.get('reference_number'),
            "debit_amount": data.get('debit_amount', 0),
            "tax_amount": data.get('tax_amount', 0),
            "total_amount": total_amount,
            "reason_code": data.get('reason_code', 'OTHER'),
            "reason": data.get('reason', ''),
            "notes": data.get('notes'),
            "is_gst_applicable": data.get('is_gst_applicable', True),
            "cgst_amount": data.get('cgst_amount', 0),
            "sgst_amount": data.get('sgst_amount', 0),
            "igst_amount": data.get('igst_amount', 0),
            "created_by": created_by
        })
        
        debit_note_id = result.scalar()
        
        return {
            "success": True,
            "debit_note_id": debit_note_id,
            "debit_note_number": debit_note_number
        }
    
    @staticmethod
    def create_credit_note_for_return(
        db: Session,
        org_id: str,
        branch_id: int,
        customer_id: int,
        return_id: int,
        return_number: str,
        credit_amount: float,
        tax_amount: float,
        cgst_amount: float,
        sgst_amount: float,
        igst_amount: float,
        reason_code: str,
        reason: str,
        invoice_id: int = None,
        invoice_number: str = None,
        return_date: str = None,
        is_gst_applicable: bool = True,
        created_by: int = 1
    ) -> Dict[str, Any]:
        """
        Create a credit note for a sales return and update customer outstanding.
        Single atomic operation that:
        1. Creates credit note in sales.credit_notes
        2. Reduces customer.current_outstanding by total amount
        
        Called by Returns module instead of directly updating customer balance.
        
        Args:
            db: Database session
            org_id: Organization ID
            branch_id: Branch ID
            customer_id: Customer ID
            return_id: Sales return ID
            return_number: Sales return number
            credit_amount: Base credit amount (subtotal)
            tax_amount: Total tax amount
            cgst_amount: CGST portion
            sgst_amount: SGST portion
            igst_amount: IGST portion
            reason_code: Return reason code (e.g., NOT_REQUIRED, DAMAGED)
            reason: Additional notes/reason text
            invoice_id: Original invoice ID (optional)
            invoice_number: Original invoice number (optional)
            return_date: Return date (defaults to current date)
            is_gst_applicable: Whether GST applies
            created_by: User ID who created the return
            
        Returns:
            Dict with credit_note_id, credit_note_number, total_amount, 
            previous_outstanding, new_outstanding
        """
        from datetime import date as date_type
        from decimal import Decimal
        
        # Generate credit note number
        credit_note_number = DocumentNumberService.generate_number(db, "credit_note", org_id)
        
        # Calculate total amount
        total_amount = float(credit_amount) + float(tax_amount)
        
        # Get current outstanding before update
        outstanding_result = db.execute(text("""
            SELECT COALESCE(current_outstanding, 0) as current_outstanding
            FROM parties.customers
            WHERE customer_id = :customer_id
        """), {"customer_id": customer_id}).first()
        
        previous_outstanding = float(outstanding_result.current_outstanding) if outstanding_result else 0.0
        
        # Use provided date or current date
        credit_note_date = return_date if return_date else date_type.today()
        
        # 1. Create credit note in sales.credit_notes
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
                :customer_id, 'sales_return', :return_id, :return_number,
                :credit_amount, :tax_amount, :total_amount,
                :reason_code, :reason, :notes,
                :is_gst_applicable, :cgst_amount, :sgst_amount, :igst_amount,
                'approved', :created_by
            ) RETURNING credit_note_id
        """), {
            "org_id": org_id,
            "branch_id": branch_id,
            "credit_note_number": credit_note_number,
            "credit_note_date": credit_note_date,
            "customer_id": customer_id,
            "return_id": return_id,
            "return_number": return_number,
            "credit_amount": credit_amount,
            "tax_amount": tax_amount,
            "total_amount": total_amount,
            "reason_code": reason_code,
            "reason": reason,
            "notes": f"Credit note for sales return {return_number}",
            "is_gst_applicable": is_gst_applicable,
            "cgst_amount": cgst_amount,
            "sgst_amount": sgst_amount,
            "igst_amount": igst_amount,
            "created_by": created_by
        })
        
        credit_note_id = result.scalar()
        
        # 2. Update customer outstanding (reduce by credit note amount)
        db.execute(text("""
            UPDATE parties.customers 
            SET current_outstanding = COALESCE(current_outstanding, 0) - :amount,
                updated_at = CURRENT_TIMESTAMP
            WHERE customer_id = :customer_id
        """), {
            "amount": total_amount,
            "customer_id": customer_id
        })
        
        # Calculate new outstanding
        new_outstanding = previous_outstanding - total_amount
        
        logger.info(
            f"Created credit note {credit_note_number} for return {return_number}. "
            f"Amount: {total_amount}. Customer {customer_id} outstanding: {previous_outstanding} -> {new_outstanding}"
        )
        
        return {
            "success": True,
            "credit_note_id": credit_note_id,
            "credit_note_number": credit_note_number,
            "total_amount": total_amount,
            "previous_outstanding": previous_outstanding,
            "new_outstanding": new_outstanding,
            "action": "outstanding_reduced"
        }
    
    @staticmethod
    def create_debit_note_for_purchase_return(
        db: Session,
        org_id: str,
        branch_id: int,
        supplier_id: int,
        return_id: int,
        return_number: str,
        debit_amount: float,
        tax_amount: float,
        cgst_amount: float,
        sgst_amount: float,
        igst_amount: float,
        reason_code: str,
        reason: str,
        grn_id: int = None,
        grn_number: str = None,
        return_date: str = None,
        is_gst_applicable: bool = True,
        created_by: int = 1
    ) -> Dict[str, Any]:
        """
        Create a debit note for a purchase return and update supplier balance.
        Single atomic operation that:
        1. Creates debit note in procurement.debit_notes (if table exists) or procurement.purchase_returns
        2. Updates supplier balance if applicable
        
        Called by Purchase Returns module.
        
        Returns:
            Dict with debit_note_id, debit_note_number, total_amount
        """
        from datetime import date as date_type
        
        # Generate debit note number
        debit_note_number = DocumentNumberService.generate_number(db, "debit_note", org_id)
        
        # Calculate total amount
        total_amount = float(debit_amount) + float(tax_amount)
        
        # Use provided date or current date
        debit_note_date = return_date if return_date else date_type.today()
        
        # Update the purchase return with debit note number
        db.execute(text("""
            UPDATE procurement.purchase_returns 
            SET debit_note_number = :debit_note_number,
                debit_note_date = :debit_note_date,
                debit_note_status = 'issued',
                updated_at = CURRENT_TIMESTAMP
            WHERE return_id = :return_id
        """), {
            "debit_note_number": debit_note_number,
            "debit_note_date": debit_note_date,
            "return_id": return_id
        })
        
        # Note: Supplier outstanding is typically managed differently (accounts payable)
        # Purchase returns reduce what we owe to supplier, not what supplier owes us
        
        logger.info(
            f"Created debit note {debit_note_number} for purchase return {return_number}. "
            f"Amount: {total_amount}. Supplier: {supplier_id}"
        )
        
        return {
            "success": True,
            "debit_note_id": return_id,  # Using return_id as reference
            "debit_note_number": debit_note_number,
            "total_amount": total_amount,
            "action": "debit_note_issued"
        }
