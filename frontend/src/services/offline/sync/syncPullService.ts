/**
 * Sync Pull Service
 * 
 * Handles all data PULL operations from server to IndexedDB.
 * This is the ONLY file responsible for downloading data from server.
 * 
 * Responsibilities:
 * - Sync products with embedded batches
 * - Sync customers
 * - Full data sync on login
 * - Delta sync for incremental updates
 * 
 * Data Model:
 * - Products are stored WITH embedded batches array
 * - No separate batches store (batches live inside products)
 * - Reservation tracking done on product.batches[].quantity_reserved_offline
 */

import offlineDB from '../core/offlineDatabase';
import { productAPI, customersApi } from '../../api';

// ==================== TYPE DEFINITIONS ====================

export interface SyncProgress {
    page: number;
    totalPages: number;
    itemsSynced: number;
    type: 'products' | 'customers';
}

export interface SyncResult {
    success: boolean;
    itemsSynced: number;
    error?: string;
}

export interface SyncStatus {
    lastSyncTime: number | null;
    isOnline: boolean;
    productCount: number;
    customerCount: number;
}

// ==================== CONSTANTS ====================

const SYNC_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const LAST_SYNC_KEY = 'syncPull_lastSyncTime';

// ==================== SERVICE CLASS ====================

class SyncPullService {
    private syncing: boolean = false;
    private lastSyncTime: number | null = null;
    private syncListeners: Set<(event: any) => void> = new Set();

    constructor() {
        // Load last sync time from localStorage
        const stored = localStorage.getItem(LAST_SYNC_KEY);
        if (stored) {
            this.lastSyncTime = parseInt(stored, 10);
        }
    }

    // ==================== SYNC STATUS ====================

    /**
     * Check if sync is currently in progress
     */
    isSyncing(): boolean {
        return this.syncing;
    }

    /**
     * Get last sync timestamp
     */
    getLastSyncTime(): number | null {
        return this.lastSyncTime;
    }

    /**
     * Check if data is stale (older than 5 minutes)
     */
    needsSync(): boolean {
        if (!this.lastSyncTime) return true;
        return Date.now() - this.lastSyncTime > SYNC_INTERVAL_MS;
    }

    /**
     * Check if user is authenticated (has token)
     * Note: AuthContext stores token as 'authToken'
     */
    private isAuthenticated(): boolean {
        return !!localStorage.getItem('authToken');
    }

    // ==================== PRODUCT SYNC ====================

    /**
     * Sync ALL products with embedded batches from server.
     * 
     * Features:
     * - Paginated to handle large catalogs
     * - Delta sync support (only fetch changes since last sync)
     * - Products include embedded batches[] array
     * - Preserves existing reservation data on batches
     * 
     * @param options - fullSync, pageSize, onProgress
     * @returns SyncResult
     */
    async syncProducts(options: {
        fullSync?: boolean;
        pageSize?: number;
        onProgress?: (progress: SyncProgress) => void;
    } = {}): Promise<SyncResult> {
        const { fullSync = false, pageSize = 100, onProgress } = options;

        // Pre-checks
        if (!this.isAuthenticated()) {
            console.log('[SyncPull] No auth token, skipping product sync');
            return { success: false, itemsSynced: 0, error: 'Not authenticated' };
        }

        if (this.syncing) {
            console.log('[SyncPull] Sync already in progress');
            return { success: false, itemsSynced: 0, error: 'Sync in progress' };
        }

        this.syncing = true;
        this.notifyListeners({ status: 'syncing', type: 'products' });

        try {
            console.log(`[SyncPull] Starting product sync (fullSync: ${fullSync})...`);

            // Determine since parameter for delta sync
            let since: string | undefined;
            if (!fullSync && this.lastSyncTime) {
                since = new Date(this.lastSyncTime).toISOString();
                console.log(`[SyncPull] Delta sync since: ${since}`);
            }

            let page = 1;
            let hasMore = true;
            let totalSynced = 0;
            let totalPages = 1;

            while (hasMore) {
                console.log(`[SyncPull] Fetching products page ${page}...`);

                const response = await productAPI.getAllWithBatches({
                    page,
                    pageSize,
                    since
                });

                const { products, total_pages, has_more } = response.data;
                totalPages = total_pages || 1;

                if (products && products.length > 0) {
                    // Transform products for IndexedDB storage
                    const transformedProducts = products.map((product: any) => this.transformProduct(product));

                    // Preserve existing reservation data
                    await this.mergeWithExistingReservations(transformedProducts);

                    // Store in IndexedDB
                    await offlineDB.bulkLoad('products', transformedProducts);
                    totalSynced += products.length;

                    console.log(`[SyncPull] Synced ${products.length} products (page ${page}/${totalPages})`);
                }

                // Progress callback
                if (onProgress) {
                    onProgress({
                        page,
                        totalPages,
                        itemsSynced: totalSynced,
                        type: 'products'
                    });
                }

                hasMore = has_more || false;
                page++;

                // Safety limit
                if (page > 100) {
                    console.warn('[SyncPull] Hit page limit, stopping');
                    break;
                }
            }

            // Update last sync time
            this.lastSyncTime = Date.now();
            localStorage.setItem(LAST_SYNC_KEY, String(this.lastSyncTime));

            this.notifyListeners({ status: 'synced', type: 'products', count: totalSynced });
            console.log(`[SyncPull] ✅ Product sync complete: ${totalSynced} products`);

            return { success: true, itemsSynced: totalSynced };

        } catch (error: any) {
            console.error('[SyncPull] Product sync failed:', error);
            this.notifyListeners({ status: 'error', type: 'products', error });
            return { success: false, itemsSynced: 0, error: error.message };
        } finally {
            this.syncing = false;
        }
    }

