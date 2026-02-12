/**
 * Inventory Memory Cache
 *
 * High-performance O(1) in-memory cache for inventory data.
 * Uses GenericCollectionCache for primary indices.
 * Custom calculateCurrentStock aggregation.
 */

import { GenericCollectionCache } from '../../core/GenericCollectionCache';
import type {
    OfflineBatch,
    OfflineStockMovement,
    OfflineStockAdjustment,
    OfflineStockTransfer,
    CurrentStockItem
} from '../../types/inventory.types';

interface CacheMetrics {
    batches: number;
    movements: number;
    adjustments: number;
    transfers: number;
    lastWarmup: string | null;
    warmupTimeMs: number;
}

class InventoryMemoryCache {
    private batches = new GenericCollectionCache<OfflineBatch>({
        idField: 'batch_id',
        searchFields: ['batch_number', 'product_name']
    });
    private stockMovements = new GenericCollectionCache<OfflineStockMovement>({ idField: 'movement_id' });
    private stockAdjustments = new GenericCollectionCache<OfflineStockAdjustment>({ idField: 'adjustment_id' });
    private stockTransfers = new GenericCollectionCache<OfflineStockTransfer>({ idField: 'transfer_id' });

    // Secondary indices
    private batchesByProduct = new Map<string, OfflineBatch[]>();
    private batchesByBatchNumber = new Map<string, OfflineBatch>();
    private movementsByProduct = new Map<string, OfflineStockMovement[]>();

    // Aggregated data
    private currentStock = new Map<string, CurrentStockItem>();

    private warmupTimestamp: string | null = null;
    private warmupDurationMs = 0;

    warmCache(
        batches: OfflineBatch[],
        movements: OfflineStockMovement[] = [],
        adjustments: OfflineStockAdjustment[] = [],
        transfers: OfflineStockTransfer[] = []
    ): void {
        const start = performance.now();
        this.clear();

        this.batches.warmCache(batches);
        this.stockMovements.warmCache(movements);
        this.stockAdjustments.warmCache(adjustments);
        this.stockTransfers.warmCache(transfers);

        // Build secondary indices for batches
        for (const batch of batches) {
            const productId = String(batch.product_id);
            const productBatches = this.batchesByProduct.get(productId) || [];
            productBatches.push(batch);
            this.batchesByProduct.set(productId, productBatches);

            this.batchesByBatchNumber.set(batch.batch_number.toUpperCase(), batch);
        }

        // Build secondary indices for movements
        for (const movement of movements) {
            for (const item of movement.items) {
                const productId = String(item.product_id);
                const productMovements = this.movementsByProduct.get(productId) || [];
                productMovements.push(movement);
                this.movementsByProduct.set(productId, productMovements);
            }
        }

        this.calculateCurrentStock();

        this.warmupTimestamp = new Date().toISOString();
        this.warmupDurationMs = performance.now() - start;

        console.log(`[InventoryCache] ✅ Warmed: ${batches.length} batches, ${movements.length} movements in ${this.warmupDurationMs.toFixed(1)}ms`);
    }

    // Batch lookups
    getBatch(batchId: string): OfflineBatch | null { return this.batches.get(batchId); }
    getBatchByNumber(batchNumber: string): OfflineBatch | null {
        return this.batchesByBatchNumber.get(batchNumber.toUpperCase()) || null;
    }
    getBatchesByProduct(productId: string): OfflineBatch[] {
        return (this.batchesByProduct.get(String(productId)) || []).map(b => ({ ...b }));
    }

    searchBatches(query: string, limit = 20): OfflineBatch[] {
        return this.batches.search(query, limit);
    }

    getActiveBatches(productId: string): OfflineBatch[] {
        return this.getBatchesByProduct(productId).filter(b =>
            b.status === 'active' &&
            b.usable_quantity > 0 &&
            new Date(b.expiry_date) > new Date()
        );
    }

