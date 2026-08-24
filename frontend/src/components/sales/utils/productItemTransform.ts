/**
 * Product Item Transformation Utilities
 * 
 * Generic utilities for transforming product data into transaction line items.
 * Handles data from multiple sources (BatchSelector, API best_batch, legacy).
 */

import { BaseLineItem } from '../types/salesSharedTypes';

export interface ProductInput {
    product_id?: number | string;
    id?: number | string;
    product_name?: string;
    name?: string;
    product_code?: string;
    batch_id?: number | string;
    batch_number?: string;
    expiry_date?: string;
    manufacturing_date?: string;
    sale_price_per_unit?: number;
    unit_price?: number;
    sale_price?: number;
    mrp_per_unit?: number;
    mrp?: number;
    quantity_available?: number;
    available_quantity?: number;
    total_stock?: number;
    total_quantity_available?: number;
    gst_percent?: number;
    tax_rate?: number;
    hsn_code?: string;
    quantity?: number;
    free_quantity?: number;
    discount_percent?: number;
    best_batch?: any; // Nested batch data from API
    [key: string]: any; // Allow additional fields
}

/**
 * Transform product data into a generic line item
 * 
 * Handles data from multiple sources:
 * 1. BatchSelector → product with batch_id and batch pricing
 * 2. API best_batch → product with best_batch embedded
 * 3. Legacy → product with product-level pricing
 * 
 * @param product - Product data from various sources
 * @param itemDefaults - Default values to merge into the item
 * @returns Generic line item with pricing and batch info
 */
export const prepareItemForTransaction = <T extends BaseLineItem>(
    product: ProductInput,
    itemDefaults?: Partial<T>
): T => {
    // If product has best_batch from new API, use it
    const bestBatch = product.best_batch;

    // Get pricing - prioritize batch-level, then product-level
    let unitPrice = 0;
    let mrp = 0;
    let availableQty = 0;
    let batchId = product.batch_id;
    let batchNumber = product.batch_number || product.batch_number || '';
    let expiryDate = product.expiry_date || '';
    let manufacturingDate = product.manufacturing_date || '';

    if (product.batch_id) {
        // BatchSelector: product already has batch data merged - ALWAYS respect user selection
        console.log('[PrepareItem] Using batch data from BatchSelector (user selected)');
        unitPrice = parseFloat(String(
            product.sale_price_per_unit || product.unit_price || 0
        ));
        mrp = parseFloat(String(
            product.mrp_per_unit || product.mrp || 0
        ));
        availableQty = parseInt(String(
            product.quantity_available || product.available_quantity || 0
        ));
        manufacturingDate = product.manufacturing_date || product.manufacturing_date || '';
    } else if (bestBatch) {
        // New API: use best_batch ONLY if no batch was explicitly selected
        console.log('[PrepareItem] Using best_batch from API (auto-selected):', bestBatch);
        unitPrice = parseFloat(String(bestBatch.sale_price_per_unit || 0));
        mrp = parseFloat(String(bestBatch.mrp_per_unit || 0));
        availableQty = parseInt(String(bestBatch.quantity_available || 0));
        batchId = bestBatch.batch_id;
        batchNumber = bestBatch.batch_number || '';
        expiryDate = bestBatch.expiry_date || '';
        manufacturingDate = bestBatch.manufacturing_date || '';
    } else {
        // Legacy: product-level averages (fallback)
        console.log('[PrepareItem] Using product-level pricing (no batch selected)');
        unitPrice = parseFloat(String(
            product.sale_price_per_unit || product.sale_price || 0
        ));
        mrp = parseFloat(String(
            product.mrp_per_unit || product.mrp || 0
        ));
        availableQty = parseInt(String(
            product.total_stock || product.quantity_available || product.total_quantity_available || 0
        ));
    }

    // Create base item with ONLY canonical fields
    const baseItem: BaseLineItem = {
        id: Date.now(),
        product_id: product.product_id || product.id || 0,
        product_name: product.product_name || product.name || '',
        batch_id: batchId ?? undefined,
        batch_number: batchNumber,
        expiry_date: expiryDate,
        unit_price: unitPrice,  // ✅ CANONICAL
        mrp: mrp,
        quantity: parseInt(String(product.quantity || 1)),
        free_quantity: parseInt(String(product.free_quantity || 0)),
        unit: ''
    };

    // Merge with module-specific defaults
    return {
        ...baseItem,
        ...itemDefaults,
        // Additional common fields
        product_code: product.product_code || '',
        manufacturing_date: manufacturingDate,
        available_quantity: availableQty,
        gst_percent: parseFloat(String(product.gst_percent || product.tax_rate || 0)),
        hsn_code: product.hsn_code || '',
        discount_percent: parseFloat(String(product.discount_percent || 0)),
        location_id: product.location_id || bestBatch?.location_id,
        branch_id: product.branch_id || bestBatch?.branch_id,
        uom_conversion_id: product.uom_conversion_id || bestBatch?.uom_conversion_id,
        // Pack info - from batch or product
        units_per_pack: parseInt(String(
            bestBatch?.units_per_pack || product.units_per_pack || 1
        )),
        packages_per_box: parseInt(String(
            bestBatch?.packages_per_box || product.packages_per_box || 1
        )),
        pack_type: bestBatch?.pack_type || product.pack_type || '',
        pack_size: bestBatch?.pack_size || product.pack_size || ''
    } as unknown as T;
};
