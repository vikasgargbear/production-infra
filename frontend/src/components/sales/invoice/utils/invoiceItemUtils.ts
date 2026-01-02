/**
 * Invoice Item Utilities
 * 
 * Pure functions for transforming product data into invoice items.
 * Handles multiple data sources (batch selector, API best_batch, legacy product-level).
 */

import { ProductInput } from '../types/invoiceTypes';
import type { InvoiceItem } from '../hooks/useInvoiceLogic';

/**
 * Prepare a product for invoice item format
 * 
 * Handles data from multiple sources:
 * 1. /products/search-with-batches → product with best_batch embedded
 * 2. BatchSelector → product with batch_id and batch pricing
 * 3. Legacy search → product with product-level pricing
 * 
 * CANONICAL field names: sale_price_per_unit, mrp_per_unit, quantity_available
 */
export const prepareItemForInvoice = (product: ProductInput): InvoiceItem => {
    // If product has best_batch from new API, use it
    const bestBatch = (product as any).best_batch;

    // Get pricing - prioritize batch-level, then product-level
    let unitPrice = 0;
    let mrp = 0;
    let availableQty = 0;
    let batchId = product.batch_id;
    let batchNumber = product.batch_number || product.batch_no || '';
    let expiryDate = product.expiry_date || '';
    let manufacturingDate = product.manufacturing_date || '';

    if (product.batch_id) {
        // BatchSelector: product already has batch data merged - ALWAYS respect user selection
        console.log('[Invoice] Using batch data from BatchSelector (user selected)');
        // CANONICAL: sale_price_per_unit, mrp_per_unit
        unitPrice = parseFloat(String(
            product.sale_price_per_unit || (product as any).unit_price || 0
        ));
        mrp = parseFloat(String(
            product.mrp_per_unit || product.mrp || 0
        ));
        availableQty = parseInt(String(
            product.quantity_available || product.available_quantity || 0
        ));
        // Get manufacturing_date from batch if available
        manufacturingDate = product.manufacturing_date || (product as any).mfg_date || '';
    } else if (bestBatch) {
        // New API: use best_batch ONLY if no batch was explicitly selected
        console.log('[Invoice] Using best_batch from API (auto-selected):', bestBatch);
        unitPrice = parseFloat(String(bestBatch.sale_price_per_unit || 0));
        mrp = parseFloat(String(bestBatch.mrp_per_unit || 0));
        availableQty = parseInt(String(bestBatch.quantity_available || 0));
        batchId = bestBatch.batch_id;
        batchNumber = bestBatch.batch_number || '';
        expiryDate = bestBatch.expiry_date || '';
        manufacturingDate = bestBatch.manufacturing_date || '';
    } else {
        // Legacy: product-level averages (fallback)
        console.log('[Invoice] Using product-level pricing (no batch selected)');
        unitPrice = parseFloat(String(
            product.sale_price_per_unit || (product as any).sale_price || 0
        ));
        mrp = parseFloat(String(
            product.mrp_per_unit || product.mrp || 0
        ));
        availableQty = parseInt(String(
            (product as any).total_stock || product.quantity_available || (product as any).current_stock || 0
        ));
    }

    console.log('[Invoice] Prepared item pricing:', { unitPrice, mrp, availableQty, batchId });

    return {
        product_id: product.product_id || product.id || 0,
        product_name: product.product_name || product.name || '',
        product_code: product.product_code || '',
        batch_id: batchId ?? undefined,
        batch_number: batchNumber,
        expiry_date: expiryDate,
        manufacturing_date: manufacturingDate,
        unit_price: unitPrice,
        mrp: mrp,
        gst_percent: parseFloat(String(product.gst_percent || (product as any).tax_rate || 0)),
        hsn_code: product.hsn_code || '',
        quantity: parseInt(String(product.quantity || 1)),
        free_quantity: parseInt(String(product.free_quantity || 0)),
        available_quantity: availableQty,
        discount_percent: parseFloat(String(product.discount_percent || 0))
    };
};
