"""
Application-wide constants and enums
Never hardcode these values directly in code

Usage:
    from app.core.constants import OrderStatus, PaymentStatus
    
    # Use .value for string comparison in SQL
    order_status = OrderStatus.PENDING.value  # "pending"
"""

from enum import Enum


# =============================================================================
# ORDER & SALES STATUSES
# =============================================================================

class OrderStatus(str, Enum):
    """Order/Sales order status constants"""
    DRAFT = "draft"
    PENDING = "pending"
    CONFIRMED = "confirmed"
    PROCESSING = "processing"
    PACKED = "packed"
    SHIPPED = "shipped"
    INVOICED = "invoiced"
    DELIVERED = "delivered"
    COMPLETED = "completed"
    RETURNED = "returned"
    CANCELLED = "cancelled"


class InvoiceStatus(str, Enum):
    """Invoice status constants"""
    DRAFT = "draft"
    ISSUED = "issued"
    GENERATED = "generated"
    SENT = "sent"
    PAID = "paid"
    PARTIALLY_PAID = "partially_paid"
    OVERDUE = "overdue"
    CANCELLED = "cancelled"
    VOID = "void"


class InvoicePaymentStatus(str, Enum):
    """Invoice payment status (tracks payment progress)"""
    UNPAID = "unpaid"
    PARTIAL = "partial"
    PAID = "paid"
    OVERDUE = "overdue"


# =============================================================================
# PAYMENT STATUSES
# =============================================================================

class PaymentStatus(str, Enum):
    """General payment status constants"""
    PENDING = "pending"
    PARTIAL = "partial"
    PAID = "paid"
    OVERDUE = "overdue"


class PaymentRecordStatus(str, Enum):
    """Individual payment record status"""
    PENDING = "pending"
    COMPLETED = "completed"
    CLEARED = "cleared"
    PROCESSED = "processed"
    APPROVED = "approved"
    CANCELLED = "cancelled"
    FAILED = "failed"


class PaymentMethod(str, Enum):
    """Valid payment methods"""
    CASH = "cash"
    CARD = "card"
    UPI = "upi"
    BANK = "bank"
    BANK_TRANSFER = "bank_transfer"
    CHECK = "check"
    CHEQUE = "cheque"
    NEFT = "neft"
    RTGS = "rtgs"
    ONLINE = "online"
    CREDIT_ADJUSTMENT = "credit_adjustment"


class PaymentType(str, Enum):
    """Payment transaction types"""
    RECEIPT = "receipt"
    PAYMENT = "payment"
    ADVANCE = "advance_payment"
    INVOICE_PAYMENT = "invoice_payment"
    ADJUSTMENT = "adjustment_entry"
    REGULAR = "regular_payment"


# =============================================================================
# PURCHASE & PROCUREMENT STATUSES
# =============================================================================

class POStatus(str, Enum):
    """Purchase order status constants"""
    DRAFT = "draft"
    PENDING = "pending"
    PENDING_APPROVAL = "pending_approval"
    APPROVED = "approved"
    ORDERED = "ordered"
    SENT = "sent"
    PARTIAL = "partial"
    PARTIALLY_RECEIVED = "partially_received"
    RECEIVED = "received"
    CANCELLED = "cancelled"
    CLOSED = "closed"


class GRNStatus(str, Enum):
    """Goods Receipt Note status constants"""
    DRAFT = "draft"
    PENDING = "pending"
    PENDING_QC = "pending_qc"
    QC_PASSED = "qc_passed"
    QC_FAILED = "qc_failed"
    RECEIVED = "received"
    PARTIAL = "partial"
    COMPLETED = "completed"
    CANCELLED = "cancelled"


class SupplierInvoiceStatus(str, Enum):
    """Supplier invoice status constants"""
    DRAFT = "draft"
    PENDING = "pending"
    PENDING_VERIFICATION = "pending_verification"
    VERIFIED = "verified"
    APPROVED = "approved"
    DISPUTED = "disputed"
    PAID = "paid"
    PARTIAL = "partial"
    PARTIALLY_PAID = "partially_paid"
    CANCELLED = "cancelled"


# =============================================================================
# INVENTORY STATUSES
# =============================================================================

class BatchStatus(str, Enum):
    """Inventory batch status constants"""
    ACTIVE = "active"
    EXPIRED = "expired"
    RECALLED = "recalled"
    QUARANTINE = "quarantine"
    DEPLETED = "depleted"


