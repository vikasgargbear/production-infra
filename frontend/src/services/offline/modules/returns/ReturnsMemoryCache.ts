/**
 * Returns Memory Cache - O(1) lookups for sales/purchase returns
 */

import { GenericCollectionCache } from '../../core/GenericCollectionCache';
import type { OfflineSalesReturn, OfflinePurchaseReturn } from '../../types/returns.types';

class ReturnsMemoryCache {
    private salesReturns = new GenericCollectionCache<OfflineSalesReturn>({ idField: 'return_id' });
    private purchaseReturns = new GenericCollectionCache<OfflinePurchaseReturn>({ idField: 'return_id' });
    private salesReturnsByCustomer = new Map<string, OfflineSalesReturn[]>();
    private purchaseReturnsBySupplier = new Map<string, OfflinePurchaseReturn[]>();

    warmCache(salesReturns: OfflineSalesReturn[], purchaseReturns: OfflinePurchaseReturn[]): void {
        this.salesReturns.warmCache(salesReturns);
        this.purchaseReturns.warmCache(purchaseReturns);

        this.salesReturnsByCustomer.clear();
        for (const ret of salesReturns) {
            const customerId = String(ret.customer_id);
            const existing = this.salesReturnsByCustomer.get(customerId) || [];
            existing.push(ret);
            this.salesReturnsByCustomer.set(customerId, existing);
        }

        this.purchaseReturnsBySupplier.clear();
        for (const ret of purchaseReturns) {
            const supplierId = String(ret.supplier_id);
            const existing = this.purchaseReturnsBySupplier.get(supplierId) || [];
            existing.push(ret);
            this.purchaseReturnsBySupplier.set(supplierId, existing);
        }

        console.log(`[ReturnsCache] ✅ Warmed: ${salesReturns.length} sales, ${purchaseReturns.length} purchase returns`);
    }

    getSalesReturn(id: string): OfflineSalesReturn | null {
        return this.salesReturns.get(id);
    }

    getPurchaseReturn(id: string): OfflinePurchaseReturn | null {
        return this.purchaseReturns.get(id);
    }

    getSalesReturnsByCustomer(customerId: string): OfflineSalesReturn[] {
        return (this.salesReturnsByCustomer.get(String(customerId)) || []).map(r => ({ ...r }));
    }

    getPurchaseReturnsBySupplier(supplierId: string): OfflinePurchaseReturn[] {
        return (this.purchaseReturnsBySupplier.get(String(supplierId)) || []).map(r => ({ ...r }));
    }

    clear(): void {
        this.salesReturns.clear();
        this.purchaseReturns.clear();
        this.salesReturnsByCustomer.clear();
        this.purchaseReturnsBySupplier.clear();
    }

    isReady(): boolean {
        return this.salesReturns.isReady();
    }
}

export const returnsMemoryCache = new ReturnsMemoryCache();
export default returnsMemoryCache;
