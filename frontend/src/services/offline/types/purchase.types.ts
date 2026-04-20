/**
 * Purchase Module Offline Types
 * 
 * Type definitions for purchase offline storage.
 * Mirrors sales.types.ts architecture.
 */

// ============================================
// SUPPLIER TYPES
// ============================================

export interface OfflineSupplier {
    id?: string;
    temp_id?: string;
    supplier_id: string;
    supplier_code?: string;
    supplier_name: string;
    contact_person?: string;
    primary_phone?: string;
    primary_email?: string;
    gst_number?: string;
    pan_number?: string;
    business_type?: string;
    billing_address?: {
        street?: string;
        city?: string;
        state?: string;
        pincode?: string;
    };
    credit_limit?: number;
    credit_days?: number;
    is_active: boolean;

    // Search optimization fields (pre-computed)
    _search_name?: string;
    _search_phone?: string;

    // Sync metadata
    sync_status?: 'synced' | 'pending' | 'error';
    last_synced_at?: string;
    // Legacy alias kept for older IndexedDB records only. New writes use temp_id.
    local_id?: string;
}

// ============================================
// PURCHASE ORDER TYPES
// ============================================

export interface PurchaseOrderItem {
    product_id: string;
    product_name: string;
    product_code?: string;
    quantity: number;
    unit_price: number;
    gst_percent: number;
    discount_percent?: number;
    amount: number;
}

export interface OfflinePurchaseOrder {
    temp_id?: string;
    purchase_order_id: string;
    po_number: string;
    supplier_id: string;
    supplier_name: string;
    order_date: string;
    expected_date?: string;
    status: 'draft' | 'pending' | 'approved' | 'received' | 'cancelled';
    items: PurchaseOrderItem[];
    subtotal: number;
    discount_amount: number;
    tax_amount: number;
    total_amount: number;
    notes?: string;

    // Sync metadata
    sync_status?: 'synced' | 'pending' | 'error';
    last_synced_at?: string;
    // Legacy alias kept for older IndexedDB records only. New writes use temp_id.
    local_id?: string;
    created_offline?: boolean;
}

// ============================================
// GRN (GOODS RECEIVED NOTE) TYPES
// ============================================

export interface GRNItem {
    product_id: string;
    product_name: string;
    batch_number: string;
    expiry_date: string;
    mfg_date?: string;
    ordered_qty: number;
    received_qty: number;
    free_qty?: number;
    mrp: number;
    purchase_rate: number;
    sale_rate: number;
    gst_percent: number;
    amount: number;
}

export interface OfflineGRN {
    temp_id?: string;
    grn_id: string;
    grn_number: string;
    purchase_order_id?: string;
    supplier_id: string;
    supplier_name: string;
    grn_date: string;
    invoice_number?: string;
    invoice_date?: string;
    status: 'draft' | 'pending' | 'verified' | 'posted';
    items: GRNItem[];
    subtotal: number;
    discount_amount: number;
    tax_amount: number;
    total_amount: number;
    notes?: string;

    // Sync metadata
    sync_status?: 'synced' | 'pending' | 'error';
    last_synced_at?: string;
    // Legacy alias kept for older IndexedDB records only. New writes use temp_id.
    local_id?: string;
    created_offline?: boolean;
}

// ============================================
// PURCHASE ENTRY (DIRECT PURCHASE) TYPES
// ============================================

export interface OfflinePurchaseEntry {
    temp_id?: string;
    purchase_id: string;
    purchase_number: string;
    supplier_id: string;
    supplier_name: string;
    purchase_date: string;
    invoice_number?: string;
    invoice_date?: string;
    items: GRNItem[];
    subtotal: number;
    discount_amount: number;
    tax_amount: number;
    total_amount: number;
    payment_status: 'unpaid' | 'partial' | 'paid';
    paid_amount: number;
    notes?: string;

    // Sync metadata
    sync_status?: 'synced' | 'pending' | 'error';
    last_synced_at?: string;
    // Legacy alias kept for older IndexedDB records only. New writes use temp_id.
    local_id?: string;
    created_offline?: boolean;
}

// ============================================
// SYNC STATE TYPES
// ============================================

export interface PurchaseSyncState {
    phase: 'idle' | 'syncing-suppliers' | 'syncing-orders' | 'warming-cache' | 'complete' | 'error';
    progress: number;
    isReady: boolean;
    lastSync: string | null;
    error: string | null;
}

// Default state
export const DEFAULT_PURCHASE_SYNC_STATE: PurchaseSyncState = {
    phase: 'idle',
    progress: 0,
    isReady: false,
    lastSync: null,
    error: null
};
