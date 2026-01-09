/**
 * Purchase Memory Cache
 * 
 * High-performance O(1) in-memory cache for suppliers and purchase data.
 * Same architecture as SalesMemoryCache:
 * - HashMap primary indices
 * - Secondary indices for phone/GST lookup
 * - Pre-computed search fields
 * - Sub-5ms search performance
 */

import type {
    OfflineSupplier,
    OfflinePurchaseOrder,
    OfflineGRN
} from '../../types/purchase.types';

// ============================================
// TYPES
// ============================================

interface CacheMetrics {
    suppliers: number;
    purchaseOrders: number;
    grns: number;
    lastWarmup: string | null;
    warmupTimeMs: number;
}

// ============================================
// PURCHASE MEMORY CACHE
// ============================================

class PurchaseMemoryCache {
    // Primary indices (O(1) lookup)
    private suppliers = new Map<string, OfflineSupplier>();
    private purchaseOrders = new Map<string, OfflinePurchaseOrder>();
    private grns = new Map<string, OfflineGRN>();

    // Secondary indices
    private suppliersByPhone = new Map<string, OfflineSupplier>();
    private suppliersByGST = new Map<string, OfflineSupplier>();
    private posBySupplier = new Map<string, OfflinePurchaseOrder[]>();

    // Cache state
    private isWarmed = false;
    private warmupTimestamp: string | null = null;
    private warmupDurationMs = 0;

    // ============================================
    // WARMUP
    // ============================================

    /**
     * Warm cache from IndexedDB data
     * Target: < 200ms for 1000+ suppliers
     */
    warmCache(
        suppliers: OfflineSupplier[],
        purchaseOrders: OfflinePurchaseOrder[] = [],
        grns: OfflineGRN[] = []
    ): void {
        const start = performance.now();

        // Clear existing
        this.clear();

        // Index suppliers
        for (const supplier of suppliers) {
            const id = String(supplier.supplier_id);

            // Pre-compute search fields
            supplier._search_name = supplier.supplier_name.toLowerCase();
            supplier._search_phone = supplier.primary_phone?.replace(/\D/g, '') || '';

            // Primary index
            this.suppliers.set(id, supplier);

            // Secondary indices
            if (supplier.primary_phone) {
                const cleanPhone = supplier.primary_phone.replace(/\D/g, '');
                this.suppliersByPhone.set(cleanPhone, supplier);
            }
            if (supplier.gst_number) {
                this.suppliersByGST.set(supplier.gst_number.toUpperCase(), supplier);
            }
        }

        // Index purchase orders
        for (const po of purchaseOrders) {
            const id = String(po.purchase_order_id);
            this.purchaseOrders.set(id, po);

            // Group by supplier
            const supplierId = String(po.supplier_id);
            const existing = this.posBySupplier.get(supplierId) || [];
            existing.push(po);
            this.posBySupplier.set(supplierId, existing);
        }

        // Index GRNs
        for (const grn of grns) {
            const id = String(grn.grn_id);
            this.grns.set(id, grn);
        }

        this.isWarmed = true;
        this.warmupTimestamp = new Date().toISOString();
        this.warmupDurationMs = performance.now() - start;

        console.log(`[PurchaseCache] ✅ Warmed: ${suppliers.length} suppliers, ${purchaseOrders.length} POs, ${grns.length} GRNs in ${this.warmupDurationMs.toFixed(1)}ms`);
    }

    // ============================================
    // SUPPLIER LOOKUPS
    // ============================================

    /**
     * Get supplier by ID - O(1)
     */
    getSupplier(supplierId: string): OfflineSupplier | null {
        return this.suppliers.get(String(supplierId)) || null;
    }

    /**
     * Get supplier by phone - O(1)
     */
    getSupplierByPhone(phone: string): OfflineSupplier | null {
        const cleanPhone = phone.replace(/\D/g, '');
        return this.suppliersByPhone.get(cleanPhone) || null;
    }

    /**
     * Get supplier by GST - O(1)
     */
    getSupplierByGST(gstNumber: string): OfflineSupplier | null {
        return this.suppliersByGST.get(gstNumber.toUpperCase()) || null;
    }

