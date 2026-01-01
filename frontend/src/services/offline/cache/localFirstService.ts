/**
 * Local-First Data Service
 * Provides instant local search with cloud fallback and background sync
 * Inspired by Marg billing software's instant responsiveness
 */

import offlineDB from '../core/offlineDatabase';
import { productAPI } from '../../api';
import { customersApi } from '../../api';
import { OfflineProduct, OfflineCustomer } from '../types';

// ==================== TYPE DEFINITIONS ====================

interface SearchOptions {
    limit?: number;
    forceCloud?: boolean;
}

interface SyncEvent {
    status: 'seeded' | 'syncing' | 'synced' | 'error';
    timestamp?: number;
    productsUpdated?: number;
    customersUpdated?: number;
    error?: Error;
}

interface SyncStatus {
    initialized: boolean;
    syncing: boolean;
    lastSyncTime: number | null;
    isOnline: boolean;
}

type SyncListener = (event: SyncEvent) => void;

// ==================== SERVICE CLASS ====================

class LocalFirstService {
    private initialized: boolean = false;
    private syncing: boolean = false;
    private lastSyncTime: number | null = null;
    private syncListeners: Set<SyncListener> = new Set();

    /**
     * Initialize the service and seed local database
     */
    async initialize(): Promise<void> {
        if (this.initialized) {
            return;
        }

        try {
            console.log('[LocalFirst] Initializing service...');
            await offlineDB.init();

            // Check if we need initial seed
            const products = await offlineDB.getAll('products');
            const customers = await offlineDB.getAll('customers');

            console.log('[LocalFirst] Current cache - Products:', products.length, 'Customers:', customers.length);

            // Only seed if both are empty (first time) or if cache is stale
            const needsSeed = products.length === 0 || customers.length === 0;

            if (needsSeed) {
                console.log('[LocalFirst] Cache empty, attempting to seed from API...');
                // Don't await - let it seed in background, app will fallback to cloud search
                this.seedInitialData().catch(error => {
                    console.warn('[LocalFirst] Background seed failed (expected if auth not ready yet):', error.message);
                });
            } else {
                console.log('[LocalFirst] Using existing cache');
            }

            this.initialized = true;

            // Start background sync
            this.startBackgroundSync();

            console.log('[LocalFirst] Service initialized successfully');
        } catch (error) {
            console.error('[LocalFirst] Failed to initialize LocalFirstService:', error);
            // Still mark as initialized so app continues with cloud-only search
            this.initialized = true;
        }
    }

