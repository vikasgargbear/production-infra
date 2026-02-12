/**
 * Purchase Sync Service
 *
 * Orchestrates sync operations for purchase module:
 * - Initial sync on login (multi-phase)
 * - Delta sync for updates
 * - Cache warmup
 * - Background sync
 */

import { BaseSyncService } from '../../core/BaseSyncService';
import offlineDB from '../../core/offlineDatabase';
import syncPullService from '../../sync/syncPullService';
import { purchaseMemoryCache } from './PurchaseMemoryCache';
import type {
    OfflineSupplier,
    OfflinePurchaseOrder,
    OfflineGRN,
    PurchaseSyncState,
} from '../../types/purchase.types';

class PurchaseSyncService extends BaseSyncService<PurchaseSyncState> {
    protected readonly logPrefix = '[PurchaseSync]';

    constructor() {
        super({ phase: 'idle', progress: 0, isReady: false, lastSync: null, error: null });
    }

    // ============================================
    // INITIAL SYNC (multi-phase override)
    // ============================================

    async performInitialSync(): Promise<void> {
        if (this.state.phase !== 'idle' && this.state.phase !== 'error') {
            console.log('[PurchaseSync] Sync already in progress');
            return;
        }

        console.log('[PurchaseSync] Starting initial sync...');

        try {
            // Phase 1: Sync suppliers
            this.updateState({ phase: 'syncing-suppliers', progress: 0, error: null } as Partial<PurchaseSyncState>);
            await this.syncSuppliers();
            this.updateState({ progress: 30 } as Partial<PurchaseSyncState>);

            // Phase 2: Sync purchase orders
            this.updateState({ phase: 'syncing-orders', progress: 40 } as Partial<PurchaseSyncState>);
            await this.syncPurchaseOrders();
            this.updateState({ progress: 70 } as Partial<PurchaseSyncState>);

            // Phase 3: Warm cache
            this.updateState({ phase: 'warming-cache', progress: 80 } as Partial<PurchaseSyncState>);
            await this.warmCache();
            this.updateState({ progress: 95 } as Partial<PurchaseSyncState>);

            // Complete
            this.updateState({
                phase: 'complete',
                progress: 100,
                isReady: true,
                lastSync: new Date().toISOString()
            } as Partial<PurchaseSyncState>);

            console.log('[PurchaseSync] ✅ Initial sync complete!');

            this.startBackgroundSync();

        } catch (error) {
            console.error('[PurchaseSync] Sync failed:', error);
            this.updateState({
                phase: 'error',
                error: (error as Error).message
            } as Partial<PurchaseSyncState>);
        }
    }

    // ============================================
    // SYNC OPERATIONS
    // ============================================

    private async syncSuppliers(): Promise<void> {
        try {
            if (typeof (syncPullService as any).syncSuppliers === 'function') {
                const result = await (syncPullService as any).syncSuppliers();
                console.log(`[PurchaseSync] Synced ${result?.itemsSynced || 0} suppliers`);
            } else {
                console.log('[PurchaseSync] Supplier sync (using cached data)');
            }
        } catch (error) {
            console.warn('[PurchaseSync] Supplier sync failed:', error);
        }
    }

    private async syncPurchaseOrders(): Promise<void> {
        try {
            console.log('[PurchaseSync] PO sync (using cached data)');
        } catch (error) {
            console.warn('[PurchaseSync] PO sync failed:', error);
        }
    }

    protected async warmCache(): Promise<void> {
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
    }

    // ============================================
    // DELTA SYNC
    // ============================================

    protected async performDeltaSync(): Promise<void> {
        if (!this.state.isReady) return;

        try {
            console.log('[PurchaseSync] Delta sync...');
            await this.syncSuppliers();
            await this.warmCache();
            this.updateState({ lastSync: new Date().toISOString() } as Partial<PurchaseSyncState>);
        } catch (error) {
            console.warn('[PurchaseSync] Delta sync failed:', error);
        }
    }

    protected onStop(): void {
        purchaseMemoryCache.clear();
    }
}

export const purchaseSyncService = new PurchaseSyncService();
export default purchaseSyncService;
