/**
 * SalesMemoryCache
 * 
 * In-memory cache layer for ultra-fast data access (0-5ms)
 * 
 * DESIGN PRINCIPLES:
 * 1. Single Responsibility: Only handles in-memory caching
 * 2. Immutability: Returns copies, never mutates internal state
 * 3. Performance: O(1) lookups, O(n) search with early exit
 * 4. Memory Efficiency: Lazy loading, configurable limits
 * 5. Thread Safety: All operations are synchronous (no race conditions)
 * 
 * ARCHITECTURE:
 * - Layer above IndexedDB, below React components
 * - Warm cache on login (one-time cost)
 * - Invalidate on sync (keep data fresh)
 * - Automatic memory management (prevent leaks)
 * 
 * PERFORMANCE TARGETS:
 * - Product lookup: < 1ms (HashMap O(1))
 * - Search 10k products: < 5ms (optimized iteration)
 * - Warmup 10k products: < 200ms (acceptable on login)
 */

import type {
    OfflineProduct,
    OfflineCustomer,
    BatchStock
} from '../../types/sales.types';
import { salesStockService } from './SalesStockService';

// ==================== CONSTANTS ====================

const MAX_SEARCH_RESULTS = 100;
const CACHE_VERSION = 1;
const LOG_PREFIX = '[MemoryCache]';

// ==================== TYPES ====================

interface CacheStats {
    productCount: number;
    customerCount: number;
    lastWarmup: Date | null;
    lastInvalidate: Date | null;
    hitCount: number;
    missCount: number;
    searchCount: number;
}

interface SearchOptions {
    limit?: number;
    includeInactive?: boolean;
    sortBy?: 'name' | 'code' | 'stock';
}

// ==================== CACHE CLASS ====================

class SalesMemoryCache {
    // ==================== STATE ====================

    private products: Map<string, OfflineProduct> = new Map();
    private customers: Map<string, OfflineCustomer> = new Map();

    private productsByCode: Map<string, OfflineProduct> = new Map();
    private customersByPhone: Map<string, OfflineCustomer> = new Map();

    private isWarmedUp: boolean = false;
    private warmupPromise: Promise<void> | null = null;

    private stats: CacheStats = {
        productCount: 0,
        customerCount: 0,
        lastWarmup: null,
        lastInvalidate: null,
        hitCount: 0,
        missCount: 0,
        searchCount: 0
    };

    // ==================== INITIALIZATION ====================

    /**
     * Warm up cache with data from IndexedDB
     * 
     * IMPORTANT: Call this ONCE after login
     * Subsequent calls return the same promise (idempotent)
     * 
     * @param offlineDB - IndexedDB instance
     * @returns Promise that resolves when warmup complete
     */
    async warmup(offlineDB: any): Promise<void> {
        // Prevent duplicate warmups
        if (this.warmupPromise) {
            console.log(`${LOG_PREFIX} Warmup already in progress, waiting...`);
            return this.warmupPromise;
        }

        if (this.isWarmedUp) {
            console.log(`${LOG_PREFIX} Already warmed up`);
            return;
        }

        console.log(`${LOG_PREFIX} Starting warmup...`);
        const startTime = performance.now();

        this.warmupPromise = this._performWarmup(offlineDB);

        try {
            await this.warmupPromise;

            const duration = Math.round(performance.now() - startTime);
            console.log(
                `${LOG_PREFIX} ✅ Warmup complete in ${duration}ms:`,
                `${this.products.size} products,`,
                `${this.customers.size} customers`
            );

            this.isWarmedUp = true;
            this.stats.lastWarmup = new Date();

        } catch (error) {
            console.error(`${LOG_PREFIX} Warmup failed:`, error);
            this.warmupPromise = null; // Allow retry
            throw error;
        }
    }

