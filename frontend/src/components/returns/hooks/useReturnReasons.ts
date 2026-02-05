/**
 * Custom hook for managing return reasons with caching
 */
import { useState, useEffect, useCallback } from 'react';
import { metadataApi } from '../../../services/api';

// ============================================================================
// Types
// ============================================================================

interface ReturnReason {
    value: string;
    label: string;
}

interface CachedReasons {
    data: ReturnReason[];
    timestamp: number;
}

interface UseReturnReasonsReturn {
    reasons: ReturnReason[];
    loading: boolean;
    error: string | null;
    reload: () => Promise<void>;
    clearCache: () => void;
}

// ============================================================================
// Constants
// ============================================================================

const CACHE_KEY = 'return_reasons_cache';
const CACHE_DURATION = 3600000; // 1 hour

const DEFAULT_REASONS: ReturnReason[] = [
    { value: 'NOT_REQUIRED', label: 'Not Required' },
    { value: 'EXPIRED', label: 'Expired Product' },
    { value: 'WRONG_ITEM', label: 'Wrong Item Delivered' },
    { value: 'QUALITY_ISSUE', label: 'Quality Issue' },
    { value: 'SHORT_EXPIRY', label: 'Short Expiry' },
    { value: 'BATCH_RECALL', label: 'Batch Recall' },
    { value: 'DAMAGED_IN_TRANSIT', label: 'Damaged in Transit' },
    { value: 'DAMAGED', label: 'Damaged Product' },
    { value: 'OTHER', label: 'Other' }
];

// ============================================================================
// Helper Functions
// ============================================================================

function getCachedReasons(): ReturnReason[] {
    try {
        const cached = localStorage.getItem(CACHE_KEY);
        if (cached) {
            const parsed: CachedReasons = JSON.parse(cached);
            if (parsed.timestamp && Date.now() - parsed.timestamp < CACHE_DURATION) {
                return parsed.data;
            }
        }
    } catch {
        // Ignore cache errors
    }
    return [];
}

function cacheReasons(reasons: ReturnReason[]): void {
    try {
        localStorage.setItem(CACHE_KEY, JSON.stringify({
            data: reasons,
            timestamp: Date.now()
        }));
    } catch {
        // Ignore cache errors
    }
}

// ============================================================================
// Hook
// ============================================================================

export function useReturnReasons(): UseReturnReasonsReturn {
    const [reasons, setReasons] = useState<ReturnReason[]>(getCachedReasons);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const loadReasons = useCallback(async (): Promise<void> => {
        try {
            setLoading(true);
            setError(null);

            const response = await metadataApi.getReturnReasons();

            if (response?.data && Array.isArray(response.data)) {
                const formattedReasons: ReturnReason[] = response.data.map((reason: Record<string, unknown>) => ({
                    value: String(reason.value || reason.code || reason.id || ''),
                    label: String(reason.label || reason.name || reason.description || '')
                }));

                setReasons(formattedReasons);
                cacheReasons(formattedReasons);
            } else {
                setReasons(DEFAULT_REASONS);
                cacheReasons(DEFAULT_REASONS);
            }
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to load return reasons');
            setReasons(DEFAULT_REASONS);
            cacheReasons(DEFAULT_REASONS);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (reasons.length === 0) {
            loadReasons();
        }
    }, [reasons.length, loadReasons]);

    const clearCache = useCallback((): void => {
        localStorage.removeItem(CACHE_KEY);
        setReasons([]);
        loadReasons();
    }, [loadReasons]);

    return {
        reasons,
        loading,
        error,
        reload: loadReasons,
        clearCache
    };
}

export type { ReturnReason, UseReturnReasonsReturn };
