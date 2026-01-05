import { useState, useEffect } from 'react';
import networkMonitor from '../services/offline/core/networkMonitor';
import offlineDB from '../services/offline/core/offlineDatabase';

interface SyncStats {
    pending: number;
    syncing: number;
    synced: number;
    failed: number;
    conflict: number;
}

interface SyncResult {
    success: boolean;
    message?: string;
}

interface UseNetworkStatusReturn {
    isOnline: boolean;
    syncStats: SyncStats;
    pendingCount: number;
    forceSync: () => Promise<SyncResult>;
    updateSyncStats: () => Promise<void>;
}

export function useNetworkStatus(): UseNetworkStatusReturn {
    const [isOnline, setIsOnline] = useState<boolean>(networkMonitor.isOnline);
    const [syncStats, setSyncStats] = useState<SyncStats>({
        pending: 0,
        syncing: 0,
        synced: 0,
        failed: 0,
        conflict: 0
    });

    const updateSyncStats = async (): Promise<void> => {
        try {
            const stats = await offlineDB.getSyncStats();
            setSyncStats(stats);
        } catch (error) {
            console.error('Failed to get sync stats:', error);
        }
    };

    useEffect(() => {
        const unsubscribe = networkMonitor.subscribe((_status: string, online: boolean) => {
            setIsOnline(online);
            updateSyncStats();
        });

        updateSyncStats();

        const interval = setInterval(updateSyncStats, 10000);

        return () => {
            unsubscribe();
            clearInterval(interval);
        };
    }, []);

    const forceSync = async (): Promise<SyncResult> => {
        if (isOnline) {
            const { default: syncEngine } = await import('../services/offline/sync/syncEngine');
            return syncEngine.startSync();
        }
        return { success: false, message: 'Cannot sync while offline' };
    };

    return {
        isOnline,
        syncStats,
        pendingCount: syncStats.pending,
        forceSync,
        updateSyncStats
    };
}

export default useNetworkStatus;
