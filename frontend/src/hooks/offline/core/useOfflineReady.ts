/**
 * useOfflineReady Hook
 * 
 * Waits for initial sync to complete before rendering content.
 * Use this to gate component rendering on data availability.
 */

import { useState, useEffect } from 'react';
import { salesSyncService } from '../../../services/offline/modules/sales';

export interface OfflineReadyHookReturn {
    isReady: boolean;
    isLoading: boolean;
    progress: number;
    error: string | null;
}

/**
 * Hook to wait for offline data to be ready
 * 
 * @example
 * const { isReady, isLoading, progress } = useOfflineReady();
 * 
 * if (isLoading) return <LoadingScreen progress={progress} />;
 * if (!isReady) return <ErrorScreen />;
 */
export function useOfflineReady(): OfflineReadyHookReturn {
    const [isReady, setIsReady] = useState(salesSyncService.isReady());
    const [isLoading, setIsLoading] = useState(!salesSyncService.isReady());
    const [progress, setProgress] = useState(0);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        // If already ready, no need to wait
        if (salesSyncService.isReady()) {
            setIsReady(true);
            setIsLoading(false);
            return;
        }

        // Subscribe to sync state
        const unsubscribe = salesSyncService.subscribe((state) => {
            setProgress(state.progress);

            if (state.isReady) {
                setIsReady(true);
                setIsLoading(false);
            }

            if (state.error) {
                setError(state.error);
                setIsLoading(false);
            }
        });

        // Start initial sync if not started
        if (!salesSyncService.isReady()) {
            salesSyncService.performInitialSync().catch((err) => {
                setError(err.message);
                setIsLoading(false);
            });
        }

        return unsubscribe;
    }, []);

    return { isReady, isLoading, progress, error };
}

export default useOfflineReady;