    private async _performWarmup(offlineDB: any): Promise<void> {
        try {
            // Load products and customers in parallel
            const [products, customers] = await Promise.all([
                offlineDB.getAll('products'),
                offlineDB.getAll('customers')
            ]);

            // Build product maps
            this.products.clear();
            this.productsByCode.clear();

            for (const product of products) {
                if (!product?.product_id) continue;

                const productId = String(product.product_id);
                this.products.set(productId, product);

                if (product.product_code) {
                    this.productsByCode.set(
                        product.product_code.toLowerCase(),
                        product
                    );
                }
            }

            // Build customer maps
            this.customers.clear();
            this.customersByPhone.clear();

            for (const customer of customers) {
                if (!customer?.customer_id) continue;

                const customerId = String(customer.customer_id);
                this.customers.set(customerId, customer);

                if (customer.primary_phone) {
                    const phone = customer.primary_phone.replace(/\D/g, '');
                    this.customersByPhone.set(phone, customer);
                }
            }

            this.stats.productCount = this.products.size;
            this.stats.customerCount = this.customers.size;

        } catch (error) {
            console.error(`${LOG_PREFIX} _performWarmup failed:`, error);
            throw error;
        }
    }

    // ==================== PRODUCT OPERATIONS ====================

    /**
     * Get product by ID (O(1) lookup)
     * 
     * @param productId - Product ID
     * @returns Product or null if not found
     */
    getProduct(productId: string | number): OfflineProduct | null {
        const key = String(productId);
        const product = this.products.get(key);

        if (product) {
            this.stats.hitCount++;
            // Return copy to prevent external mutations
            return { ...product };
        }

        this.stats.missCount++;
        return null;
    }

    /**
     * Get product by code (O(1) lookup)
     */
    getProductByCode(code: string): OfflineProduct | null {
        const product = this.productsByCode.get(code.toLowerCase());

        if (product) {
            this.stats.hitCount++;
            return { ...product };
        }

        this.stats.missCount++;
        return null;
    }

    /**
     * Search products by query
     * 
     * PERFORMANCE: Optimized for speed
     * - Early exit when limit reached
     * - Pre-computed search fields (_search_name, etc.)
     * - No regex (slow), simple includes() check
     * 
     * @param query - Search string
     * @param options - Search options
     * @returns Array of matching products
     */
    searchProducts(
        query: string,
        options: SearchOptions = {}
    ): OfflineProduct[] {
        this.stats.searchCount++;

        const {
            limit = MAX_SEARCH_RESULTS,
            includeInactive = false,
            sortBy = 'name'
        } = options;

        // Empty query: return first N products
        if (!query.trim()) {
            const products = Array.from(this.products.values())
                .filter(p => includeInactive || p.is_active !== false)
                .slice(0, limit);

            return this._sortProducts(products, sortBy);
        }

        // Search query
        const searchTerm = query.toLowerCase().trim();
        const results: OfflineProduct[] = [];

        // Iterate and filter (optimized with early exit)
        for (const product of this.products.values()) {
            // Early exit if limit reached
            if (results.length >= limit) break;

            // Skip inactive if needed
            if (!includeInactive && product.is_active === false) continue;

            // Check search fields (pre-computed for speed)
            if (
                product._search_name?.includes(searchTerm) ||
                product._search_code?.includes(searchTerm) ||
                product._search_hsn?.includes(searchTerm) ||
                product._search_manufacturer?.includes(searchTerm) ||
                product._search_generic?.includes(searchTerm)
            ) {
                // Return copy to prevent mutations
                results.push({ ...product });
            }
        }

        return this._sortProducts(results, sortBy);
    }

    /**
     * Get products with stock > 0
     */
    getProductsInStock(options: SearchOptions = {}): OfflineProduct[] {
        const { limit = MAX_SEARCH_RESULTS } = options;
        const results: OfflineProduct[] = [];

        for (const product of this.products.values()) {
            if (results.length >= limit) break;

            const stock = salesStockService.getUsableStock(product);
            if (stock > 0) {
                results.push({ ...product });
            }
        }

        return results;
    }

    private _sortProducts(
        products: OfflineProduct[],
        sortBy: 'name' | 'code' | 'stock'
    ): OfflineProduct[] {
        switch (sortBy) {
            case 'name':
                return products.sort((a, b) =>
                    (a.product_name || '').localeCompare(b.product_name || '')
                );
            case 'code':
                return products.sort((a, b) =>
                    (a.product_code || '').localeCompare(b.product_code || '')
                );
            case 'stock':
                return products.sort((a, b) => {
                    const stockA = salesStockService.getUsableStock(a);
                    const stockB = salesStockService.getUsableStock(b);
                    return stockB - stockA; // Descending
                });
            default:
                return products;
        }
    }

    // ==================== CUSTOMER OPERATIONS ====================

