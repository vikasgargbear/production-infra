/**
 * Inventory Sync Service
 *
 * Orchestrates sync operations for inventory module:
 * - Initial sync on login (multi-phase)
 * - Delta sync for updates
 * - Cache warmup
 * - Background sync
 */

import { BaseSyncService } from '../../core/BaseSyncService';
import offlineDB from '../../core/offlineDatabase';
import { inventoryMemoryCache } from './InventoryMemoryCache';
import type {
    OfflineBatch,
    OfflineStockMovement,
    OfflineStockAdjustment,
    OfflineStockTransfer,
    InventorySyncState
} from '../../types/inventory.types';

class InventorySyncService extends BaseSyncService<InventorySyncState> {
    protected readonly logPrefix = '[InventorySync]';

    constructor() {
        super({ phase: 'idle', progress: 0, isReady: false, lastSync: null, error: null });
    }

    // ============================================
    // INITIAL SYNC (multi-phase override)
    // ============================================

    async performInitialSync(): Promise<void> {
        if (this.state.phase !== 'idle' && this.state.phase !== 'error') {
            console.log('[InventorySync] Sync already in progress');
            return;
        }

        console.log('[InventorySync] Starting initial sync...');

        try {
            // Phase 1: Sync batches
            this.updateState({ phase: 'syncing-batches', progress: 0, error: null } as Partial<InventorySyncState>);
            await this.syncBatches();
            this.updateState({ progress: 40 } as Partial<InventorySyncState>);

            // Phase 2: Sync movements
            this.updateState({ phase: 'syncing-movements', progress: 50 } as Partial<InventorySyncState>);
            await this.syncMovements();
            this.updateState({ progress: 70 } as Partial<InventorySyncState>);

            // Phase 3: Warm cache
            this.updateState({ phase: 'warming-cache', progress: 80 } as Partial<InventorySyncState>);
            await this.warmCache();
            this.updateState({ progress: 95 } as Partial<InventorySyncState>);

            // Complete
            this.updateState({
                phase: 'complete',
                progress: 100,
                isReady: true,
                lastSync: new Date().toISOString()
            } as Partial<InventorySyncState>);

            console.log('[InventorySync] ✅ Initial sync complete!');

            this.startBackgroundSync();

        } catch (error) {
            console.error('[InventorySync] Sync failed:', error);
            this.updateState({
                phase: 'error',
                error: (error as Error).message
            } as Partial<InventorySyncState>);
        }
    }

    // ============================================
    // SYNC OPERATIONS
    // ============================================

    private async syncBatches(): Promise<void> {
        try {
            console.log('[InventorySync] Batch sync (using cached data)');
        } catch (error) {
            console.warn('[InventorySync] Batch sync failed:', error);
        }
    }

    private async syncMovements(): Promise<void> {
        try {
            console.log('[InventorySync] Movement sync (using cached data)');
        } catch (error) {
            console.warn('[InventorySync] Movement sync failed:', error);
        }
    }

    protected async warmCache(): Promise<void> {
        const [batches, movements, adjustments, transfers] = await Promise.all([
            offlineDB.getAll('batches'),
            offlineDB.getAll('stock_movements'),
            offlineDB.getAll('stock_adjustments'),
            offlineDB.getAll('stock_transfers')
        ]);

        inventoryMemoryCache.warmCache(
            (batches || []) as OfflineBatch[],
            (movements || []) as OfflineStockMovement[],
            (adjustments || []) as OfflineStockAdjustment[],
            (transfers || []) as OfflineStockTransfer[]
        );

        console.log('[InventorySync] Cache warmed');
    }

    // ============================================
    // DELTA SYNC
    // ============================================

    protected async performDeltaSync(): Promise<void> {
        if (!this.state.isReady) return;

        try {
            console.log('[InventorySync] Delta sync...');
            await this.syncBatches();
            await this.warmCache();
            this.updateState({ lastSync: new Date().toISOString() } as Partial<InventorySyncState>);
        } catch (error) {
            console.warn('[InventorySync] Delta sync failed:', error);
        }
    }

    protected onStop(): void {
        inventoryMemoryCache.clear();
    }
}

export const inventorySyncService = new InventorySyncService();
export default inventorySyncService;
