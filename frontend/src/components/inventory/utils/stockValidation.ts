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
    const currentStock = Number(product.current_stock || product.total_quantity || 0);
    const reorderLevel = Number(product.reorder_level || 0);
    const minStockLevel = Number(product.min_stock_quantity || product.minimum_stock_level || 0);
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

        // Stock & Inventory
        current_stock: currentStock,
        available_stock: Number(product.available_stock || product.available_quantity || currentStock),
        reserved_stock: Number(product.reserved_stock || product.allocated_quantity || 0),
        reorder_level: effectiveReorderLevel,
        minimum_stock_level: minStockLevel,
        maximum_stock_level: Number(product.max_stock_quantity || product.maximum_stock_level || 0),

        // Pricing
        mrp: Number(product.mrp || 0),
        cost_price: Number(product.cost_price || product.average_cost || 0),
        purchase_rate: Number(product.purchase_rate || product.cost_price || 0),
        selling_rate: Number(product.selling_rate || product.sale_price || product.mrp || 0),
        stock_value: currentStock * Number(product.cost_price || product.average_cost || 0),

        // Units & Measurements
        unit: product.base_uom || product.unit || 'Units',
        sale_unit: product.sale_unit || product.base_uom || product.unit || 'Units',
        purchase_unit: product.purchase_unit || product.pack_uom || '',
        pack_size: Number(product.pack_size || 1),
        pack_type: product.pack_type || product.pack_unit || '',
        pack_unit_quantity: Number(product.units_per_pack || product.pack_unit_quantity || 1),
        sub_unit_quantity: Number(product.tablets_per_strip || product.packs_per_box || 1),

        // Tax
        gst_percent: Number(product.gst_percent || 0),
        cess_percentage: Number(product.cess_percentage || 0),
        hsn_code: product.hsn_code || '',

        // Status & Alerts
        is_active: Boolean(product.is_active),
        low_stock: currentStock <= effectiveReorderLevel && effectiveReorderLevel > 0,
        out_of_stock: currentStock === 0,
        expiry_alert: Boolean(product.expiry_alert || product.near_expiry_batches > 0),

        // Metadata
        created_at: product.created_at,
        updated_at: product.updated_at,
        last_updated: product.updated_at
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
        batch_number: batch.batch_number || batch.batch_no || '',
        product_id: batch.product_id,
        product_name: batch.product_name || '',

        // Quantities
        quantity_available: Number(batch.quantity_available || batch.current_stock || 0),
        quantity_received: Number(batch.quantity_received || 0),
        quantity_sold: Number(batch.quantity_sold || 0),

        // Dates - output backend-standard name only
        expiry_date: batch.expiry_date,
        manufacturing_date: batch.manufacturing_date || batch.mfg_date, // Accept both inputs, output standard
        received_date: batch.received_date,

        // Pricing - output backend-standard _per_unit names
        mrp_per_unit: Number(batch.mrp_per_unit || batch.mrp || 0),
        cost_per_unit: Number(batch.cost_per_unit || batch.cost_price || 0),
        sale_price_per_unit: Number(batch.sale_price_per_unit || batch.sale_price || 0),

        // Metadata
        supplier: batch.supplier || '',
        location: batch.location || batch.warehouse || '',
        is_active: Boolean(batch.is_active)
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