class StockMovementType(str, Enum):
    """Stock movement type constants"""
    RECEIPT = "receipt"
    ISSUE = "issue"
    RETURN = "return"
    ADJUSTMENT = "adjustment"
    TRANSFER = "transfer"
    WRITEOFF = "writeoff"
    EXPIRY = "expiry"


# =============================================================================
# RETURN STATUSES
# =============================================================================

class ReturnStatus(str, Enum):
    """Sales/Purchase return status constants"""
    DRAFT = "draft"
    PENDING = "pending"
    APPROVED = "approved"
    PROCESSING = "processing"
    COMPLETED = "completed"
    REJECTED = "rejected"
    CANCELLED = "cancelled"


class JournalEntryStatus(str, Enum):
    """Journal entry status constants"""
    DRAFT = "draft"
    POSTED = "posted"
    CANCELLED = "cancelled"


class DispositionType(str, Enum):
    """Return item disposition types"""
    RESTOCK = "RESTOCK"
    QUARANTINE = "QUARANTINE"
    DESTROY = "DESTROY"
    RETURN_TO_SUPPLIER = "RETURN_TO_SUPPLIER"


# =============================================================================
# DOCUMENT & INVOICE TYPES
# =============================================================================

class InvoiceType(str, Enum):
    """Invoice type constants"""
    REGULAR = "regular"
    PROFORMA = "proforma"
    TAX = "tax"
    TAX_INVOICE = "tax_invoice"
    CREDIT_NOTE = "credit_note"
    DEBIT_NOTE = "debit_note"


class CreditNoteReason(str, Enum):
    """Credit note reason codes"""
    EXPIRED_GOODS = "EXPIRED_GOODS"
    DAMAGED_GOODS = "DAMAGED_GOODS"
    WRONG_BILLING = "WRONG_BILLING"
    QUALITY_ISSUE = "QUALITY_ISSUE"
    OVERCHARGE = "OVERCHARGE"
    SALES_RETURN = "SALES_RETURN"
    OTHER = "OTHER"


# =============================================================================
# PARTY TYPES
# =============================================================================

class PartyType(str, Enum):
    """Party type for payments and transactions"""
    CUSTOMER = "customer"
    SUPPLIER = "supplier"


class CustomerType(str, Enum):
    """Customer type constants"""
    RETAIL = "retail"
    WHOLESALE = "wholesale"
    HOSPITAL = "hospital"
    CLINIC = "clinic"
    PHARMACY = "pharmacy"
    DISTRIBUTOR = "distributor"


# =============================================================================
# TAX & GST
# =============================================================================

class GSTType(str, Enum):
    """GST type for tax calculations"""
    CGST_SGST = "CGST/SGST"
    IGST = "IGST"


class TaxRates:
    """Default GST tax rates in India"""
    GST_0 = 0.0
    GST_5 = 5.0
    GST_12 = 12.0
    GST_18 = 18.0
    GST_28 = 28.0
    
    VALID_SLABS = [0, 5, 12, 18, 28]


# =============================================================================
# BUSINESS LIMITS
# =============================================================================

class BusinessLimits:
    """Business rule constants - should be configurable per org"""
    MAX_DISCOUNT_PERCENT = 50
    MIN_ORDER_AMOUNT = 100
    MAX_CREDIT_DAYS = 365
    DEFAULT_CREDIT_DAYS = 30
    DEFAULT_CREDIT_LIMIT = 0
    
    # Expiry alert thresholds (days)
    EXPIRY_CRITICAL_DAYS = 7
    EXPIRY_WARNING_DAYS = 30
    EXPIRY_ALERT_DAYS = 90
    
    # Ledger defaults
    DEFAULT_LEDGER_DAYS = 365


# =============================================================================
# API SETTINGS
# =============================================================================

class APISettings:
    """API configuration constants"""
    DEFAULT_PAGE_SIZE = 50
    MAX_PAGE_SIZE = 200
    REQUEST_TIMEOUT = 30  # seconds
    MAX_UPLOAD_SIZE = 10 * 1024 * 1024  # 10MB


# =============================================================================
# PRODUCT DEFAULTS
# =============================================================================

class ProductDefaults:
    """Default values for product creation and management"""
    HSN_PHARMA = "30049099"       # Default pharmaceutical HSN code
    HSN_GENERAL = "3004"          # General medicines HSN
    DEFAULT_GST_PERCENT = 12      # Default GST rate for pharma products
    DEFAULT_PRODUCT_TYPE = "medication"
    DEFAULT_BASE_UOM = "NOS"      # Default unit of measure (Numbers)
    DEFAULT_CESS_RATE = 0.00


# =============================================================================
# PACK CONFIGURATION DEFAULTS
# =============================================================================

