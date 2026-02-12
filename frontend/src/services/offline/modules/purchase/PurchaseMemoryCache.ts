/**
 * Purchase Memory Cache
 *
 * High-performance O(1) in-memory cache for suppliers and purchase data.
 * Uses GenericCollectionCache for primary indices.
 */

import { GenericCollectionCache } from '../../core/GenericCollectionCache';
import type {
    OfflineSupplier,
    OfflinePurchaseOrder,
    OfflineGRN
} from '../../types/purchase.types';

interface CacheMetrics {
    suppliers: number;
    purchaseOrders: number;
    grns: number;
    lastWarmup: string | null;
    warmupTimeMs: number;
}

class PurchaseMemoryCache {
    private suppliers = new GenericCollectionCache<OfflineSupplier>({
        idField: 'supplier_id',
        searchFields: ['supplier_name']
    });
    private purchaseOrders = new GenericCollectionCache<OfflinePurchaseOrder>({ idField: 'purchase_order_id' });
    private grns = new GenericCollectionCache<OfflineGRN>({ idField: 'grn_id' });

    // Secondary indices
    private suppliersByPhone = new Map<string, OfflineSupplier>();
    private suppliersByGST = new Map<string, OfflineSupplier>();
    private posBySupplier = new Map<string, OfflinePurchaseOrder[]>();

    private warmupTimestamp: string | null = null;
    private warmupDurationMs = 0;

    warmCache(
        suppliers: OfflineSupplier[],
        purchaseOrders: OfflinePurchaseOrder[] = [],
        grns: OfflineGRN[] = []
    ): void {
        const start = performance.now();
        this.clear();

        // Pre-compute phone search field
        for (const supplier of suppliers) {
            supplier._search_phone = supplier.primary_phone?.replace(/\D/g, '') || '';
        }

        this.suppliers.warmCache(suppliers);
        this.purchaseOrders.warmCache(purchaseOrders);
        this.grns.warmCache(grns);

        // Build secondary indices
        for (const supplier of suppliers) {
            if (supplier.primary_phone) {
                this.suppliersByPhone.set(supplier.primary_phone.replace(/\D/g, ''), supplier);
            }
            if (supplier.gst_number) {
                this.suppliersByGST.set(supplier.gst_number.toUpperCase(), supplier);
            }
        }

        for (const po of purchaseOrders) {
            const supplierId = String(po.supplier_id);
            const existing = this.posBySupplier.get(supplierId) || [];
            existing.push(po);
            this.posBySupplier.set(supplierId, existing);
        }

        this.warmupTimestamp = new Date().toISOString();
        this.warmupDurationMs = performance.now() - start;

        console.log(`[PurchaseCache] ✅ Warmed: ${suppliers.length} suppliers, ${purchaseOrders.length} POs, ${grns.length} GRNs in ${this.warmupDurationMs.toFixed(1)}ms`);
    }

    // Supplier lookups
    getSupplier(supplierId: string): OfflineSupplier | null { return this.suppliers.get(supplierId); }
    getSupplierByPhone(phone: string): OfflineSupplier | null {
        return this.suppliersByPhone.get(phone.replace(/\D/g, '')) || null;
    }
    getSupplierByGST(gstNumber: string): OfflineSupplier | null {
        return this.suppliersByGST.get(gstNumber.toUpperCase()) || null;
    }

    searchSuppliers(query: string, limit = 20): OfflineSupplier[] {
        if (!query || query.length < 2) return [];
        const lowerQuery = query.toLowerCase();
        const results: OfflineSupplier[] = [];

        for (const supplier of this.suppliers.values()) {
            if (
                supplier._search_name?.includes(lowerQuery) ||
                supplier._search_phone?.includes(query.replace(/\D/g, ''))
            ) {
                results.push({ ...supplier });
                if (results.length >= limit) break;
            }
        }

        return results;
    }

    getAllSuppliers(offset = 0, limit = 100): OfflineSupplier[] {
        return this.suppliers.getAll().slice(offset, offset + limit).map(s => ({ ...s }));
    }

    // Purchase order lookups
    getPurchaseOrder(poId: string): OfflinePurchaseOrder | null { return this.purchaseOrders.get(poId); }
    getPurchaseOrdersBySupplier(supplierId: string): OfflinePurchaseOrder[] {
        return (this.posBySupplier.get(String(supplierId)) || []).map(po => ({ ...po }));
    }
    getAllPurchaseOrders(offset = 0, limit = 50): OfflinePurchaseOrder[] {
        return this.purchaseOrders.getAll().slice(offset, offset + limit).map(po => ({ ...po }));
    }

    // GRN lookups
    getGRN(grnId: string): OfflineGRN | null { return this.grns.get(grnId); }

    // Upserts
    upsertSupplier(supplier: OfflineSupplier): void {
        supplier._search_phone = supplier.primary_phone?.replace(/\D/g, '') || '';
        this.suppliers.upsert(supplier);
        if (supplier.primary_phone) {
            this.suppliersByPhone.set(supplier.primary_phone.replace(/\D/g, ''), supplier);
        }
        if (supplier.gst_number) {
            this.suppliersByGST.set(supplier.gst_number.toUpperCase(), supplier);
        }
    }

    upsertPurchaseOrder(po: OfflinePurchaseOrder): void {
        this.purchaseOrders.upsert(po);
        const supplierId = String(po.supplier_id);
        const existing = this.posBySupplier.get(supplierId) || [];
        const index = existing.findIndex(p => String(p.purchase_order_id) === String(po.purchase_order_id));
        if (index >= 0) {
            existing[index] = po;
        } else {
            existing.push(po);
        }
        this.posBySupplier.set(supplierId, existing);
    }

    upsertGRN(grn: OfflineGRN): void {
        this.grns.upsert(grn);
    }

    clear(): void {
        this.suppliers.clear();
        this.purchaseOrders.clear();
        this.grns.clear();
        this.suppliersByPhone.clear();
        this.suppliersByGST.clear();
        this.posBySupplier.clear();
    }

    isReady(): boolean { return this.suppliers.isReady(); }

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

export const purchaseMemoryCache = new PurchaseMemoryCache();
export default purchaseMemoryCache;
