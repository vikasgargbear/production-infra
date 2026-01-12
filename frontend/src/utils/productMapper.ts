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

    const mrp = Number(raw.mrp_per_unit || 0);
    const salePrice = Number(raw.sale_price_per_unit || 0);

    return {
        batch_id: raw.batch_id ?? raw.id ?? '',
        product_id: raw.product_id ?? '',
        batch_number: raw.batch_number || '',
        manufacturing_date: raw.manufacturing_date || undefined,
        expiry_date: raw.expiry_date || '',
        quantity_available: Number(raw.quantity_available || 0),

        // Canonical Pricing
        mrp_per_unit: mrp,
        sale_price_per_unit: salePrice,
        cost_per_unit: Number(raw.cost_per_unit || 0),

        // Legacy Required Fields (mapped from same source)
        mrp: mrp,
        sale_price: salePrice,
        unit_price: Number(raw.unit_price || 0),

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
    const mrp = parseFloat(raw.mrp_per_unit || 0);
    const salePrice = parseFloat(raw.sale_price_per_unit || 0);
    // CANONICAL: Use total_quantity_available from backend (product-level stock), fallback to legacy field names
    const totalStock = parseFloat(raw.total_quantity_available || raw.total_stock || raw.quantity_available || 0);

    const product: Product = {
        // Required fields (NOT NULL in DB)
        product_id: raw.product_id || raw.id || 0,
        product_code: raw.product_code || '',
        product_name: raw.product_name || '',
        product_type: raw.product_type || 'general',  // Required field

        // Optional fields
        generic_name: raw.generic_name,
        manufacturer: raw.manufacturer,
        hsn_code: raw.hsn_code,
        gst_percent: parseFloat(raw.gst_percent || raw.tax_rate || 0),
        category: raw.category_name || raw.category,
        brand: raw.brand,

        // Pricing (from batch but often needed on product)
        mrp: mrp,
        sale_price: salePrice,
        cost_per_unit: parseFloat(raw.cost_per_unit || 0),

        // Stock - canonical field name
        total_stock: totalStock,
        total_quantity_available: totalStock,
    };

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

/**
 * Merge product and batch into a single object for UI selection
 * overriding product pricing with batch pricing.
 */
export function mergeProductAndBatch(product: Product, batch: ProductBatch) {
    return {
        ...product,
        // Batch overrides
        batch_id: batch.batch_id,
        batch_number: batch.batch_number,
        expiry_date: batch.expiry_date,
        manufacturing_date: batch.manufacturing_date,

        // Stock from batch
        available_quantity: batch.quantity_available,
        quantity_available: batch.quantity_available,
        quantity: 1,

        // PRICING OVERRIDES (Crucial)
        mrp_per_unit: batch.mrp_per_unit,
        sale_price_per_unit: batch.sale_price_per_unit,
        cost_per_unit: batch.cost_per_unit,

        // Legacy overrides (ensure UI sees batch price)
        mrp: batch.mrp_per_unit,
        unit_price: batch.sale_price_per_unit,
        sale_price: batch.sale_price_per_unit,

        // Pack info from batch
        units_per_pack: batch.units_per_pack,
        packages_per_box: batch.packages_per_box,
        pack_type: batch.pack_type,

        // Keep product tax
        gst_percent: product.gst_percent
    };
}