    /**
     * Seed initial data from cloud
     */
    async seedInitialData(): Promise<void> {
        try {
            console.log('[LocalFirst] Seeding initial data...');

            // Fetch products - with error handling for auth issues
            try {
                const productsResponse = await productAPI.list({ limit: 100 });
                const products = (productsResponse as any)?.data || productsResponse || [];

                console.log('[LocalFirst] Fetched products from cloud:', products.length);

                // Products: Core info only - NO PRICING (comes from batches)
                // Use String(product_id) as consistent key to prevent duplicates
                const transformedProducts = products.map((p: any) => {
                    const productId = String(p.product_id || p.id);
                    return {
                        id: productId,
                        product_id: productId,
                        product_name: p.product_name || p.name,
                        product_code: p.product_code || p.code || p.sku,
                        generic_name: p.generic_name,
                        brand: p.brand,
                        hsn_code: p.hsn_code || p.hsn,
                        category: p.category,
                        gst_percent: Number((p.gst_percent || 0).toFixed(2)),
                        current_stock: p.current_stock || p.stock || 0,
                        // Search fields
                        _search_name: (p.product_name || p.name || '').toLowerCase(),
                        _search_code: (p.product_code || p.code || p.sku || '').toLowerCase(),
                        _search_hsn: (p.hsn_code || p.hsn || '').toLowerCase(),
                    };
                });

                await offlineDB.bulkLoad('products', transformedProducts);
                console.log(`[LocalFirst] Seeded ${transformedProducts.length} products`);
            } catch (error) {
                console.error('[LocalFirst] Failed to fetch products - might be auth issue:', (error as Error).message);
                // Don't throw - continue with customers
            }

            // Fetch customers - with error handling for auth issues
            try {
                console.log('[LocalFirst] Fetching customers from cloud...');
                const customersResponse = await customersApi.getAll({ limit: 100 });
                console.log('[LocalFirst] Raw customers response:', customersResponse);

                // Handle different response structures
                let customers: any[] = [];
                if ((customersResponse as any)?.data?.customers) {
                    customers = (customersResponse as any).data.customers;
                } else if ((customersResponse as any)?.customers) {
                    customers = (customersResponse as any).customers;
                } else if ((customersResponse as any)?.data) {
                    customers = (customersResponse as any).data;
                } else if (Array.isArray(customersResponse)) {
                    customers = customersResponse;
                }

                console.log('[LocalFirst] Fetched customers from cloud:', customers.length);

                if (customers.length > 0) {
                    // Transform customers to include search fields  
                    const transformedCustomers = customers.map((c: any) => ({
                        id: c.customer_id || c.id,
                        customer_id: c.customer_id || c.id,
                        name: c.customer_name || c.name,
                        customer_name: c.customer_name || c.name,
                        phone: c.phone || c.phone_number || c.primary_phone,
                        phone_number: c.phone || c.phone_number || c.primary_phone,
                        primary_phone: c.primary_phone || c.phone || c.phone_number,
                        email: c.email || c.primary_email,
                        primary_email: c.primary_email || c.email,
                        gst_number: c.gst_number || c.gstin,
                        gstin: c.gstin || c.gst_number,
                        address: c.address,
                        city: c.city,
                        state: c.state,
                        customer_type: c.customer_type,
                        customer_code: c.customer_code,
                        // Contact person fields for B2B
                        contact_person_name: c.contact_person_name,
                        contact_person_phone: c.contact_person_phone,
                        contact_person_email: c.contact_person_email,
                        // Address fields
                        billing_address: c.billing_address,
                        address_info: c.address_info,
                        // Normalized search fields
                        _search_name: (c.customer_name || c.name || '').toLowerCase(),
                        _search_phone: (c.phone || c.phone_number || c.primary_phone || '').replace(/\D/g, ''),
                        _search_gst: (c.gst_number || c.gstin || '').toLowerCase(),
                    }));

                    await offlineDB.bulkLoad('customers', transformedCustomers);
                    console.log(`[LocalFirst] Seeded ${transformedCustomers.length} customers to IndexedDB`);
                }
            } catch (error) {
                console.error('[LocalFirst] Failed to fetch customers - might be auth issue:', (error as Error).message);
                // Don't throw - allow app to continue with cloud-only search
            }

            this.lastSyncTime = Date.now();
            this.notifySyncListeners({ status: 'seeded', timestamp: this.lastSyncTime });
            console.log('[LocalFirst] Initial seed completed (some data may have failed due to auth)');
        } catch (error) {
            console.error('[LocalFirst] Failed to seed initial data:', error);
            // Don't throw - allow app to continue with cloud-only search
        }
    }

    // ==========================================================================
    // BULK SYNC - Products with Batches (for Offline-First Architecture)
    // ==========================================================================

