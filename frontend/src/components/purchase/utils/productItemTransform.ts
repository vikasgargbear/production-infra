/**
 * Purchase Module - Product to Item Transform Utilities
 * 
 * Transforms product data into purchase line items
 * Following sales module pattern
 */

import type { BasePurchaseItem, PurchaseOrderItem, PurchaseEntryItem, GRNItem } from '../types';

/**
 * Generate temporary ID for new items (offline use)
 */
export function generateTempId(): string {
    return `temp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Prepare product for Purchase Order line item
 */
export function prepareItemForPurchaseOrder(product: any): PurchaseOrderItem {
    return {
        id: generateTempId(),
        product_id: product.product_id || product.id,
        product_name: product.product_name || product.name,
        hsn_code: product.hsn_code || product.hsn,
        quantity: 1,
        free_quantity: 0,
        rate: product.purchase_price || product.cost_price || product.cost_per_unit || 0,
        discount_percent: 0,
        discount_amount: 0,
        tax_percent: product.gst_percent || product.tax_percent || 18,
        cgst_rate: (product.gst_percent || product.tax_percent || 18) / 2,
        sgst_rate: (product.gst_percent || product.tax_percent || 18) / 2,
        notes: '',
    };
}

/**
 * Prepare product for Purchase Entry line item (with batch/expiry)
 */
export function prepareItemForPurchaseEntry(product: any): PurchaseEntryItem {
    return {
        id: generateTempId(),
        product_id: product.product_id || product.id,
        product_name: product.product_name || product.name,
        hsn_code: product.hsn_code || product.hsn,
        quantity: 1,
        free_quantity: 0,
        rate: product.purchase_price || product.cost_price || product.cost_per_unit || 0,
        discount_percent: 0,
        discount_amount: 0,
        tax_percent: product.gst_percent || product.tax_percent || 18,
        cgst_rate: (product.gst_percent || product.tax_percent || 18) / 2,
        sgst_rate: (product.gst_percent || product.tax_percent || 18) / 2,

        // Purchase entry specific
        batch_number: '',
        expiry_date: '',
        manufacturing_date: null,
        mrp_per_unit: product.mrp_per_unit || product.mrp || 0,
        sale_price_per_unit: product.sale_price_per_unit || product.selling_price || 0,
        cost_per_unit: product.purchase_price || product.cost_price || product.cost_per_unit || 0,
    };
}

/**
 * Prepare product for GRN line item
 */
export function prepareItemForGRN(product: any, poItem?: any): GRNItem {
    return {
        id: generateTempId(),
        product_id: product.product_id || product.id,
        product_name: product.product_name || product.name,
        hsn_code: product.hsn_code || product.hsn,
        quantity: poItem?.quantity || 1,
        received_quantity: poItem?.quantity || 1,
        rejected_quantity: 0,
        free_quantity: poItem?.free_quantity || 0,
        rate: poItem?.rate || product.purchase_price || product.cost_per_unit || 0,
        discount_percent: poItem?.discount_percent || 0,
        tax_percent: poItem?.tax_percent || product.gst_percent || 18,
        cgst_rate: ((poItem?.tax_percent || product.gst_percent || 18) / 2),
        sgst_rate: ((poItem?.tax_percent || product.gst_percent || 18) / 2),

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

    // Ensure numeric fields
    cleaned.quantity = parseFloat(cleaned.quantity as any) || 0;
    cleaned.rate = parseFloat(cleaned.rate as any) || 0;
    cleaned.discount_percent = parseFloat(cleaned.discount_percent as any) || 0;
    cleaned.tax_percent = parseFloat(cleaned.tax_percent as any) || 0;

    return cleaned;
}
