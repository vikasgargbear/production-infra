"""
Unified Document Number Generation Service
Provides consistent document number generation across all modules

Format: PREFIX-YYYYMMDDNNNN
- PREFIX: Document type identifier (2-4 letters)
- YYYYMMDD: Date of generation
- NNNN: 4-digit sequential number per date (0001-9999)

Scoped by: document_type + org_id + date → each org gets its own 0001 per type per day
"""
from typing import Dict
from datetime import datetime
from sqlalchemy.orm import Session
from sqlalchemy import text
import logging

logger = logging.getLogger(__name__)


# Standalone number endpoints consume a sequence even when the document is not
# subsequently created. Keep that contract explicit for OpenAPI/agent clients.
DOCUMENT_NUMBER_RESERVATION_OPENAPI = {
    "x-erp-risk": "consequential_write",
    "x-erp-tenant-scope": "organization",
    "x-erp-branch-scope": "none",
    "x-erp-side-effects": "reserves_document_number",
    "x-erp-approval": "none",
    "x-erp-idempotency": "requires_durable_reservation_key_store",
    "x-erp-mcp-export": False,
    "x-erp-contract-status": "internal_release_blocked",
}


def document_number_reservation_openapi(permission: str) -> Dict[str, object]:
    """Return consistent OpenAPI policy metadata for one reservation route."""
    return {
        **DOCUMENT_NUMBER_RESERVATION_OPENAPI,
        "x-erp-permission": permission,
    }

# Document type configurations
DOCUMENT_CONFIGS = {
    "invoice": {
        "prefix": "INV",
        "table": "sales.invoices",
        "column": "invoice_number",
        "id_column": "invoice_id"
    },
    "purchase_order": {
        "prefix": "PO",
        "table": "procurement.purchase_orders",
        "column": "po_number",
        "id_column": "purchase_order_id"
    },
    "grn": {
        "prefix": "GRN",
        "table": "procurement.goods_receipt_notes",
        "column": "grn_number",
        "id_column": "grn_id"
    },
    "supplier_invoice": {
        "prefix": "PINV",
        "table": "procurement.supplier_invoices",
        "column": "supplier_invoice_number",
        "id_column": "supplier_invoice_id"
    },
    "sales_order": {
        "prefix": "SO",
        "table": "sales.orders",
        "column": "order_number",
        "id_column": "order_id"
    },
    "delivery_challan": {
        "prefix": "DC",
        "table": "sales.delivery_challans",
        "column": "challan_number",
        "id_column": "challan_id"
    },
    "sales_return": {
        "prefix": "SRN",
        "table": "sales.sales_returns",
        "column": "return_number",
        "id_column": "return_id"
    },
    "purchase_return": {
        "prefix": "PRN",
        "table": "procurement.purchase_returns",
        "column": "return_number",
        "id_column": "return_id"
    },
    "payment": {
        "prefix": "PAY",
        "table": "financial.payments",
        "column": "payment_number",
        "id_column": "payment_id"
    },
    "receipt": {
        "prefix": "RCT",
        "table": "financial.payments",
        "column": "payment_number",
        "id_column": "payment_id"
    },
    "credit_note": {
        "prefix": "CN",
        "table": "financial.credit_notes",
        "column": "credit_note_number",
        "id_column": "credit_note_id"
    },
    "debit_note": {
        "prefix": "DN",
        "table": "financial.debit_notes",
        "column": "debit_note_number",
        "id_column": "debit_note_id"
    },
    "journal_entry": {
        "prefix": "JV",
        "table": "financial.journal_entries",
        "column": "journal_number",
        "id_column": "journal_id"
    },
    "expense_claim": {
        "prefix": "EXP",
        "table": "financial.expense_claims",
        "column": "claim_number",
        "id_column": "claim_id"
    },
    "adjustment": {
        "prefix": "ADJ",
        "table": "inventory.inventory_movements",
        "column": "reference_number",
        "id_column": "movement_id"
    },
    # New document types added for service consolidation
    "stock_receipt": {
        "prefix": "SR",
        "table": "inventory.inventory_movements",
        "column": "reference_number",
        "id_column": "movement_id"
    },
    "stock_issue": {
        "prefix": "SI",
        "table": "inventory.inventory_movements",
        "column": "reference_number",
        "id_column": "movement_id"
    },
    "stock_transfer": {
        "prefix": "ST",
        "table": "inventory.inventory_movements",
        "column": "reference_number",
        "id_column": "movement_id"
    },
    "writeoff": {
        "prefix": "WO",
        "table": "inventory.stock_writeoffs",
        "column": "writeoff_number",
        "id_column": "writeoff_id"
    },
    "product": {
        "prefix": "PROD",
        "table": "inventory.products",
        "column": "product_code",
        "id_column": "product_id"
    },
    "batch": {
        "prefix": "BATCH",
        "table": "inventory.batches",
        "column": "batch_number",
        "id_column": "batch_id"
    },
    "supplier": {
        "prefix": "SUP",
        "table": "parties.suppliers",
        "column": "supplier_code",
        "id_column": "supplier_id"
    },
    "branch": {
        "prefix": "BR",
        "table": "master.org_branches",
        "column": "branch_code",
        "id_column": "branch_id"
    },
    "department": {
        "prefix": "DEPT",
        "table": "master.departments",
        "column": "department_code",
        "id_column": "department_id"
    },
    "employee": {
        "prefix": "EMP",
        "table": "master.employees",
        "column": "employee_code",
        "id_column": "employee_id"
    },
    "payroll_run": {
        "prefix": "PRL",
        "table": "payroll.payroll_runs",
        "column": "run_number",
        "id_column": "payroll_run_id"
    },
    "salary_slip": {
        "prefix": "SLP",
        "table": "payroll.payroll_slips",
        "column": "slip_number",
        "id_column": "payroll_slip_id"
    },
    "gst_filing": {
        "prefix": "GST",
        "table": "gst.return_filing_status",
        "column": "reference_number",
        "id_column": "filing_id"
    }
}

