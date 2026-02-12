/**
 * Returns Sync Service - Sync orchestration
 */

import { BaseSyncService } from '../../core/BaseSyncService';
import offlineDB from '../../core/offlineDatabase';
import { returnsMemoryCache } from './ReturnsMemoryCache';
import type { OfflineSalesReturn, OfflinePurchaseReturn, ReturnsSyncState } from '../../types/returns.types';

class ReturnsSyncService extends BaseSyncService<ReturnsSyncState> {
    protected readonly logPrefix = '[ReturnsSync]';

    constructor() {
        super({ phase: 'idle', progress: 0, isReady: false, lastSync: null, error: null });
    }

    protected async warmCache(): Promise<void> {
        const [salesReturns, purchaseReturns] = await Promise.all([
            offlineDB.getAll('sales_returns'),
            offlineDB.getAll('purchase_returns')
        ]);

        returnsMemoryCache.warmCache(
            (salesReturns || []) as OfflineSalesReturn[],
            (purchaseReturns || []) as OfflinePurchaseReturn[]
        );

        console.log('[ReturnsSync] Cache warmed');
    }

    protected onStop(): void {
        returnsMemoryCache.clear();
    }
}

export const returnsSyncService = new ReturnsSyncService();
export default returnsSyncService;
