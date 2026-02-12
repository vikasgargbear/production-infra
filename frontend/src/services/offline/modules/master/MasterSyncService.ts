/**
 * Master Sync Service - Sync orchestration for master data
 */

import { BaseSyncService } from '../../core/BaseSyncService';
import offlineDB from '../../core/offlineDatabase';
import { masterMemoryCache } from './MasterMemoryCache';
import type { OfflineEmployee, OfflineWarehouse, OfflineCategory, OfflineManufacturer, MasterSyncState } from '../../types/master.types';

class MasterSyncService extends BaseSyncService<MasterSyncState> {
    protected readonly logPrefix = '[MasterSync]';

    constructor() {
        super({ phase: 'idle', progress: 0, isReady: false, lastSync: null, error: null });
    }

    protected async warmCache(): Promise<void> {
        const [employees, warehouses, categories, manufacturers] = await Promise.all([
            offlineDB.getAll('employees'),
            offlineDB.getAll('warehouses'),
            offlineDB.getAll('categories'),
            offlineDB.getAll('manufacturers')
        ]);

        masterMemoryCache.warmCache(
            (employees || []) as OfflineEmployee[],
            (warehouses || []) as OfflineWarehouse[],
            (categories || []) as OfflineCategory[],
            (manufacturers || []) as OfflineManufacturer[]
        );

        console.log('[MasterSync] Cache warmed');
    }

    protected onStop(): void {
        masterMemoryCache.clear();
    }
}

export const masterSyncService = new MasterSyncService();
export default masterSyncService;
