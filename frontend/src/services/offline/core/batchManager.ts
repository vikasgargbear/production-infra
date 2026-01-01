import { IDBPDatabase } from 'idb';
import { OfflineBatch, BatchReservationResult } from '../types';

export class BatchManager {
    private getDb: () => Promise<any>;

    constructor(getDb: () => Promise<any>) {
        this.getDb = getDb;
    }

    /**
     * Get batches for a specific product (fast IndexedDB lookup)
     */
    async getBatchesByProduct(productId: string | number): Promise<OfflineBatch[]> {
        const db = await this.getDb();
        const tx = db.transaction('batches', 'readonly');
        const index = tx.store.index('product_id');

        const batches = await index.getAll(String(productId));
        return batches as OfflineBatch[];
    }

    /**
     * Store batches in IndexedDB for offline use
     */
    async storeBatches(batches: any[]): Promise<void> {
        const db = await this.getDb();
        const tx = db.transaction('batches', 'readwrite');
        const store = tx.objectStore('batches');

        const timestamp = new Date().toISOString();

        for (const batch of batches) {
            // IMPORTANT: Convert batch_id to string for consistent key lookup
            const batchId = String(batch.batch_id);

            // Preserve existing reserved quantity if batch already exists
            const existingBatch = await store.get(batchId) as OfflineBatch;
            const reservedOffline = existingBatch?.quantity_reserved_offline || 0;

            await store.put({
                ...batch,
                batch_id: batchId,
                quantity_reserved_offline: reservedOffline,
                updated_at: timestamp
            });
        }

        await tx.done;
    }

    /**
     * Clear batches for a specific product (cache invalidation)
     */
    async clearBatchesForProduct(productId: string | number): Promise<void> {
        const db = await this.getDb();
        const tx = db.transaction('batches', 'readwrite');
        const index = tx.store.index('product_id');

        // This is inefficient but IDB doesn't support delete by index directly
        const batches = await index.getAllKeys(String(productId));

        await Promise.all(batches.map(key => tx.store.delete(key)));
        await tx.done;
    }

    /**
     * Clear all cached batches
     */
    async clearAllBatches(): Promise<void> {
        const db = await this.getDb();
        await db.clear('batches');
    }

    /**
     * Reserve batch quantity for offline invoice
     */
    async reserveBatchQuantity(batchId: string | number, quantity: number): Promise<BatchReservationResult> {
        const db = await this.getDb();
        const tx = db.transaction('batches', 'readwrite');
        const store = tx.objectStore('batches');
        const id = String(batchId);

        const batch = await store.get(id) as OfflineBatch;

        if (!batch) {
            await tx.done;
            return { success: false, error: 'Batch not found in cache', availableQuantity: 0 };
        }

        const reserved = batch.quantity_reserved_offline || 0;
        const available = parseFloat(String(batch.quantity_available || 0)); // Ensure number
        const usable = available - reserved;

        // DEBUG: Log reservation attempt
        console.log(`[BatchManager] reserveBatchQuantity called:`, {
            batchId: id,
            requestedQty: quantity,
            available,
            reserved,
            usable,
            batchData: batch
        });
        console.trace('[BatchManager] Call stack for reserveBatchQuantity');

        if (usable < quantity) {
            console.warn(`[BatchManager] INSUFFICIENT STOCK - Available: ${usable}, Requested: ${quantity}`);
            await tx.done;
            return {
                success: false,
                error: `Insufficient stock.Available: ${usable} (${reserved} pending sync)`,
                availableQuantity: usable,
                reservedQuantity: reserved
            };
        }

        batch.quantity_reserved_offline = reserved + quantity;
        await store.put(batch);
        await tx.done;

        return {
            success: true,
            availableQuantity: usable - quantity,
            newReserved: batch.quantity_reserved_offline
        };
    }

    /**
     * Clear reserved quantity after successful sync
     */
    async clearReservedQuantity(batchId: string | number, quantity: number): Promise<void> {
        const db = await this.getDb();
        const tx = db.transaction('batches', 'readwrite');
        const store = tx.objectStore('batches');
        const id = String(batchId);

        const batch = await store.get(id) as OfflineBatch;

        if (batch) {
            batch.quantity_reserved_offline = Math.max(0, (batch.quantity_reserved_offline || 0) - quantity);
            await store.put(batch);
        }

        await tx.done;
    }

    /**
     * Update batch quantity from server response
     */
    async updateBatchQuantity(batchId: string | number, newQuantity: number): Promise<void> {
        const db = await this.getDb();
        const tx = db.transaction('batches', 'readwrite');
        const store = tx.objectStore('batches');

        const batch = await store.get(String(batchId)) as OfflineBatch;

        if (batch) {
            batch.quantity_available = newQuantity;
            batch.updated_at = new Date().toISOString();
            await store.put(batch);
        }

        await tx.done;
    }

    /**
     * Get usable quantity for a batch
     */
    async getBatchUsableQuantity(batchId: string | number): Promise<{ available: number, reserved: number, usable: number }> {
        const db = await this.getDb();
        const tx = db.transaction('batches', 'readonly');
        const store = tx.objectStore('batches');

        const batch = await store.get(String(batchId)) as OfflineBatch;
        await tx.done;

        if (!batch) {
            return { available: 0, reserved: 0, usable: 0 };
        }

        const available = batch.quantity_available || 0;
        const reserved = batch.quantity_reserved_offline || 0;
        const usable = available - reserved;

        return { available, reserved, usable };
    }

    /**
     * Get all batches with pending offline reservations
     */
    async getBatchesWithReservations(): Promise<OfflineBatch[]> {
        const db = await this.getDb();
        const batches = await db.getAll('batches');

        return batches.filter((batch: OfflineBatch) =>
            batch.quantity_reserved_offline && batch.quantity_reserved_offline > 0
        );
    }
}
