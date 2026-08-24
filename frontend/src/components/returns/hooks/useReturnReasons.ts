import { useCallback, useEffect, useState } from 'react';
import { metadataApi } from '../../../services/api';

interface ReturnReason {
    value: string;
    label: string;
}

interface UseReturnReasonsReturn {
    reasons: ReturnReason[];
    loading: boolean;
    error: string | null;
    reload: () => Promise<void>;
}

/** Load return reasons from the canonical metadata API without local fallback. */
export function useReturnReasons(): UseReturnReasonsReturn {
    const [reasons, setReasons] = useState<ReturnReason[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const loadReasons = useCallback(async (): Promise<void> => {
        setLoading(true);
        setError(null);
        try {
            const response = await metadataApi.getReturnReasons();
            const payload = response?.data;
            const rawReasons = Array.isArray(payload)
                ? payload
                : payload?.return_reasons || payload?.sales_return_reasons || payload?.purchase_return_reasons || [];

            if (!Array.isArray(rawReasons) || rawReasons.length === 0) {
                throw new Error('The canonical API returned no return reasons.');
            }

            setReasons(rawReasons.map((reason: Record<string, unknown>) => ({
                value: String(reason.value || reason.code || reason.id || ''),
                label: String(reason.label || reason.name || reason.description || '')
            })));
        } catch (loadError) {
            setReasons([]);
            setError(loadError instanceof Error ? loadError.message : 'Failed to load return reasons from the canonical API.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void loadReasons();
    }, [loadReasons]);

    return { reasons, loading, error, reload: loadReasons };
}

export default useReturnReasons;