    /**
     * Sync ALL products with embedded batches from the server.
     * This is the key method for offline-first architecture.
     * 
     * Features:
     * - Paginated to handle large catalogs
     * - Delta sync support (only fetch changes since last sync)
     * - Stores products with batches in IndexedDB
     * - Called on login/app load and periodically in background
     * 
     * @param options.fullSync - If true, fetch all products (ignore lastSyncTime)
     * @param options.pageSize - Products per page (default 100)
     * @param options.onProgress - Callback for sync progress
     */
    async syncProductsWithBatches(options: {
        fullSync?: boolean;
        pageSize?: number;
        onProgress?: (progress: { page: number; totalPages: number; productsSynced: number }) => void;
    } = {}): Promise<{ success: boolean; productsSynced: number; error?: string }> {
        const { fullSync = false, pageSize = 100, onProgress } = options;

        // Check authentication before attempting sync
        const token = localStorage.getItem('access_token');
        if (!token) {
            console.log('[LocalFirst] No auth token, skipping product sync');
            return { success: false, productsSynced: 0, error: 'Not authenticated' };
        }

        if (this.syncing) {
            console.log('[LocalFirst] Sync already in progress, skipping...');
            return { success: false, productsSynced: 0, error: 'Sync already in progress' };
        }

        this.syncing = true;
        this.notifySyncListeners({ status: 'syncing' });

        try {
            console.log(`[LocalFirst] Starting products sync (fullSync: ${fullSync})...`);

            // Determine since parameter for delta sync
            let since: string | undefined;
            if (!fullSync && this.lastSyncTime) {
                since = new Date(this.lastSyncTime).toISOString();
                console.log(`[LocalFirst] Delta sync since: ${since}`);
            }

            let page = 1;
            let hasMore = true;
            let totalProductsSynced = 0;
            let totalPages = 1;

            while (hasMore) {
                console.log(`[LocalFirst] Fetching page ${page}...`);

                const response = await productAPI.getAllWithBatches({
                    page,
                    pageSize,
                    since
                });

                const data = (response as any)?.data || response;
                const products = data.products || [];
                const pagination = data.pagination || {};

                totalPages = pagination.total_pages || 1;
                hasMore = pagination.has_more || false;

                console.log(`[LocalFirst] Page ${page}/${totalPages}: ${products.length} products`);

                if (products.length > 0) {
                    // Transform products to include search fields
                    const transformedProducts = products.map((p: any) => {
                        const productId = String(p.product_id);
                        return {
                            id: productId,
                            product_id: productId,
                            product_name: p.product_name,
                            product_code: p.product_code,
                            generic_name: p.generic_name,
                            manufacturer: p.manufacturer,
                            hsn_code: p.hsn_code,
                            category: p.category,
                            gst_percent: Number(p.gst_percent || 0),
                            total_stock: p.total_stock || 0,
                            // Canonical pricing fields
                            mrp_per_unit: p.mrp_per_unit || 0,
                            sale_price_per_unit: p.sale_price_per_unit || 0,
                            // Embedded batches!
                            batches: p.batches || [],
                            best_batch: p.best_batch || null,
                            // Timestamps
                            updated_at: p.updated_at,
                            // Normalized search fields
                            _search_name: (p.product_name || '').toLowerCase(),
                            _search_code: (p.product_code || '').toLowerCase(),
                            _search_hsn: (p.hsn_code || '').toLowerCase(),
                            _search_generic: (p.generic_name || '').toLowerCase(),
                            _search_manufacturer: (p.manufacturer || '').toLowerCase(),
                        };
                    });

                    // Upsert products (overwrite if exists)
                    await offlineDB.bulkLoad('products', transformedProducts);
                    totalProductsSynced += transformedProducts.length;

                    // Also store batches separately for direct batch queries
                    const allBatches: any[] = [];
                    for (const product of products) {
                        if (product.batches && product.batches.length > 0) {
                            for (const batch of product.batches) {
                                allBatches.push({
                                    id: String(batch.batch_id),
                                    batch_id: batch.batch_id,
                                    product_id: product.product_id,
                                    batch_number: batch.batch_number,
                                    expiry_date: batch.expiry_date,
                                    manufacturing_date: batch.manufacturing_date,
                                    mrp_per_unit: batch.mrp_per_unit,
                                    sale_price_per_unit: batch.sale_price_per_unit,
                                    cost_per_unit: batch.cost_per_unit,
                                    quantity_available: batch.quantity_available,
                                    days_to_expiry: batch.days_to_expiry
                                });
                            }
                        }
                    }
                    if (allBatches.length > 0) {
                        await offlineDB.storeBatches(allBatches);
                    }

                    // Report progress
                    if (onProgress) {
                        onProgress({
                            page,
                            totalPages,
                            productsSynced: totalProductsSynced
                        });
                    }
                }

                page++;
            }

            this.lastSyncTime = Date.now();
            localStorage.setItem('localFirst_lastProductSync', this.lastSyncTime.toString());

            this.notifySyncListeners({
                status: 'synced',
                timestamp: this.lastSyncTime,
                productsUpdated: totalProductsSynced
            });

            console.log(`[LocalFirst] ✅ Sync complete! ${totalProductsSynced} products with batches synced.`);

            return { success: true, productsSynced: totalProductsSynced };

        } catch (error) {
            const errorMessage = (error as Error).message;
            console.error('[LocalFirst] Sync failed:', errorMessage);
            this.notifySyncListeners({ status: 'error', error: error as Error });
            return { success: false, productsSynced: 0, error: errorMessage };
        } finally {
            this.syncing = false;
        }
    }

