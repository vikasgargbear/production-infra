/**
 * useCurrentStock Hook
 * 
 * Get aggregated current stock for products.
 * Uses memory cache for instant O(1) lookups.
 */

import { useState, useEffect, useCallback } from 'react';
import { inventoryDataService, inventorySyncService } from '../../../services/offline/modules/inventory';
import type { CurrentStockItem } from '../../../services/offline/types/inventory.types';

export interface CurrentStockHookReturn {
    currentStock: CurrentStockItem[];
    loading: boolean;
    error: string | null;
    getStock: (productId: string) => Promise<CurrentStockItem | null>;
    getLowStock: () => Promise<CurrentStockItem[]>;
    refreshStock: () => Promise<void>;
}

/**
 * Hook for current stock operations
 * 
 * @example
 * const { currentStock, getStock, getLowStock } = useCurrentStock();
 * 
 * // Get stock for specific product
 * const stock = await getStock(productId);
 * 
 * // Get low stock items
 * const lowStock = await getLowStock();
 */
export function useCurrentStock(): CurrentStockHookReturn {
    const [currentStock, setCurrentStock] = useState<CurrentStockItem[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Get stock for specific product
    const getStock = useCallback(async (productId: string): Promise<CurrentStockItem | null> => {
        try {
            return await inventoryDataService.getCurrentStock(productId);
        } catch (err) {
            console.error('[useCurrentStock] Failed to get stock:', err);
            return null;
        }
    }, []);

    // Get low stock items
    const getLowStock = useCallback(async (): Promise<CurrentStockItem[]> => {
        try {
            return await inventoryDataService.getLowStockItems();
        } catch (err) {
            console.error('[useCurrentStock] Failed to get low stock:', err);
            return [];
        }
    }, []);

    // Refresh all stock
    const refreshStock = useCallback(async () => {
        try {
            setLoading(true);
            setError(null);
            const stock = await inventoryDataService.getAllCurrentStock();
            setCurrentStock(stock);
        } catch (err) {
            setError((err as Error).message);
        } finally {
            setLoading(false);
        }
    }, []);

    // Initial load when sync is ready
    useEffect(() => {
        if (!inventorySyncService.isReady()) {
            const unsubscribe = inventorySyncService.subscribe((state) => {
                if (state.isReady) {
                    refreshStock();
                    unsubscribe();
                }
            });
            return unsubscribe;
        }

        refreshStock();
    }, [refreshStock]);

    return {
        currentStock,
        loading,
        error,
        getStock,
        getLowStock,
        refreshStock
    };
}

export default useCurrentStock;