    /**
     * Get customer by ID (O(1) lookup)
     */
    getCustomer(customerId: string | number): OfflineCustomer | null {
        const key = String(customerId);
        const customer = this.customers.get(key);

        if (customer) {
            this.stats.hitCount++;
            return { ...customer };
        }

        this.stats.missCount++;
        return null;
    }

    /**
     * Get customer by phone (O(1) lookup)
     */
    getCustomerByPhone(phone: string): OfflineCustomer | null {
        const cleanPhone = phone.replace(/\D/g, '');
        const customer = this.customersByPhone.get(cleanPhone);

        if (customer) {
            this.stats.hitCount++;
            return { ...customer };
        }

        this.stats.missCount++;
        return null;
    }

    /**
     * Search customers by query
     */
    searchCustomers(
        query: string,
        options: SearchOptions = {}
    ): OfflineCustomer[] {
        this.stats.searchCount++;

        const { limit = MAX_SEARCH_RESULTS } = options;

        // Empty query: return first N customers
        if (!query.trim()) {
            return Array.from(this.customers.values()).slice(0, limit);
        }

        // Search query
        const searchTerm = query.toLowerCase().trim();
        const results: OfflineCustomer[] = [];

        for (const customer of this.customers.values()) {
            if (results.length >= limit) break;

            if (
                customer._search_name?.includes(searchTerm) ||
                customer._search_phone?.includes(searchTerm.replace(/\D/g, '')) ||
                customer._search_gst?.includes(searchTerm)
            ) {
                results.push({ ...customer });
            }
        }

        return results;
    }

    // ==================== CACHE UPDATES ====================

    /**
     * Update product in cache
     * Called after local changes or sync
     */
    updateProduct(product: OfflineProduct): void {
        if (!product?.product_id) return;

        const productId = String(product.product_id);
        this.products.set(productId, { ...product });

        if (product.product_code) {
            this.productsByCode.set(
                product.product_code.toLowerCase(),
                { ...product }
            );
        }
    }

    /**
     * Update customer in cache
     */
    updateCustomer(customer: OfflineCustomer): void {
        if (!customer?.customer_id) return;

        const customerId = String(customer.customer_id);
        this.customers.set(customerId, { ...customer });

        if (customer.primary_phone) {
            const phone = customer.primary_phone.replace(/\D/g, '');
            this.customersByPhone.set(phone, { ...customer });
        }
    }

    /**
     * Invalidate cache (after sync)
     * Marks cache as stale, forces re-warmup
     */
    invalidate(): void {
        console.log(`${LOG_PREFIX} Cache invalidated`);
        this.isWarmedUp = false;
        this.warmupPromise = null;
        this.stats.lastInvalidate = new Date();
    }

    /**
     * Clear cache completely
     * Use sparingly (e.g., on logout)
     */
    clear(): void {
        this.products.clear();
        this.customers.clear();
        this.productsByCode.clear();
        this.customersByPhone.clear();
        this.isWarmedUp = false;
        this.warmupPromise = null;

        console.log(`${LOG_PREFIX} Cache cleared`);
    }

    // ==================== DIAGNOSTICS ====================

    /**
     * Check if cache is ready
     */
    isReady(): boolean {
        return this.isWarmedUp;
    }

    /**
     * Get cache statistics
     */
    getStats(): CacheStats {
        return { ...this.stats };
    }

    /**
     * Get hit rate percentage
     */
    getHitRate(): number {
        const total = this.stats.hitCount + this.stats.missCount;
        if (total === 0) return 0;
        return (this.stats.hitCount / total) * 100;
    }

    /**
     * Log cache performance metrics
     */
    logPerformanceMetrics(): void {
        console.log(`${LOG_PREFIX} Performance Metrics:`, {
            products: this.products.size,
            customers: this.customers.size,
            hitRate: `${this.getHitRate().toFixed(1)}%`,
            searches: this.stats.searchCount,
            lastWarmup: this.stats.lastWarmup?.toISOString(),
            lastInvalidate: this.stats.lastInvalidate?.toISOString()
        });
    }
}

// ==================== SINGLETON EXPORT ====================

/**
 * Singleton instance
 * Use this throughout the application
 */
export const salesMemoryCache = new SalesMemoryCache();

export default salesMemoryCache;
