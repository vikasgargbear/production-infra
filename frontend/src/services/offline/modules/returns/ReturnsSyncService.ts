/**
 * Returns Sync Service - Sync orchestration
 */

import offlineDB from '../../core/offlineDatabase';
import { returnsMemoryCache } from './ReturnsMemoryCache';
import type { OfflineSalesReturn, OfflinePurchaseReturn, ReturnsSyncState } from '../../types/returns.types';

type SyncListener = (state: ReturnsSyncState) => void;

class ReturnsSyncService {
    private state: ReturnsSyncState = {
        phase: 'idle',
        progress: 0,
        isReady: false,
        lastSync: null,
        error: null
    };

    private listeners: Set<SyncListener> = new Set();
    private syncInterval: ReturnType<typeof setInterval> | null = null;

    private updateState(partial: Partial<ReturnsSyncState>): void {
        this.state = { ...this.state, ...partial };
        for (const listener of this.listeners) {
            try { listener(this.state); } catch (error) { console.error('[ReturnsSync] Listener error:', error); }
        }
    }

    subscribe(listener: SyncListener): () => void {
        this.listeners.add(listener);
        listener(this.state);
        return () => { this.listeners.delete(listener); };
    }

    getState(): ReturnsSyncState {
        return { ...this.state };
    }

    isReady(): boolean {
        return this.state.isReady;
    }

    async performInitialSync(): Promise<void> {
        if (this.state.phase !== 'idle' && this.state.phase !== 'error') return;

        console.log('[ReturnsSync] Starting initial sync...');

        try {
            await this.warmCache();

            this.updateState({
                phase: 'complete',
                progress: 100,
                isReady: true,
                lastSync: new Date().toISOString()
            });

            console.log('[ReturnsSync] ✅ Initial sync complete!');
        } catch (error) {
            console.error('[ReturnsSync] Sync failed:', error);
            this.updateState({
                phase: 'error',
                error: (error as Error).message
            });
        }
    }

    private async warmCache(): Promise<void> {
        try {
            const [salesReturns, purchaseReturns] = await Promise.all([
                offlineDB.getAll('sales_returns'),
                offlineDB.getAll('purchase_returns')
            ]);

            returnsMemoryCache.warmCache(
                (salesReturns || []) as OfflineSalesReturn[],
                (purchaseReturns || []) as OfflinePurchaseReturn[]
            );

            console.log('[ReturnsSync] Cache warmed');
        } catch (error) {
            console.error('[ReturnsSync] Cache warmup failed:', error);
            throw error;
        }
    }

    stop(): void {
        if (this.syncInterval) clearInterval(this.syncInterval);
        returnsMemoryCache.clear();
        this.updateState({ phase: 'idle', progress: 0, isReady: false });
    }
}

export const returnsSyncService = new ReturnsSyncService();
export default returnsSyncService;
