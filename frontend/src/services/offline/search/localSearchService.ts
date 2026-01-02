/**
 * Local Search Service
 * 
 * Provides instant local search on IndexedDB for products and customers.
 * This is the ONLY file responsible for search operations.
 * 
 * Strategy:
 * 1. Search IndexedDB first (instant, <50ms)
 * 2. Return results immediately
 * 3. Caller can trigger background sync if needed
 */

import offlineDB from '../core/offlineDatabase';

// ==================== TYPE DEFINITIONS ====================

export interface SearchOptions {
    limit?: number;
}

export interface ProductSearchResult {
    product_id: string | number;
    product_name: string;
    product_code?: string;
    hsn_code?: string;
    category?: string;
    manufacturer?: string;
    generic_name?: string;
    gst_percent: number;
    total_stock: number;
    mrp_per_unit: number;
    sale_price_per_unit: number;
    batches?: any[];
    best_batch?: any;
}

export interface CustomerSearchResult {
    customer_id: string | number;
    customer_name: string;
    customer_code?: string;
    primary_phone?: string;
    primary_email?: string;
    gst_number?: string;
    customer_type?: string;
    credit_limit?: number;
    current_outstanding?: number;
    // Address info (embedded like batches in products)
    city?: string;
    state?: string;
    billing_address?: {
        street?: string;
        city?: string;
        state?: string;
        pincode?: string;
    };
    shipping_address?: {
        street?: string;
        city?: string;
        state?: string;
        pincode?: string;
    } | null;
    // B2B contact person (embedded)
    contact_person?: {
        name: string;
        phone?: string;
        email?: string;
    } | null;
    // Compliance fields
    pan_number?: string;
    drug_license_number?: string;
}

// ==================== SERVICE CLASS ====================

class LocalSearchService {
    private initialized: boolean = false;

    /**
     * Ensure IndexedDB is initialized before searching
     */
    private async ensureInitialized(): Promise<void> {
        if (!this.initialized) {
            await offlineDB.init();
            this.initialized = true;
        }
    }

    /**
     * Search products in IndexedDB (instant, <50ms)
     * 
     * @param query - Search term (min 2 characters)
     * @param options - Search options (limit)
     * @returns Array of matching products with embedded batches
     */
    async searchProducts(query: string, options: SearchOptions = {}): Promise<ProductSearchResult[]> {
        const { limit = 20 } = options;

        await this.ensureInitialized();

        if (!query || query.length < 2) {
            return [];
        }

        const searchTerm = query.toLowerCase();

        try {
            const allProducts = await offlineDB.getAll('products');

            // If cache is empty, fallback to cloud API
            if (allProducts.length === 0) {
                console.log('[LocalSearch] No products in cache, falling back to API...');
                return this.searchProductsFromCloud(query, limit);
            }

            console.log(`[LocalSearch] ⚡ Searching ${allProducts.length} products for: "${query}"`);

            // Multi-field fuzzy search
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
            const seen = new Set<string>();
            const uniqueMatches = matches.filter((product: any) => {
                const key = String(product.product_id || product.id);
                if (seen.has(key)) return false;
                seen.add(key);
                return true;
            });

            const results = uniqueMatches.slice(0, limit);
            console.log(`[LocalSearch] ⚡ Found ${results.length} products`);

            return results;
        } catch (error) {
            console.error('[LocalSearch] Product search failed:', error);
            // Fallback to cloud on error
            return this.searchProductsFromCloud(query, limit);
        }
    }

    /**
     * Fallback: Search products from cloud API
     */
    private async searchProductsFromCloud(query: string, limit: number): Promise<ProductSearchResult[]> {
        try {
            const { productAPI } = await import('../../api');
            const response = await productAPI.search(query, { limit });
            const products = response.data?.products || response.data || [];
            console.log(`[LocalSearch] ☁️ Found ${products.length} products from API`);
            return products;
        } catch (error) {
            console.error('[LocalSearch] Cloud search failed:', error);
            return [];
        }
    }

