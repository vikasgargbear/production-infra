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
