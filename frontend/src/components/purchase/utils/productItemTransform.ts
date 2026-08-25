/**
 * Purchase Module - Product to Item Transform Utilities
 * 
 * Transforms product data into purchase line items
 * Following sales module pattern
 */

import type { BasePurchaseItem, PurchaseOrderItem, PurchaseEntryItem, GRNItem } from '../types';

/**
 * Generate a client-only draft-row identity.
 */
export function generateTempId(): string {
    return `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

const requiredNumber = (
    value: unknown,
    label: string,
    { positive = false, maximum = Number.POSITIVE_INFINITY } = {},
): number => {
    if (value === '' || value === null || value === undefined) {
        throw new Error(`${label} must come from an authoritative source or explicit user entry.`);
    }
    const parsed = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(parsed) || parsed < 0 || (positive && parsed <= 0) || parsed > maximum) {
        throw new Error(`${label} is invalid.`);
    }
    return parsed;
};

const optionalNumber = (value: unknown, label: string): number | undefined => (
    value === '' || value === null || value === undefined
        ? undefined
        : requiredNumber(value, label)
);

const productTax = (product: any): number => requiredNumber(
    product.gst_percent,
    'Product GST rate',
    { maximum: 100 },
);

/**
 * Prepare product for Purchase Order line item
 */
export function prepareItemForPurchaseOrder(product: any): PurchaseOrderItem {
    return {
        id: generateTempId(),
        product_id: product.product_id,
        product_name: product.product_name,
        hsn_code: product.hsn_code,
        quantity: requiredNumber(product.quantity, 'Purchase-order quantity', { positive: true }),
        free_quantity: requiredNumber(product.free_quantity, 'Purchase-order free quantity'),
        unit_price: requiredNumber(product.unit_price ?? product.cost_per_unit, 'Purchase-order unit price', { positive: true }),
        discount_percent: requiredNumber(product.discount_percent, 'Purchase-order discount', { maximum: 100 }),
        tax_percent: productTax(product),
        notes: '',
    };
}

/**
 * Prepare product for Purchase Entry line item (with batch/expiry)
 */
export function prepareItemForPurchaseEntry(product: any): PurchaseEntryItem {
    return {
        id: generateTempId(),
        product_id: product.product_id,
        product_name: product.product_name,
        hsn_code: product.hsn_code,
        quantity: requiredNumber(product.quantity, 'Purchase-entry quantity', { positive: true }),
        free_quantity: requiredNumber(product.free_quantity, 'Purchase-entry free quantity'),
        unit_price: requiredNumber(product.unit_price ?? product.cost_per_unit, 'Purchase-entry unit price', { positive: true }),
        discount_percent: requiredNumber(product.discount_percent, 'Purchase-entry discount', { maximum: 100 }),
        tax_percent: productTax(product),

        // Purchase entry specific
        batch_number: '',
        expiry_date: '',
        manufacturing_date: null,
        mrp_per_unit: optionalNumber(product.mrp_per_unit ?? product.mrp, 'Purchase-entry MRP'),
        sale_price_per_unit: optionalNumber(product.sale_price_per_unit ?? product.selling_price, 'Purchase-entry sale price'),
        cost_per_unit: requiredNumber(product.unit_price ?? product.cost_per_unit, 'Purchase-entry cost', { positive: true }),
    };
}

/**
 * Prepare product for GRN line item
 */
export function prepareItemForGRN(product: any, poItem?: any): GRNItem {
    return {
        id: generateTempId(),
        product_id: product.product_id,
        product_name: product.product_name,
        hsn_code: product.hsn_code,
        quantity: requiredNumber(poItem?.quantity, 'GRN ordered quantity', { positive: true }),
        received_quantity: requiredNumber(poItem?.received_quantity, 'GRN received quantity', { positive: true }),
        rejected_quantity: requiredNumber(poItem?.rejected_quantity, 'GRN rejected quantity'),
        free_quantity: requiredNumber(poItem?.free_quantity, 'GRN free quantity'),
        unit_price: requiredNumber(poItem?.unit_price, 'GRN unit price', { positive: true }),
        discount_percent: requiredNumber(poItem?.discount_percent, 'GRN discount', { maximum: 100 }),
        tax_percent: requiredNumber(poItem?.tax_percent, 'GRN GST rate', { maximum: 100 }),

        // GRN specific
        batch_number: '',
        expiry_date: '',
        manufacturing_date: null,
        po_item_id: poItem?.id,
    };
}

/**
 * Clean item data for backend submission
 * Removes temp IDs, normalizes field names
 */
export function cleanItemForBackend(item: BasePurchaseItem): any {
    const cleaned: any = { ...item };

    // Remove temp IDs
    if (typeof cleaned.id === 'string' && cleaned.id.startsWith('temp_')) {
        delete cleaned.id;
    }

    // A submission adapter may normalize explicit values, but never invent them.
    cleaned.quantity = requiredNumber(cleaned.quantity, 'Purchase quantity', { positive: true });
    cleaned.unit_price = requiredNumber(cleaned.unit_price, 'Purchase unit price', { positive: true });
    cleaned.discount_percent = requiredNumber(cleaned.discount_percent, 'Purchase discount', { maximum: 100 });
    cleaned.tax_percent = requiredNumber(cleaned.tax_percent, 'Purchase GST rate', { maximum: 100 });

    return cleaned;
}
