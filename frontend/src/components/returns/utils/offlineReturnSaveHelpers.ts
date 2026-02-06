/**
 * Offline Return Save Helpers
 * 
 * Utilities for offline-first return creation, mirroring invoice pattern.
 * Saves returns to IndexedDB first, syncs to server in background.
 */

import offlineDB from '../../../services/offline/core/offlineDatabase';
import { SYNC_STATUS } from '../../../services/offline/core/offlineDatabase';

/**
 * Generate a temporary local ID for offline-first saves
 */
export const generateTempId = (): string => {
    return `LOCAL_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
};

/**
 * Generate a local return number for offline-first saves
 * Format: SR-LOCAL-YYYYMMDD-XXXXX
 */
export const generateLocalReturnNumber = (): string => {
    const date = new Date();
    const dateStr = date.toISOString().slice(0, 10).replace(/-/g, '');
    const random = Math.random().toString(36).substr(2, 5).toUpperCase();
    return `SR-LOCAL-${dateStr}-${random}`;
};

/**
 * Generate a local credit note number for offline-first saves
 * Format: CN-LOCAL-YYYYMMDD-XXXXX
 */
export const generateLocalCreditNoteNumber = (): string => {
    const date = new Date();
    const dateStr = date.toISOString().slice(0, 10).replace(/-/g, '');
    const random = Math.random().toString(36).substr(2, 5).toUpperCase();
    return `CN-LOCAL-${dateStr}-${random}`;
};

export interface OfflineReturnItem {
    product_id: string | number;
    batch_id?: string | number;
    batch_number?: string;
    return_quantity: number;
    unit_price: number;
    return_value: number;
    tax_amount?: number;
    tax_percent?: number;
    disposition?: string;
    reason?: string;
}

export interface OfflineSalesReturnData {
    customer_id: string | number;
    customer_name?: string;
    invoice_id?: string | number;
    invoice_number?: string;
    return_date: string;
    return_reason: string;
    return_method: string;
    items: OfflineReturnItem[];
    subtotal: number;
    tax_amount: number;
    total_amount: number;
    notes?: string;
}

/**
 * Save a sales return to IndexedDB for offline-first creation
 * Returns immediately, syncs to server in background
 */
export const saveReturnOffline = async (
    returnData: OfflineSalesReturnData
): Promise<{ success: boolean; return_number: string; credit_note_number: string; temp_id: string }> => {
    const tempId = generateTempId();
    const returnNumber = generateLocalReturnNumber();
    const creditNoteNumber = generateLocalCreditNoteNumber();

    const offlineReturn = {
        temp_id: tempId,
        _localId: tempId,
        return_number: returnNumber,
        credit_note_number: creditNoteNumber,
        ...returnData,
        status: 'pending',
        sync_status: SYNC_STATUS.PENDING,
        created_at: new Date().toISOString(),
        created_offline: true
    };

    try {
        // Save to IndexedDB
        const db = await offlineDB.init();
        await db.put('sales_returns', offlineReturn);

        // Add to sync queue for background upload
        await offlineDB.addToSyncQueue('sales_returns', tempId, 'create', offlineReturn);

        // Restock batches locally (opposite of invoice deduction)
        await restockBatchesLocally(returnData.items);

        console.log(`[OfflineReturn] ✅ Saved return ${returnNumber} offline (temp_id: ${tempId})`);

        return {
            success: true,
            return_number: returnNumber,
            credit_note_number: creditNoteNumber,
            temp_id: tempId
        };
    } catch (error) {
        console.error('[OfflineReturn] ❌ Failed to save return offline:', error);
        throw error;
    }
};

/**
 * Restock batch quantities locally (for offline returns)
 * Opposite of deductStockLocally used in invoices
 */
export const restockBatchesLocally = async (items: OfflineReturnItem[]): Promise<void> => {
    if (!items || items.length === 0) return;

    const db = await offlineDB.init();
    const tx = db.transaction('products', 'readwrite');
    const store = tx.objectStore('products');

    for (const item of items) {
        if (!item.batch_id || !item.product_id || !item.return_quantity) continue;

        try {
            const product = await store.get(String(item.product_id));
            if (!product || !product.batches) continue;

            // Find and update the batch within the product
            const batchIndex = product.batches.findIndex(
                (b: any) => String(b.batch_id) === String(item.batch_id)
            );

            if (batchIndex !== -1) {
                const currentQty = product.batches[batchIndex].quantity_available || 0;
                product.batches[batchIndex].quantity_available = currentQty + item.return_quantity;

                // Also update product total_stock if present
                if (typeof product.total_stock === 'number') {
                    product.total_stock = product.total_stock + item.return_quantity;
                }

                product.updated_at = new Date().toISOString();
                await store.put(product);

                console.log(`[OfflineReturn] ✅ Restocked ${item.return_quantity} to product ${item.product_id}, batch ${item.batch_id}. New qty: ${product.batches[batchIndex].quantity_available}`);
            }
        } catch (err) {
            console.warn(`[OfflineReturn] Could not restock for product ${item.product_id}:`, err);
        }
    }

    await tx.done;
};

/**
 * Get all pending offline returns (not yet synced)
 */
export const getPendingOfflineReturns = async (): Promise<any[]> => {
    try {
        const returns = await offlineDB.getAll('sales_returns', 'sync_status', SYNC_STATUS.PENDING);
        return returns || [];
    } catch (error) {
        console.error('[OfflineReturn] Failed to get pending returns:', error);
        return [];
    }
};

/**
 * Mark a return as synced after successful server upload
 */
export const markReturnSynced = async (
    tempId: string,
    serverReturnId: string | number,
    serverReturnNumber: string,
    serverCreditNoteNumber: string
): Promise<void> => {
    try {
        const db = await offlineDB.init();
        const returnData = await db.get('sales_returns', tempId);

        if (returnData) {
            returnData.return_id = serverReturnId;
            returnData.return_number = serverReturnNumber;
            returnData.credit_note_number = serverCreditNoteNumber;
            returnData.sync_status = SYNC_STATUS.SYNCED;
            returnData.synced_at = new Date().toISOString();

            await db.put('sales_returns', returnData);
            console.log(`[OfflineReturn] ✅ Marked return ${tempId} as synced (server ID: ${serverReturnId})`);
        }
    } catch (error) {
        console.error('[OfflineReturn] Failed to mark return as synced:', error);
    }
};
