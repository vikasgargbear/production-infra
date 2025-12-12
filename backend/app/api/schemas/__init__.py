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

# Finance schemas
from .finance import (
    AllocationRequest, BulkAllocationRequest, AutoAllocationRequest,
    JournalLineCreate, JournalEntryCreate,
    ExpenseLineCreate, ExpenseClaimCreate,
    LedgerTransaction, LedgerSummary
)

# Compliance schemas
from .compliance import (
    DrugLicenseCreate, ComplianceAudit, InspectorVisit, ComplianceDocument
)

# Loyalty schemas
from .loyalty import (
    LoyaltyProgramCreate, CustomerTier, PointsTransaction, PointsRedemption,
    SchemeCreate, SchemeResponse, DiscountCalculation
)

# Challan schemas
from .challan import (
    ChallanItemRequest, ChallanCreationRequest, ChallanResponse, ChallanTrackingRequest,
    ConversionRequest, BulkChallanToInvoiceRequest, ConversionResponse
)

# Settings schemas
from .settings import (
    SettingUpdate, BillingSettings, InventorySettings, ComplianceSettings
)

# Export all schemas
__all__ = [
    # Customer schemas
    "CustomerBase", "CustomerCreate", "CustomerUpdate", "CustomerResponse",
    "CustomerListResponse", "CustomerLedgerEntry", "CustomerLedgerResponse",
    "OutstandingInvoice", "CustomerOutstandingResponse",
    "PaymentRecord", "PaymentResponse",
    # Finance schemas
    "AllocationRequest", "BulkAllocationRequest", "AutoAllocationRequest",
    "JournalLineCreate", "JournalEntryCreate",
    "ExpenseLineCreate", "ExpenseClaimCreate",
    "LedgerTransaction", "LedgerSummary",
    # Compliance schemas
    "DrugLicenseCreate", "ComplianceAudit", "InspectorVisit", "ComplianceDocument",
    # Loyalty schemas
    "LoyaltyProgramCreate", "CustomerTier", "PointsTransaction", "PointsRedemption",
    "SchemeCreate", "SchemeResponse", "DiscountCalculation",
    # Challan schemas
    "ChallanItemRequest", "ChallanCreationRequest", "ChallanResponse", "ChallanTrackingRequest",
    "ConversionRequest", "BulkChallanToInvoiceRequest", "ConversionResponse",
    # Settings schemas
    "SettingUpdate", "BillingSettings", "InventorySettings", "ComplianceSettings",
]