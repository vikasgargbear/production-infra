/**
 * SalesStockService
 * 
 * SINGLE SOURCE OF TRUTH for stock calculations in sales module.
 * 
 * CRITICAL RULE: NEVER use product.total_stock directly.
 * ALWAYS calculate from product.batches[] to ensure accurate stock.
 * 
 * This service fixes the bug where stock shows 0 after delta sync.
 */

import offlineDB from '../../core/offlineDatabase';
import type {
    OfflineProduct,
    OfflineBatch,
    BatchStock,
    StockReserveResult,
    StockDeduction
} from '../../types/sales.types';

const LOG_PREFIX = '[SalesStock]';

class SalesStockService {

    // ==================== STOCK CALCULATIONS ====================

    /**
     * Get total usable stock for a product
     * 
     * CRITICAL: Always calculates from batches array, never uses cached total
     * usable = available - reserved_offline
     */
    getUsableStock(product: OfflineProduct | null): number {
        if (!product?.batches?.length) {
            return 0;
        }

        return product.batches
            .filter(batch => batch.is_active !== false)
            .reduce((total, batch) => {
                const available = batch.quantity_available || 0;
                const reserved = batch.quantity_reserved_offline || 0;
                return total + Math.max(0, available - reserved);
            }, 0);
    }

    /**
     * Get detailed stock information for a specific batch
     */
    getBatchDetails(product: OfflineProduct | null, batchId: string): BatchStock | null {
        if (!product?.batches?.length) {
            return null;
        }

        const batch = product.batches.find(b => String(b.batch_id) === String(batchId));

        if (!batch) {
            return null;
        }

        const available = batch.quantity_available || 0;
        const reserved = batch.quantity_reserved_offline || 0;

        return {
            batchId: String(batch.batch_id),
            batchNumber: batch.batch_number || '',
            available,
            reserved,
            usable: Math.max(0, available - reserved),
            expiryDate: batch.expiry_date,
            manufacturingDate: batch.manufacturing_date,
            mrpPerUnit: batch.mrp_per_unit,
            salePrice: batch.sale_price_per_unit
        };
    }

    /**
     * Get stock details for all batches of a product
     */
    getAllBatchDetails(product: OfflineProduct | null): BatchStock[] {
        if (!product?.batches?.length) {
            return [];
        }

        return product.batches
            .filter(batch => batch.is_active !== false)
            .map(batch => this.getBatchDetails(product, batch.batch_id))
            .filter((b): b is BatchStock => b !== null);
    }

    // ==================== STOCK RESERVATIONS ====================

    /**
     * Reserve stock for an invoice item (before save)
     * 
     * This reserves stock locally to prevent double-booking when creating
     * multiple invoices offline. Reserved stock is visible to other components.
     */
    async reserve(
        productId: string,
        batchId: string,
        quantity: number
    ): Promise<StockReserveResult> {
        try {
            const product = await offlineDB.get('products', String(productId));

            if (!product) {
                console.warn(`${LOG_PREFIX} Product not found: ${productId}`);
                return { success: false, error: 'Product not found' };
            }

            const batch = product.batches?.find(
                (b: OfflineBatch) => String(b.batch_id) === String(batchId)
            );

            if (!batch) {
                console.warn(`${LOG_PREFIX} Batch not found: ${batchId}`);
                return { success: false, error: 'Batch not found' };
            }

            const available = batch.quantity_available || 0;
            const reserved = batch.quantity_reserved_offline || 0;
            const usable = available - reserved;

            if (usable < quantity) {
                console.warn(`${LOG_PREFIX} Insufficient stock: need ${quantity}, have ${usable}`);
                return {
                    success: false,
                    error: `Insufficient stock. Available: ${usable} (${reserved} reserved)`,
                    remaining: usable,
                    batchId
                };
            }

            // Update reservation
            batch.quantity_reserved_offline = reserved + quantity;
            product.updated_at = new Date().toISOString();

            await offlineDB.update('products', product);

            console.log(`${LOG_PREFIX} ✅ Reserved ${quantity} from batch ${batchId}. Remaining: ${usable - quantity}`);

            return {
                success: true,
                remaining: usable - quantity,
                batchId
            };

        } catch (error) {
            console.error(`${LOG_PREFIX} Reserve failed:`, error);
            return { success: false, error: (error as Error).message };
        }
    }

