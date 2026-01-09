/**
 * useSyncStatus Hook
 * 
 * Provides current sync status for UI components.
 * Shows: isReady, isSyncing, phase, lastSync, pendingCount
 */

import { useState, useEffect } from 'react';
import { salesSyncService } from '../../../services/offline/modules/sales';
import offlineDB from '../../../services/offline/core/offlineDatabase';
import type { SalesSyncState } from '../../../services/offline/types/sales.types';

export interface SyncStatusHookReturn {
    isReady: boolean;
    isSyncing: boolean;
    phase: SalesSyncState['phase'];
    progress: number;
    lastSync: Date | null;
    pendingCount: number;
    isOnline: boolean;
    error?: string;
}

/**
 * Hook to get current sync status
 * 
 * @example
 * const { isReady, pendingCount, isOnline } = useSyncStatus();
 */
export function useSyncStatus(): SyncStatusHookReturn {
    const [state, setState] = useState<SalesSyncState>(salesSyncService.getState());
    const [pendingCount, setPendingCount] = useState(0);
    const [isOnline, setIsOnline] = useState(
        typeof navigator !== 'undefined' ? navigator.onLine : true
    );

    useEffect(() => {
        // Subscribe to sync state changes
        const unsubscribe = salesSyncService.subscribe(setState);

        // Setup online/offline listener
        const handleOnline = () => setIsOnline(true);
        const handleOffline = () => setIsOnline(false);

        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);

        // Poll pending count
        const updatePendingCount = async () => {
            try {
                const queue = await offlineDB.getSyncQueue();
                setPendingCount(queue.length);
            } catch (error) {
                console.warn('[useSyncStatus] Failed to get pending count:', error);
            }
        };

        updatePendingCount();
        const pollInterval = setInterval(updatePendingCount, 3000);

        return () => {
            unsubscribe();
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
            clearInterval(pollInterval);
        };
    }, []);

    return {
        isReady: state.isReady,
        isSyncing: state.phase === 'initial' || state.phase === 'delta' || state.phase === 'push',
        phase: state.phase,
        progress: state.progress,
        lastSync: state.lastSync,
        pendingCount,
        isOnline,
        error: state.error
    };
}

export default useSyncStatus;
