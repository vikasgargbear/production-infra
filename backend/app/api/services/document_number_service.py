"""
Unified Document Number Generation Service
Provides consistent document number generation across all modules

Format: PREFIX-YYXXXXXXXX
- PREFIX: Document type identifier (2-3 letters)
- YY: Last 2 digits of year
- XXXXXXXX: 8-digit sequential number (10000000-99999999)

This provides 90,000,000 unique numbers per document type per year
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
    "sales_order": {
        "prefix": "SO",
        "table": "sales.sales_orders",
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
    }
}

class DocumentNumberService:
    """Unified service for generating document numbers"""
    
    @staticmethod
    def generate_number(db: Session, document_type: str, org_id: Optional[str] = None) -> str:
        """
        Generate a unique document number for the specified type
        
        Args:
            db: Database session
            document_type: Type of document (invoice, purchase_order, etc.)
            org_id: Organization ID (optional, for multi-tenant systems)
            
        Returns:
            Generated document number in format PREFIX-YYXXXXXX
        """
        try:
            # Get configuration for document type
            config = DOCUMENT_CONFIGS.get(document_type)
            if not config:
                raise ValueError(f"Unknown document type: {document_type}")
            
            # Get current year (last 2 digits)
            current_year = datetime.now().year % 100  # Gets last 2 digits (2025 -> 25)
            year_prefix = f"{current_year:02d}"
            
            # Build the pattern for searching existing numbers
            pattern = f"{config['prefix']}-{year_prefix}%"
            
            # Build query based on whether org_id is provided
            if org_id and "org_id" in get_table_columns(db, config['table']):
                query = f"""
                    SELECT {config['column']} 
                    FROM {config['table']}
                    WHERE {config['column']} LIKE :pattern
                    AND org_id = :org_id
                    ORDER BY {config['id_column']} DESC
                    LIMIT 1
                """
                params = {"pattern": pattern, "org_id": org_id}
            else:
                query = f"""
                    SELECT {config['column']} 
                    FROM {config['table']}
                    WHERE {config['column']} LIKE :pattern
                    ORDER BY {config['id_column']} DESC
                    LIMIT 1
                """
                params = {"pattern": pattern}
            
            # Execute query
            result = db.execute(text(query), params)
            latest = result.first()
            
            # Calculate next sequence number
            if latest and latest[0]:
                # Extract sequence number from existing format
                # Format: PREFIX-YY######## where YY is year and ######## is sequence
                parts = latest[0].split('-')
                if len(parts) >= 2:
                    try:
                        # Remove the year prefix (first 2 digits) from the number part
                        number_with_year = parts[-1]
                        # Check if it starts with the year prefix
                        if number_with_year.startswith(year_prefix):
                            # Extract just the sequence number (remove year prefix)
                            current_seq = int(number_with_year[len(year_prefix):])
                        else:
                            # Old format or corrupted, extract what we can
                            current_seq = int(number_with_year) if len(number_with_year) <= 8 else int(number_with_year[-8:])
                        
                        # Increment for next sequence
                        if current_seq < 10000000:
                            next_seq = 10000000
                        else:
                            next_seq = current_seq + 1
                    except (ValueError, IndexError):
                        next_seq = 10000000
                else:
                    next_seq = 10000000
            else:
                # First document of the year
                next_seq = 10000000
            
            # Generate the document number
            document_number = f"{config['prefix']}-{year_prefix}{next_seq}"
            
            logger.info(f"Generated {document_type} number: {document_number}")
            return document_number
            
        except Exception as e:
            logger.error(f"Error generating {document_type} number: {e}")
            # Fallback to timestamp-based generation
            timestamp = int(datetime.now().timestamp() * 1000) % 100000000
            fallback_number = f"{config['prefix']}-{year_prefix}{timestamp:08d}"
            logger.warning(f"Using fallback number: {fallback_number}")
            return fallback_number
    
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


def get_table_columns(db: Session, table_name: str) -> list:
    """Helper to get columns of a table"""
    try:
        schema, table = table_name.split('.')
        result = db.execute(text("""
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_schema = :schema 
            AND table_name = :table
        """), {"schema": schema, "table": table})
        return [row[0] for row in result]
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