    /**
     * Get the last sync timestamp
     */
    getLastSyncTime(): number | null {
        if (!this.lastSyncTime) {
            const stored = localStorage.getItem('localFirst_lastProductSync');
            this.lastSyncTime = stored ? parseInt(stored, 10) : null;
        }
        return this.lastSyncTime;
    }

    /**
     * Check if sync is needed (older than 5 minutes)
     */
    needsSync(): boolean {
        const lastSync = this.getLastSyncTime();
        if (!lastSync) return true;
        const fiveMinutesAgo = Date.now() - (5 * 60 * 1000);
        return lastSync < fiveMinutesAgo;
    }

    /**
     * Search products - LOCAL-FIRST strategy for instant results!
     * 
     * Strategy:
     * 1. ALWAYS search IndexedDB first (instant, <50ms)
     * 2. Return results immediately
     * 3. If synced recently (< 5 min), done
     * 4. If stale or forceCloud, trigger background refresh
     * 
     * This makes search feel instant even on slow connections.
     */
    async searchProducts(query: string, options: SearchOptions = {}): Promise<any[]> {
        const { limit = 20, forceCloud = false } = options;

        // Ensure initialized
        await this.initialize();

        if (!query || query.length < 2) {
            return [];
        }

        const searchTerm = query.toLowerCase();

        // STEP 1: Search IndexedDB first (INSTANT!)
        try {
            const allProducts = await offlineDB.getAll('products');

            if (allProducts.length > 0) {
                console.log(`[LocalFirst] ⚡ Instant search in ${allProducts.length} cached products for: "${query}"`);

                // Multi-field fuzzy search (includes new fields from sync)
                const matches = allProducts.filter((product: any) => {
                    return (
                        (product._search_name?.includes(searchTerm) || false) ||
                        (product._search_code?.includes(searchTerm) || false) ||
                        (product._search_hsn?.includes(searchTerm) || false) ||
                        (product._search_generic?.includes(searchTerm) || false) ||
                        (product._search_manufacturer?.includes(searchTerm) || false) ||
                        // Fallback for legacy data
                        (product.product_name?.toLowerCase().includes(searchTerm) || false) ||
                        (product.name?.toLowerCase().includes(searchTerm) || false)
                    );
                });

                // Sort by relevance (exact matches first, then by stock)
                matches.sort((a: any, b: any) => {
                    // Exact match priority
                    const aExact = a._search_name === searchTerm || a._search_code === searchTerm;
                    const bExact = b._search_name === searchTerm || b._search_code === searchTerm;
                    if (aExact && !bExact) return -1;
                    if (!aExact && bExact) return 1;

                    // Then by stock (products with stock first)
                    const aStock = a.total_stock || 0;
                    const bStock = b.total_stock || 0;
                    return bStock - aStock;
                });

                // Deduplicate by product_id
                const seen = new Set<string | number>();
                const uniqueMatches = matches.filter((product: any) => {
                    const key = product.product_id || product.id;
                    if (seen.has(String(key))) return false;
                    seen.add(String(key));
                    return true;
                });

                const results = uniqueMatches.slice(0, limit);
                console.log(`[LocalFirst] ⚡ Returning ${results.length} instant results (LOCAL-FIRST)`);

                // STEP 2: Background sync if data is stale (non-blocking)
                if (forceCloud || this.needsSync()) {
                    console.log('[LocalFirst] Data might be stale, triggering background sync...');
                    this.syncProductsWithBatches({ fullSync: false }).catch(err => {
                        console.warn('[LocalFirst] Background sync failed:', err.message);
                    });
                }

                return results;
            }
        } catch (error) {
            console.error('[LocalFirst] Local search failed:', error);
        }

        // STEP 3: Fallback to cloud if no local data
        console.log('[LocalFirst] No local data, falling back to cloud search...');
        if (navigator.onLine) {
            try {
                const results = await this.cloudSearchProducts(query, limit);
                return results;
            } catch (error) {
                console.error('[LocalFirst] Cloud search also failed:', error);
            }
        }

        return [];
    }

