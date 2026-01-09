/**
 * Returns Module Offline Types
 * 
 * Type definitions for sales and purchase returns.
 */

// ============================================
// SALES RETURN TYPES
// ============================================

export interface SalesReturnItem {
    product_id: string;
    product_name: string;
    batch_id: string;
    batch_number: string;
    quantity: number;
    unit_price: number;
    mrp: number;
    gst_percent: number;
    discount_percent?: number;
    amount: number;
    reason?: string;
}

export interface OfflineSalesReturn {
    return_id: string;
    return_number: string;
    invoice_id?: string;
    invoice_number?: string;
    customer_id: string;
    customer_name: string;
    return_date: string;

    items: SalesReturnItem[];

    subtotal: number;
    discount_amount: number;
    tax_amount: number;
    total_amount: number;

    payment_method: 'cash' | 'upi' | 'card' | 'credit';
    payment_status: 'pending' | 'completed' | 'refunded';
    refund_amount: number;

    reason: string;
    notes?: string;
    status: 'draft' | 'pending' | 'approved' | 'rejected';

    // Sync metadata
    sync_status?: 'synced' | 'pending' | 'error';
    last_synced_at?: string;
    local_id?: string;
    created_offline?: boolean;
}

// ============================================
// PURCHASE RETURN TYPES
// ============================================

export interface PurchaseReturnItem {
    product_id: string;
    product_name: string;
    batch_id: string;
    batch_number: string;
    quantity: number;
    unit_price: number;
    gst_percent: number;
    amount: number;
    reason?: string;
}

export interface OfflinePurchaseReturn {
    return_id: string;
    return_number: string;
    purchase_id?: string;
    grn_id?: string;
    grn_number?: string;
    supplier_id: string;
    supplier_name: string;
    return_date: string;

    items: PurchaseReturnItem[];

    subtotal: number;
    tax_amount: number;
    total_amount: number;

    reason: string;
    notes?: string;
    status: 'draft' | 'pending' | 'approved' | 'rejected';

    // Sync metadata
    sync_status?: 'synced' | 'pending' | 'error';
    last_synced_at?: string;
    local_id?: string;
    created_offline?: boolean;
}

// ============================================
// SYNC STATE TYPES
// ============================================

export interface ReturnsSyncState {
    phase: 'idle' | 'syncing-sales-returns' | 'syncing-purchase-returns' | 'warming-cache' | 'complete' | 'error';
    progress: number;
    isReady: boolean;
    lastSync: string | null;
    error: string | null;
}

export const DEFAULT_RETURNS_SYNC_STATE: ReturnsSyncState = {
    phase: 'idle',
    progress: 0,
    isReady: false,
    lastSync: null,
    error: null
};
