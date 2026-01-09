/**
 * Offline Types - Sales Module
 * 
 * Type definitions for sales module offline functionality
 */

// ==================== STOCK TYPES ====================

export interface BatchStock {
    batchId: string;
    batchNumber: string;
    available: number;
    reserved: number;
    usable: number;
    expiryDate?: string;
    manufacturingDate?: string;
    mrpPerUnit?: number;
    salePrice?: number;
}

export interface ProductStock {
    productId: string;
    productName: string;
    totalAvailable: number;
    totalReserved: number;
    totalUsable: number;
    batches: BatchStock[];
}

export interface StockReserveResult {
    success: boolean;
    error?: string;
    remaining?: number;
    batchId?: string;
}

export interface StockDeduction {
    productId: string;
    batchId: string;
    quantity: number;
}

// ==================== CUSTOMER TYPES ====================

export interface OfflineCustomer {
    id: string;
    customer_id: string;
    customer_name: string;
    customer_code?: string;
    primary_phone?: string;
    primary_email?: string;
    gst_number?: string;
    customer_type: 'regular' | 'b2b' | 'b2c' | 'wholesale';
    billing_address?: {
        street?: string;
        city?: string;
        state?: string;
        pincode?: string;
    };
    is_active: boolean;
    sync_status?: 'pending' | 'synced' | 'failed';
    created_offline?: boolean;

    // Search index fields (lowercase for fast matching)
    _search_name?: string;
    _search_phone?: string;
    _search_gst?: string;
}

// ==================== PRODUCT TYPES ====================

export interface OfflineBatch {
    batch_id: string;
    product_id: string;
    batch_number: string;
    expiry_date?: string;
    manufacturing_date?: string;
    quantity_available: number;
    quantity_reserved: number;
    quantity_reserved_offline: number;
    mrp_per_unit: number;
    sale_price_per_unit: number;
    cost_per_unit: number;
    is_active: boolean;
}

export interface OfflineProduct {
    id: string;
    product_id: string;
    product_name: string;
    product_code?: string;
    hsn_code?: string;
    category?: string;
    manufacturer?: string;
    gst_percent: number;
    mrp_per_unit?: number;
    sale_price_per_unit?: number;
    batches: OfflineBatch[];
    is_active: boolean;
    sync_status?: 'pending' | 'synced' | 'failed';

    // Search index fields (lowercase for fast matching)
    _search_name?: string;
    _search_code?: string;
    _search_hsn?: string;
    _search_manufacturer?: string;
    _search_generic?: string;
}

// ==================== INVOICE TYPES ====================

export interface OfflineInvoiceItem {
    product_id: string;
    product_name: string;
    batch_id: string;
    batch_number: string;
    quantity: number;
    unit_price: number;
    discount_percent?: number;
    discount_amount?: number;
    gst_percent: number;
    cgst_amount: number;
    sgst_amount: number;
    igst_amount: number;
    line_total: number;
}

export interface OfflineInvoice {
    temp_id: string;
    invoice_id?: string;
    invoice_number: string;
    invoice_date: string;
    customer_id: string;
    customer_name: string;
    items: OfflineInvoiceItem[];
    subtotal_amount: number;
    discount_amount: number;
    taxable_amount: number;
    cgst_amount: number;
    sgst_amount: number;
    igst_amount: number;
    total_tax_amount: number;
    freight_charges?: number;
    final_amount: number;
    round_off_amount?: number;
    invoice_status: 'draft' | 'posted';
    payment_status: 'pending' | 'partial' | 'paid';
    sync_status: 'pending' | 'synced' | 'failed' | 'conflict';
    created_offline: boolean;
    reserved_batches?: StockDeduction[];
    created_at: string;
    updated_at: string;
}

// ==================== SYNC TYPES ====================

export interface SalesSyncState {
    isReady: boolean;
    phase: 'idle' | 'initial' | 'delta' | 'push' | 'complete';
    progress: number;
    lastSync: Date | null;
    pendingCount: number;
    error?: string;
}

export interface SyncEventPayload {
    type: 'sync_started' | 'sync_progress' | 'sync_complete' | 'sync_error' | 'data_updated';
    entity?: 'products' | 'customers' | 'invoices';
    progress?: number;
    error?: string;
}

// ==================== SERVICE INTERFACES ====================

export interface ISalesStockService {
    getUsableStock(product: OfflineProduct): number;
    getBatchDetails(product: OfflineProduct, batchId: string): BatchStock | null;
    reserve(productId: string, batchId: string, quantity: number): Promise<StockReserveResult>;
    deduct(productId: string, batchId: string, quantity: number): Promise<void>;
    release(productId: string, batchId: string, quantity: number): Promise<void>;
    releaseAll(deductions: StockDeduction[]): Promise<void>;
}

export interface ISalesDataService {
    // Products
    getProduct(productId: string): Promise<OfflineProduct | null>;
    searchProducts(query: string, options?: { limit?: number }): Promise<OfflineProduct[]>;
    getProductsWithStock(): Promise<ProductStock[]>;

    // Customers
    getCustomer(customerId: string): Promise<OfflineCustomer | null>;
    searchCustomers(query: string, options?: { limit?: number }): Promise<OfflineCustomer[]>;
    saveCustomer(customer: Partial<OfflineCustomer>): Promise<string>;

    // Invoices
    getInvoice(invoiceId: string): Promise<OfflineInvoice | null>;
    saveInvoice(invoice: OfflineInvoice): Promise<string>;
    getPendingInvoices(): Promise<OfflineInvoice[]>;
}

export interface ISalesSyncService {
    isReady(): boolean;
    getState(): SalesSyncState;
    performInitialSync(): Promise<void>;
    performDeltaSync(): Promise<void>;
    subscribe(callback: (state: SalesSyncState) => void): () => void;
}
