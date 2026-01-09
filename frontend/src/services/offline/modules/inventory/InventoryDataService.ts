/**
 * Inventory Data Service
 * 
 * Data access layer for inventory module.
 * Same architecture as Sales/Purchase:
 * - Memory cache first (O(1))
 * - IndexedDB fallback  
 * - Optimistic updates
 * - Immutable returns
 */

import offlineDB from '../../core/offlineDatabase';
import { inventoryMemoryCache } from './InventoryMemoryCache';
import type {
    OfflineBatch,
    OfflineStockMovement,
    OfflineStockAdjustment,
    OfflineStockTransfer,
    CurrentStockItem
} from '../../types/inventory.types';

// ============================================
// INVENTORY DATA SERVICE
// ============================================

class InventoryDataService {

    // ============================================
    // BATCH OPERATIONS
    // ============================================

    /**
     * Get batch by ID
     * Memory cache: O(1), IndexedDB fallback
     */
    async getBatch(batchId: string): Promise<OfflineBatch | null> {
        const cached = inventoryMemoryCache.getBatch(batchId);
        if (cached) return { ...cached };

        try {
            const batch = await offlineDB.get('batches', batchId);
            if (batch) {
                inventoryMemoryCache.upsertBatch(batch as OfflineBatch);
                return { ...batch } as OfflineBatch;
            }
        } catch (error) {
            console.error('[InventoryData] Failed to get batch:', error);
        }

        return null;
    }

    /**
     * Get batches by product - O(1)
     */
    async getBatchesByProduct(productId: string): Promise<OfflineBatch[]> {
        if (inventoryMemoryCache.isReady()) {
            return inventoryMemoryCache.getBatchesByProduct(productId);
        }

        try {
            const all = await offlineDB.getAll('batches') as OfflineBatch[];
            return all
                .filter(b => String(b.product_id) === String(productId))
                .map(b => ({ ...b }));
        } catch (error) {
            console.error('[InventoryData] Failed to get batches by product:', error);
            return [];
        }
    }

    /**
     * Get active batches for product (usable stock)
     */
    async getActiveBatches(productId: string): Promise<OfflineBatch[]> {
        if (inventoryMemoryCache.isReady()) {
            return inventoryMemoryCache.getActiveBatches(productId);
        }

        const allBatches = await this.getBatchesByProduct(productId);
        const now = new Date();

        return allBatches.filter(b =>
            b.status === 'active' &&
            b.usable_quantity > 0 &&
            new Date(b.expiry_date) > now
        );
    }

    /**
     * Search batches
     */
    async searchBatches(query: string, limit = 20): Promise<OfflineBatch[]> {
        if (inventoryMemoryCache.isReady()) {
            return inventoryMemoryCache.searchBatches(query, limit);
        }

        try {
            const all = await offlineDB.getAll('batches') as OfflineBatch[];
            const lowerQuery = query.toLowerCase();

            return all
                .filter(b =>
                    b.batch_number.toLowerCase().includes(lowerQuery) ||
                    b.product_name.toLowerCase().includes(lowerQuery)
                )
                .slice(0, limit)
                .map(b => ({ ...b }));
        } catch (error) {
            console.error('[InventoryData] Search failed:', error);
            return [];
        }
    }

    // ============================================
    // CURRENT STOCK OPERATIONS
    // ============================================

    /**
     * Get current stock for product - O(1)
     * Aggregated from all batches
     */
    async getCurrentStock(productId: string): Promise<CurrentStockItem | null> {
        if (inventoryMemoryCache.isReady()) {
            return inventoryMemoryCache.getCurrentStock(productId);
        }

        // Fallback: Calculate from batches
        const batches = await this.getBatchesByProduct(productId);
        if (batches.length === 0) return null;

        let totalQty = 0;
        let usableQty = 0;
        let blockedQty = 0;

        for (const batch of batches) {
            totalQty += batch.quantity;
            usableQty += batch.usable_quantity;
            blockedQty += batch.blocked_quantity;
        }

        return {
            product_id: productId,
            product_name: batches[0].product_name,
            product_code: batches[0].product_code,
            total_quantity: totalQty,
            usable_quantity: usableQty,
            blocked_quantity: blockedQty,
            batch_count: batches.length,
            avg_mrp: 0,
            avg_purchase_rate: 0,
            avg_sale_rate: 0,
            is_low_stock: usableQty < 10,
            has_expired_batches: false,
            has_near_expiry: false,
            last_updated: new Date().toISOString()
        };
    }

