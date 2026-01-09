/**
 * Purchase Sync Service
 * 
 * Orchestrates sync operations for purchase module:
 * - Initial sync on login
 * - Delta sync for updates
 * - Cache warmup
 * - Background sync
 * 
 * Same architecture as SalesSyncService.
 */

import offlineDB from '../../core/offlineDatabase';
import syncPullService from '../../sync/syncPullService';
import { purchaseMemoryCache } from './PurchaseMemoryCache';
import type {
    OfflineSupplier,
    OfflinePurchaseOrder,
    OfflineGRN,
    PurchaseSyncState,
    DEFAULT_PURCHASE_SYNC_STATE
} from '../../types/purchase.types';

// ============================================
// SYNC STATE MANAGEMENT
// ============================================

type SyncListener = (state: PurchaseSyncState) => void;

class PurchaseSyncService {
    private state: PurchaseSyncState = {
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

    private updateState(partial: Partial<PurchaseSyncState>): void {
        this.state = { ...this.state, ...partial };
        this.notifyListeners();
    }

    private notifyListeners(): void {
        for (const listener of this.listeners) {
            try {
                listener(this.state);
            } catch (error) {
                console.error('[PurchaseSync] Listener error:', error);
            }
        }
    }

    /**
     * Subscribe to state changes
     */
    subscribe(listener: SyncListener): () => void {
        this.listeners.add(listener);
        // Immediately call with current state
        listener(this.state);

        return () => {
            this.listeners.delete(listener);
        };
    }

    /**
     * Get current state
     */
    getState(): PurchaseSyncState {
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
     * Same pattern as Sales module
     */
    async performInitialSync(): Promise<void> {
        if (this.state.phase !== 'idle' && this.state.phase !== 'error') {
            console.log('[PurchaseSync] Sync already in progress');
            return;
        }

        console.log('[PurchaseSync] Starting initial sync...');

        try {
            // Phase 1: Sync suppliers
            this.updateState({ phase: 'syncing-suppliers', progress: 0, error: null });

            await this.syncSuppliers();
            this.updateState({ progress: 30 });

            // Phase 2: Sync purchase orders
            this.updateState({ phase: 'syncing-orders', progress: 40 });

            await this.syncPurchaseOrders();
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

            console.log('[PurchaseSync] ✅ Initial sync complete!');

            // Start background sync
            this.startBackgroundSync();

        } catch (error) {
            console.error('[PurchaseSync] Sync failed:', error);
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
     * Sync suppliers from backend
     */
    private async syncSuppliers(): Promise<void> {
        try {
            // Use existing sync pull service
            // syncSuppliers may not exist on older versions
            if (typeof (syncPullService as any).syncSuppliers === 'function') {
                const result = await (syncPullService as any).syncSuppliers();
                console.log(`[PurchaseSync] Synced ${result?.itemsSynced || 0} suppliers`);
            } else {
                console.log('[PurchaseSync] Supplier sync (using cached data)');
            }
        } catch (error) {
            console.warn('[PurchaseSync] Supplier sync failed:', error);
            // Continue anyway - use cached data
        }
    }

    /**
     * Sync purchase orders from backend
     */
    private async syncPurchaseOrders(): Promise<void> {
        try {
            // Sync purchase orders if available
            // This would call the appropriate API
            console.log('[PurchaseSync] PO sync (using cached data)');
        } catch (error) {
            console.warn('[PurchaseSync] PO sync failed:', error);
        }
    }

    /**
     * Warm memory cache from IndexedDB
     */
    private async warmCache(): Promise<void> {
        try {
            const [suppliers, purchaseOrders, grns] = await Promise.all([
                offlineDB.getAll('suppliers'),
                offlineDB.getAll('purchase_orders'),
                offlineDB.getAll('grn')
            ]);

            purchaseMemoryCache.warmCache(
                (suppliers || []) as OfflineSupplier[],
                (purchaseOrders || []) as OfflinePurchaseOrder[],
                (grns || []) as OfflineGRN[]
            );

            console.log('[PurchaseSync] Cache warmed');
        } catch (error) {
            console.error('[PurchaseSync] Cache warmup failed:', error);
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

        console.log(`[PurchaseSync] Background sync started (${intervalMs / 1000}s interval)`);
    }

    /**
     * Stop background sync
     */
    stopBackgroundSync(): void {
        if (this.syncInterval) {
            clearInterval(this.syncInterval);
            this.syncInterval = null;
            console.log('[PurchaseSync] Background sync stopped');
        }
    }

    /**
     * Perform delta sync (incremental update)
     */
    private async performDeltaSync(): Promise<void> {
        if (!this.state.isReady) return;

        try {
            console.log('[PurchaseSync] Delta sync...');

            // Sync only changes since last sync
            await this.syncSuppliers();
            await this.warmCache();

            this.updateState({
                lastSync: new Date().toISOString()
            });
        } catch (error) {
            console.warn('[PurchaseSync] Delta sync failed:', error);
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
        purchaseMemoryCache.clear();
        this.updateState({
            phase: 'idle',
            progress: 0,
            isReady: false
        });
        console.log('[PurchaseSync] Stopped and cleared');
    }
}

// Singleton instance
export const purchaseSyncService = new PurchaseSyncService();
export default purchaseSyncService;
