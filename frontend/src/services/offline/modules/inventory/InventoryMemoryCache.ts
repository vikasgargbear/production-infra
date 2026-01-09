/**
 * Inventory Memory Cache
 * 
 * High-performance O(1) in-memory cache for inventory data.
 * Architecture:
 * - HashMap primary indices for batches, movements
 * - Secondary indices for product-based lookups
 * - Aggregated current stock calculations
 * - Sub-5ms search performance
 */

import type {
    OfflineBatch,
    OfflineStockMovement,
    OfflineStockAdjustment,
    OfflineStockTransfer,
    CurrentStockItem
} from '../../types/inventory.types';

// ============================================
// TYPES
// ============================================

interface CacheMetrics {
    batches: number;
    movements: number;
    adjustments: number;
    transfers: number;
    lastWarmup: string | null;
    warmupTimeMs: number;
}

// ============================================
// INVENTORY MEMORY CACHE
// ============================================

class InventoryMemoryCache {
    // Primary indices (O(1) lookup)
    private batches = new Map<string, OfflineBatch>();
    private stockMovements = new Map<string, OfflineStockMovement>();
    private stockAdjustments = new Map<string, OfflineStockAdjustment>();
    private stockTransfers = new Map<string, OfflineStockTransfer>();

    // Secondary indices
    private batchesByProduct = new Map<string, OfflineBatch[]>();
    private batchesByBatchNumber = new Map<string, OfflineBatch>();
    private movementsByProduct = new Map<string, OfflineStockMovement[]>();

    // Aggregated data
    private currentStock = new Map<string, CurrentStockItem>();

    // Cache state
    private isWarmed = false;
    private warmupTimestamp: string | null = null;
    private warmupDurationMs = 0;

    // ============================================
    // WARMUP
    // ============================================

    /**
     * Warm cache from IndexedDB data
     * Target: < 300ms for 5000+ batches
     */
    warmCache(
        batches: OfflineBatch[],
        movements: OfflineStockMovement[] = [],
        adjustments: OfflineStockAdjustment[] = [],
        transfers: OfflineStockTransfer[] = []
    ): void {
        const start = performance.now();

        // Clear existing
        this.clear();

        // Index batches
        for (const batch of batches) {
            const id = String(batch.batch_id);

            // Pre-compute search fields
            batch._search_batch = batch.batch_number.toLowerCase();
            batch._search_product = batch.product_name.toLowerCase();

            // Primary index
            this.batches.set(id, batch);

            // Secondary indices
            const productId = String(batch.product_id);
            const productBatches = this.batchesByProduct.get(productId) || [];
            productBatches.push(batch);
            this.batchesByProduct.set(productId, productBatches);

            // Batch number index
            this.batchesByBatchNumber.set(batch.batch_number.toUpperCase(), batch);
        }

        // Index movements
        for (const movement of movements) {
            const id = String(movement.movement_id);
            this.stockMovements.set(id, movement);

            // Group by product
            for (const item of movement.items) {
                const productId = String(item.product_id);
                const productMovements = this.movementsByProduct.get(productId) || [];
                productMovements.push(movement);
                this.movementsByProduct.set(productId, productMovements);
            }
        }

        // Index adjustments
        for (const adjustment of adjustments) {
            const id = String(adjustment.adjustment_id);
            this.stockAdjustments.set(id, adjustment);
        }

        // Index transfers
        for (const transfer of transfers) {
            const id = String(transfer.transfer_id);
            this.stockTransfers.set(id, transfer);
        }

        // Calculate aggregated current stock
        this.calculateCurrentStock();

        this.isWarmed = true;
        this.warmupTimestamp = new Date().toISOString();
        this.warmupDurationMs = performance.now() - start;

        console.log(`[InventoryCache] ✅ Warmed: ${batches.length} batches, ${movements.length} movements in ${this.warmupDurationMs.toFixed(1)}ms`);
    }

    // ============================================
    // BATCH LOOKUPS
    // ============================================

    /**
     * Get batch by ID - O(1)
     */
    getBatch(batchId: string): OfflineBatch | null {
        return this.batches.get(String(batchId)) || null;
    }

    /**
     * Get batch by batch number - O(1)
     */
    getBatchByNumber(batchNumber: string): OfflineBatch | null {
        return this.batchesByBatchNumber.get(batchNumber.toUpperCase()) || null;
    }

    /**
     * Get batches by product - O(1)
     */
    getBatchesByProduct(productId: string): OfflineBatch[] {
        return (this.batchesByProduct.get(String(productId)) || []).map(b => ({ ...b }));
    }

