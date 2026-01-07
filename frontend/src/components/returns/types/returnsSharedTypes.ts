/**
 * Returns Module - Shared Type Definitions
 * 
 * Common types for sales returns, purchase returns, and refunds.
 */

// ==================== RETURN TYPES ====================

/** Type of return */
export type ReturnType = 'sales_return' | 'purchase_return';

/** Return status */
export type ReturnStatus =
    | 'draft'
    | 'pending'
    | 'approved'
    | 'completed'
    | 'cancelled'
    | 'rejected';

/** Refund method */
export type RefundMethod =
    | 'credit_note'
    | 'debit_note'
    | 'cash_refund'
    | 'bank_refund'
    | 'original_payment';

/** Return reason */
export type ReturnReason =
    | 'damaged'
    | 'expired'
    | 'wrong_product'
    | 'wrong_quantity'
    | 'quality_issue'
    | 'pricing_error'
    | 'customer_request'
    | 'other';

// ==================== BASE RETURN ITEM ====================

/** Base return item fields */
export interface BaseReturnItem {
    product_id: number;
    product_name: string;
    product_code?: string;
    batch_id?: number;
    batch_number?: string;

    // Quantities
    original_quantity: number;
    return_quantity: number;

    // Pricing
    unit_price: number;
    discount_amount?: number;
    discount_percent?: number;

    // Tax
    tax_percent?: number;
    cgst_rate?: number;
    sgst_rate?: number;
    igst_rate?: number;

    // Selection state
    selected?: boolean;

    // Calculated values
    taxable_amount?: number;
    tax_amount?: number;
    total_amount?: number;

    // Reason
    return_reason?: ReturnReason | string;
    notes?: string;
}

// ==================== RETURN CALCULATIONS ====================

/** Return calculation result */
export interface ReturnCalculation {
    subtotal: number;
    totalTax: number;
    total: number;
    itemCount: number;
    totalQuantity: number;
    breakdown: {
        cgst: number;
        sgst: number;
        igst: number;
    };
}

/** Refund breakdown */
export interface RefundBreakdown {
    creditAmount: number;
    cashRefund: number;
    bankRefund: number;
}

// ==================== RETURN DOCUMENT ====================

/** Base return document */
export interface BaseReturn {
    return_id?: number;
    return_number?: string;
    return_type: ReturnType;
    return_date: string;
    status: ReturnStatus;

    // Party info
    customer_id?: number;
    customer_name?: string;
    supplier_id?: number;
    supplier_name?: string;

    // Reference
    original_invoice_id?: number;
    original_invoice_number?: string;

    // Items
    items: BaseReturnItem[];

    // Totals
    subtotal: number;
    tax_amount: number;
    total_amount: number;

    // Refund
    refund_method: RefundMethod;
    refund_amount: number;

    // Notes
    reason?: ReturnReason | string;
    notes?: string;

    // Metadata
    created_by?: string;
    created_at?: string;
    updated_at?: string;
}

// ==================== CONSTANTS ====================

export const RETURN_STATUS = {
    DRAFT: 'draft' as ReturnStatus,
    PENDING: 'pending' as ReturnStatus,
    APPROVED: 'approved' as ReturnStatus,
    COMPLETED: 'completed' as ReturnStatus,
    CANCELLED: 'cancelled' as ReturnStatus,
    REJECTED: 'rejected' as ReturnStatus
} as const;

export const REFUND_METHODS = {
    CREDIT_NOTE: 'credit_note' as RefundMethod,
    DEBIT_NOTE: 'debit_note' as RefundMethod,
    CASH_REFUND: 'cash_refund' as RefundMethod,
    BANK_REFUND: 'bank_refund' as RefundMethod,
    ORIGINAL_PAYMENT: 'original_payment' as RefundMethod
} as const;

export const RETURN_REASONS = {
    DAMAGED: 'damaged' as ReturnReason,
    EXPIRED: 'expired' as ReturnReason,
    WRONG_PRODUCT: 'wrong_product' as ReturnReason,
    WRONG_QUANTITY: 'wrong_quantity' as ReturnReason,
    QUALITY_ISSUE: 'quality_issue' as ReturnReason,
    PRICING_ERROR: 'pricing_error' as ReturnReason,
    CUSTOMER_REQUEST: 'customer_request' as ReturnReason,
    OTHER: 'other' as ReturnReason
} as const;