    /**
     * Search customers locally with instant results
     */
    async searchCustomers(query: string, options: SearchOptions = {}): Promise<any[]> {
        const { limit = 20, forceCloud = false } = options;

        // Ensure initialized
        await this.initialize();

        if (!query || query.length < 2) {
            return [];
        }

        const searchTerm = query.toLowerCase();
        const phoneDigits = query.replace(/\D/g, '');

        // Try local search first (instant) - but don't let it block cloud fallback
        if (!forceCloud) {
            try {
                const allCustomers = await offlineDB.getAll('customers');

                if (allCustomers.length > 0) {
                    console.log('[LocalFirst] Searching', allCustomers.length, 'local customers for:', query);

                    // Multi-field fuzzy search
                    const matches = allCustomers.filter((customer: any) => {
                        // Only check fields if the search term is meaningful
                        const nameMatch = customer._search_name?.includes(searchTerm) || false;
                        const phoneMatch = phoneDigits.length > 0 && customer._search_phone?.includes(phoneDigits) || false;
                        const gstMatch = customer._search_gst?.includes(searchTerm) || false;
                        const nameDirectMatch = customer.name?.toLowerCase().includes(searchTerm) || false;
                        const emailMatch = customer.email?.toLowerCase().includes(searchTerm) || false;

                        const isMatch = nameMatch || phoneMatch || gstMatch || nameDirectMatch || emailMatch;

                        return isMatch;
                    });

                    console.log('[LocalFirst] Customer search - matches found:', matches.length);

                    // Sort by relevance
                    matches.sort((a: any, b: any) => {
                        const aExact = a._search_name === searchTerm || a._search_phone === phoneDigits;
                        const bExact = b._search_name === searchTerm || b._search_phone === phoneDigits;
                        if (aExact && !bExact) return -1;
                        if (!aExact && bExact) return 1;
                        return 0;
                    });

                    const results = matches.slice(0, limit);

                    // If we have local results, return them instantly
                    if (results.length > 0) {
                        console.log('[LocalFirst] Returning', results.length, 'local customer results');
                        // Trigger background cloud search to update cache
                        this.backgroundCloudSearch('customers', query).catch(() => { });
                        return results;
                    }

                    console.log('[LocalFirst] No local customers matched, falling back to cloud');
                } else {
                    console.log('[LocalFirst] No local customers cached, using cloud search');
                }
            } catch (error) {
                console.error('[LocalFirst] Local customer search failed:', error);
            }
        }

        // Fallback to cloud search
        console.log('[LocalFirst] Using cloud search for customers:', query);
        return this.cloudSearchCustomers(query, limit);
    }

