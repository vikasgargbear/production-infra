"""
Pydantic schemas for API validation
"""
# Import from the original schemas.py to maintain compatibility

# Import new modular schemas
from .customer import (
    CustomerBase, CustomerCreate, CustomerUpdate, CustomerResponse,
    CustomerListResponse, CustomerLedgerEntry, CustomerLedgerResponse,
    OutstandingInvoice, CustomerOutstandingResponse,
    PaymentRecord, PaymentResponse
)

# Export all schemas
__all__ = [
    # Customer schemas
    "CustomerBase", "CustomerCreate", "CustomerUpdate", "CustomerResponse",
    "CustomerListResponse", "CustomerLedgerEntry", "CustomerLedgerResponse",
    "OutstandingInvoice", "CustomerOutstandingResponse",
    "PaymentRecord", "PaymentResponse"
]