    /**
     * Transform product from API format to IndexedDB format
     */
    private transformProduct(product: any): any {
        const productId = String(product.product_id || product.id);

        // Transform embedded batches
        const batches = (product.batches || []).map((batch: any) => ({
            batch_id: String(batch.batch_id),
            batch_number: batch.batch_number || '',
            expiry_date: batch.expiry_date,
            quantity_available: batch.quantity_available || 0,
            quantity_reserved_offline: 0, // Will be merged with existing
            mrp_per_unit: batch.mrp_per_unit || 0,
            sale_price_per_unit: batch.sale_price_per_unit || 0,
            units_per_pack: batch.units_per_pack || 1,
        }));

        return {
            id: productId,
            product_id: productId,
            product_name: product.product_name || product.name || '',
            product_code: product.product_code || product.code || '',
            hsn_code: product.hsn_code || '',
            category: product.category_name || product.category || '',
            manufacturer: product.manufacturer_name || product.manufacturer || '',
            generic_name: product.generic_name || '',
            gst_percent: product.gst_percent || 0,
            total_stock: product.total_stock ?? product.current_stock ?? 0,
            mrp_per_unit: product.mrp_per_unit || product.mrp || 0,
            sale_price_per_unit: product.sale_price_per_unit || product.sale_price || 0,
            batches,
            best_batch: product.best_batch || batches[0] || null,
            // Search fields (lowercase for fast matching)
            _search_name: (product.product_name || product.name || '').toLowerCase(),
            _search_code: (product.product_code || product.code || '').toLowerCase(),
            _search_hsn: (product.hsn_code || '').toLowerCase(),
            _search_generic: (product.generic_name || '').toLowerCase(),
            _search_manufacturer: (product.manufacturer_name || product.manufacturer || '').toLowerCase(),
            // Metadata
            updated_at: new Date().toISOString()
        };
    }

    /**
     * Merge new products with existing reservation data
     * This preserves quantity_reserved_offline on batches
     */
    private async mergeWithExistingReservations(products: any[]): Promise<void> {
        for (const product of products) {
            try {
                const existing = await offlineDB.get('products', product.id);
                if (existing && existing.batches) {
                    // Build map of existing reservations
                    const reservationMap = new Map<string, number>();
                    for (const batch of existing.batches) {
                        if (batch.quantity_reserved_offline > 0) {
                            reservationMap.set(String(batch.batch_id), batch.quantity_reserved_offline);
                        }
                    }

                    // Apply to new batches
                    if (product.batches && reservationMap.size > 0) {
                        for (const batch of product.batches) {
                            const reserved = reservationMap.get(String(batch.batch_id));
                            if (reserved) {
                                batch.quantity_reserved_offline = reserved;
                            }
                        }
                    }
                }
            } catch (e) {
                // Product doesn't exist yet, that's fine
            }
        }
    }

    // ==================== CUSTOMER SYNC ====================

