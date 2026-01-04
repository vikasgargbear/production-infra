"""
Purchase Invoice Parsers
Extract structured data from supplier PDF invoices

Usage:
    from app.api.services.purchase.parsers import InvoiceParser
    
    parser = InvoiceParser()
    result = parser.parse("/path/to/invoice.pdf")
    
    if result.success:
        print(f"Supplier: {result.extracted_data.supplier_name}")
        for item in result.extracted_data.items:
            print(f"  {item.product_name}: {item.quantity} @ {item.cost_price}")
"""

from .invoice_parser import InvoiceParser, ParserError
from .schemas import (
    ParseResult,
    ParsedInvoice,
    ParsedItem,
    ParserConfidence,
    ParserDefaults,
)

__all__ = [
    # Main parser
    "InvoiceParser",
    "ParserError",
    
    # Data models
    "ParseResult",
    "ParsedInvoice", 
    "ParsedItem",
    
    # Enums and constants
    "ParserConfidence",
    "ParserDefaults",
]