    /**
     * Search customers in IndexedDB (instant)
     * 
     * @param query - Search term (min 2 characters)
     * @param options - Search options (limit)
     * @returns Array of matching customers
     */
    async searchCustomers(query: string, options: SearchOptions = {}): Promise<CustomerSearchResult[]> {
        const { limit = 20 } = options;

        await this.ensureInitialized();

        if (!query || query.length < 2) {
            return [];
        }

        const searchTerm = query.toLowerCase();
        const phoneDigits = query.replace(/\D/g, '');

        try {
            const allCustomers = await offlineDB.getAll('customers');

            // If cache is empty, fallback to cloud API
            if (allCustomers.length === 0) {
                console.log('[LocalSearch] No customers in cache, falling back to API...');
                return this.searchCustomersFromCloud(query, limit);
            }

            console.log(`[LocalSearch] ⚡ Searching ${allCustomers.length} customers for: "${query}"`);

            // Multi-field search
            const matches = allCustomers.filter((customer: any) => {
                return (
                    (customer._search_name?.includes(searchTerm) || false) ||
                    (customer._search_phone?.includes(phoneDigits) || false) ||
                    (customer._search_gst?.includes(searchTerm) || false) ||
                    // Fallback for legacy data
                    (customer.customer_name?.toLowerCase().includes(searchTerm) || false) ||
                    (customer.name?.toLowerCase().includes(searchTerm) || false) ||
                    (customer.primary_phone?.includes(phoneDigits) || false) ||
                    (customer.phone?.includes(phoneDigits) || false)
                );
            });

            // Sort by relevance
            matches.sort((a: any, b: any) => {
                const aExact = a._search_name === searchTerm || a._search_phone === phoneDigits;
                const bExact = b._search_name === searchTerm || b._search_phone === phoneDigits;
                if (aExact && !bExact) return -1;
                if (!aExact && bExact) return 1;
                return 0;
            });

            // Deduplicate
            const seen = new Set<string>();
            const uniqueMatches = matches.filter((customer: any) => {
                const key = String(customer.customer_id || customer.id);
                if (seen.has(key)) return false;
                seen.add(key);
                return true;
            });

            const results = uniqueMatches.slice(0, limit);
            console.log(`[LocalSearch] ⚡ Found ${results.length} customers`);

            return results;
        } catch (error) {
            console.error('[LocalSearch] Customer search failed:', error);
            // Fallback to cloud on error
            return this.searchCustomersFromCloud(query, limit);
        }
    }

    /**
     * Fallback: Search customers from cloud API
     */
    private async searchCustomersFromCloud(query: string, limit: number): Promise<CustomerSearchResult[]> {
        try {
            const { customersApi } = await import('../../api');
            const response = await customersApi.search(query, { limit });
            const customers = response.data?.customers || response.data || [];
            console.log(`[LocalSearch] ☁️ Found ${customers.length} customers from API`);
            return customers;
        } catch (error) {
            console.error('[LocalSearch] Cloud customer search failed:', error);
            return [];
        }
    }

    /**
     * Get product count in cache
     */
    async getProductCount(): Promise<number> {
        await this.ensureInitialized();
        const products = await offlineDB.getAll('products');
        return products.length;
    }

    /**
     * Get customer count in cache
     */
    async getCustomerCount(): Promise<number> {
        await this.ensureInitialized();
        const customers = await offlineDB.getAll('customers');
        return customers.length;
    }

    /**
     * Check if cache has data
     */
    async hasCachedData(): Promise<{ products: boolean; customers: boolean }> {
        await this.ensureInitialized();
        const productCount = await this.getProductCount();
        const customerCount = await this.getCustomerCount();
        return {
            products: productCount > 0,
            customers: customerCount > 0
        };
    }
}

// Export singleton instance
const localSearchService = new LocalSearchService();
export default localSearchService;
