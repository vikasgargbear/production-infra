/**
 * Offline Save Helpers
 * 
 * Shared utilities for offline-first save patterns across sales modules.
 * Used by invoice, challan, and order save hooks.
 */

import offlineDB from '../../../services/offline/core/offlineDatabase';
import { BaseLineItem } from '../types/salesSharedTypes';

/**
 * Generate a temporary local ID for offline-first saves
 * 
 * @returns Temporary ID string (e.g., "LOCAL_1704205234567_abc123")
 */
export const generateTempId = (): string => {
    return `LOCAL_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};

/**
 * Deduct stock locally from IndexedDB for offline-first saves
 * 
 * @param items - Line items to deduct stock for
 */
export const deductStockLocally = async (items: BaseLineItem[]): Promise<void> => {
    const stockDeductions = items
        .filter(item => item.batch_id && item.quantity > 0)
        .map(item => ({
            product_id: item.product_id,
            batch_id: item.batch_id!,
            quantity: parseFloat(String(item.quantity)) + parseFloat(String(item.free_quantity || 0))
        }));

    if (stockDeductions.length > 0) {
        await offlineDB.deductStockLocally(stockDeductions);
        console.log(`[OfflineSave] ✅ Deducted stock for ${stockDeductions.length} items`);
    }
};

/**
 * Prepare offline document data with common fields
 * 
 * @param data - Document data
 * @param tempId - Temporary local ID
 * @param documentNumber - Generated document number
 * @returns Data with offline metadata
 */
export const prepareOfflineDocument = <T extends Record<string, any>>(
    data: T,
    tempId: string,
    documentNumber: string
): T & { temp_id: string; _localId: string; sync_status: string; created_offline: boolean } => {
    return {
        ...data,
        temp_id: tempId,
        _localId: tempId,
        sync_status: 'pending',
        created_offline: true
    };
};
