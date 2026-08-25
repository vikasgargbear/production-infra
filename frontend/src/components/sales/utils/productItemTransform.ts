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
import {
    exactDecimalUnits,
    normalizeAuthoritativeDecimal,
    normalizeExactDecimal,
} from '../../../utils/exactDecimal';

const quantityOptions = { scale: 6, maximumWholeDigits: 14 } as const;
const moneyOptions = { scale: 4, maximumWholeDigits: 16 } as const;
const rateOptions = { scale: 6, maximumWholeDigits: 4 } as const;

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
    sale_price_per_unit?: string;
    unit_price?: string;
    sale_price?: string;
    mrp_per_unit?: string;
    mrp?: string;
    quantity_available?: number | string;
    available_quantity?: number | string;
    total_stock?: number | string;
    total_quantity_available?: number | string;
    gst_percent?: string;
    hsn_code?: string;
    quantity: string | number;
    free_quantity: string | number;
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
    base_billed_quantity?: string | number;
    base_free_quantity?: string | number;
    source_billed_quantity?: string | number;
    source_free_quantity?: string | number;
    discount_percent?: string;
    best_batch?: any; // Nested batch data from API
    [key: string]: any; // Allow additional fields
}

const editableQuantity = (
    value: unknown,
    label: string,
): string => normalizeExactDecimal(value, label, quantityOptions);

const authoritativeQuantity = (value: unknown, label: string): string =>
    normalizeAuthoritativeDecimal(value, label, quantityOptions);

const authoritativeMoney = (value: unknown, label: string): string =>
    normalizeAuthoritativeDecimal(value, label, moneyOptions);

const authoritativeRate = (value: unknown, label: string): string =>
    normalizeAuthoritativeDecimal(value, label, rateOptions);

/**
 * Transform product data into a generic line item
 * 
 * Handles canonical data from two sources:
 * 1. BatchSelector → product with batch_id and batch pricing
 * 2. API best_batch → product with best_batch embedded
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
    const productId = product.product_id ?? product.id;
    const productName = String(product.product_name ?? product.name ?? '').trim();
    if (productId === undefined || productId === null || String(productId).trim() === '') {
        throw new Error('Selected product is missing its canonical identity.');
    }
    if (!productName) throw new Error('Selected product is missing its canonical name.');

    let unitPrice: string;
    let mrp: string | undefined;
    let availableQty: string | undefined;
    let batchId = product.batch_id;
    let batchNumber = product.batch_number || product.batch_number || '';
    let expiryDate = product.expiry_date || '';
    let manufacturingDate = product.manufacturing_date || '';

    if (product.batch_id) {
        // BatchSelector: product already has batch data merged - ALWAYS respect user selection
        unitPrice = authoritativeMoney(
            product.sale_price_per_unit ?? product.unit_price,
            'Selected batch unit rate',
        );
        const immutableImport = Boolean(product.source_line_id || product.allocation_id);
        const selectedMrp = product.mrp_per_unit ?? product.mrp;
        const selectedAvailability = product.quantity_available ?? product.available_quantity;
        mrp = immutableImport && selectedMrp === undefined
            ? undefined
            : authoritativeMoney(selectedMrp, 'Selected batch MRP');
        availableQty = immutableImport && selectedAvailability === undefined
            ? undefined
            : authoritativeQuantity(selectedAvailability, 'Selected batch available quantity');
        manufacturingDate = product.manufacturing_date || product.manufacturing_date || '';
    } else if (bestBatch) {
        // New API: use best_batch ONLY if no batch was explicitly selected
        unitPrice = authoritativeMoney(bestBatch.sale_price_per_unit, 'Recommended batch unit rate');
        mrp = authoritativeMoney(bestBatch.mrp_per_unit, 'Recommended batch MRP');
        availableQty = authoritativeQuantity(bestBatch.quantity_available, 'Recommended batch available quantity');
        batchId = bestBatch.batch_id;
        batchNumber = bestBatch.batch_number || '';
        expiryDate = bestBatch.expiry_date || '';
        manufacturingDate = bestBatch.manufacturing_date || '';
    } else {
        throw new Error('Select an authoritative canonical batch before adding this sales item.');
    }

    // Create base item with ONLY canonical fields
    const freeQuantity = editableQuantity(product.free_quantity, 'Free quantity');
    let freeSupplyTaxTreatment = product.free_supply_tax_treatment;
    if (!freeSupplyTaxTreatment) {
        if (exactDecimalUnits(freeQuantity, 'Free quantity', quantityOptions) !== 0n) {
            throw new Error('Choose the free-supply tax treatment before adding free quantity.');
        }
        // The treatment has no monetary effect when the explicitly entered free quantity is zero.
        freeSupplyTaxTreatment = 'excluded_from_taxable_value';
    }

    const baseItem: BaseLineItem = {
        id: Date.now(),
        product_id: productId,
        product_name: productName,
        batch_id: batchId ?? undefined,
        batch_number: batchNumber,
        expiry_date: expiryDate,
        unit_price: unitPrice,  // ✅ CANONICAL
        mrp: mrp,
        quantity: editableQuantity(product.quantity, 'Quantity'),
        free_quantity: freeQuantity,
        free_supply_tax_treatment: freeSupplyTaxTreatment,
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
        gst_percent: authoritativeRate(product.gst_percent, 'Product GST rate'),
        hsn_code: product.hsn_code || '',
        product_type: product.product_type,
        requires_prescription: Boolean(product.requires_prescription),
        discount_percent: product.discount_percent === undefined
            ? '0.000000'
            : authoritativeRate(product.discount_percent, 'Product discount rate'),
        location_id: product.location_id || bestBatch?.location_id,
        branch_id: product.branch_id || bestBatch?.branch_id,
        uom_conversion_id: product.uom_conversion_id || bestBatch?.uom_conversion_id,
        // Pack info - from batch or product
        units_per_pack: bestBatch?.units_per_pack ?? product.units_per_pack,
        packages_per_box: bestBatch?.packages_per_box ?? product.packages_per_box,
        pack_type: bestBatch?.pack_type || product.pack_type || '',
        pack_size: bestBatch?.pack_size || product.pack_size || ''
    } as unknown as T;
};