class PackDefaults:
    """Default pack configuration for pharma products"""
    PACK_TYPE = "STRIP"
    PACK_SIZE = 1
    UNITS_PER_PACK = 10
    PACKAGES_PER_BOX = 1
    PACK_UOM = "Strip"
    BASE_UOM = "Unit"


# =============================================================================
# PRICING DEFAULTS
# =============================================================================

class PricingDefaults:
    """Default pricing multipliers and values.
    Change these to adjust default pricing strategy across all modules."""
    SALE_PRICE_FROM_MRP = 0.8       # sale_price = mrp * 0.8  (20% margin)
    COST_FROM_SALE_PRICE = 0.6      # cost = sale_price * 0.6  (40% margin)
    MRP_FROM_COST = 1.5             # mrp = cost * 1.5  (50% markup)
    SELLING_FROM_MRP = 0.9          # selling_price = mrp * 0.9 (10% discount)
    DEFAULT_MRP = 100               # Default MRP for new products
    DEFAULT_INITIAL_QUANTITY = 100  # Default stock quantity for new batches


# =============================================================================
# DATE & EXPIRY DEFAULTS
# =============================================================================

class DateDefaults:
    """Default date calculations.
    Change these to adjust expiry and date logic across all modules."""
    EXPIRY_DAYS_SHORT = 365         # 1 year default expiry (product creation)
    EXPIRY_DAYS_LONG = 730          # 2 year default expiry (purchase batches)
    NEAR_EXPIRY_THRESHOLD = 90      # Days threshold for near-expiry alerts


# =============================================================================
# SOURCE TYPES
# =============================================================================

class SourceType(str, Enum):
    """Batch source type - how the batch was created"""
    MANUAL = "MANUAL"
    GRN = "GRN"
    PURCHASE = "PURCHASE"


# =============================================================================
# QUALITY STATUS
# =============================================================================

class QualityStatus(str, Enum):
    """Quality control status for batches and GRN items"""
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"
    NOT_REQUIRED = "not_required"


# =============================================================================
# PARSER CONFIDENCE THRESHOLDS
# =============================================================================

class ParserConfidence:
    """Confidence thresholds for invoice parsing"""
    HIGH = 0.8      # Auto-accept threshold
    MEDIUM = 0.5    # Needs review
    LOW = 0.3       # Likely incorrect


# =============================================================================
# PAYROLL STATUSES
# =============================================================================

class PayrollRunStatus(str, Enum):
    """Payroll run status constants"""
    DRAFT = "draft"
    CALCULATED = "calculated"
    CONFIRMED = "confirmed"
    PAID = "paid"


class AttendanceStatus(str, Enum):
    """Attendance status constants"""
    PRESENT = "present"
    ABSENT = "absent"
    HALF_DAY = "half_day"
    LEAVE = "leave"
    HOLIDAY = "holiday"
    WEEK_OFF = "week_off"


class LeaveStatus(str, Enum):
    """Leave application status constants"""
    PENDING = "pending"
    APPROVED = "approved"
    REJECTED = "rejected"
    CANCELLED = "cancelled"


class LeaveType(str, Enum):
    """Standard leave types for Indian companies"""
    CL = "CL"    # Casual Leave
    SL = "SL"    # Sick Leave
    EL = "EL"    # Earned Leave / Privilege Leave
    LOP = "LOP"  # Loss of Pay


class PayrollDefaults:
    """Indian payroll statutory defaults"""
    PF_EMPLOYEE_PERCENT = 12.0       # Employee PF contribution
    PF_EMPLOYER_PERCENT = 12.0       # Employer PF contribution
    PF_CEILING_BASIC = 15000         # PF applicable on min(basic, 15000)
    ESI_EMPLOYEE_PERCENT = 0.75      # Employee ESI if gross <= 21000
    ESI_EMPLOYER_PERCENT = 3.25      # Employer ESI if gross <= 21000
    ESI_CEILING_GROSS = 21000        # ESI applicability ceiling
    # Maharashtra Professional Tax slabs
    PT_SLAB_MALE = [
        (0, 7500, 0),          # Up to 7500: Nil
        (7501, 10000, 175),    # 7501-10000: 175/month
        (10001, 999999, 200),  # Above 10000: 200/month (except Feb: 300)
    ]
    PT_SLAB_FEMALE = [
        (0, 10000, 0),         # Up to 10000: Nil
        (10001, 999999, 200),  # Above 10000: 200/month
    ]
    DEFAULT_WORKING_DAYS = 26  # Standard working days per month
