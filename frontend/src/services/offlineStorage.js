/**
 * DEPRECATED STUB - DO NOT USE IN NEW CODE
 * 
 * This file exists only to prevent build failures from legacy components.
 * All new code should use:
 * - offlineDB.setCache() / getCache() for simple caching
 * - offlineDB.addToSyncQueue() for operation queueing
 * 
 * Components still using this stub:
 * - NotificationCenter.js
 * - PaymentTracking.js
 * - PaymentDashboard.js
 * - CreditManagement.js
 * - CustomerCreationB2B.js
 * - CustomerCreationB2C.js
 * - EnhancedStockAdjustmentFlow.js
 * - PurchaseReturnFlowV2.js
 * - SalesReturnFlow.js
 * - PaymentEntryModal.js
 * - BatchesInventory.js
 */

import offlineDB from './offline/core/offlineDatabase';

const offlineStorage = {
    // Stub methods that delegate to modern offlineDB
    async storeOffline(key, data, options = {}) {
        console.warn(`[offlineStorage DEPRECATED] storeOffline('${key}') - migrate to offlineDB.setCache()`);
        try {
            await offlineDB.setCache(key, data);
        } catch (e) {
            console.warn('[offlineStorage] storeOffline failed:', e.message);
        }
    },

    async getOffline(key, options = {}) {
        console.warn(`[offlineStorage DEPRECATED] getOffline('${key}') - migrate to offlineDB.getCache()`);
        try {
            return await offlineDB.getCache(key);
        } catch (e) {
            console.warn('[offlineStorage] getOffline failed:', e.message);
            return null;
        }
    },

    isDataStale(data, maxAgeMinutes = 60) {
        if (!data?.timestamp) return true;
        const age = (Date.now() - data.timestamp) / 1000 / 60;
        return age > maxAgeMinutes;
    },

    async queueOfflineOperation(operation) {
        console.warn(`[offlineStorage DEPRECATED] queueOfflineOperation - migrate to offlineDB.addToSyncQueue()`);
        try {
            await offlineDB.addToSyncQueue(
                operation.type || 'unknown',
                operation.id || Date.now(),
                operation.action || 'create',
                operation.data || operation
            );
        } catch (e) {
            console.warn('[offlineStorage] queueOfflineOperation failed:', e.message);
        }
    },

    async clearOldData(maxAgeHours = 24) {
        // No-op - let offlineDB manage its own cleanup
        console.warn('[offlineStorage DEPRECATED] clearOldData - no-op in stub');
    }
};

export default offlineStorage;
