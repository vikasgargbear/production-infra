/**
 * useProductStock Hook
 * 
 * Get accurate stock for a product.
 * ALWAYS calculates from batches - never uses cached total.
 * 
 * Fixes the stock=0 bug by using SalesStockService.
 */

import { useState, useEffect, useCallback } from 'react';
import { salesStockService, salesDataService } from '../../../services/offline/modules/sales';
import { salesSyncService } from '../../../services/offline/modules/sales';
import type { OfflineProduct, BatchStock, ProductStock } from '../../../services/offline/types/sales.types';

export interface ProductStockHookReturn {
    product: OfflineProduct | null;
    totalStock: number;
    batches: BatchStock[];
    loading: boolean;
    error: string | null;
    refetch: () => Promise<void>;
}

/**
 * Hook to get product with accurate stock
 * 
 * @param productId - Product ID to fetch
 * @returns Product with live stock calculation
 * 
 * @example
 * const { product, totalStock, batches, loading } = useProductStock(productId);
 * 
 * // totalStock is ALWAYS calculated fresh from batches
 * // Never shows 0 unless actually 0
 */
export function useProductStock(productId: string | null): ProductStockHookReturn {
    const [product, setProduct] = useState<OfflineProduct | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const fetchProduct = useCallback(async () => {
        if (!productId) {
            setProduct(null);
            setLoading(false);
            return;
        }

        try {
            setLoading(true);
            setError(null);

            const data = await salesDataService.getProduct(productId);
            setProduct(data);

        } catch (err) {
            console.error('[useProductStock] Failed to fetch product:', err);
            setError((err as Error).message);
        } finally {
            setLoading(false);
        }
    }, [productId]);

    useEffect(() => {
        // Wait for sync to be ready
        if (!salesSyncService.isReady()) {
            const unsubscribe = salesSyncService.subscribe((state) => {
                if (state.isReady) {
                    fetchProduct();
                    unsubscribe();
                }
            });
            return unsubscribe;
        }

        fetchProduct();

        // Re-fetch when sync completes (data may have changed)
        const unsubscribe = salesSyncService.subscribe((state) => {
            if (state.phase === 'complete' && state.lastSync) {
                fetchProduct();
            }
        });

        return unsubscribe;
    }, [productId, fetchProduct]);

    // CRITICAL: Calculate stock fresh from batches every render
    const totalStock = salesStockService.getUsableStock(product);
    const batches = salesStockService.getAllBatchDetails(product);

    return {
        product,
        totalStock,
        batches,
        loading,
        error,
        refetch: fetchProduct
    };
}

export default useProductStock;
