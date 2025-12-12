/**
 * Frontend Constants
 * Synced with backend app/core/constants.py - SINGLE SOURCE OF TRUTH
 * 
 * IMPORTANT: When updating these values, ensure backend constants.py is also updated!
 */

// =============================================================================
// ORDER STATUSES
// =============================================================================

export const OrderStatus = {
    DRAFT: 'draft',
    PENDING: 'pending',
    CONFIRMED: 'confirmed',
    PROCESSING: 'processing',
    SHIPPED: 'shipped',
    DELIVERED: 'delivered',
    CANCELLED: 'cancelled',
    ON_HOLD: 'on_hold'
};

export const FulfillmentStatus = {
    UNFULFILLED: 'unfulfilled',
    PARTIAL: 'partial',
    FULFILLED: 'fulfilled',
    RETURNED: 'returned'
};

// =============================================================================
// INVOICE STATUSES
// =============================================================================

export const InvoiceStatus = {
    DRAFT: 'draft',
    PENDING: 'pending',
    PAID: 'paid',
    PARTIAL: 'partial',
    OVERDUE: 'overdue',
    CANCELLED: 'cancelled'
};

export const InvoicePaymentStatus = {
    UNPAID: 'unpaid',
    PARTIAL: 'partial',
    PAID: 'paid',
    REFUNDED: 'refunded'
};

// =============================================================================
// PAYMENT STATUSES
// =============================================================================

export const PaymentStatus = {
    PENDING: 'pending',
    COMPLETED: 'completed',
    FAILED: 'failed',
    REFUNDED: 'refunded',
    CANCELLED: 'cancelled'
};

export const PaymentRecordStatus = {
    PENDING: 'pending',
    COMPLETED: 'completed',
    CANCELLED: 'cancelled',
    BOUNCED: 'bounced'
};

// =============================================================================
// PAYMENT METHODS
// =============================================================================

export const PaymentMethod = {
    CASH: 'cash',
    CHEQUE: 'cheque',
    BANK_TRANSFER: 'bank_transfer',
    CREDIT_CARD: 'credit_card',
    UPI: 'upi',
    CREDIT: 'credit',
    NEFT: 'neft',
    RTGS: 'rtgs'
};

// =============================================================================
// PARTY TYPES
// =============================================================================

export const PartyType = {
    CUSTOMER: 'customer',
    SUPPLIER: 'supplier'
};

// =============================================================================
// RETURN STATUSES
// =============================================================================

export const ReturnStatus = {
    DRAFT: 'draft',
    PENDING: 'pending',
    APPROVED: 'approved',
    COMPLETED: 'completed',
    REJECTED: 'rejected',
    CANCELLED: 'cancelled'
};

// =============================================================================
// PURCHASE ORDER STATUSES
// =============================================================================

export const POStatus = {
    DRAFT: 'draft',
    SENT: 'sent',
    CONFIRMED: 'confirmed',
    PARTIAL: 'partial',
    RECEIVED: 'received',
    CANCELLED: 'cancelled'
};

// =============================================================================
// GRN STATUSES
// =============================================================================

export const GRNStatus = {
    DRAFT: 'draft',
    PENDING: 'pending',
    APPROVED: 'approved',
    COMPLETED: 'completed',
    REJECTED: 'rejected'
};

// =============================================================================
// STOCK MOVEMENT TYPES
// =============================================================================

export const StockMovementType = {
    PURCHASE: 'PURCHASE',
    SALE: 'SALE',
    ADJUSTMENT: 'ADJUSTMENT',
    TRANSFER: 'TRANSFER',
    RETURN_IN: 'RETURN_IN',
    RETURN_OUT: 'RETURN_OUT',
    DAMAGE: 'DAMAGE',
    EXPIRY: 'EXPIRY'
};

// =============================================================================
// INVOICE TYPES
// =============================================================================

export const InvoiceType = {
    SALES: 'SALES',
    PURCHASE: 'PURCHASE',
    CREDIT_NOTE: 'CREDIT_NOTE',
    DEBIT_NOTE: 'DEBIT_NOTE'
};

// =============================================================================
// DOCUMENT TYPES
// =============================================================================

export const DocumentType = {
    INVOICE: 'INVOICE',
    CREDIT_NOTE: 'CREDIT_NOTE',
    DEBIT_NOTE: 'DEBIT_NOTE',
    PAYMENT_RECEIPT: 'PAYMENT_RECEIPT',
    PAYMENT_VOUCHER: 'PAYMENT_VOUCHER',
    PURCHASE_ORDER: 'PURCHASE_ORDER',
    GRN: 'GRN',
    SALES_ORDER: 'SALES_ORDER',
    DELIVERY_CHALLAN: 'DELIVERY_CHALLAN',
    QUOTATION: 'QUOTATION'
};

// =============================================================================
// PRIORITY LEVELS
// =============================================================================

export const PriorityLevel = {
    LOW: 'low',
    MEDIUM: 'medium',
    HIGH: 'high',
    URGENT: 'urgent'
};

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Get all values of a constant object as an array
 */
export const getValues = (constantObj) => Object.values(constantObj);

/**
 * Get dropdown options from a constant object
 */
export const getOptions = (constantObj) =>
    Object.entries(constantObj).map(([key, value]) => ({
        label: key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
        value
    }));

/**
 * Check if a value exists in a constant object
 */
export const isValidValue = (constantObj, value) =>
    Object.values(constantObj).includes(value);

// Default export for convenience
export default {
    OrderStatus,
    FulfillmentStatus,
    InvoiceStatus,
    InvoicePaymentStatus,
    PaymentStatus,
    PaymentRecordStatus,
    PaymentMethod,
    PartyType,
    ReturnStatus,
    POStatus,
    GRNStatus,
    StockMovementType,
    InvoiceType,
    DocumentType,
    PriorityLevel
};
