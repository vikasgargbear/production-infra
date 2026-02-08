"""
Unified Document Number Generation Service
Provides consistent document number generation across all modules

Format: PREFIX-YYYYMMDDNNNN
- PREFIX: Document type identifier (2-4 letters)
- YYYYMMDD: Date of generation
- NNNN: 4-digit sequential number per date (0001-9999)

Scoped by: document_type + org_id + date → each org gets its own 0001 per type per day
"""
from typing import Dict, Optional
from datetime import datetime
from sqlalchemy.orm import Session
from sqlalchemy import text
import logging

logger = logging.getLogger(__name__)

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
    "purchase": {
        "prefix": "PUR",
        "table": "procurement.purchases",
        "column": "purchase_number",
        "id_column": "purchase_id"
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
        "table": "financial.receipts",
        "column": "receipt_number",
        "id_column": "receipt_id"
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
    "quotation": {
        "prefix": "QT",
        "table": "sales.quotations",
        "column": "quotation_number",
        "id_column": "quotation_id"
    },
    "stock_adjustment": {
        "prefix": "ADJ",
        "table": "inventory.stock_adjustments",
        "column": "adjustment_number",
        "id_column": "adjustment_id"
    },
    "adjustment": {
        "prefix": "ADJ",
        "table": "inventory.stock_movements",
        "column": "reference_number",
        "id_column": "movement_id"
    },
    # New document types added for service consolidation
    "stock_receipt": {
        "prefix": "SR",
        "table": "inventory.stock_movements",
        "column": "movement_number",
        "id_column": "movement_id"
    },
    "stock_issue": {
        "prefix": "SI",
        "table": "inventory.stock_movements",
        "column": "movement_number",
        "id_column": "movement_id"
    },
    "writeoff": {
        "prefix": "WO",
        "table": "inventory.stock_writeoffs",
        "column": "writeoff_number",
        "id_column": "writeoff_id"
    },
    "scheme": {
        "prefix": "SCH",
        "table": "sales.promotional_schemes",
        "column": "scheme_code",
        "id_column": "scheme_id"
    },
    "stock_count": {
        "prefix": "CNT",
        "table": "inventory.stock_counts",
        "column": "count_reference",
        "id_column": "count_id"
    },
    "product": {
        "prefix": "PROD",
        "table": "inventory.products",
        "column": "product_code",
        "id_column": "product_id"
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
    def generate_number(db: Session, document_type: str, org_id: Optional[str] = None) -> str:
        """
        Generate a unique document number using atomic database sequences.

        Uses INSERT ... ON CONFLICT DO UPDATE on public.document_number_sequences
        to guarantee uniqueness even under concurrent requests.

        Args:
            db: Database session
            document_type: Type of document (invoice, purchase_order, etc.)
            org_id: Organization ID (optional, for multi-tenant systems)

        Returns:
            Generated document number in format PREFIX-YYYYMMDDNNNN
        """
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
    def generate_batch_number(product_code: Optional[str] = None) -> str:
        """
        Generate a batch number for inventory
        Format: BYYMMXXXX (B + YY + MM + 4-digit sequence)
        """
        now = datetime.now()
        year = now.year % 100
        month = now.month
        
        # Generate a 4-digit random/sequential component
        import random
        seq = random.randint(1000, 9999)
        
        batch_number = f"B{year:02d}{month:02d}{seq:04d}"
        return batch_number
    
    @staticmethod
    def validate_format(document_number: str, document_type: str) -> bool:
        """
        Validate if a document number follows the correct format
        """
        config = DOCUMENT_CONFIGS.get(document_type)
        if not config:
            return False
        
        # Expected format: PREFIX-YYXXXXXX
        parts = document_number.split('-')
        if len(parts) != 2:
            return False
        
        prefix, number_part = parts
        if prefix != config['prefix']:
            return False
        
        # Check if number part is 10 digits (YY + 8-digit sequence)
        if len(number_part) != 10 or not number_part.isdigit():
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


# Convenience functions for backward compatibility
def generate_invoice_number(db: Session, org_id: Optional[str] = None) -> str:
    """Generate invoice number"""
    return DocumentNumberService.generate_number(db, "invoice", org_id)

def generate_purchase_order_number(db: Session, org_id: Optional[str] = None) -> str:
    """Generate purchase order number"""
    return DocumentNumberService.generate_number(db, "purchase_order", org_id)

def generate_grn_number(db: Session, org_id: Optional[str] = None) -> str:
    """Generate GRN number"""
    return DocumentNumberService.generate_number(db, "grn", org_id)

def generate_payment_number(db: Session, org_id: Optional[str] = None) -> str:
    """Generate payment number"""
    return DocumentNumberService.generate_number(db, "payment", org_id)

def generate_sales_order_number(db: Session, org_id: Optional[str] = None) -> str:
    """Generate sales order number"""
    return DocumentNumberService.generate_number(db, "sales_order", org_id)

def generate_delivery_challan_number(db: Session, org_id: Optional[str] = None) -> str:
    """Generate delivery challan number"""
    return DocumentNumberService.generate_number(db, "delivery_challan", org_id)

def generate_return_number(db: Session, return_type: str, org_id: Optional[str] = None) -> str:
    """Generate return number (sales or purchase)"""
    document_type = f"{return_type}_return"
    return DocumentNumberService.generate_number(db, document_type, org_id)