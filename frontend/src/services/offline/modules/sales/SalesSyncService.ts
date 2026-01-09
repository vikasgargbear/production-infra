/**
 * SalesSyncService
 * 
 * Coordinates sync operations specific to sales module.
 * Provides clear lifecycle for initial sync, delta sync, and push sync.
 * 
 * Components subscribe to sync state to know when data is ready.
 */

import syncPullService from '../../sync/syncPullService';
import deltaSyncService from '../../sync/deltaSyncService';
import syncEngine from '../../sync/syncEngine';
import offlineDB from '../../core/offlineDatabase';
import { salesMemoryCache } from './SalesMemoryCache';
// SyncEventPayload: Reserved for future event-driven sync system
import type { SalesSyncState, SyncEventPayload } from '../../types/sales.types';

const LOG_PREFIX = '[SalesSync]';
const DELTA_SYNC_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

class SalesSyncService {
    private state: SalesSyncState = {
        isReady: false,
        phase: 'idle',
        progress: 0,
        lastSync: null,
        pendingCount: 0
    };

    private subscribers = new Set<(state: SalesSyncState) => void>();
    private deltaInterval: NodeJS.Timeout | null = null;
    private initialized = false;

    // ==================== STATE MANAGEMENT ====================

    /**
     * Get current sync state
     */
    getState(): SalesSyncState {
        return { ...this.state };
    }

    /**
     * Is initial sync complete? Components should wait for this.
     */
    isReady(): boolean {
        return this.state.isReady;
    }

    /**
     * Subscribe to sync state changes
     * Returns unsubscribe function
     */
    subscribe(callback: (state: SalesSyncState) => void): () => void {
        this.subscribers.add(callback);

        // Immediately call with current state
        callback(this.state);

        return () => this.subscribers.delete(callback);
    }

    private setState(partial: Partial<SalesSyncState>): void {
        this.state = { ...this.state, ...partial };
        this.notifySubscribers();
    }

    private notifySubscribers(): void {
        this.subscribers.forEach(callback => {
            try {
                callback(this.state);
            } catch (error) {
                console.error(`${LOG_PREFIX} Subscriber error:`, error);
            }
        });
    }

    // ==================== INITIAL SYNC ====================

    /**
     * Perform initial sync after login
     * 
     * MUST complete before app is usable.
     * Syncs: employees, customers, products (with batches)
     * Then warms memory cache for instant performance.
     */
    async performInitialSync(): Promise<void> {
        if (this.initialized) {
            console.log(`${LOG_PREFIX} Already initialized, skipping`);
            return;
        }

        if (!navigator.onLine) {
            console.log(`${LOG_PREFIX} Offline - using cached data`);

            // Warm cache even offline (from IndexedDB)
            await salesMemoryCache.warmup(offlineDB);

            this.setState({ isReady: true, phase: 'complete' });
            return;
        }

        console.log(`${LOG_PREFIX} 🚀 Starting initial sync...`);

        this.setState({ phase: 'initial', progress: 0, isReady: false });

        try {
            // 1. Sync employees (10%)
            await syncPullService.syncEmployees();
            this.setState({ progress: 10 });

            // 2. Sync customers (40%)
            await syncPullService.syncCustomers({
                onProgress: (p) => {
                    const progress = 10 + (p.page / p.totalPages) * 30;
                    this.setState({ progress: Math.min(40, progress) });
                }
            });
            this.setState({ progress: 40 });

            // 3. Sync products with batches (80%)
            await syncPullService.syncProducts({
                fullSync: true,
                onProgress: (p) => {
                    const progress = 40 + (p.page / p.totalPages) * 40;
                    this.setState({ progress: Math.min(80, progress) });
                }
            });
            this.setState({ progress: 80 });

            // 4. CRITICAL: Warm memory cache for instant performance (90%)
            console.log(`${LOG_PREFIX} Warming memory cache...`);
            await salesMemoryCache.warmup(offlineDB);
            this.setState({ progress: 90 });

            // 5. Initialize delta sync timestamp
            deltaSyncService.initializeAfterFullSync(new Date().toISOString());

            // 6. Complete!
            this.setState({
                phase: 'complete',
                progress: 100,
                isReady: true,
                lastSync: new Date()
            });

            this.initialized = true;

            // 7. Start background delta sync
            this.startDeltaSync();

            // 8. Log performance metrics
            salesMemoryCache.logPerformanceMetrics();

            console.log(`${LOG_PREFIX} ✅ Initial sync complete!`);

        } catch (error) {
            console.error(`${LOG_PREFIX} Initial sync failed:`, error);

            this.setState({
                phase: 'idle',
                isReady: false,
                error: (error as Error).message
            });

            throw error;
        }
    }

    // ==================== DELTA SYNC ====================

    /**
     * Start background delta sync
     * Runs every 5 minutes when online
     */
    private startDeltaSync(): void {
        if (this.deltaInterval) return;

        console.log(`${LOG_PREFIX} Starting delta sync interval`);

        this.deltaInterval = setInterval(() => {
            this.performDeltaSync();
        }, DELTA_SYNC_INTERVAL_MS);

        // Also listen for visibility change
        if (typeof document !== 'undefined') {
            document.addEventListener('visibilitychange', () => {
                if (document.visibilityState === 'visible') {
                    this.performDeltaSync();
                }
            });
        }
    }

    /**
     * Perform incremental sync
     * Called automatically every 5 minutes and on page focus
     */
    async performDeltaSync(): Promise<void> {
        if (!this.state.isReady) return;
        if (this.state.phase === 'delta') return;
        if (!navigator.onLine) return;

        console.log(`${LOG_PREFIX} Performing delta sync...`);

        this.setState({ phase: 'delta' });

        try {
            // Push local changes first
            await syncEngine.startSync();

            // Pull server changes
            await deltaSyncService.syncTables(['products', 'customers', 'batches'], 'background');

            this.setState({
                phase: 'complete',
                lastSync: new Date()
            });

            // Notify subscribers (components refresh data)
            this.notifySubscribers();

            console.log(`${LOG_PREFIX} ✅ Delta sync complete`);

        } catch (error) {
            console.warn(`${LOG_PREFIX} Delta sync failed:`, error);
            this.setState({ phase: 'complete' }); // Still ready, just failed this sync
        }
    }

    // ==================== ACTION TRIGGERS ====================

    /**
     * Called after creating an invoice
     * Triggers immediate delta sync for stock updates
     */
    async afterInvoiceCreated(): Promise<void> {
        console.log(`${LOG_PREFIX} Invoice created, syncing stock...`);

        if (navigator.onLine) {
            // Try to sync immediately
            await syncEngine.startSync();

            // Pull latest stock
            await deltaSyncService.afterInvoiceCreated();
        }
    }

    /**
     * Called after creating a customer
     */
    async afterCustomerCreated(): Promise<void> {
        console.log(`${LOG_PREFIX} Customer created, syncing...`);

        if (navigator.onLine) {
            await syncEngine.startSync();
        }
    }

    // ==================== CLEANUP ====================

    /**
     * Stop all sync operations
     * Call on logout
     */
    stop(): void {
        if (this.deltaInterval) {
            clearInterval(this.deltaInterval);
            this.deltaInterval = null;
        }

        this.setState({
            isReady: false,
            phase: 'idle',
            progress: 0
        });

        this.initialized = false;

        console.log(`${LOG_PREFIX} Stopped`);
    }
}

// Export singleton instance
export const salesSyncService = new SalesSyncService();
export default salesSyncService;