    /**
     * Search batches - O(n) with early exit
     */
    searchBatches(query: string, limit = 20): OfflineBatch[] {
        if (!query || query.length < 2) return [];

        const lowerQuery = query.toLowerCase();
        const results: OfflineBatch[] = [];

        for (const batch of this.batches.values()) {
            if (
                batch._search_batch?.includes(lowerQuery) ||
                batch._search_product?.includes(lowerQuery)
            ) {
                results.push({ ...batch });
                if (results.length >= limit) break;
            }
        }

        return results;
    }

    /**
     * Get active batches for product (not expired, has quantity)
     */
    getActiveBatches(productId: string): OfflineBatch[] {
        const batches = this.getBatchesByProduct(productId);
        return batches.filter(b =>
            b.status === 'active' &&
            b.usable_quantity > 0 &&
            new Date(b.expiry_date) > new Date()
        );
    }

    // ============================================
    // STOCK MOVEMENT LOOKUPS
    // ============================================

    /**
     * Get movement by ID - O(1)
     */
    getMovement(movementId: string): OfflineStockMovement | null {
        return this.stockMovements.get(String(movementId)) || null;
    }

    /**
     * Get movements by product - O(1)
     */
    getMovementsByProduct(productId: string): OfflineStockMovement[] {
        return (this.movementsByProduct.get(String(productId)) || []).map(m => ({ ...m }));
    }

    // ============================================
    // CURRENT STOCK CALCULATIONS
    // ============================================

    /**
     * Calculate current stock from batches
     * Groups by product and aggregates quantities
     */
    private calculateCurrentStock(): void {
        this.currentStock.clear();

        for (const batches of this.batchesByProduct.values()) {
            if (batches.length === 0) continue;

            const firstBatch = batches[0];
            const productId = String(firstBatch.product_id);

            // Aggregate quantities
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

            // Calculate weighted averages
            if (totalQty > 0) {
                avgMRP /= totalQty;
                avgPurchase /= totalQty;
                avgSale /= totalQty;
            }

            const stockItem: CurrentStockItem = {
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
                is_low_stock: usableQty < 10, // TODO: Use actual reorder level
                has_expired_batches: hasExpired,
                has_near_expiry: hasNearExpiry,
                last_updated: new Date().toISOString()
            };

            this.currentStock.set(productId, stockItem);
        }
    }

    /**
     * Get current stock for product - O(1)
     */
    getCurrentStock(productId: string): CurrentStockItem | null {
        return this.currentStock.get(String(productId)) || null;
    }

    /**
     * Get all current stock items
     */
    getAllCurrentStock(): CurrentStockItem[] {
        return Array.from(this.currentStock.values()).map(s => ({ ...s }));
    }

    /**
     * Get low stock items
     */
    getLowStockItems(): CurrentStockItem[] {
        return this.getAllCurrentStock().filter(s => s.is_low_stock);
    }

    // ============================================
    // CACHE UPDATES
    // ============================================

    /**
     * Add/update batch in cache
     */
    upsertBatch(batch: OfflineBatch): void {
        const id = String(batch.batch_id);

        // Pre-compute search fields
        batch._search_batch = batch.batch_number.toLowerCase();
        batch._search_product = batch.product_name.toLowerCase();

        this.batches.set(id, batch);

        // Update product index
        const productId = String(batch.product_id);
        const existing = this.batchesByProduct.get(productId) || [];
        const index = existing.findIndex(b => String(b.batch_id) === id);
        if (index >= 0) {
            existing[index] = batch;
        } else {
            existing.push(batch);
        }
        this.batchesByProduct.set(productId, existing);

        // Update batch number index
        this.batchesByBatchNumber.set(batch.batch_number.toUpperCase(), batch);

        // Recalculate current stock for this product
        // (In production, optimize to only recalc affected product)
        this.calculateCurrentStock();
    }

    // ============================================
    // CACHE MANAGEMENT
    // ============================================

    /**
     * Clear all cache data
     */
    clear(): void {
        this.batches.clear();
        this.stockMovements.clear();
        this.stockAdjustments.clear();
        this.stockTransfers.clear();
        this.batchesByProduct.clear();
        this.batchesByBatchNumber.clear();
        this.movementsByProduct.clear();
        this.currentStock.clear();
        this.isWarmed = false;
    }

    /**
     * Check if cache is ready
     */
    isReady(): boolean {
        return this.isWarmed;
    }

    /**
     * Get cache metrics
     */
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

// Singleton instance
export const inventoryMemoryCache = new InventoryMemoryCache();
export default inventoryMemoryCache;