    /**
     * Deduct stock after successful invoice save
     * 
     * This reduces quantity_available and clears the reservation.
     * Called when invoice is saved (locally or synced to server).
     */
    async deduct(
        productId: string,
        batchId: string,
        quantity: number
    ): Promise<void> {
        try {
            const product = await offlineDB.get('products', String(productId));

            if (!product?.batches) {
                console.warn(`${LOG_PREFIX} Cannot deduct - product not found: ${productId}`);
                return;
            }

            const batch = product.batches.find(
                (b: OfflineBatch) => String(b.batch_id) === String(batchId)
            );

            if (!batch) {
                console.warn(`${LOG_PREFIX} Cannot deduct - batch not found: ${batchId}`);
                return;
            }

            // Clear reservation
            batch.quantity_reserved_offline = Math.max(
                0,
                (batch.quantity_reserved_offline || 0) - quantity
            );

            // Deduct actual stock
            batch.quantity_available = Math.max(
                0,
                (batch.quantity_available || 0) - quantity
            );

            product.updated_at = new Date().toISOString();

            await offlineDB.update('products', product);

            console.log(`${LOG_PREFIX} ✅ Deducted ${quantity} from batch ${batchId}. New qty: ${batch.quantity_available}`);

        } catch (error) {
            console.error(`${LOG_PREFIX} Deduct failed:`, error);
        }
    }

    /**
     * Release reserved stock (on cancel or error)
     * 
     * Called when invoice creation is cancelled or fails.
     */
    async release(
        productId: string,
        batchId: string,
        quantity: number
    ): Promise<void> {
        try {
            const product = await offlineDB.get('products', String(productId));

            if (!product?.batches) return;

            const batch = product.batches.find(
                (b: OfflineBatch) => String(b.batch_id) === String(batchId)
            );

            if (!batch) return;

            batch.quantity_reserved_offline = Math.max(
                0,
                (batch.quantity_reserved_offline || 0) - quantity
            );

            product.updated_at = new Date().toISOString();

            await offlineDB.update('products', product);

            console.log(`${LOG_PREFIX} Released ${quantity} reservation from batch ${batchId}`);

        } catch (error) {
            console.error(`${LOG_PREFIX} Release failed:`, error);
        }
    }

    /**
     * Release all reserved stock for multiple items
     * 
     * Called when entire invoice is cancelled.
     */
    async releaseAll(deductions: StockDeduction[]): Promise<void> {
        if (!deductions?.length) return;

        for (const { productId, batchId, quantity } of deductions) {
            await this.release(productId, batchId, quantity);
        }

        console.log(`${LOG_PREFIX} Released all reservations (${deductions.length} items)`);
    }

    /**
     * Deduct all stock for multiple items
     * 
     * Called when invoice is saved with multiple items.
     */
    async deductAll(deductions: StockDeduction[]): Promise<void> {
        if (!deductions?.length) return;

        for (const { productId, batchId, quantity } of deductions) {
            await this.deduct(productId, batchId, quantity);
        }

        console.log(`${LOG_PREFIX} Deducted all (${deductions.length} items)`);
    }

    // ==================== UTILITIES ====================

    /**
     * Check if product has sufficient stock
     */
    hasStock(product: OfflineProduct | null, minimumQuantity: number = 1): boolean {
        return this.getUsableStock(product) >= minimumQuantity;
    }

    /**
     * Get best batch for quantity (FEFO - First Expiry First Out)
     */
    getBestBatch(
        product: OfflineProduct | null,
        requiredQuantity: number
    ): BatchStock | null {
        if (!product?.batches?.length) return null;

        const validBatches = this.getAllBatchDetails(product)
            .filter(b => b.usable >= requiredQuantity)
            .sort((a, b) => {
                // Sort by expiry date (earliest first)
                if (a.expiryDate && b.expiryDate) {
                    return new Date(a.expiryDate).getTime() - new Date(b.expiryDate).getTime();
                }
                return 0;
            });

        return validBatches[0] || null;
    }
}

// Export singleton instance
export const salesStockService = new SalesStockService();
export default salesStockService;
