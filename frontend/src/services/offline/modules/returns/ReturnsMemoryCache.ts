/**
 * Returns Memory Cache - O(1) lookups for sales/purchase returns
 */

import type { OfflineSalesReturn, OfflinePurchaseReturn } from '../../types/returns.types';

class ReturnsMemoryCache {
    private salesReturns = new Map<string, OfflineSalesReturn>();
    private purchaseReturns = new Map<string, OfflinePurchaseReturn>();
    private salesReturnsByCustomer = new Map<string, OfflineSalesReturn[]>();
    private purchaseReturnsBySupplier = new Map<string, OfflinePurchaseReturn[]>();

    private isWarmed = false;

    warmCache(salesReturns: OfflineSalesReturn[], purchaseReturns: OfflinePurchaseReturn[]): void {
        this.clear();

        for (const ret of salesReturns) {
            const id = String(ret.return_id);
            this.salesReturns.set(id, ret);

            const customerId = String(ret.customer_id);
            const existing = this.salesReturnsByCustomer.get(customerId) || [];
            existing.push(ret);
            this.salesReturnsByCustomer.set(customerId, existing);
        }

        for (const ret of purchaseReturns) {
            const id = String(ret.return_id);
            this.purchaseReturns.set(id, ret);

            const supplierId = String(ret.supplier_id);
            const existing = this.purchaseReturnsBySupplier.get(supplierId) || [];
            existing.push(ret);
            this.purchaseReturnsBySupplier.set(supplierId, existing);
        }

        this.isWarmed = true;
        console.log(`[ReturnsCache] ✅ Warmed: ${salesReturns.length} sales, ${purchaseReturns.length} purchase returns`);
    }

    getSalesReturn(id: string): OfflineSalesReturn | null {
        return this.salesReturns.get(String(id)) || null;
    }

    getPurchaseReturn(id: string): OfflinePurchaseReturn | null {
        return this.purchaseReturns.get(String(id)) || null;
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
        this.isWarmed = false;
    }

    isReady(): boolean {
        return this.isWarmed;
    }
}

export const returnsMemoryCache = new ReturnsMemoryCache();
export default returnsMemoryCache;
