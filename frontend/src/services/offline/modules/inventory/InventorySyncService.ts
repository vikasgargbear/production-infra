/**
 * Inventory Sync Service
 * 
 * Orchestrates sync operations for inventory module:
 * - Initial sync on login
 * - Delta sync for updates
 * - Cache warmup
 * - Background sync
 */

import offlineDB from '../../core/offlineDatabase';
import { inventoryMemoryCache } from './InventoryMemoryCache';
import type {
    OfflineBatch,
    OfflineStockMovement,
    OfflineStockAdjustment,
    OfflineStockTransfer,
    InventorySyncState
} from '../../types/inventory.types';

// ============================================
// SYNC STATE MANAGEMENT
// ============================================

type SyncListener = (state: InventorySyncState) => void;

class InventorySyncService {
    private state: InventorySyncState = {
        phase: 'idle',
        progress: 0,
        isReady: false,
        lastSync: null,
        error: null
    };

    private listeners: Set<SyncListener> = new Set();
    private syncInterval: ReturnType<typeof setInterval> | null = null;

    // ============================================
    // STATE MANAGEMENT
    // ============================================

    private updateState(partial: Partial<InventorySyncState>): void {
        this.state = { ...this.state, ...partial };
        this.notifyListeners();
    }

    private notifyListeners(): void {
        for (const listener of this.listeners) {
            try {
                listener(this.state);
            } catch (error) {
                console.error('[InventorySync] Listener error:', error);
            }
        }
    }

    /**
     * Subscribe to state changes
     */
    subscribe(listener: SyncListener): () => void {
        this.listeners.add(listener);
        listener(this.state);

        return () => {
            this.listeners.delete(listener);
        };
    }

    /**
     * Get current state
     */
    getState(): InventorySyncState {
        return { ...this.state };
    }

    /**
     * Check if ready
     */
    isReady(): boolean {
        return this.state.isReady;
    }

    // ============================================
    // INITIAL SYNC
    // ============================================

    /**
     * Perform initial sync on login
     */
    async performInitialSync(): Promise<void> {
        if (this.state.phase !== 'idle' && this.state.phase !== 'error') {
            console.log('[InventorySync] Sync already in progress');
            return;
        }

        console.log('[InventorySync] Starting initial sync...');

        try {
            // Phase 1: Sync batches
            this.updateState({ phase: 'syncing-batches', progress: 0, error: null });

            await this.syncBatches();
            this.updateState({ progress: 40 });

            // Phase 2: Sync movements
            this.updateState({ phase: 'syncing-movements', progress: 50 });

            await this.syncMovements();
            this.updateState({ progress: 70 });

            // Phase 3: Warm cache
            this.updateState({ phase: 'warming-cache', progress: 80 });

            await this.warmCache();
            this.updateState({ progress: 95 });

            // Complete
            this.updateState({
                phase: 'complete',
                progress: 100,
                isReady: true,
                lastSync: new Date().toISOString()
            });

            console.log('[InventorySync] ✅ Initial sync complete!');

            // Start background sync
            this.startBackgroundSync();

        } catch (error) {
            console.error('[InventorySync] Sync failed:', error);
            this.updateState({
                phase: 'error',
                error: (error as Error).message
            });
        }
    }

    // ============================================
    // SYNC OPERATIONS
    // ============================================

    /**
     * Sync batches from backend
     */
    private async syncBatches(): Promise<void> {
        try {
            // Would call API to sync batches
            // For now, use cached data
            console.log('[InventorySync] Batch sync (using cached data)');
        } catch (error) {
            console.warn('[InventorySync] Batch sync failed:', error);
        }
    }

    /**
     * Sync movements from backend
     */
    private async syncMovements(): Promise<void> {
        try {
            // Would call API to sync movements
            console.log('[InventorySync] Movement sync (using cached data)');
        } catch (error) {
            console.warn('[InventorySync] Movement sync failed:', error);
        }
    }

    /**
     * Warm memory cache from IndexedDB
     */
    private async warmCache(): Promise<void> {
        try {
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
        } catch (error) {
            console.error('[InventorySync] Cache warmup failed:', error);
            throw error;
        }
    }

    // ============================================
    // BACKGROUND SYNC
    // ============================================

    /**
     * Start background sync interval
     */
    startBackgroundSync(intervalMs = 5 * 60 * 1000): void {
        if (this.syncInterval) {
            clearInterval(this.syncInterval);
        }

        this.syncInterval = setInterval(() => {
            if (navigator.onLine) {
                this.performDeltaSync();
            }
        }, intervalMs);

        console.log(`[InventorySync] Background sync started (${intervalMs / 1000}s interval)`);
    }

    /**
     * Stop background sync
     */
    stopBackgroundSync(): void {
        if (this.syncInterval) {
            clearInterval(this.syncInterval);
            this.syncInterval = null;
            console.log('[InventorySync] Background sync stopped');
        }
    }

    /**
     * Perform delta sync (incremental update)
     */
    private async performDeltaSync(): Promise<void> {
        if (!this.state.isReady) return;

        try {
            console.log('[InventorySync] Delta sync...');

            await this.syncBatches();
            await this.warmCache();

            this.updateState({
                lastSync: new Date().toISOString()
            });
        } catch (error) {
            console.warn('[InventorySync] Delta sync failed:', error);
        }
    }

    // ============================================
    // CLEANUP
    // ============================================

    /**
     * Stop all sync and clear cache
     */
    stop(): void {
        this.stopBackgroundSync();
        inventoryMemoryCache.clear();
        this.updateState({
            phase: 'idle',
            progress: 0,
            isReady: false
        });
        console.log('[InventorySync] Stopped and cleared');
    }
}

// Singleton instance
export const inventorySyncService = new InventorySyncService();
export default inventorySyncService;
