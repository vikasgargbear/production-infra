"""
Pydantic schemas for API validation

Organized by domain to match routes structure:
- auth/       - Authentication schemas
- compliance/ - Drug license, audits, loyalty
- finance/    - Payments, allocations, journals
- inventory/  - Stock movements, batches
- master/     - Customers, suppliers, products
- purchase/   - Purchase orders, GRN, supplier invoices
- sales/      - Orders, invoices, returns, challans
- settings/   - Org settings, billing config
"""

# Re-export from subdirectories for backward compatibility

# Master data schemas
from .master.customer import (
    CustomerBase, CustomerCreate, CustomerUpdate, CustomerResponse, CustomerSummary,
    CustomerListResponse, CustomerLedgerEntry, CustomerLedgerResponse,
    OutstandingInvoice, CustomerOutstandingResponse,
    PaymentRecord, PaymentResponse
)
from .master.supplier import (
    SupplierBase, SupplierCreate, SupplierUpdate, SupplierResponse,
    SupplierListResponse, SupplierSummary
)
from .master.product_schema import (
    Product, ProductBase, ProductCreate, ProductUpdate, ProductResponse, 
    ProductSummary, ProductSearch, ProductListResponse
)

# Sales schemas
from .sales.order import (
    OrderStatus, OrderType,
    OrderItemCreate, OrderCreate, OrderUpdate, OrderResponse, OrderSummary, OrderListResponse
)
from .sales.returns import (
    ReturnCategory, ReturnMethod, ReturnStatus,
    SalesReturnItem, SalesReturnCreate, SalesReturnResponse
)
from .sales.billing import (
    InvoiceStatus, PaymentMode, GSTType,
    InvoiceCreate, InvoiceResponse, InvoiceSummary,
    PaymentCreate, PaymentResponse as InvoicePaymentResponse,
    GeneralPaymentCreate, InvoicePaymentCreate
)
from .sales.challan import (
    ChallanStatus,
    ChallanItemRequest, ChallanCreationRequest, ChallanResponse, ChallanSummary,
    ChallanTrackingRequest, ConversionRequest, BulkChallanToInvoiceRequest, ConversionResponse
)

# Purchase schemas
from .purchase import (
    POStatus, POType, GRNStatus, QCStatus, SupplierInvoiceStatus,
    PurchaseOrderCreate, PurchaseOrderResponse, PurchaseOrderSummary,
    GRNCreate, GRNResponse, GRNSummary,
    SupplierInvoiceCreate, SupplierInvoiceResponse, SupplierPaymentCreate
)

# Finance schemas  
from .finance.finance import (
    AllocationMethod, JournalEntryType,
    AllocationRequest, BulkAllocationRequest, AutoAllocationRequest, AllocationResponse,
    JournalLineCreate, JournalEntryCreate, JournalEntryResponse,
    ExpenseLineCreate, ExpenseClaimCreate, ExpenseClaimResponse,
    LedgerTransaction, LedgerSummary, LedgerRequest
)

# Inventory schemas
from .inventory.inventory import (
    MovementType, MovementDirection, AdjustmentType,
    BatchCreate, BatchUpdate, BatchResponse, BatchSummary,
    StockMovementCreate, StockMovementResponse,
    StockAdjustment, StockTransfer,
    CurrentStock, ExpiryAlert, LowStockAlert,
    InventoryDashboard
)

# Auth schemas
from .auth.auth_schemas import (
    UserRole, SessionStatus,
    LoginRequest, LoginResponse, UserSummary,
    RefreshTokenRequest, RefreshTokenResponse,
    PasswordChangeRequest, PasswordResetRequest,
    AuthError, SessionInfo, SessionListResponse,
    UserCreate, UserUpdate, UserResponse
)

# Compliance schemas
from .compliance.compliance import (
    LicenseType, LicenseStatus, AuditType, AuditStatus,
    DrugLicenseCreate, DrugLicenseResponse,
    ComplianceAuditCreate, ComplianceAuditResponse,
    InspectorVisitCreate, InspectorVisitResponse,
    ComplianceDocumentCreate, ComplianceDocumentResponse,
    ComplianceDashboard
)
from .compliance.loyalty import (
    LoyaltyProgramCreate, CustomerTier,
    PointsTransaction, PointsRedemption,
    SchemeCreate, SchemeResponse, DiscountCalculation
)

# Settings schemas
from .settings.settings import (
    SettingUpdate, SettingResponse,
    BillingSettings, InventorySettings, ComplianceSettings,
    NotificationSettings, OrganizationSettings
)