/**
 * Master Sync Service - Sync orchestration for master data
 */

import offlineDB from '../../core/offlineDatabase';
import { masterMemoryCache } from './MasterMemoryCache';
import type { OfflineEmployee, OfflineWarehouse, OfflineCategory, OfflineManufacturer, MasterSyncState } from '../../types/master.types';

type SyncListener = (state: MasterSyncState) => void;

class MasterSyncService {
    private state: MasterSyncState = {
        phase: 'idle',
        progress: 0,
        isReady: false,
        lastSync: null,
        error: null
    };

    private listeners: Set<SyncListener> = new Set();

    private updateState(partial: Partial<MasterSyncState>): void {
        this.state = { ...this.state, ...partial };
        for (const listener of this.listeners) {
            try { listener(this.state); } catch (error) { console.error('[MasterSync] Listener error:', error); }
        }
    }

    subscribe(listener: SyncListener): () => void {
        this.listeners.add(listener);
        listener(this.state);
        return () => { this.listeners.delete(listener); };
    }

    getState(): MasterSyncState {
        return { ...this.state };
    }

    isReady(): boolean {
        return this.state.isReady;
    }

    async performInitialSync(): Promise<void> {
        if (this.state.phase !== 'idle' && this.state.phase !== 'error') return;

        console.log('[MasterSync] Starting initial sync...');

        try {
            await this.warmCache();

            this.updateState({
                phase: 'complete',
                progress: 100,
                isReady: true,
                lastSync: new Date().toISOString()
            });

            console.log('[MasterSync] ✅ Initial sync complete!');
        } catch (error) {
            console.error('[MasterSync] Sync failed:', error);
            this.updateState({
                phase: 'error',
                error: (error as Error).message
            });
        }
    }

    private async warmCache(): Promise<void> {
        try {
            const [employees, warehouses, categories, manufacturers] = await Promise.all([
                offlineDB.getAll('employees'),
                offlineDB.getAll('warehouses'),
                offlineDB.getAll('categories'),
                offlineDB.getAll('manufacturers')
            ]);

            masterMemoryCache.warmCache(
                (employees || []) as OfflineEmployee[],
                (warehouses || []) as OfflineWarehouse[],
                (categories || []) as OfflineCategory[],
                (manufacturers || []) as OfflineManufacturer[]
            );

            console.log('[MasterSync] Cache warmed');
        } catch (error) {
            console.error('[MasterSync] Cache warmup failed:', error);
            throw error;
        }
    }

    stop(): void {
        masterMemoryCache.clear();
        this.updateState({ phase: 'idle', progress: 0, isReady: false });
    }
}

export const masterSyncService = new MasterSyncService();
export default masterSyncService;