class DocumentNumberService:
    """Unified service for generating document numbers"""
    
    @staticmethod
    def generate_number(db: Session, document_type: str, org_id: str) -> str:
        """
        Generate a unique document number using atomic database sequences.

        Uses INSERT ... ON CONFLICT DO UPDATE on public.document_number_sequences
        to guarantee uniqueness even under concurrent requests.

        Args:
            db: Database session
            document_type: Type of document (invoice, purchase_order, etc.)
            org_id: Organization ID used to isolate the sequence

        Returns:
            Generated document number in format PREFIX-YYYYMMDDNNNN
        """
        if not org_id:
            raise ValueError("org_id is required for document number generation")

        try:
            config = DOCUMENT_CONFIGS.get(document_type)
            if not config:
                raise ValueError(f"Unknown document type: {document_type}")

            now = datetime.now()
            date_prefix = now.strftime("%Y%m%d")  # YYYYMMDD

            # Atomic: INSERT new row or INCREMENT existing sequence in one statement
            # ON CONFLICT guarantees no race condition — PostgreSQL locks the row during UPDATE
            result = db.execute(text("""
                INSERT INTO public.document_number_sequences
                    (document_type, org_id, year_prefix, last_sequence_number, last_generated_number, created_at, updated_at)
                VALUES
                    (:doc_type, :org_id, :date_prefix, 1, :generated, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
                ON CONFLICT (document_type, org_id, year_prefix)
                DO UPDATE SET
                    last_sequence_number = document_number_sequences.last_sequence_number + 1,
                    last_generated_number = :prefix || '-' || :date_prefix || LPAD((document_number_sequences.last_sequence_number + 1)::text, 4, '0'),
                    updated_at = CURRENT_TIMESTAMP
                RETURNING last_sequence_number
            """), {
                "doc_type": document_type,
                "org_id": org_id,
                "date_prefix": date_prefix,
                "prefix": config['prefix'],
                "generated": f"{config['prefix']}-{date_prefix}0001"
            })

            next_seq = result.scalar()
            document_number = f"{config['prefix']}-{date_prefix}{next_seq:04d}"

            logger.info(f"Generated {document_type} number: {document_number} (atomic)")
            return document_number

        except Exception as e:
            logger.error(f"Error generating {document_type} number: {e}")
            raise ValueError(f"Failed to generate {document_type} number: {e}")

    @staticmethod
    def reserve_number(db: Session, document_type: str, org_id: str) -> str:
        """Generate and commit a standalone reservation.

        Document creation flows should continue to call ``generate_number`` so
        the identifier and document are committed in the same transaction.
        """
        try:
            document_number = DocumentNumberService.generate_number(
                db, document_type, org_id
            )
            db.commit()
            return document_number
        except Exception:
            db.rollback()
            raise

    @staticmethod
    def generate_batch_number(db: Session, org_id: str) -> str:
        """Generate a tenant-scoped atomic batch reference."""
        return DocumentNumberService.generate_number(db, "batch", org_id)
    
    @staticmethod
    def validate_format(document_number: str, document_type: str) -> bool:
        """
        Validate if a document number follows the correct format
        """
        config = DOCUMENT_CONFIGS.get(document_type)
        if not config:
            return False
        
        # Expected format: PREFIX-YYYYMMDDNNNN
        parts = document_number.split('-')
        if len(parts) != 2:
            return False
        
        prefix, number_part = parts
        if prefix != config['prefix']:
            return False
        
        # Date prefix (8 digits) followed by a 4-digit daily sequence.
        if len(number_part) != 12 or not number_part.isdigit():
            return False
        
        return True


_table_columns_cache: Dict[str, list] = {}

def get_table_columns(db: Session, table_name: str) -> list:
    """Helper to get columns of a table (cached - columns don't change at runtime)"""
    if table_name in _table_columns_cache:
        return _table_columns_cache[table_name]

    try:
        schema, table = table_name.split('.')
        result = db.execute(text("""
            SELECT column_name
            FROM information_schema.columns
            WHERE table_schema = :schema
            AND table_name = :table
        """), {"schema": schema, "table": table})
        columns = [row[0] for row in result]
        _table_columns_cache[table_name] = columns
        return columns
    except:
        return []
