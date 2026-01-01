/**
 * Product & Batch Data Mapper
 * 
 * SINGLE SOURCE OF TRUTH for field name mapping.
 * Uses CANONICAL backend field names (no renaming).
 * 
 * Canonical Field Names (from database):
 * - Pricing: mrp_per_unit, sale_price_per_unit, cost_per_unit
 * - Quantity: quantity_available
 * - Batch: batch_id, batch_number, expiry_date, manufacturing_date
 * - Product: product_id, product_name, product_code, hsn_code, gst_percent
 */

// ==================== TYPE DEFINITIONS ====================

export interface CanonicalBatch {
    batch_id: number | string;
    product_id: number | string;
    batch_number: string;
    manufacturing_date: string | null;
    expiry_date: string | null;
    quantity_available: number;
    mrp_per_unit: number;
    sale_price_per_unit: number;
    cost_per_unit: number;
    units_per_pack?: number;
    packages_per_box?: number;
    pack_type?: string;
    days_to_expiry?: number | null;
}

export interface CanonicalProduct {
    product_id: number | string;
    product_code: string;
    product_name: string;
    generic_name?: string;
    brand?: string;
    manufacturer?: string;
    hsn_code: string;
    gst_percent: number;
    category_id?: number;
    total_stock: number;
    batches?: CanonicalBatch[];
    best_batch?: CanonicalBatch | null;
}

export interface InvoiceItemData {
    product_id: number | string;
    product_name: string;
    product_code: string;
    hsn_code: string;
    gst_percent: number;
    batch_id: number | string;
    batch_number: string;
    expiry_date: string | null;
    manufacturing_date: string | null;
    // Pricing - CANONICAL names
    mrp_per_unit: number;
    sale_price_per_unit: number;
    quantity_available: number;
    // Invoice specific
    quantity: number;
    free_quantity: number;
    discount_percent: number;
}

// ==================== MAPPER FUNCTIONS ====================

/**
 * Map raw API batch data to canonical format
 * Handles various field name variations from different sources
 */
export function mapBatchToCanonical(raw: any): CanonicalBatch {
    return {
        batch_id: raw.batch_id || raw.id,
        product_id: raw.product_id,
        batch_number: raw.batch_number || raw.batch_no || '',
        manufacturing_date: raw.manufacturing_date || null,
        expiry_date: raw.expiry_date || null,
        quantity_available: parseFloat(raw.quantity_available || raw.current_stock || raw.stock || 0),
        // CANONICAL pricing fields - no fallback to renamed fields
        mrp_per_unit: parseFloat(raw.mrp_per_unit || 0),
        sale_price_per_unit: parseFloat(raw.sale_price_per_unit || 0),
        cost_per_unit: parseFloat(raw.cost_per_unit || 0),
        units_per_pack: raw.units_per_pack,
        packages_per_box: raw.packages_per_box,
        pack_type: raw.pack_type,
        days_to_expiry: raw.days_to_expiry ?? null
    };
}

/**
 * Map raw API product data to canonical format
 */
export function mapProductToCanonical(raw: any): CanonicalProduct {
    const product: CanonicalProduct = {
        product_id: raw.product_id || raw.id,
        product_code: raw.product_code || raw.code || '',
        product_name: raw.product_name || raw.name || '',
        generic_name: raw.generic_name,
        brand: raw.brand,
        manufacturer: raw.manufacturer,
        hsn_code: raw.hsn_code || '',
        gst_percent: parseFloat(raw.gst_percent || raw.tax_rate || 0),
        category_id: raw.category_id,
        total_stock: parseFloat(raw.total_stock || raw.current_stock || raw.quantity_available || 0)
    };

    // Map embedded batches if present
    if (raw.batches && Array.isArray(raw.batches)) {
        product.batches = raw.batches.map(mapBatchToCanonical);
    }

    // Map best_batch if present
    if (raw.best_batch) {
        product.best_batch = mapBatchToCanonical(raw.best_batch);
    }

    return product;
}

/**
 * Create invoice item from product and selected batch
 * Uses CANONICAL field names throughout
 */
export function createInvoiceItem(
    product: CanonicalProduct,
    batch: CanonicalBatch,
    quantity: number = 1
): InvoiceItemData {
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
        // CANONICAL pricing from batch
        mrp_per_unit: batch.mrp_per_unit,
        sale_price_per_unit: batch.sale_price_per_unit,
        quantity_available: batch.quantity_available,
        // Invoice defaults
        quantity: quantity,
        free_quantity: 0,
        discount_percent: 0
    };
}

/**
 * Map search-with-batches API response
 */
export function mapSearchWithBatchesResponse(response: any): CanonicalProduct[] {
    const products = response?.products || response?.data?.products || [];
    return products.map(mapProductToCanonical);
}

// ==================== LEGACY COMPATIBILITY ====================

/**
 * Convert canonical batch to legacy format used by some components
 * This provides backward compatibility while we migrate
 */
export function batchToLegacyFormat(batch: CanonicalBatch): any {
    return {
        ...batch,
        // Legacy aliases (for components not yet migrated)
        mrp: batch.mrp_per_unit,
        unit_price: batch.sale_price_per_unit,
        sale_price: batch.sale_price_per_unit,
        rate: batch.sale_price_per_unit,
        available_quantity: batch.quantity_available,
        batch_no: batch.batch_number
    };
}

/**
 * Convert canonical product to legacy format
 */
export function productToLegacyFormat(product: CanonicalProduct): any {
    return {
        ...product,
        // Legacy aliases
        id: product.product_id,
        name: product.product_name,
        code: product.product_code,
        current_stock: product.total_stock,
        tax_rate: product.gst_percent,
        // Map batches to legacy format
        batches: product.batches?.map(batchToLegacyFormat)
    };
}
