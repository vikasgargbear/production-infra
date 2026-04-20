/**
 * Returns Data Service - Optimistic data layer for returns
 */

import offlineDB from '../../core/offlineDatabase';
import { returnsMemoryCache } from './ReturnsMemoryCache';
import type { OfflineSalesReturn, OfflinePurchaseReturn } from '../../types/returns.types';

class ReturnsDataService {
    async getSalesReturn(returnId: string): Promise<OfflineSalesReturn | null> {
        const cached = returnsMemoryCache.getSalesReturn(returnId);
        if (cached) return { ...cached };

        try {
            const ret = await offlineDB.get('sales_returns', returnId);
            return ret ? { ...ret } as OfflineSalesReturn : null;
        } catch (error) {
            console.error('[ReturnsData] Failed to get sales return:', error);
            return null;
        }
    }

    async saveSalesReturn(returnData: Partial<OfflineSalesReturn>): Promise<string> {
        const tempId = `temp_sret_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        const salesReturn: OfflineSalesReturn = {
            temp_id: tempId,
            return_id: tempId,
            return_number: `SRET-OFFLINE-${Date.now().toString(36).toUpperCase()}`,
            customer_id: '',
            customer_name: '',
            return_date: new Date().toISOString().split('T')[0],
            items: [],
            subtotal: 0,
            discount_amount: 0,
            tax_amount: 0,
            total_amount: 0,
            payment_method: 'cash',
            payment_status: 'pending',
            refund_amount: 0,
            reason: '',
            status: 'draft',
            sync_status: 'pending',
            created_offline: true,
            ...returnData
        };

        try {
            await offlineDB.add('sales_returns', salesReturn);
            await offlineDB.addToSyncQueue('sales_returns', tempId, 'create', salesReturn as unknown as null);
            console.log('[ReturnsData] ✅ Sales return saved optimistically:', tempId);
        } catch (error) {
            console.error('[ReturnsData] Failed to save sales return:', error);
        }

        return tempId;
    }

    async savePurchaseReturn(returnData: Partial<OfflinePurchaseReturn>): Promise<string> {
        const tempId = `temp_pret_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        const purchaseReturn: OfflinePurchaseReturn = {
            temp_id: tempId,
            return_id: tempId,
            return_number: `PRET-OFFLINE-${Date.now().toString(36).toUpperCase()}`,
            supplier_id: '',
            supplier_name: '',
            return_date: new Date().toISOString().split('T')[0],
            items: [],
            subtotal: 0,
            tax_amount: 0,
            total_amount: 0,
            reason: '',
            status: 'draft',
            sync_status: 'pending',
            created_offline: true,
            ...returnData
        };

        try {
            await offlineDB.add('purchase_returns', purchaseReturn);
            await offlineDB.addToSyncQueue('purchase_returns', tempId, 'create', purchaseReturn as unknown as null);
            console.log('[ReturnsData] ✅ Purchase return saved optimistically:', tempId);
        } catch (error) {
            console.error('[ReturnsData] Failed to save purchase return:', error);
        }

        return tempId;
    }
}

export const returnsDataService = new ReturnsDataService();
export default returnsDataService;
