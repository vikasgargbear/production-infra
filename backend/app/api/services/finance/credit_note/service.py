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

CREDIT_REASON_CODE_MAP = {
    "discount": "DISCOUNT_ADJUSTMENT",
    "price_adjustment": "RATE_DIFFERENCE",
    "overcharge": "WRONG_BILLING",
    "quality_issue": "QUALITY_ISSUE",
    "sales_return": "SALES_RETURN",
    "goodwill": "OTHER",
    "promotional": "OTHER",
    "other": "OTHER",
}

DEBIT_REASON_CODE_MAP = {
    "undercharge": "RATE_CORRECTION",
    "late_payment": "INTEREST_CHARGES",
    "service_charge": "SERVICE_CHARGES",
    "price_increase": "RATE_CORRECTION",
    "penalty": "PENALTY_CHARGES",
    "other": "OTHER",
}


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
    def _resolve_branch_id(db: Session, org_id: str, note_data: Dict[str, Any]) -> int:
        branch_id = note_data.get("branch_id")
        if branch_id:
            return int(branch_id)

        result = db.execute(text("""
            SELECT branch_id
            FROM master.org_branches
            WHERE org_id = :org_id AND COALESCE(is_active, TRUE) = TRUE
            ORDER BY COALESCE(is_main, FALSE) DESC, branch_id
            LIMIT 1
        """), {"org_id": org_id}).first()

        if not result:
            raise ValueError("No active branch found for organization")

        return int(result.branch_id)

    @staticmethod
    def _format_note_identifier(note_type: str, note_id: Any) -> str:
        return f"{note_type}:{note_id}"

    @staticmethod
    def _parse_note_identifier(note_identifier: str) -> tuple[Optional[str], str]:
        if ":" in str(note_identifier):
            note_type, raw_id = str(note_identifier).split(":", 1)
            return note_type, raw_id
        return None, str(note_identifier)

    @staticmethod
    def _map_reason_code(note_type: str, raw_reason: Optional[str], explicit_reason_code: Optional[str] = None) -> str:
        if explicit_reason_code:
            return explicit_reason_code.upper()

        normalized = (raw_reason or "").strip().lower().replace(" ", "_")
        if note_type == "credit":
            return CREDIT_REASON_CODE_MAP.get(normalized, "OTHER")
        return DEBIT_REASON_CODE_MAP.get(normalized, "OTHER")
    
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
        # Canonical note source is the financial schema.
        base_query = """
            SELECT 
                'credit:' || cn.credit_note_id::text as note_id,
                'credit' as note_type,
                cn.credit_note_id as raw_note_id,
                cn.credit_note_number as note_number,
                cn.credit_note_date as note_date,
                cn.customer_id as party_id,
                'customer' as party_type,
                c.customer_name as party_name,
                c.gst_number as party_gst,
                cn.total_amount,
                cn.reason,
                cn.reason_code,
                cn.status,
                cn.created_at,
                cn.reference_type,
                cn.reference_id,
                cn.reference_number
            FROM financial.credit_notes cn
            LEFT JOIN parties.customers c ON cn.customer_id = c.customer_id
            
            UNION ALL
            
            SELECT 
                'debit:' || dn.debit_note_id::text as note_id,
                'debit' as note_type,
                dn.debit_note_id as raw_note_id,
                dn.debit_note_number as note_number,
                dn.debit_note_date as note_date,
                COALESCE(dn.supplier_id, dn.customer_id) as party_id,
                CASE
                    WHEN dn.supplier_id IS NOT NULL THEN 'supplier'
                    ELSE 'customer'
                END as party_type,
                COALESCE(s.supplier_name, c.customer_name) as party_name,
                COALESCE(s.gst_number, c.gst_number) as party_gst,
                dn.total_amount,
                dn.reason,
                dn.reason_code,
                dn.status,
                dn.created_at,
                dn.reference_type,
                dn.reference_id,
                dn.reference_number
            FROM financial.debit_notes dn
            LEFT JOIN parties.suppliers s ON dn.supplier_id = s.supplier_id
            LEFT JOIN parties.customers c ON dn.customer_id = c.customer_id
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
        branch_id = CreditNoteService._resolve_branch_id(db, org_id, note_data)
        note_number = DocumentNumberService.generate_number(db, "credit_note", org_id)
        subtotal = Decimal(str(note_data["amount"]))
        tax_percent = Decimal(str(note_data.get("tax_percent", 0)))
        tax_amount = subtotal * tax_percent / 100 if tax_percent > 0 else Decimal("0")
        total_amount = subtotal + tax_amount
        reason_code = CreditNoteService._map_reason_code(
            "credit",
            note_data.get("reason"),
            note_data.get("reason_code")
        )

        result = db.execute(text("""
            INSERT INTO financial.credit_notes (
                org_id, branch_id, credit_note_number, credit_note_date,
                customer_id, reference_type, reference_id, reference_number,
                credit_amount, tax_amount, total_amount,
                reason_code, reason, notes,
                is_gst_applicable, cgst_amount, sgst_amount, igst_amount,
                status, created_by, created_at, updated_at
            ) VALUES (
                :org_id, :branch_id, :note_number, :note_date,
                :party_id, :reference_type, :reference_id, :reference_number,
                :subtotal, :tax_amount, :total_amount,
                :reason_code, :reason, :notes,
                :is_gst_applicable, :cgst_amount, :sgst_amount, :igst_amount,
                'approved', :created_by, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
            )
            RETURNING credit_note_id
        """), {
            "org_id": org_id,
            "branch_id": branch_id,
            "note_number": note_number,
            "note_date": note_data["note_date"],
            "party_id": note_data["party_id"],
            "reference_type": "INVOICE" if note_data.get("reference_invoice_id") else "OTHER",
            "reference_id": note_data.get("reference_invoice_id"),
            "reference_number": note_data.get("reference_number"),
            "reason": note_data["reason"],
            "reason_code": reason_code,
            "subtotal": subtotal,
            "tax_amount": tax_amount,
            "total_amount": total_amount,
            "notes": note_data.get("notes", ""),
            "is_gst_applicable": note_data.get("is_gst_applicable", True),
            "cgst_amount": note_data.get("cgst_amount", 0),
            "sgst_amount": note_data.get("sgst_amount", 0),
            "igst_amount": note_data.get("igst_amount", 0),
            "created_by": user_id
        })
        note_id = result.scalar()

        logger.info(f"Created credit note {note_number} for amount {total_amount}")
        
        return {
            "note_id": CreditNoteService._format_note_identifier("credit", note_id),
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
        branch_id = CreditNoteService._resolve_branch_id(db, org_id, note_data)
        note_number = DocumentNumberService.generate_number(db, "debit_note", org_id)
        subtotal = Decimal(str(note_data["amount"]))
        tax_percent = Decimal(str(note_data.get("tax_percent", 0)))
        tax_amount = subtotal * tax_percent / 100 if tax_percent > 0 else Decimal("0")
        total_amount = subtotal + tax_amount
        reason_code = CreditNoteService._map_reason_code(
            "debit",
            note_data.get("reason"),
            note_data.get("reason_code")
        )

        result = db.execute(text("""
            INSERT INTO financial.debit_notes (
                org_id, branch_id, debit_note_number, debit_note_date,
                customer_id, supplier_id, reference_type, reference_id, reference_number,
                debit_amount, tax_amount, total_amount,
                reason_code, reason, notes,
                is_gst_applicable, cgst_amount, sgst_amount, igst_amount,
                status, created_by, created_at, updated_at
            ) VALUES (
                :org_id, :branch_id, :note_number, :note_date,
                :customer_id, :supplier_id, :reference_type, :reference_id, :reference_number,
                :subtotal, :tax_amount, :total_amount,
                :reason_code, :reason, :notes,
                :is_gst_applicable, :cgst_amount, :sgst_amount, :igst_amount,
                'approved', :created_by, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
            )
            RETURNING debit_note_id
        """), {
            "org_id": org_id,
            "branch_id": branch_id,
            "note_number": note_number,
            "note_date": note_data["note_date"],
            "customer_id": note_data["party_id"] if party_type == PartyType.CUSTOMER.value else None,
            "supplier_id": note_data["party_id"] if party_type == PartyType.SUPPLIER.value else None,
            "reference_type": "INVOICE" if note_data.get("reference_invoice_id") else "OTHER",
            "reference_id": note_data.get("reference_invoice_id"),
            "reference_number": note_data.get("reference_number"),
            "reason": note_data["reason"],
            "reason_code": reason_code,
            "subtotal": subtotal,
            "tax_amount": tax_amount,
            "total_amount": total_amount,
            "notes": note_data.get("notes", ""),
            "is_gst_applicable": note_data.get("is_gst_applicable", True),
            "cgst_amount": note_data.get("cgst_amount", 0),
            "sgst_amount": note_data.get("sgst_amount", 0),
            "igst_amount": note_data.get("igst_amount", 0),
            "created_by": user_id
        })
        note_id = result.scalar()

        logger.info(f"Created debit note {note_number} for amount {total_amount}")
        
        return {
            "note_id": CreditNoteService._format_note_identifier("debit", note_id),
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
        note_type, raw_note_id = CreditNoteService._parse_note_identifier(note_id)

        credit_note = None
        debit_note = None

        if note_type in (None, "credit"):
            credit_note = db.execute(text("""
                SELECT
                    'credit' as note_type,
                    'credit:' || cn.credit_note_id::text as note_id,
                    cn.credit_note_id as raw_note_id,
                    cn.credit_note_number as note_number,
                    cn.credit_note_date as note_date,
                    cn.customer_id as party_id,
                    'customer' as party_type,
                    c.customer_name as party_name,
                    c.gst_number as party_gst,
                    cn.reference_type,
                    cn.reference_id,
                    cn.reference_number,
                    cn.credit_amount as base_amount,
                    cn.tax_amount,
                    cn.total_amount,
                    cn.reason_code,
                    cn.reason,
                    cn.notes,
                    cn.status,
                    cn.cgst_amount,
                    cn.sgst_amount,
                    cn.igst_amount,
                    cn.created_at,
                    cn.updated_at
                FROM financial.credit_notes cn
                LEFT JOIN parties.customers c ON cn.customer_id = c.customer_id
                WHERE cn.credit_note_id = :note_id
            """), {"note_id": raw_note_id}).fetchone()

        if note_type in (None, "debit") and not credit_note:
            debit_note = db.execute(text("""
                SELECT
                    'debit' as note_type,
                    'debit:' || dn.debit_note_id::text as note_id,
                    dn.debit_note_id as raw_note_id,
                    dn.debit_note_number as note_number,
                    dn.debit_note_date as note_date,
                    COALESCE(dn.supplier_id, dn.customer_id) as party_id,
                    CASE WHEN dn.supplier_id IS NOT NULL THEN 'supplier' ELSE 'customer' END as party_type,
                    COALESCE(s.supplier_name, c.customer_name) as party_name,
                    COALESCE(s.gst_number, c.gst_number) as party_gst,
                    dn.reference_type,
                    dn.reference_id,
                    dn.reference_number,
                    dn.debit_amount as base_amount,
                    dn.tax_amount,
                    dn.total_amount,
                    dn.reason_code,
                    dn.reason,
                    dn.notes,
                    dn.status,
                    dn.cgst_amount,
                    dn.sgst_amount,
                    dn.igst_amount,
                    dn.created_at,
                    dn.updated_at
                FROM financial.debit_notes dn
                LEFT JOIN parties.suppliers s ON dn.supplier_id = s.supplier_id
                LEFT JOIN parties.customers c ON dn.customer_id = c.customer_id
                WHERE dn.debit_note_id = :note_id
            """), {"note_id": raw_note_id}).fetchone()

        note = credit_note or debit_note
        return dict(note._mapping) if note else None
    
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
        note = CreditNoteService.get_note_detail(db, org_id, note_id)
        if not note:
            raise ValueError("Note not found")

        if note["status"] == "cancelled":
            raise ValueError("Note already cancelled")

        target_table = "financial.credit_notes" if note["note_type"] == "credit" else "financial.debit_notes"
        target_id_column = "credit_note_id" if note["note_type"] == "credit" else "debit_note_id"

        db.execute(text(f"""
            UPDATE {target_table}
            SET status = 'cancelled',
                notes = CASE
                    WHEN COALESCE(notes, '') = '' THEN :reason_note
                    ELSE notes || E'\\n\\n' || :reason_note
                END,
                updated_at = CURRENT_TIMESTAMP
            WHERE {target_id_column} = :note_id
        """), {
            "note_id": note["raw_note_id"],
            "reason_note": f"Cancellation reason: {reason}"
        })

        logger.info(f"Cancelled note {note['note_number']} by user {user_id}. Reason: {reason}")

        return {
            "note_id": note["note_id"],
            "note_number": note["note_number"],
            "status": "cancelled",
            "message": f"{note['note_type'].title()} note {note['note_number']} cancelled successfully"
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
        created_by: int
    ) -> Dict[str, Any]:
        """
        Create a credit note in financial.credit_notes table.
        Used by sales module for customer credit notes.
        """
        # Generate credit note number
        credit_note_number = DocumentNumberService.generate_number(db, "credit_note", org_id)
        
        # Calculate total amount
        total_amount = float(data.get('credit_amount', 0)) + float(data.get('tax_amount', 0))
        
        # Create credit note
        result = db.execute(text("""
            INSERT INTO financial.credit_notes (
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
        created_by: int
    ) -> Dict[str, Any]:
        """
        Create a debit note in financial.debit_notes table.
        Used by sales module for customer debit notes.
        """
        # Generate debit note number
        debit_note_number = DocumentNumberService.generate_number(db, "debit_note", org_id)
        
        # Calculate total amount
        total_amount = float(data.get('debit_amount', 0)) + float(data.get('tax_amount', 0))
        
        # Create debit note
        result = db.execute(text("""
            INSERT INTO financial.debit_notes (
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
        created_by: int,
        invoice_id: int = None,
        invoice_number: str = None,
        return_date: str = None,
        is_gst_applicable: bool = True
    ) -> Dict[str, Any]:
        """
        Create a credit note for a sales return and update customer outstanding.
        Single atomic operation that:
        1. Creates credit note in financial.credit_notes
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
        
        # Sales returns follow the same whole-rupee rounding convention as invoices.
        # The credit note ledger impact must match the return header and invoice final amount.
        total_amount = round(float(credit_amount) + float(tax_amount))
        
        # Use provided date or current date
        credit_note_date = return_date if return_date else date_type.today()
        
        # 1. Create credit note in financial.credit_notes
        result = db.execute(text("""
            INSERT INTO financial.credit_notes (
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
            "reason": reason or f"Sales return - {reason_code}",
            "notes": f"Credit note for sales return {return_number}",
            "is_gst_applicable": is_gst_applicable,
            "cgst_amount": cgst_amount,
            "sgst_amount": sgst_amount,
            "igst_amount": igst_amount,
            "created_by": created_by
        })
        
        credit_note_id = result.scalar()
        
        # 2. Insert into financial.customer_outstanding (single source of truth)
        # Credit notes have NEGATIVE original_amount (reduces what customer owes)
        db.execute(text("""
            INSERT INTO financial.customer_outstanding (
                org_id, customer_id, document_type, document_id, document_number,
                document_date, original_amount, outstanding_amount, paid_amount,
                due_date, status
            ) VALUES (
                :org_id, :customer_id, 'credit_note', :credit_note_id, :credit_note_number,
                :credit_note_date, :negative_amount, :negative_amount, 0,
                :credit_note_date, 'open'
            )
        """), {
            "org_id": org_id,
            "customer_id": customer_id,
            "credit_note_id": credit_note_id,
            "credit_note_number": credit_note_number,
            "credit_note_date": credit_note_date,
            "negative_amount": -total_amount  # Negative to reduce outstanding
        })
        
        # Get updated total outstanding from financial.customer_outstanding
        outstanding_result = db.execute(text("""
            SELECT COALESCE(SUM(outstanding_amount), 0) as total_outstanding
            FROM financial.customer_outstanding
            WHERE customer_id = :customer_id 
            AND status IN ('open', 'partial')
        """), {"customer_id": customer_id}).first()
        
        new_outstanding = float(outstanding_result.total_outstanding) if outstanding_result else 0.0
        previous_outstanding = new_outstanding + total_amount  # Calculate what it was before
        
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
        created_by: int,
        grn_id: int = None,
        grn_number: str = None,
        return_date: str = None,
        is_gst_applicable: bool = True
    ) -> Dict[str, Any]:
        """
        Create a debit note for a purchase return and update supplier balance.
        Single atomic operation that:
        1. Updates procurement.purchase_returns with debit note number
        2. Creates debit note in financial.debit_notes with supplier_id
        3. Inserts into financial.supplier_outstanding (negative amount)

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

        # 1. Update the purchase return with debit note number
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

        # 2. Create debit note in financial.debit_notes with supplier_id
        result = db.execute(text("""
            INSERT INTO financial.debit_notes (
                org_id, branch_id, debit_note_number, debit_note_date,
                supplier_id, reference_type, reference_id, reference_number,
                debit_amount, tax_amount, total_amount,
                reason_code, reason, notes,
                is_gst_applicable, cgst_amount, sgst_amount, igst_amount,
                status, created_by
            ) VALUES (
                :org_id, :branch_id, :debit_note_number, :debit_note_date,
                :supplier_id, 'PURCHASE_RETURN', :return_id, :return_number,
                :debit_amount, :tax_amount, :total_amount,
                'PURCHASE_RETURN', :reason, :notes,
                :is_gst_applicable, :cgst_amount, :sgst_amount, :igst_amount,
                'approved', :created_by
            ) RETURNING debit_note_id
        """), {
            "org_id": org_id,
            "branch_id": branch_id,
            "debit_note_number": debit_note_number,
            "debit_note_date": debit_note_date,
            "supplier_id": supplier_id,
            "return_id": return_id,
            "return_number": return_number,
            "debit_amount": debit_amount,
            "tax_amount": tax_amount,
            "total_amount": total_amount,
            "reason": reason or f"Purchase return - {reason_code}",
            "notes": f"Debit note for purchase return {return_number}",
            "is_gst_applicable": is_gst_applicable,
            "cgst_amount": cgst_amount,
            "sgst_amount": sgst_amount,
            "igst_amount": igst_amount,
            "created_by": created_by
        })

        debit_note_id = result.scalar()

        # 3. Insert into financial.supplier_outstanding (reduces what we owe supplier)
        # Negative amount = reduces payable (mirrors credit note pattern for customers)
        db.execute(text("""
            INSERT INTO financial.supplier_outstanding (
                org_id, supplier_id, document_type, document_id, document_number,
                document_date, original_amount, outstanding_amount, paid_amount,
                due_date, status
            ) VALUES (
                :org_id, :supplier_id, 'debit_note', :debit_note_id, :debit_note_number,
                :debit_note_date, :negative_amount, :negative_amount, 0,
                :debit_note_date, 'open'
            )
        """), {
            "org_id": org_id,
            "supplier_id": supplier_id,
            "debit_note_id": debit_note_id,
            "debit_note_number": debit_note_number,
            "debit_note_date": debit_note_date,
            "negative_amount": -total_amount  # Negative to reduce payable
        })

        logger.info(
            f"Created debit note {debit_note_number} (ID: {debit_note_id}) for purchase return {return_number}. "
            f"Amount: {total_amount}. Supplier: {supplier_id}. Supplier outstanding updated."
        )

        return {
            "success": True,
            "debit_note_id": debit_note_id,
            "debit_note_number": debit_note_number,
            "total_amount": total_amount,
            "action": "debit_note_issued"
        }
