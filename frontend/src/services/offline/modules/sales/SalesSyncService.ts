/**
 * SalesSyncService
 *
 * Coordinates sync operations specific to sales module.
 * Provides clear lifecycle for initial sync, delta sync, and push sync.
 *
 * Components subscribe to sync state to know when data is ready.
 */

import { BaseSyncService } from '../../core/BaseSyncService';
import syncPullService from '../../sync/syncPullService';
import deltaSyncService from '../../sync/deltaSyncService';
import syncEngine from '../../sync/syncEngine';
import offlineDB from '../../core/offlineDatabase';
import { salesMemoryCache } from './SalesMemoryCache';
import type { SalesSyncState, SyncEventPayload } from '../../types/sales.types';

const LOG_PREFIX = '[SalesSync]';
const DELTA_SYNC_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

class SalesSyncService extends BaseSyncService<SalesSyncState> {
    protected readonly logPrefix = LOG_PREFIX;
    private initialized = false;

    constructor() {
        super({
            isReady: false,
            phase: 'idle',
            progress: 0,
            lastSync: null,
            pendingCount: 0
        });
    }

    // ==================== INITIAL SYNC (custom override) ====================

    async performInitialSync(): Promise<void> {
        if (this.initialized) {
            console.log(`${LOG_PREFIX} Already initialized, skipping`);
            return;
        }

        if (!navigator.onLine) {
            console.log(`${LOG_PREFIX} Offline - using cached data`);
            await salesMemoryCache.warmup(offlineDB);
            this.updateState({ isReady: true, phase: 'complete' } as Partial<SalesSyncState>);
            return;
        }

        console.log(`${LOG_PREFIX} 🚀 Starting initial sync...`);

        this.updateState({ phase: 'initial', progress: 0, isReady: false } as Partial<SalesSyncState>);

        try {
            // 1. Sync employees (10%)
            await syncPullService.syncEmployees();
            this.updateState({ progress: 10 } as Partial<SalesSyncState>);

            // 2. Sync customers (40%)
            await syncPullService.syncCustomers({
                onProgress: (p) => {
                    const progress = 10 + (p.page / p.totalPages) * 30;
                    this.updateState({ progress: Math.min(40, progress) } as Partial<SalesSyncState>);
                }
            });
            this.updateState({ progress: 40 } as Partial<SalesSyncState>);

            // 3. Sync products with batches (80%)
            await syncPullService.syncProducts({
                fullSync: true,
                onProgress: (p) => {
                    const progress = 40 + (p.page / p.totalPages) * 40;
                    this.updateState({ progress: Math.min(80, progress) } as Partial<SalesSyncState>);
                }
            });
            this.updateState({ progress: 80 } as Partial<SalesSyncState>);

            // 4. Warm memory cache (90%)
            console.log(`${LOG_PREFIX} Warming memory cache...`);
            await salesMemoryCache.warmup(offlineDB);
            this.updateState({ progress: 90 } as Partial<SalesSyncState>);

            // 5. Initialize delta sync timestamp
            deltaSyncService.initializeAfterFullSync(new Date().toISOString());

            // 6. Complete!
            this.updateState({
                phase: 'complete',
                progress: 100,
                isReady: true,
                lastSync: new Date()
            } as Partial<SalesSyncState>);

            this.initialized = true;

            // 7. Start background delta sync
            this.startDeltaSync();

            // 8. Log performance metrics
            salesMemoryCache.logPerformanceMetrics();

            console.log(`${LOG_PREFIX} ✅ Initial sync complete!`);

        } catch (error) {
            console.error(`${LOG_PREFIX} Initial sync failed:`, error);

            this.updateState({
                phase: 'idle',
                isReady: false,
                error: (error as Error).message
            } as Partial<SalesSyncState>);

            throw error;
        }
    }

    // ==================== DELTA SYNC ====================

    private startDeltaSync(): void {
        this.startBackgroundSync(DELTA_SYNC_INTERVAL_MS);

        // Also listen for visibility change
        if (typeof document !== 'undefined') {
            document.addEventListener('visibilitychange', () => {
                if (document.visibilityState === 'visible') {
                    this.performDeltaSync();
                }
            });
        }
    }

    async performDeltaSync(): Promise<void> {
        if (!this.state.isReady) return;
        if (this.state.phase === 'delta') return;
        if (!navigator.onLine) return;

        console.log(`${LOG_PREFIX} Performing delta sync...`);

        this.updateState({ phase: 'delta' } as Partial<SalesSyncState>);

        try {
            // Push local changes first
            await syncEngine.startSync();

            // Pull server changes
            await deltaSyncService.syncTables(['products', 'customers', 'batches'], 'background');

            this.updateState({
                phase: 'complete',
                lastSync: new Date()
            } as Partial<SalesSyncState>);

            this.notifyListeners();

            console.log(`${LOG_PREFIX} ✅ Delta sync complete`);

        } catch (error) {
            console.warn(`${LOG_PREFIX} Delta sync failed:`, error);
            this.updateState({ phase: 'complete' } as Partial<SalesSyncState>);
        }
    }

    // ==================== ACTION TRIGGERS ====================

    async afterInvoiceCreated(): Promise<void> {
        console.log(`${LOG_PREFIX} Invoice created, syncing stock...`);

        if (navigator.onLine) {
            await syncEngine.startSync();
            await deltaSyncService.afterInvoiceCreated();
        }
    }

    async afterCustomerCreated(): Promise<void> {
        console.log(`${LOG_PREFIX} Customer created, syncing...`);

        if (navigator.onLine) {
            await syncEngine.startSync();
        }
    }

    // ==================== CLEANUP ====================

    protected warmCache(): Promise<void> {
        return salesMemoryCache.warmup(offlineDB);
    }

    protected onStop(): void {
        this.initialized = false;
    }
}

export const salesSyncService = new SalesSyncService();
export default salesSyncService;
