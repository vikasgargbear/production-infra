/**
 * useOfflineSuppliers Hook
 * 
 * Search and access suppliers from offline storage.
 * Same architecture as useOfflineCustomers.
 */

import { useState, useEffect, useCallback } from 'react';
import { purchaseDataService, purchaseSyncService } from '../../../services/offline/modules/purchase';
import type { OfflineSupplier } from '../../../services/offline/types/purchase.types';

export interface OfflineSuppliersHookReturn {
    suppliers: OfflineSupplier[];
    loading: boolean;
    error: string | null;
    searchSuppliers: (query: string) => Promise<void>;
    saveSupplier: (data: Partial<OfflineSupplier>) => Promise<string>;
    refreshSuppliers: () => Promise<void>;
}

/**
 * Hook for offline supplier operations
 * 
 * @example
 * const { suppliers, searchSuppliers, saveSupplier } = useOfflineSuppliers();
 * 
 * // Search
 * await searchSuppliers('Pharma');
 * 
 * // Create (optimistic - instant!)
 * const supplierId = await saveSupplier({ supplier_name: 'New Pharma' });
 */
export function useOfflineSuppliers(): OfflineSuppliersHookReturn {
    const [suppliers, setSuppliers] = useState<OfflineSupplier[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Search suppliers
    const searchSuppliers = useCallback(async (query: string) => {
        try {
            setLoading(true);
            setError(null);
            const results = await purchaseDataService.searchSuppliers(query);
            setSuppliers(results);
        } catch (err) {
            setError((err as Error).message);
            setSuppliers([]);
        } finally {
            setLoading(false);
        }
    }, []);

    // Refresh supplier list
    const refreshSuppliers = useCallback(async () => {
        try {
            const all = await purchaseDataService.getAllSuppliers();
            setSuppliers(all.slice(0, 100)); // Limit for performance
        } catch (err) {
            console.error('[useOfflineSuppliers] Refresh failed:', err);
        }
    }, []);

    // Save supplier (optimistic)
    const saveSupplier = useCallback(async (data: Partial<OfflineSupplier>): Promise<string> => {
        const supplierId = await purchaseDataService.saveSupplier(data);

        // Refresh list to include new supplier
        await refreshSuppliers();

        return supplierId;
    }, [refreshSuppliers]);

    // Initial load when sync is ready
    useEffect(() => {
        if (!purchaseSyncService.isReady()) {
            const unsubscribe = purchaseSyncService.subscribe((state) => {
                if (state.isReady) {
                    refreshSuppliers();
                    unsubscribe();
                }
            });
            return unsubscribe;
        }

        refreshSuppliers();
    }, [refreshSuppliers]);

    return {
        suppliers,
        loading,
        error,
        searchSuppliers,
        saveSupplier,
        refreshSuppliers
    };
}

export default useOfflineSuppliers;
