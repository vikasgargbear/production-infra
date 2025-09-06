"""
Application-wide constants and enums
Never hardcode these values directly in code
"""

from enum import Enum


class OrderStatus(str, Enum):
    """Order status constants"""
    PENDING = "pending"
    CONFIRMED = "confirmed"
    PROCESSING = "processing"
    COMPLETED = "completed"
    CANCELLED = "cancelled"


class PaymentStatus(str, Enum):
    """Payment status constants"""
    PAID = "paid"
    PARTIAL = "partial"
    PENDING = "pending"


class PaymentMethod(str, Enum):
    """Valid payment methods"""
    CASH = "cash"
    CARD = "card"
    UPI = "upi"
    BANK = "bank"
    CHECK = "check"


class InvoiceType(str, Enum):
    """Invoice type constants"""
    REGULAR = "regular"
    PROFORMA = "proforma"
    TAX = "tax"


class CreditNoteReason(str, Enum):
    """Credit note reason codes"""
    EXPIRED_GOODS = "EXPIRED_GOODS"
    DAMAGED_GOODS = "DAMAGED_GOODS"
    WRONG_BILLING = "WRONG_BILLING"
    QUALITY_ISSUE = "QUALITY_ISSUE"
    OVERCHARGE = "OVERCHARGE"
    OTHER = "OTHER"


class TaxRates:
    """Default tax rates - should come from DB in production"""
    GST_5 = 5.0
    GST_12 = 12.0
    GST_18 = 18.0
    GST_28 = 28.0


class BusinessLimits:
    """Business rule constants - should be configurable"""
    MAX_DISCOUNT_PERCENT = 50
    MIN_ORDER_AMOUNT = 100
    MAX_CREDIT_DAYS = 90
    DEFAULT_CREDIT_DAYS = 30


class APISettings:
    """API configuration constants"""
    DEFAULT_PAGE_SIZE = 50
    MAX_PAGE_SIZE = 200
    REQUEST_TIMEOUT = 30  # seconds
    MAX_UPLOAD_SIZE = 10 * 1024 * 1024  # 10MB