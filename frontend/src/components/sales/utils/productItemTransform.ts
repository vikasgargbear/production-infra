/**
 * Product Item Transformation Utilities
 * 
 * Generic utilities for transforming product data into transaction line items.
 * Handles data from multiple sources (BatchSelector, API best_batch, legacy).
 */

import {
    BaseLineItem,
    CanonicalAllocationSourceKind,
    CanonicalSourceDocumentKind,
    FreeSupplyTaxTreatment,
} from '../types/salesSharedTypes';

export interface ProductInput {
    product_id?: number | string;
    id?: number | string;
    product_name?: string;
    name?: string;
    product_code?: string;
    batch_id?: number | string | null;
    batch_number?: string;
    expiry_date?: string | null;
    manufacturing_date?: string;
    sale_price_per_unit?: number;
    unit_price?: number;
    sale_price?: number;
    mrp_per_unit?: number;
    mrp?: number;
    quantity_available?: number | string;
    available_quantity?: number | string;
    total_stock?: number | string;
    total_quantity_available?: number | string;
    gst_percent?: number;
    tax_rate?: number;
    hsn_code?: string;
    quantity: number;
    free_quantity: number;
    free_supply_tax_treatment?: FreeSupplyTaxTreatment;
    source_line_id?: string | number;
    source_document_kind?: CanonicalSourceDocumentKind;
    source_allocation_kind?: CanonicalAllocationSourceKind;
    allocation_id?: string;
    command_request_id?: string | null;
    inventory_document_id?: string;
    inventory_document_line_id?: string;
    invoice_dispatch_allocation_id?: string | null;
    dispatch_id?: string | null;
    dispatch_line_id?: string | null;
    base_billed_quantity?: number;
    base_free_quantity?: number;
    source_billed_quantity?: number;
    source_free_quantity?: number;
    discount_percent?: number;
    best_batch?: any; // Nested batch data from API
    [key: string]: any; // Allow additional fields
}

function nonNegativeQuantity(
    value: unknown,
    label: string,
): number {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
        throw new Error(`${label} must be a finite non-negative number.`);
    }
    return value;
}

function nonNegativeAvailability(value: unknown): number {
    const parsed = typeof value === 'number'
        ? value
        : typeof value === 'string' && value.trim() !== ''
            ? Number(value)
            : 0;
    if (!Number.isFinite(parsed) || parsed < 0) {
        throw new Error('Available quantity must be a finite non-negative number.');
    }
    return parsed;
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
        availableQty = nonNegativeAvailability(
            product.quantity_available ?? product.available_quantity ?? 0
        );
        manufacturingDate = product.manufacturing_date || product.manufacturing_date || '';
    } else if (bestBatch) {
        // New API: use best_batch ONLY if no batch was explicitly selected
        console.log('[PrepareItem] Using best_batch from API (auto-selected):', bestBatch);
        unitPrice = parseFloat(String(bestBatch.sale_price_per_unit || 0));
        mrp = parseFloat(String(bestBatch.mrp_per_unit || 0));
        availableQty = nonNegativeAvailability(bestBatch.quantity_available ?? 0);
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
        availableQty = nonNegativeAvailability(
            product.total_stock
            ?? product.quantity_available
            ?? product.total_quantity_available
            ?? 0
        );
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
        quantity: nonNegativeQuantity(product.quantity, 'Quantity'),
        free_quantity: nonNegativeQuantity(product.free_quantity, 'Free quantity'),
        free_supply_tax_treatment:
            product.free_supply_tax_treatment || 'excluded_from_taxable_value',
        source_line_id: product.source_line_id,
        source_document_kind: product.source_document_kind,
        source_allocation_kind: product.source_allocation_kind,
        allocation_id: product.allocation_id,
        command_request_id: product.command_request_id,
        inventory_document_id: product.inventory_document_id,
        inventory_document_line_id: product.inventory_document_line_id,
        invoice_dispatch_allocation_id: product.invoice_dispatch_allocation_id,
        dispatch_id: product.dispatch_id,
        dispatch_line_id: product.dispatch_line_id,
        base_billed_quantity: product.base_billed_quantity,
        base_free_quantity: product.base_free_quantity,
        source_billed_quantity: product.source_billed_quantity,
        source_free_quantity: product.source_free_quantity,
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
        product_type: product.product_type,
        requires_prescription: Boolean(product.requires_prescription),
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