    /**
     * Sync customers from server with embedded addresses
     * Uses new /customers/all-with-addresses endpoint
     */
    async syncCustomers(options: {
        pageSize?: number;
        onProgress?: (progress: SyncProgress) => void;
    } = {}): Promise<SyncResult> {
        const { pageSize = 100, onProgress } = options;

        if (!this.isAuthenticated()) {
            return { success: false, itemsSynced: 0, error: 'Not authenticated' };
        }

        if (this.syncing) {
            return { success: false, itemsSynced: 0, error: 'Sync in progress' };
        }

        this.syncing = true;
        let totalSynced = 0;

        try {
            console.log('[SyncPull] Starting customer sync with addresses...');

            let page = 1;
            let hasMore = true;

            while (hasMore) {
                // Use new endpoint that returns customers with embedded addresses
                const response = await customersApi.getAllWithAddresses({
                    page,
                    page_size: pageSize
                });

                const data = response.data || response;
                const customers = data.customers || [];
                const pagination = data.pagination || {};

                if (customers.length > 0) {
                    const transformedCustomers = customers.map((customer: any) => this.transformCustomer(customer));
                    await offlineDB.bulkLoad('customers', transformedCustomers);
                    totalSynced += customers.length;
                    console.log(`[SyncPull] ✅ Synced ${customers.length} customers (page ${page})`);
                }

                if (onProgress) {
                    onProgress({
                        page,
                        totalPages: pagination.total_pages || 1,
                        itemsSynced: totalSynced,
                        type: 'customers'
                    });
                }

                hasMore = pagination.has_more || false;
                page++;
            }

            console.log(`[SyncPull] ✅ Customer sync complete: ${totalSynced} customers`);
            return { success: true, itemsSynced: totalSynced };

        } catch (error: any) {
            console.error('[SyncPull] Customer sync failed:', error);
            return { success: false, itemsSynced: totalSynced, error: error.message };
        } finally {
            this.syncing = false;
        }
    }

    /**
     * Transform customer from API format to IndexedDB format
     * Includes embedded address and contact data (like products include batches)
     * 
     * New endpoint returns addresses as an array - we extract billing/shipping
     */
    private transformCustomer(customer: any): any {
        const customerId = String(customer.customer_id || customer.id);

        // Extract addresses from embedded array (new endpoint format)
        const addresses = customer.addresses || [];
        const billingAddr = addresses.find((a: any) => a.address_type === 'billing' && a.is_default) ||
            addresses.find((a: any) => a.address_type === 'billing') ||
            addresses[0];
        const shippingAddr = addresses.find((a: any) => a.address_type === 'shipping');

        // Build billing address object
        const billingAddress = billingAddr ? {
            street: billingAddr.address_line1 || '',
            address_line1: billingAddr.address_line1 || '',
            address_line2: billingAddr.address_line2 || '',
            city: billingAddr.city || '',
            state: billingAddr.state_name || billingAddr.state_code || '',
            state_code: billingAddr.state_code || '',
            pincode: billingAddr.pincode || ''
        } : {
            street: '',
            city: '',
            state: '',
            pincode: ''
        };

        // Build shipping address object (if available)
        const shippingAddress = shippingAddr ? {
            street: shippingAddr.address_line1 || '',
            address_line1: shippingAddr.address_line1 || '',
            address_line2: shippingAddr.address_line2 || '',
            city: shippingAddr.city || '',
            state: shippingAddr.state_name || shippingAddr.state_code || '',
            state_code: shippingAddr.state_code || '',
            pincode: shippingAddr.pincode || ''
        } : null;

        // Build contact person object for B2B customers
        const contactPerson = customer.contact_person_name ? {
            name: customer.contact_person_name,
            phone: customer.contact_person_phone || '',
            email: customer.contact_person_email || ''
        } : null;

        return {
            id: customerId,
            customer_id: customerId,
            customer_name: customer.customer_name || customer.name || '',
            customer_code: customer.customer_code || '',
            primary_phone: customer.primary_phone || customer.phone || '',
            primary_email: customer.primary_email || customer.email || '',
            secondary_phone: customer.secondary_phone || '',
            whatsapp_number: customer.whatsapp_number || '',
            gst_number: customer.gst_number || customer.gstin || '',
            customer_type: customer.customer_type || 'regular',
            business_type: customer.business_type || '',
            credit_limit: customer.credit_limit || 0,
            credit_days: customer.credit_days || 0,
            current_outstanding: customer.current_outstanding || 0,
            // Embedded address data (like batches in products)
            city: billingAddress.city,
            state: billingAddress.state,
            billing_address: billingAddress,
            shipping_address: shippingAddress,
            // Keep raw addresses for advanced use
            addresses: addresses,
            // Embedded contact person (for B2B)
            contact_person: contactPerson,
            // Compliance fields
            pan_number: customer.pan_number || '',
            drug_license_number: customer.drug_license_number || '',
            drug_license_validity: customer.drug_license_validity || null,
            // Search fields (indexed for fast lookup)
            _search_name: (customer.customer_name || customer.name || '').toLowerCase(),
            _search_phone: (customer.primary_phone || customer.phone || '').replace(/\D/g, ''),
            _search_gst: (customer.gst_number || customer.gstin || '').toLowerCase(),
            // Metadata
            is_active: customer.is_active !== false,
            updated_at: customer.updated_at || new Date().toISOString()
        };
    }