    /**
     * Cloud search for products with embedded batches (OPTIMIZED)
     * Uses /products/search-with-batches endpoint for single API call
     */
    async cloudSearchProducts(query: string, limit: number = 20): Promise<any[]> {
        try {
            console.log('[LocalFirst] Searching products via cloud API (with batches), query:', query);

            // Use the new optimized endpoint that returns products with batches
            const response = await productAPI.searchWithBatches(query, { limit });
            const rawProducts = (response as any)?.products || (response as any)?.data?.products || [];

            console.log('[LocalFirst] Cloud search returned:', rawProducts.length, 'products with batches');

            // Deduplicate by product_id
            const seen = new Set<string | number>();
            const products = rawProducts.filter((product: any) => {
                const key = product.product_id || product.id;
                if (seen.has(key)) return false;
                seen.add(key);
                return true;
            });

            // Extract all batches from products for caching
            const allBatches: any[] = [];
            for (const product of products) {
                if (product.batches && Array.isArray(product.batches)) {
                    for (const batch of product.batches) {
                        allBatches.push({
                            ...batch,
                            product_id: product.product_id,
                            product_name: product.product_name
                        });
                    }
                }
            }

            // Update local caches in background
            if (products.length > 0) {
                // Cache products (with embedded batches for quick access)
                this.updateLocalCache('products', products).catch(() => { });

                // Also cache batches separately for BatchSelector
                if (allBatches.length > 0) {
                    try {
                        await offlineDB.storeBatches(allBatches);
                        console.log(`[LocalFirst] Cached ${allBatches.length} batches for offline use`);
                    } catch (e) {
                        console.warn('[LocalFirst] Failed to cache batches:', e);
                    }
                }
            }

            // Return products with batches for immediate use
            return products;
        } catch (error) {
            console.error('[LocalFirst] Cloud product search failed:', (error as Error).message);

            // Fallback to basic search if new endpoint fails
            try {
                console.log('[LocalFirst] Falling back to basic product search...');
                const response = await productAPI.search(query, { limit });
                const results = (response as any)?.data || response || [];
                return results;
            } catch (fallbackError) {
                console.error('[LocalFirst] Fallback search also failed:', fallbackError);
                return [];
            }
        }
    }

    /**
     * Cloud search for customers (fallback)
     */
    async cloudSearchCustomers(query: string, limit: number = 20): Promise<any[]> {
        try {
            console.log('[LocalFirst] Calling cloud API for customers, query:', query);
            const response = await customersApi.search(query, { limit });
            console.log('[LocalFirst] Cloud API response:', response);

            // Handle different response structures
            let results: any[] = [];
            if ((response as any)?.data?.customers) {
                results = (response as any).data.customers;
            } else if ((response as any)?.customers) {
                results = (response as any).customers;
            } else if ((response as any)?.data) {
                results = (response as any).data;
            } else if (Array.isArray(response)) {
                results = response;
            }

            console.log('[LocalFirst] Extracted customer results:', results.length);

            // Update local cache in background
            if (results.length > 0) {
                this.updateLocalCache('customers', results).catch(() => { });
            }

            return results;
        } catch (error) {
            console.error('[LocalFirst] Cloud customer search failed:', (error as Error).message, error);
            // Return empty array so UI can show "no results" instead of breaking
            return [];
        }
    }

    /**
     * Background cloud search to update cache
     */
    async backgroundCloudSearch(type: 'products' | 'customers', query: string): Promise<any[]> {
        if (type === 'products') {
            return this.cloudSearchProducts(query, 50);
        } else if (type === 'customers') {
            return this.cloudSearchCustomers(query, 50);
        }
        return [];
    }

