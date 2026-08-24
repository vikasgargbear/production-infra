import { useCallback, useEffect, useState } from 'react';
import { getApiBaseUrl } from '../config/apiBase';

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
    const [isOnline, setIsOnline] = useState<boolean>(false);
    const syncStats: SyncStats = {
        pending: 0,
        syncing: 0,
        synced: 0,
        failed: 0,
        conflict: 0
    };

    const checkApi = useCallback(async (): Promise<void> => {
        if (!navigator.onLine) {
            setIsOnline(false);
            return;
        }

        try {
            const response = await fetch(`${getApiBaseUrl()}/health`, {
                method: 'GET',
                cache: 'no-store',
                headers: { 'X-Connection-Check': 'true' }
            });
            setIsOnline(response.ok);
        } catch {
            setIsOnline(false);
        }
    }, []);

    useEffect(() => {
        const check = () => { void checkApi(); };
        check();
        window.addEventListener('online', check);
        window.addEventListener('offline', check);
        const interval = window.setInterval(check, 30_000);

        return () => {
            window.removeEventListener('online', check);
            window.removeEventListener('offline', check);
            window.clearInterval(interval);
        };
    }, [checkApi]);

    const forceSync = async (): Promise<SyncResult> => {
        await checkApi();
        return {
            success: false,
            message: 'Background sync is disabled. Refresh the page to load current API data.'
        };
    };

    const updateSyncStats = async (): Promise<void> => checkApi();

    return {
        isOnline,
        syncStats,
        pendingCount: syncStats.pending,
        forceSync,
        updateSyncStats
    };
}

export default useNetworkStatus;
