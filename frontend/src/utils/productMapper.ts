/**
 * Product & Batch Data Mapper
 * 
 * Maps raw API/Cache data to the standard Product and ProductBatch types.
 * SINGLE SOURCE OF TRUTH for field name normalization.
 */

import { Product, ProductBatch, ProductWithBatches } from '../types/models/product';

// ==================== RAW INPUT TYPES ====================

/**
 * Represents the inconsistent/messy data coming from various sources
 * (API, Cache, Legacy components) before normalization.
 */
export interface RawBatchInput {
    [key: string]: any;
    // Common aliases
    batch_id?: number | string;
    id?: number | string;
    batch_number?: string;
    batch_no?: string;
    // Pricing aliases
    sale_price_per_unit?: number | string;
    sale_price?: number | string;
    unit_price?: number | string;
    selling_price?: number | string;
    mrp_per_unit?: number | string;
    mrp?: number | string;
}

export interface RawProductInput {
    [key: string]: any;
}

// ==================== MAPPER FUNCTIONS ====================

/**
 * Map raw API batch data to standardized ProductBatch format
 */
export function mapBatchToCanonical(raw: RawBatchInput): ProductBatch {
    // Centralized calculation for accurate days_to_expiry
    const daysToExpiry = raw.expiry_date
        ? Math.ceil((new Date(raw.expiry_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
        : null;

    const mrp = parseFloat(raw.mrp_per_unit || raw.mrp || 0);
    const salePrice = parseFloat(raw.sale_price_per_unit || raw.sale_price || raw.unit_price || raw.selling_price || 0);

    return {
        batch_id: raw.batch_id || raw.id,
        product_id: raw.product_id,
        batch_number: raw.batch_number || raw.batch_no || '',
        manufacturing_date: raw.manufacturing_date || undefined,
        expiry_date: raw.expiry_date || '',
        quantity_available: parseFloat(raw.quantity_available || raw.current_stock || raw.stock || 0),

        // Canonical Pricing
        mrp_per_unit: mrp,
        sale_price_per_unit: salePrice,
        cost_per_unit: parseFloat(raw.cost_per_unit || raw.cost_price || 0),

        // Legacy Required Fields (mapped from same source)
        mrp: mrp,
        sale_price: salePrice,
        purchase_price: parseFloat(raw.purchase_price || 0),

        units_per_pack: raw.units_per_pack,
        packages_per_box: raw.packages_per_box,
        pack_type: raw.pack_type,
        days_to_expiry: daysToExpiry,

        // Defaults
        is_active: raw.is_active !== false, // Default true unless false
        created_at: raw.created_at,
        updated_at: raw.updated_at
    };
}

/**
 * Map raw API product data to standardized Product format
 */
export function mapProductToCanonical(raw: RawProductInput): Product {
    const mrp = parseFloat(raw.mrp_per_unit || raw.mrp || 0);
    const salePrice = parseFloat(raw.sale_price_per_unit || raw.sale_price || 0);
    const totalStock = parseFloat(raw.total_stock || raw.current_stock || raw.quantity_available || 0);

    const product: Product = {
        product_id: raw.product_id || raw.id,
        product_code: raw.product_code || raw.code || '',
        product_name: raw.product_name || raw.name || '',
        generic_name: raw.generic_name,
        // Required legacy fields
        manufacturer: raw.manufacturer || '',
        base_unit: raw.base_unit || 'pc',

        hsn_code: raw.hsn_code || '',
        gst_percent: parseFloat(raw.gst_percent || raw.tax_rate || 0),
        category: raw.category_name || raw.category, // Mapped to name if ID not suitable

        // Pricing
        mrp: mrp,
        sale_price: salePrice,
        cost_price: parseFloat(raw.cost_price || 0),

        // Canonical Pricing
        mrp_per_unit: mrp,
        sale_price_per_unit: salePrice,
        cost_per_unit: parseFloat(raw.cost_price || 0),

        // Stock
        total_stock: totalStock,
        total_quantity: totalStock, // Map to both for compatibility

        // Optional fields passed through
        brand: raw.brand, // Note: Product interface doesn't have brand, might be extra
    } as Product; // Cast to ensure loose compatibility if Product has strict checks

    // Handle embedded batches
    if (raw.batches && Array.isArray(raw.batches)) {
        (product as any).batches = raw.batches.map(mapBatchToCanonical);
    }

    // Handle best_batch
    if (raw.best_batch) {
        (product as any).best_batch = mapBatchToCanonical(raw.best_batch);
    }

    return product;
}

/**
 * Map search-with-batches API response
 */
export function mapSearchWithBatchesResponse(response: any): Product[] {
    const products = response?.products || response?.data?.products || [];
    return products.map(mapProductToCanonical);
}

/**
 * Helper to create invoice item data (InvoiceItemData interface usually in invoiceTypes)
 * For now returning a loosely typed object compatible with invoice items
 */
export function createInvoiceItem(
    product: Product,
    batch: ProductBatch,
    quantity: number = 1
) {
    return {
        product_id: product.product_id,
        product_name: product.product_name,
        product_code: product.product_code,
        hsn_code: product.hsn_code,
        gst_percent: product.gst_percent,
        batch_id: batch.batch_id,
        batch_number: batch.batch_number,
        expiry_date: batch.expiry_date,
        manufacturing_date: batch.manufacturing_date,
        // Canonical pricing
        mrp_per_unit: batch.mrp_per_unit,
        sale_price_per_unit: batch.sale_price_per_unit,
        unit_price: batch.sale_price_per_unit, // Fallback
        quantity_available: batch.quantity_available,
        quantity: quantity,
        free_quantity: 0,
        discount_percent: 0
    };
}