    /**
     * Search suppliers - O(n) but with early exit
     * Target: < 5ms for 1000+ suppliers
     */
    searchSuppliers(query: string, limit = 20): OfflineSupplier[] {
        if (!query || query.length < 2) return [];

        const lowerQuery = query.toLowerCase();
        const results: OfflineSupplier[] = [];

        for (const supplier of this.suppliers.values()) {
            // Check pre-computed search fields
            if (
                supplier._search_name?.includes(lowerQuery) ||
                supplier._search_phone?.includes(query.replace(/\D/g, ''))
            ) {
                results.push({ ...supplier }); // Return copy
                if (results.length >= limit) break; // Early exit
            }
        }

        return results;
    }

    /**
     * Get all suppliers (paginated)
     */
    getAllSuppliers(offset = 0, limit = 100): OfflineSupplier[] {
        const all = Array.from(this.suppliers.values());
        return all.slice(offset, offset + limit).map(s => ({ ...s }));
    }

    // ============================================
    // PURCHASE ORDER LOOKUPS
    // ============================================

    /**
     * Get purchase order by ID - O(1)
     */
    getPurchaseOrder(poId: string): OfflinePurchaseOrder | null {
        return this.purchaseOrders.get(String(poId)) || null;
    }

    /**
     * Get purchase orders by supplier - O(1)
     */
    getPurchaseOrdersBySupplier(supplierId: string): OfflinePurchaseOrder[] {
        return (this.posBySupplier.get(String(supplierId)) || []).map(po => ({ ...po }));
    }

    /**
     * Get all purchase orders (paginated)
     */
    getAllPurchaseOrders(offset = 0, limit = 50): OfflinePurchaseOrder[] {
        const all = Array.from(this.purchaseOrders.values());
        return all.slice(offset, offset + limit).map(po => ({ ...po }));
    }

    // ============================================
    // GRN LOOKUPS
    // ============================================

    /**
     * Get GRN by ID - O(1)
     */
    getGRN(grnId: string): OfflineGRN | null {
        return this.grns.get(String(grnId)) || null;
    }

    // ============================================
    // CACHE UPDATES
    // ============================================

    /**
     * Add/update supplier in cache
     */
    upsertSupplier(supplier: OfflineSupplier): void {
        const id = String(supplier.supplier_id);

        // Pre-compute search fields
        supplier._search_name = supplier.supplier_name.toLowerCase();
        supplier._search_phone = supplier.primary_phone?.replace(/\D/g, '') || '';

        this.suppliers.set(id, supplier);

        if (supplier.primary_phone) {
            this.suppliersByPhone.set(supplier.primary_phone.replace(/\D/g, ''), supplier);
        }
        if (supplier.gst_number) {
            this.suppliersByGST.set(supplier.gst_number.toUpperCase(), supplier);
        }
    }

    /**
     * Add/update purchase order in cache
     */
    upsertPurchaseOrder(po: OfflinePurchaseOrder): void {
        const id = String(po.purchase_order_id);
        this.purchaseOrders.set(id, po);

        const supplierId = String(po.supplier_id);
        const existing = this.posBySupplier.get(supplierId) || [];
        const index = existing.findIndex(p => String(p.purchase_order_id) === id);
        if (index >= 0) {
            existing[index] = po;
        } else {
            existing.push(po);
        }
        this.posBySupplier.set(supplierId, existing);
    }

    /**
     * Add/update GRN in cache
     */
    upsertGRN(grn: OfflineGRN): void {
        const id = String(grn.grn_id);
        this.grns.set(id, grn);
    }

    // ============================================
    // CACHE MANAGEMENT
    // ============================================

    /**
     * Clear all cache data
     */
    clear(): void {
        this.suppliers.clear();
        this.purchaseOrders.clear();
        this.grns.clear();
        this.suppliersByPhone.clear();
        this.suppliersByGST.clear();
        this.posBySupplier.clear();
        this.isWarmed = false;
    }

    /**
     * Check if cache is ready
     */
    isReady(): boolean {
        return this.isWarmed;
    }

    /**
     * Get cache metrics
     */
    getMetrics(): CacheMetrics {
        return {
            suppliers: this.suppliers.size,
            purchaseOrders: this.purchaseOrders.size,
            grns: this.grns.size,
            lastWarmup: this.warmupTimestamp,
            warmupTimeMs: this.warmupDurationMs
        };
    }
}

// Singleton instance
export const purchaseMemoryCache = new PurchaseMemoryCache();
export default purchaseMemoryCache;
