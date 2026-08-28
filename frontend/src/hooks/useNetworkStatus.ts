import { useCallback, useEffect, useState } from 'react';
import { getApiBaseUrl } from '../config/apiBase';

interface UseNetworkStatusReturn {
    isOnline: boolean;
}

/** Reports whether the browser can currently reach the authoritative ERP API. */
export function useNetworkStatus(): UseNetworkStatusReturn {
    const [isOnline, setIsOnline] = useState<boolean>(false);

    const checkApi = useCallback(async (): Promise<void> => {
        if (!navigator.onLine) {
            setIsOnline(false);
            return;
        }

        try {
            const response = await fetch(`${getApiBaseUrl()}/health`, {
                method: 'GET',
                cache: 'no-store',
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

    return { isOnline };
}

export default useNetworkStatus;
