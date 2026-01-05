/**
 * Sync API Module
 * Handles data synchronization for offline support
 * 
 * Endpoints:
 * - getFullData(): Initial full sync (after login)
 * - getDelta(): Incremental sync (changed records since timestamp)
 * - getTableDelta(): Sync specific table only
 * - getStatus(): Check if sync is needed
 */
import { apiHelpers } from '../../apiClient';

const ENDPOINTS = {
    FULL_DATA: '/sync/full-data',
    DELTA: '/sync/delta',
    STATUS: '/sync/status'
};

export interface DeltaSyncResponse {
    sync_timestamp: string;
    sync_type: 'delta';
    since: string;
    changes: {
        products?: any[];
        batches?: any[];
        customers?: any[];
        suppliers?: any[];
        employees?: any[];
    };
    deactivated: {
        products?: number[];
        batches?: number[];
        customers?: number[];
    };
    counts: {
        products?: number;
        batches?: number;
        customers?: number;
        suppliers?: number;
        employees?: number;
    };
}

export interface SyncStatusResponse {
    products_latest: string | null;
    batches_latest: string | null;
    customers_latest: string | null;
    server_time: string;
}

export const syncApi = {
    /**
     * Get full data payload for offline initialization
     * Downloads products, batches, customers, etc.
     * Call ONCE after login
     */
    getFullData: () => {
        return apiHelpers.get(ENDPOINTS.FULL_DATA);
    },

    /**
     * Get delta/incremental changes since last sync
     * Much faster than full sync - only returns changed records
     * 
     * @param since - ISO timestamp from previous sync
     * @param tables - Optional comma-separated table names to sync
     */
    getDelta: (since: string, tables?: string) => {
        const params: Record<string, string> = { since };
        if (tables) {
            params.tables = tables;
        }
        return apiHelpers.get<DeltaSyncResponse>(ENDPOINTS.DELTA, { params });
    },

    /**
     * Get delta for specific table only
     * Use after specific actions:
     * - After invoice: syncTable('batches,products')
     * - After GRN: syncTable('batches,products') 
     * - After customer created: syncTable('customers')
     */
    getTableDelta: (table: string, since: string) => {
        return apiHelpers.get<DeltaSyncResponse>(`${ENDPOINTS.DELTA}/${table}`, {
            params: { since }
        });
    },

    /**
     * Get sync status - latest update times for each table
     * Use to check if local data is stale
     */
    getStatus: () => {
        return apiHelpers.get<SyncStatusResponse>(ENDPOINTS.STATUS);
    }
};
