"""
Pydantic schemas for API validation

Organized by domain to match routes structure:
- auth/       - Authentication schemas
- compliance/ - Drug license, audits, loyalty
- finance/    - Payments, allocations, journals
- inventory/  - Stock movements, batches
- master/     - Customers, suppliers, products
- sales/      - Orders, invoices, returns, challans
- settings/   - Org settings, billing config
"""

# Re-export from subdirectories for backward compatibility

# Master data schemas
from .master.customer import (
    CustomerBase, CustomerCreate, CustomerUpdate, CustomerResponse,
    CustomerListResponse, CustomerLedgerEntry, CustomerLedgerResponse,
    OutstandingInvoice, CustomerOutstandingResponse,
    PaymentRecord, PaymentResponse
)
from .master.supplier import SupplierCreate, SupplierUpdate, SupplierResponse, SupplierListResponse
from .master.product_schema import Product, ProductCreate, ProductUpdate, ProductResponse, ProductSearch

# Sales schemas
from .sales.order import (
    OrderItemCreate, OrderCreate, OrderResponse, OrderSummary
)
from .sales.returns import SalesReturnItem, SalesReturnCreate
from .sales.billing import (
    PaymentCreate, PaymentAllocationCreate, InvoicePaymentUpdate
)
from .sales.challan import (
    ChallanItemRequest, ChallanCreationRequest, ChallanResponse, ChallanTrackingRequest,
    ConversionRequest, BulkChallanToInvoiceRequest, ConversionResponse
)

# Finance schemas  
from .finance.finance import (
    AllocationRequest, BulkAllocationRequest, AutoAllocationRequest,
    JournalLineCreate, JournalEntryCreate,
    ExpenseLineCreate, ExpenseClaimCreate,
    LedgerTransaction, LedgerSummary
)

# Inventory schemas
from .inventory.inventory import (
    StockMovementCreate, StockAdjustmentCreate,
    BatchCreate, BatchUpdate, BatchResponse
)

# Auth schemas
from .auth.auth_schemas import (
    UserCreate, UserLogin, UserResponse, TokenResponse,
    PasswordReset, PasswordChange
)

# Compliance schemas
from .compliance.compliance import (
    DrugLicenseCreate, ComplianceAudit, InspectorVisit, ComplianceDocument
)
from .compliance.loyalty import (
    LoyaltyProgramCreate, CustomerTier, PointsTransaction, PointsRedemption,
    SchemeCreate, SchemeResponse, DiscountCalculation
)

# Settings schemas
from .settings.settings import (
    SettingUpdate, BillingSettings, InventorySettings, ComplianceSettings
)