    // ==================== FULL SYNC ====================

    /**
     * Full sync - downloads all data after login
     * Called once after authentication
     */
    async fullSync(options: {
        onProgress?: (progress: SyncProgress) => void;
    } = {}): Promise<{ products: SyncResult; customers: SyncResult }> {
        console.log('[SyncPull] Starting full sync...');

        const productResult = await this.syncProducts({
            fullSync: true,
            onProgress: options.onProgress
        });

        const customerResult = await this.syncCustomers({
            onProgress: options.onProgress
        });

        console.log('[SyncPull] Full sync complete:', {
            products: productResult.itemsSynced,
            customers: customerResult.itemsSynced
        });

        return { products: productResult, customers: customerResult };
    }

    // ==================== BATCH RESERVATIONS ====================

    /**
     * Reserve quantity on a batch for offline invoice
     * This is stored in the product.batches[].quantity_reserved_offline
     */
    async reserveBatchQuantity(
        productId: string | number,
        batchId: string | number,
        quantity: number
    ): Promise<{ success: boolean; error?: string; usable?: number }> {
        try {
            const product = await offlineDB.get('products', String(productId));
            if (!product || !product.batches) {
                return { success: false, error: 'Product not found' };
            }

            const batch = product.batches.find((b: any) => String(b.batch_id) === String(batchId));
            if (!batch) {
                return { success: false, error: 'Batch not found' };
            }

            const available = batch.quantity_available || 0;
            const reserved = batch.quantity_reserved_offline || 0;
            const usable = available - reserved;

            if (usable < quantity) {
                return {
                    success: false,
                    error: `Insufficient stock. Available: ${usable}`,
                    usable
                };
            }

            // Update reservation
            batch.quantity_reserved_offline = reserved + quantity;
            await offlineDB.update('products', product);

            console.log(`[SyncPull] Reserved ${quantity} units on batch ${batchId}`);
            return { success: true, usable: usable - quantity };

        } catch (error: any) {
            return { success: false, error: error.message };
        }
    }

    /**
     * Clear reservation after sync completes
     */
    async clearBatchReservation(
        productId: string | number,
        batchId: string | number,
        quantity: number
    ): Promise<void> {
        try {
            const product = await offlineDB.get('products', String(productId));
            if (!product || !product.batches) return;

            const batch = product.batches.find((b: any) => String(b.batch_id) === String(batchId));
            if (!batch) return;

            batch.quantity_reserved_offline = Math.max(0, (batch.quantity_reserved_offline || 0) - quantity);
            await offlineDB.update('products', product);

            console.log(`[SyncPull] Cleared reservation of ${quantity} units on batch ${batchId}`);
        } catch (error) {
            console.warn('[SyncPull] Failed to clear reservation:', error);
        }
    }

    // ==================== LISTENERS ====================

    /**
     * Subscribe to sync events
     */
    onSyncEvent(callback: (event: any) => void): () => void {
        this.syncListeners.add(callback);
        return () => this.syncListeners.delete(callback);
    }

    private notifyListeners(event: any): void {
        this.syncListeners.forEach(cb => {
            try {
                cb(event);
            } catch (e) {
                console.error('[SyncPull] Listener error:', e);
            }
        });
    }

    // ==================== UTILITIES ====================

    /**
     * Get sync status
     */
    async getStatus(): Promise<SyncStatus> {
        const products = await offlineDB.getAll('products');
        const customers = await offlineDB.getAll('customers');

        return {
            lastSyncTime: this.lastSyncTime,
            isOnline: navigator.onLine,
            productCount: products.length,
            customerCount: customers.length
        };
    }

    /**
     * Clear all synced data
     */
    async clearAll(): Promise<void> {
        await offlineDB.clearAll();
        this.lastSyncTime = null;
        localStorage.removeItem(LAST_SYNC_KEY);
        console.log('[SyncPull] All data cleared');
    }
}

// Export singleton instance
const syncPullService = new SyncPullService();
export default syncPullService;
