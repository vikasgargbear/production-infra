/**
 * Stock Validation Utilities
 * 
 * Data validation and transformation functions for inventory.
 * Extracted from CurrentStock.tsx ProductDataValidator.
 */

import { BaseStockItem, BaseBatch } from '../types/inventorySharedTypes';

/**
 * Validates that a product object has all required fields
 * 
 * @param product - Product data from API
 * @returns True if valid
 */
export const validateProductData = (product: any): boolean => {
    if (!product || typeof product !== 'object') {
        console.warn('[Validation] Invalid product object:', product);
        return false;
    }

    if (!product.product_id || typeof product.product_id !== 'number') {
        console.warn('[Validation] Missing or invalid product_id:', product);
        return false;
    }

    if (!product.product_name || typeof product.product_name !== 'string') {
        console.warn('[Validation] Missing or invalid product_name:', product);
        return false;
    }

    return true;
};

/**
 * Validates batch data
 * 
 * @param batch - Batch data from API
 * @returns True if valid
 */
export const validateBatchData = (batch: any): boolean => {
    if (!batch || typeof batch !== 'object') {
        return false;
    }

    if (!batch.batch_id) {
        return false;
    }

    if (!batch.product_id) {
        return false;
    }

    return true;
};

/**
 * Transform raw API product data to standardized BaseStockItem format
 * 
 * Handles multiple API response formats and field name variations
 * 
 * @param product - Raw product data from API
 * @returns Standardized stock item
 */
export const transformToStockItem = <T extends BaseStockItem>(product: any): T => {
    const totalQtyAvailable = Number(product.total_quantity_available || product.total_quantity || 0);
    const reorderLevel = Number(product.reorder_level || 0);
    const minStockLevel = Number(product.min_stock_quantity || 0);
    const effectiveReorderLevel = reorderLevel || minStockLevel;

    return {
        // Core identification
        product_id: product.product_id,
        product_name: product.product_name,
        product_code: product.product_code || `PROD-${product.product_id}`,
        generic_name: product.generic_name || '',

        // Category
        category: product.category_name || product.category || '',
        manufacturer: product.manufacturer || '',
        brand: product.brand || '',

        // Stock & Inventory - CANONICAL NAMES
        total_quantity_available: totalQtyAvailable,
        total_quantity_reserved: Number(product.total_quantity_reserved || product.allocated_quantity || 0),
        total_quantity_quarantine: Number(product.total_quantity_quarantine || 0),
        reorder_level: effectiveReorderLevel,
        min_stock_quantity: minStockLevel,
        max_stock_quantity: Number(product.max_stock_quantity || 0),

        // Pricing - CANONICAL with _per_unit suffix (NO FALLBACKS)
        mrp_per_unit: Number(product.mrp_per_unit || 0),
        cost_per_unit: Number(product.cost_per_unit || 0),
        sale_price_per_unit: Number(product.sale_price_per_unit || 0),
        stock_value: totalQtyAvailable * Number(product.cost_per_unit || 0),

        // Units & Measurements - CANONICAL
        unit: product.base_uom || product.unit || 'Units',
        base_uom: product.base_uom || product.unit || 'Units',
        pack_uom: product.pack_uom || '',
        pack_size: Number(product.pack_size || 1),
        pack_type: product.pack_type || '',
        units_per_pack: Number(product.units_per_pack || 1),
        packages_per_box: Number(product.packages_per_box || 1),

        // Tax
        gst_percent: Number(product.gst_percent || 0),
        cess_percentage: Number(product.cess_percentage || 0),
        hsn_code: product.hsn_code || '',

        // Status & Alerts (computed flags)
        is_active: Boolean(product.is_active),
        low_stock: totalQtyAvailable <= effectiveReorderLevel && effectiveReorderLevel > 0,
        out_of_stock: totalQtyAvailable === 0,
        expiry_alert: Boolean(product.expiry_alert || product.near_expiry_batches > 0),

        // Metadata
        created_at: product.created_at,
        updated_at: product.updated_at
    } as T;
};

/**
 * Transform raw API batch data to standardized BaseBatch format
 * 
 * @param batch - Raw batch data from API
 * @returns Standardized batch
 */
export const transformToBatch = <T extends BaseBatch>(batch: any): T => {
    return {
        batch_id: batch.batch_id,
        batch_number: batch.batch_number || '',  // CANONICAL - no batch_number fallback
        product_id: batch.product_id,
        product_name: batch.product_name || '',

        // Quantities - CANONICAL
        quantity_available: Number(batch.quantity_available || 0),
        quantity_reserved: Number(batch.quantity_reserved || 0),
        quantity_quarantine: Number(batch.quantity_quarantine || 0),
        initial_quantity: Number(batch.initial_quantity || 0),

        // Dates - CANONICAL (output standard names only)
        expiry_date: batch.expiry_date,
        manufacturing_date: batch.manufacturing_date,  // CANONICAL - no manufacturing_date fallback

        // Pricing - CANONICAL with _per_unit suffix (NO FALLBACKS)
        mrp_per_unit: Number(batch.mrp_per_unit || 0),
        cost_per_unit: Number(batch.cost_per_unit || 0),
        sale_price_per_unit: Number(batch.sale_price_per_unit || 0),

        // Storage - CANONICAL
        storage_location: batch.storage_location || '',
        storage_condition: batch.storage_condition || '',
        supplier_id: batch.supplier_id,
        is_active: Boolean(batch.is_active !== false)
    } as T;
};


/**
 * Clean and normalize stock data array
 * 
 * Filters out invalid items and transforms them
 * 
 * @param products - Raw product array from API
 * @returns Clean, standardized stock items
 */
export const normalizeStockData = <T extends BaseStockItem>(products: any[]): T[] => {
    if (!Array.isArray(products)) {
        console.warn('[Validation] Expected array, got:', typeof products);
        return [];
    }

    return products
        .filter(validateProductData)
        .map(product => transformToStockItem<T>(product));
};

/**
 * Clean and normalize batch data array
 * 
 * @param batches - Raw batch array from API
 * @returns Clean, standardized batches
 */
export const normalizeBatchData = <T extends BaseBatch>(batches: any[]): T[] => {
    if (!Array.isArray(batches)) {
        return [];
    }

    return batches
        .filter(validateBatchData)
        .map(batch => transformToBatch<T>(batch));
};
