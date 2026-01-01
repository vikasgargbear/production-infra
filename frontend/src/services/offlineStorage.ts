/**
 * DEPRECATED STUB - Temporary compatibility layer
 * TODO: Migrate all usages to offlineDB directly
 * 
 * Files still using this stub:
 * - CreditManagement.js (4 usages)
 * - GSTDashboard.tsx (1 usage)
 * And possibly others
 */

import offlineDB from './offline/core/offlineDatabase';

const offlineStorage = {
    async storeOffline(key: string, data: any, options?: any): Promise<void> {
        try {
            await offlineDB.setCache(key, data);
        } catch (e) {
            console.warn('[offlineStorage stub] storeOffline failed:', e);
        }
    },

    async getOffline(key: string, options?: any): Promise<any> {
        try {
            return await offlineDB.getCache(key);
        } catch (e) {
            console.warn('[offlineStorage stub] getOffline failed:', e);
            return null;
        }
    },

    isDataStale(data: { timestamp?: number }, maxAgeMinutes: number = 60): boolean {
        if (!data?.timestamp) return true;
        const age = (Date.now() - data.timestamp) / 1000 / 60;
        return age > maxAgeMinutes;
    },

    async queueOfflineOperation(operation: any): Promise<void> {
        try {
            await offlineDB.addToSyncQueue(
                operation.type || 'unknown',
                operation.id || Date.now(),
                operation.action || 'create',
                operation.data || operation
            );
        } catch (e) {
            console.warn('[offlineStorage stub] queueOfflineOperation failed:', e);
        }
    },

    async clearOldData(hours?: number): Promise<void> {
        // No-op
    }
};

export default offlineStorage;
