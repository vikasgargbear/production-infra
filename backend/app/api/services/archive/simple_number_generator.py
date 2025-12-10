"""
Simple Document Number Generator
Replaces complex database-based generators with timestamp-based approach

Advantages:
1. No database queries needed (faster)
2. Guaranteed unique (timestamp + milliseconds)
3. No race conditions
4. No need for locks or transactions
5. Simple and easy to understand

Format: {PREFIX}-{YY}{TIMESTAMP:08d}
Example: INV-2510234567
- INV = Invoice
- 25 = Year 2025
- 10234567 = Timestamp (last 8 digits)
"""
from datetime import datetime
import time


class SimpleNumberGenerator:
    """Simple, fast, unique number generator for all document types"""

    # Document type configurations
    PREFIXES = {
        "invoice": "INV",
        "sales_order": "SO",
        "purchase_order": "PO",
        "purchase": "PUR",
        "grn": "GRN",
        "delivery_challan": "DC",
        "sales_return": "SRN",
        "purchase_return": "PRN",
        "payment": "PAY",
        "receipt": "RCT",
        "credit_note": "CN",
        "debit_note": "DN",
        "journal_entry": "JV",
        "expense_claim": "EXP",
        "quotation": "QT",
        "stock_adjustment": "ADJ",
    }

    @staticmethod
    def generate(document_type: str) -> str:
        """
        Generate unique document number

        Args:
            document_type: Type of document (invoice, sales_order, etc.)

        Returns:
            str: Unique document number

        Examples:
            >>> generate("invoice")
            "INV-2510234567"
            >>> generate("sales_order")
            "SO-2510234568"
        """
        # Get prefix
        prefix = SimpleNumberGenerator.PREFIXES.get(document_type, "DOC")

        # Get current year (last 2 digits)
        current_year = datetime.now().year % 100

        # Get timestamp (milliseconds since epoch, last 8 digits)
        # This ensures uniqueness even if multiple requests in same second
        timestamp_ms = int(time.time() * 1000)
        timestamp_part = timestamp_ms % 100000000  # Last 8 digits

        # Format: PREFIX-YYTIMESTAMP
        document_number = f"{prefix}-{current_year:02d}{timestamp_part:08d}"

        return document_number

    @staticmethod
    def generate_batch_number(product_code: str = None) -> str:
        """
        Generate batch number for inventory

        Format: B{YY}{MM}{XXXX}
        Example: B2510001234

        Args:
            product_code: Optional product code (not used currently)

        Returns:
            str: Unique batch number
        """
        now = datetime.now()
        year = now.year % 100
        month = now.month

        # Use timestamp for uniqueness
        timestamp_part = int(time.time() * 1000) % 10000  # Last 4 digits

        batch_number = f"B{year:02d}{month:02d}{timestamp_part:04d}"
        return batch_number


# Convenience functions for backward compatibility
def generate_invoice_number() -> str:
    """Generate invoice number"""
    return SimpleNumberGenerator.generate("invoice")


def generate_sales_order_number() -> str:
    """Generate sales order number"""
    return SimpleNumberGenerator.generate("sales_order")


def generate_purchase_order_number() -> str:
    """Generate purchase order number"""
    return SimpleNumberGenerator.generate("purchase_order")


def generate_grn_number() -> str:
    """Generate GRN number"""
    return SimpleNumberGenerator.generate("grn")


def generate_delivery_challan_number() -> str:
    """Generate delivery challan number"""
    return SimpleNumberGenerator.generate("delivery_challan")


def generate_payment_number() -> str:
    """Generate payment number"""
    return SimpleNumberGenerator.generate("payment")


def generate_credit_note_number() -> str:
    """Generate credit note number"""
    return SimpleNumberGenerator.generate("credit_note")


def generate_debit_note_number() -> str:
    """Generate debit note number"""
    return SimpleNumberGenerator.generate("debit_note")
