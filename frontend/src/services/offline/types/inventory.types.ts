/**
 * Inventory Module Offline Types
 * 
 * Type definitions for inventory offline storage.
 * Covers stock movements, adjustments, transfers, and batch tracking.
 */

// ============================================
// BATCH TYPES
// ============================================

export interface OfflineBatch {
    batch_id: string;
    batch_number: string;
    product_id: string;
    product_name: string;
    product_code?: string;

    // Quantities
    quantity: number;
    usable_quantity: number;
    blocked_quantity: number;
    free_quantity?: number;

    // Pricing
    mrp: number;
    purchase_rate: number;
    sale_rate: number;

    // Dates
    mfg_date?: string;
    expiry_date: string;

    // Location
    warehouse_id?: string;
    location?: string;

    // Status
    status: 'active' | 'expired' | 'blocked' | 'depleted';
    is_active: boolean;

    // Search optimization
    _search_batch?: string;
    _search_product?: string;

    // Sync metadata
    sync_status?: 'synced' | 'pending' | 'error';
    last_synced_at?: string;
    local_id?: string;
}

// ============================================
// STOCK MOVEMENT TYPES
// ============================================

export interface StockMovementItem {
    product_id: string;
    product_name: string;
    batch_id: string;
    batch_number: string;
    quantity: number;
    movement_type: 'in' | 'out' | 'adjustment' | 'transfer';
    reason?: string;
}

export interface OfflineStockMovement {
    movement_id: string;
    movement_number: string;
    movement_date: string;
    movement_type: 'in' | 'out' | 'adjustment' | 'transfer';

    // Reference documents
    reference_type?: 'grn' | 'invoice' | 'adjustment' | 'transfer';
    reference_id?: string;
    reference_number?: string;

    // Items
    items: StockMovementItem[];

    // Location
    from_warehouse_id?: string;
    to_warehouse_id?: string;

    // Details
    reason?: string;
    notes?: string;
    created_by?: string;

    // Sync metadata
    sync_status?: 'synced' | 'pending' | 'error';
    last_synced_at?: string;
    local_id?: string;
    created_offline?: boolean;
}

// ============================================
// STOCK ADJUSTMENT TYPES
// ============================================

export interface AdjustmentItem {
    product_id: string;
    product_name: string;
    batch_id: string;
    batch_number: string;
    current_qty: number;
    adjusted_qty: number;
    difference: number;
    reason: string;
}

export interface OfflineStockAdjustment {
    temp_id?: string;
    adjustment_id: string;
    adjustment_number: string;
    adjustment_date: string;
    adjustment_type: 'increase' | 'decrease' | 'correction';

    items: AdjustmentItem[];

    reason: string;
    notes?: string;
    approved_by?: string;
    status: 'draft' | 'pending' | 'approved' | 'rejected';

    // Sync metadata
    sync_status?: 'synced' | 'pending' | 'error';
    last_synced_at?: string;
    // Legacy alias kept for older IndexedDB records only. New writes use temp_id.
    local_id?: string;
    created_offline?: boolean;
}

// ============================================
// STOCK TRANSFER TYPES
// ============================================

export interface TransferItem {
    product_id: string;
    product_name: string;
    batch_id: string;
    batch_number: string;
    quantity: number;
    unit_price?: number;
}

export interface OfflineStockTransfer {
    temp_id?: string;
    transfer_id: string;
    transfer_number: string;
    transfer_date: string;

    from_warehouse_id: string;
    from_warehouse_name: string;
    to_warehouse_id: string;
    to_warehouse_name: string;

    items: TransferItem[];

    status: 'draft' | 'pending' | 'in_transit' | 'received' | 'cancelled';
    notes?: string;

    // Tracking
    shipped_date?: string;
    received_date?: string;
    created_by?: string;
    received_by?: string;

    // Sync metadata
    sync_status?: 'synced' | 'pending' | 'error';
    last_synced_at?: string;
    // Legacy alias kept for older IndexedDB records only. New writes use temp_id.
    local_id?: string;
    created_offline?: boolean;
}

// ============================================
// CURRENT STOCK TYPES
// ============================================

export interface CurrentStockItem {
    product_id: string;
    product_name: string;
    product_code?: string;
    total_quantity: number;
    usable_quantity: number;
    blocked_quantity: number;
    batch_count: number;
    min_stock_level?: number;
    max_stock_level?: number;
    reorder_level?: number;

    // Aggregated pricing
    avg_mrp: number;
    avg_purchase_rate: number;
    avg_sale_rate: number;

    // Status flags
    is_low_stock: boolean;
    has_expired_batches: boolean;
    has_near_expiry: boolean;

    last_updated: string;
}

// ============================================
// SYNC STATE TYPES
// ============================================

export interface InventorySyncState {
    phase: 'idle' | 'syncing-batches' | 'syncing-movements' | 'warming-cache' | 'complete' | 'error';
    progress: number;
    isReady: boolean;
    lastSync: string | null;
    error: string | null;
}

// Default state
export const DEFAULT_INVENTORY_SYNC_STATE: InventorySyncState = {
    phase: 'idle',
    progress: 0,
    isReady: false,
    lastSync: null,
    error: null
};