    // Movement lookups
    getMovement(movementId: string): OfflineStockMovement | null { return this.stockMovements.get(movementId); }
    getMovementsByProduct(productId: string): OfflineStockMovement[] {
        return (this.movementsByProduct.get(String(productId)) || []).map(m => ({ ...m }));
    }

    // Current stock
    private calculateCurrentStock(): void {
        this.currentStock.clear();

        for (const [, batches] of this.batchesByProduct) {
            if (batches.length === 0) continue;

            const firstBatch = batches[0];
            const productId = String(firstBatch.product_id);

            let totalQty = 0;
            let usableQty = 0;
            let blockedQty = 0;
            let avgMRP = 0;
            let avgPurchase = 0;
            let avgSale = 0;
            let hasExpired = false;
            let hasNearExpiry = false;

            const now = new Date();
            const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

            for (const batch of batches) {
                totalQty += batch.quantity;
                usableQty += batch.usable_quantity;
                blockedQty += batch.blocked_quantity;
                avgMRP += batch.mrp * batch.quantity;
                avgPurchase += batch.purchase_rate * batch.quantity;
                avgSale += batch.sale_rate * batch.quantity;

                const expiryDate = new Date(batch.expiry_date);
                if (expiryDate < now) hasExpired = true;
                if (expiryDate < thirtyDaysFromNow) hasNearExpiry = true;
            }

            if (totalQty > 0) {
                avgMRP /= totalQty;
                avgPurchase /= totalQty;
                avgSale /= totalQty;
            }

            this.currentStock.set(productId, {
                product_id: productId,
                product_name: firstBatch.product_name,
                product_code: firstBatch.product_code,
                total_quantity: totalQty,
                usable_quantity: usableQty,
                blocked_quantity: blockedQty,
                batch_count: batches.length,
                avg_mrp: avgMRP,
                avg_purchase_rate: avgPurchase,
                avg_sale_rate: avgSale,
                is_low_stock: usableQty < 10,
                has_expired_batches: hasExpired,
                has_near_expiry: hasNearExpiry,
                last_updated: new Date().toISOString()
            });
        }
    }

    getCurrentStock(productId: string): CurrentStockItem | null {
        return this.currentStock.get(String(productId)) || null;
    }
    getAllCurrentStock(): CurrentStockItem[] {
        return Array.from(this.currentStock.values()).map(s => ({ ...s }));
    }
    getLowStockItems(): CurrentStockItem[] {
        return this.getAllCurrentStock().filter(s => s.is_low_stock);
    }

    // Upsert
    upsertBatch(batch: OfflineBatch): void {
        this.batches.upsert(batch);

        const productId = String(batch.product_id);
        const existing = this.batchesByProduct.get(productId) || [];
        const index = existing.findIndex(b => String(b.batch_id) === String(batch.batch_id));
        if (index >= 0) {
            existing[index] = batch;
        } else {
            existing.push(batch);
        }
        this.batchesByProduct.set(productId, existing);
        this.batchesByBatchNumber.set(batch.batch_number.toUpperCase(), batch);
        this.calculateCurrentStock();
    }

    clear(): void {
        this.batches.clear();
        this.stockMovements.clear();
        this.stockAdjustments.clear();
        this.stockTransfers.clear();
        this.batchesByProduct.clear();
        this.batchesByBatchNumber.clear();
        this.movementsByProduct.clear();
        this.currentStock.clear();
    }

    isReady(): boolean { return this.batches.isReady(); }

    getMetrics(): CacheMetrics {
        return {
            batches: this.batches.size,
            movements: this.stockMovements.size,
            adjustments: this.stockAdjustments.size,
            transfers: this.stockTransfers.size,
            lastWarmup: this.warmupTimestamp,
            warmupTimeMs: this.warmupDurationMs
        };
    }
}

export const inventoryMemoryCache = new InventoryMemoryCache();
export default inventoryMemoryCache;
