/**
 * Sync API Module
 * Handles full data synchronization for offline support
 */
import { apiHelpers } from '../../apiClient';

const ENDPOINTS = {
    FULL_DATA: '/sync/full-data'
};

export const syncApi = {
    /**
     * Get full data payload for offline initialization
     * Downloads products, batches, customers, etc.
     */
    getFullData: () => {
        return apiHelpers.get(ENDPOINTS.FULL_DATA);
    }
};