    /**
     * Get all current stock
     */
    async getAllCurrentStock(): Promise<CurrentStockItem[]> {
        if (inventoryMemoryCache.isReady()) {
            return inventoryMemoryCache.getAllCurrentStock();
        }

        try {
            // Fallback: Would need to aggregate from all batches
            console.warn('[InventoryData] Current stock requires cache warmup');
            return [];
        } catch (error) {
            console.error('[InventoryData] Failed to get current stock:', error);
            return [];
        }
    }

    /**
     * Get low stock items
     */
    async getLowStockItems(): Promise<CurrentStockItem[]> {
        if (inventoryMemoryCache.isReady()) {
            return inventoryMemoryCache.getLowStockItems();
        }

        const all = await this.getAllCurrentStock();
        return all.filter(s => s.is_low_stock);
    }

    // ============================================
    // STOCK MOVEMENT OPERATIONS
    // ============================================

    /**
     * Get movement by ID
     */
    async getMovement(movementId: string): Promise<OfflineStockMovement | null> {
        const cached = inventoryMemoryCache.getMovement(movementId);
        if (cached) return { ...cached };

        try {
            const movement = await offlineDB.get('stock_movements', movementId);
            return movement ? { ...movement } as OfflineStockMovement : null;
        } catch (error) {
            console.error('[InventoryData] Failed to get movement:', error);
            return null;
        }
    }

    /**
     * Save stock adjustment (optimistic)
     */
    async saveStockAdjustment(adjustmentData: Partial<OfflineStockAdjustment>): Promise<string> {
        const tempId = `temp_adj_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        const adjustment: OfflineStockAdjustment = {
            adjustment_id: tempId,
            adjustment_number: `ADJ-OFFLINE-${Date.now().toString(36).toUpperCase()}`,
            adjustment_date: new Date().toISOString().split('T')[0],
            adjustment_type: 'correction',
            status: 'draft',
            items: [],
            reason: '',
            sync_status: 'pending',
            local_id: tempId,
            created_offline: true,
            ...adjustmentData
        };

        try {
            await offlineDB.add('stock_adjustments', adjustment);
            await offlineDB.addToSyncQueue('stock_adjustments', tempId, 'create', adjustment as unknown as null);
            console.log('[InventoryData] ✅ Adjustment saved optimistically:', tempId);
        } catch (error) {
            console.error('[InventoryData] Failed to save adjustment:', error);
        }

        return tempId;
    }

    /**
     * Save stock transfer (optimistic)
     */
    async saveStockTransfer(transferData: Partial<OfflineStockTransfer>): Promise<string> {
        const tempId = `temp_transfer_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        const transfer: OfflineStockTransfer = {
            transfer_id: tempId,
            transfer_number: `TRF-OFFLINE-${Date.now().toString(36).toUpperCase()}`,
            transfer_date: new Date().toISOString().split('T')[0],
            from_warehouse_id: '',
            from_warehouse_name: '',
            to_warehouse_id: '',
            to_warehouse_name: '',
            status: 'draft',
            items: [],
            sync_status: 'pending',
            local_id: tempId,
            created_offline: true,
            ...transferData
        };

        try {
            await offlineDB.add('stock_transfers', transfer);
            await offlineDB.addToSyncQueue('stock_transfers', tempId, 'create', transfer as unknown as null);
            console.log('[InventoryData] ✅ Transfer saved optimistically:', tempId);
        } catch (error) {
            console.error('[InventoryData] Failed to save transfer:', error);
        }

        return tempId;
    }
}

// Singleton instance
export const inventoryDataService = new InventoryDataService();
export default inventoryDataService;