    /**
     * Update local cache with cloud data
     */
    async updateLocalCache(storeName: 'products' | 'customers', items: any[]): Promise<void> {
        try {
            for (const item of items) {
                let transformed: any;

                if (storeName === 'products') {
                    // Use String(product_id) as consistent key
                    const productId = String(item.product_id || item.id);
                    transformed = {
                        id: productId,
                        product_id: productId,
                        product_name: item.product_name || item.name,
                        product_code: item.product_code || item.code || item.sku,
                        hsn_code: item.hsn_code || item.hsn,
                        category: item.category,
                        mrp: Number((item.mrp_per_unit || item.mrp || 0).toFixed(2)),
                        sale_price: Number((item.sale_price_per_unit || item.sale_price || item.selling_price || 0).toFixed(2)),
                        current_stock: item.current_stock || item.stock || 0,
                        gst_percent: Number((item.gst_percent || item.tax_rate || 0).toFixed(2)),
                        _search_name: (item.product_name || item.name || '').toLowerCase(),
                        _search_code: (item.product_code || item.code || item.sku || '').toLowerCase(),
                        _search_hsn: (item.hsn_code || item.hsn || '').toLowerCase(),
                    };
                } else if (storeName === 'customers') {
                    transformed = {
                        id: item.customer_id || item.id,
                        customer_id: item.customer_id || item.id,
                        name: item.customer_name || item.name,
                        customer_name: item.customer_name || item.name,
                        phone: item.phone || item.phone_number,
                        phone_number: item.phone || item.phone_number,
                        email: item.email,
                        gst_number: item.gst_number || item.gstin,
                        address: item.address,
                        city: item.city,
                        state: item.state,
                        _search_name: (item.customer_name || item.name || '').toLowerCase(),
                        _search_phone: (item.phone || item.phone_number || '').replace(/\D/g, ''),
                        _search_gst: (item.gst_number || item.gstin || '').toLowerCase(),
                    };
                }

                if (transformed) {
                    await offlineDB.update(storeName, transformed);
                }
            }
        } catch (error) {
            console.error(`Failed to update ${storeName} cache:`, error);
        }
    }

    /**
     * Start background sync to keep data fresh
     */
    startBackgroundSync(): void {
        // Sync every 5 minutes when online
        setInterval(() => {
            if (navigator.onLine && !this.syncing) {
                this.syncInBackground();
            }
        }, 5 * 60 * 1000); // 5 minutes
    }

    /**
     * Background sync without blocking UI
     */
    async syncInBackground(): Promise<void> {
        if (this.syncing) return;

        this.syncing = true;
        this.notifySyncListeners({ status: 'syncing' });

        try {
            // Fetch latest products
            const productsResponse = await productAPI.list({
                limit: 100,
                updated_since: this.lastSyncTime ? new Date(this.lastSyncTime).toISOString() : undefined
            });
            const products = (productsResponse as any)?.data || productsResponse || [];

            if (products.length > 0) {
                await this.updateLocalCache('products', products);
            }

            // Fetch latest customers
            const customersResponse = await customersApi.getAll({
                limit: 100,
                updated_since: this.lastSyncTime ? new Date(this.lastSyncTime).toISOString() : undefined
            });
            const customers = (customersResponse as any)?.data || customersResponse || [];

            if (customers.length > 0) {
                await this.updateLocalCache('customers', customers);
            }

            this.lastSyncTime = Date.now();
            this.notifySyncListeners({
                status: 'synced',
                timestamp: this.lastSyncTime,
                productsUpdated: products.length,
                customersUpdated: customers.length
            });
        } catch (error) {
            console.error('Background sync failed:', error);
            this.notifySyncListeners({ status: 'error', error: error as Error });
        } finally {
            this.syncing = false;
        }
    }

    /**
     * Force sync now
     */
    async syncNow(): Promise<void> {
        return this.syncInBackground();
    }

    /**
     * Get sync status
     */
    getSyncStatus(): SyncStatus {
        return {
            initialized: this.initialized,
            syncing: this.syncing,
            lastSyncTime: this.lastSyncTime,
            isOnline: navigator.onLine
        };
    }

    /**
     * Subscribe to sync events
     */
    onSyncStatusChange(callback: SyncListener): () => void {
        this.syncListeners.add(callback);

        // Return unsubscribe function
        return () => {
            this.syncListeners.delete(callback);
        };
    }

    /**
     * Notify all sync listeners
     */
    private notifySyncListeners(event: SyncEvent): void {
        this.syncListeners.forEach(callback => {
            try {
                callback(event);
            } catch (error) {
                console.error('Sync listener error:', error);
            }
        });
    }

    /**
     * Clear all local data
     */
    async clearLocalData(): Promise<void> {
        await offlineDB.clearAll();
        this.initialized = false;
        this.lastSyncTime = null;
    }
}

// Export singleton instance
const localFirstService = new LocalFirstService();
export default localFirstService;

// Re-export types
export type { SearchOptions, SyncEvent, SyncStatus, SyncListener };
