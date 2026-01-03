/**
 * Purchase Module - Shared Type Definitions
 * 
 * Common types for purchase orders, GRN, and supplier invoices.
 */

// ==================== PURCHASE TYPES ====================

/** Purchase document type */
export type PurchaseDocumentType =
    | 'purchase_order'
    | 'grn'
    | 'supplier_invoice'
    | 'purchase_return';

/** Purchase status */
export type PurchaseStatus =
    | 'draft'
    | 'pending'
    | 'approved'
    | 'ordered'
    | 'partial_received'
    | 'received'
    | 'completed'
    | 'cancelled';

/** GRN status */
export type GRNStatus =
    | 'draft'
    | 'pending_verification'
    | 'verified'
    | 'completed'
    | 'rejected';

/** Payment status */
export type PaymentStatus =
    | 'pending'
    | 'partial'
    | 'paid'
    | 'overdue';

// ==================== BASE PURCHASE ITEM ====================

/** Base purchase item fields */
export interface BasePurchaseItem {
    product_id: number;
    product_name: string;
    product_code?: string;
    generic_name?: string;

    // Batch info
    batch_id?: number;
    batch_number?: string;
    expiry_date?: string;
    manufacturing_date?: string;

    // Quantities
    ordered_quantity?: number;
    received_quantity?: number;
    pending_quantity?: number;
    quantity: number;
    free_quantity?: number;

    // Pack configuration
    pack_size?: number;
    pack_type?: string;
    units_per_pack?: number;

    // Pricing
    mrp: number;
    purchase_rate: number;
    rate?: number;
    discount_percent?: number;
    discount_amount?: number;

    // Tax
    gst_percent?: number;
    cgst_rate?: number;
    sgst_rate?: number;
    igst_rate?: number;
    hsn_code?: string;

    // Calculated
    taxable_amount?: number;
    tax_amount?: number;
    total_amount?: number;

    // Metadata
    notes?: string;
    is_verified?: boolean;
}

// ==================== SUPPLIER ====================

/** Base supplier */
export interface BaseSupplier {
    supplier_id: number;
    supplier_name: string;
    supplier_code?: string;
    contact_person?: string;
    phone?: string;
    email?: string;
    gstin?: string;
    pan?: string;
    address?: string;
    city?: string;
    state?: string;
    pincode?: string;
    credit_days?: number;
    credit_limit?: number;
    balance?: number;
    is_active?: boolean;
}

// ==================== PURCHASE DOCUMENT ====================

/** Base purchase document */
export interface BasePurchaseDocument {
    document_id?: number;
    document_number?: string;
    document_type: PurchaseDocumentType;
    document_date: string;
    status: PurchaseStatus;

    // Supplier
    supplier_id: number;
    supplier_name?: string;
    supplier?: BaseSupplier;

    // Reference
    reference_number?: string;
    po_number?: string;
    invoice_number?: string;

    // Items
    items: BasePurchaseItem[];

    // Totals
    subtotal: number;
    discount_amount?: number;
    tax_amount: number;
    total_amount: number;

    // Payment
    payment_status?: PaymentStatus;
    paid_amount?: number;
    balance_amount?: number;
    due_date?: string;

    // Notes
    notes?: string;
    terms?: string;

    // Metadata
    created_by?: string;
    created_at?: string;
    updated_at?: string;
}

// ==================== CONSTANTS ====================

export const PURCHASE_STATUS = {
    DRAFT: 'draft' as PurchaseStatus,
    PENDING: 'pending' as PurchaseStatus,
    APPROVED: 'approved' as PurchaseStatus,
    ORDERED: 'ordered' as PurchaseStatus,
    PARTIAL_RECEIVED: 'partial_received' as PurchaseStatus,
    RECEIVED: 'received' as PurchaseStatus,
    COMPLETED: 'completed' as PurchaseStatus,
    CANCELLED: 'cancelled' as PurchaseStatus
} as const;

export const GRN_STATUS = {
    DRAFT: 'draft' as GRNStatus,
    PENDING_VERIFICATION: 'pending_verification' as GRNStatus,
    VERIFIED: 'verified' as GRNStatus,
    COMPLETED: 'completed' as GRNStatus,
    REJECTED: 'rejected' as GRNStatus
} as const;

export const PAYMENT_STATUS = {
    PENDING: 'pending' as PaymentStatus,
    PARTIAL: 'partial' as PaymentStatus,
    PAID: 'paid' as PaymentStatus,
    OVERDUE: 'overdue' as PaymentStatus
} as const;
