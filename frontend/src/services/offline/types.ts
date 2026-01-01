
export interface SyncStatusEnum {
    PENDING: 'pending';
    SYNCING: 'syncing';
    SYNCED: 'synced';
    CONFLICT: 'conflict';
    FAILED: 'failed';
}

export const SYNC_STATUS: SyncStatusEnum = {
    PENDING: 'pending',
    SYNCING: 'syncing',
    SYNCED: 'synced',
    CONFLICT: 'conflict',
    FAILED: 'failed'
};

export interface SyncQueueItem {
    id?: number;
    entity_type: string;
    entity_id: string | number;
    action: 'create' | 'update' | 'delete';
    data: any;
    created_at: string;
    attempts: number;
    sync_status?: string;
    conflict_reason?: any;
    conflict_at?: string;
    retry_count?: number;
    last_retry_at?: string;
}

export interface OfflineBatch {
    batch_id: string;
    product_id: string | number;
    batch_number: string;
    expiry_date: string;
    quantity_available: number;
    quantity_reserved_offline: number;
    updated_at: string;
    [key: string]: any;
}

export interface BatchReservationResult {
    success: boolean;
    error?: string;
    availableQuantity?: number;
    reservedQuantity?: number;
    newReserved?: number;
}

export interface SyncStats {
    pending: number;
    syncing: number;
    synced: number;
    failed: number;
    conflicts: number;
    lastSync?: string;

}

export interface OfflineProduct {
    id: string | number;
    product_id: string | number;
    name: string;
    product_name: string;
    code?: string;
    product_code?: string;
    description?: string;
    category?: string;
    brand?: string;
    unit?: string;
    mrp: number;
    sale_price: number;
    selling_price: number;
    purchase_price?: number;
    gst_percent: number;
    min_stock_level?: number;
    shelf_label?: string;
    current_stock?: number;
    hsn_code?: string;
    // Search fields
    _search_name: string;
    _search_code: string;
    _search_hsn: string;
    // Metadata
    sync_status?: string;
    created_at?: string;
    updated_at?: string;
    _localId?: string;
    [key: string]: any;
}

export interface OfflineCustomer {
    id: string | number;
    customer_id: string | number;
    name: string;
    customer_name: string;
    phone: string;
    phone_number?: string;
    email?: string;
    address?: string;
    city?: string;
    state?: string;
    pincode?: string;
    gst_number?: string;
    gstin?: string;
    customer_type?: string;
    credit_limit?: number;
    current_balance?: number;
    // Search fields
    _search_name: string;
    _search_phone: string;
    _search_gst: string;
    // Metadata
    sync_status?: string;
    created_at?: string;
    updated_at?: string;
    _localId?: string;
    [key: string]: any;
}

