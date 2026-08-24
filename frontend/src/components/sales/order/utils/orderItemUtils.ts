/**
 * Order Item Utilities
 * 
 * Order-specific wrapper around shared product transformation utilities.
 */

import { prepareItemForTransaction, ProductInput } from '../../utils/productItemTransform';

// Import OrderItem type from order types
// Adjust the import based on actual type location
export interface OrderItem {
    id?: number | string;
    product_id: string | number;
    product_name: string;
    batch_id?: string | number;
    batch_number?: string;
    expiry_date?: string;
    quantity: string | number;
    free_quantity?: string | number;
    unit_price?: string | number;
    mrp?: string | number;
    gst_percent?: string | number;
    hsn_code?: string;
    discount_percent?: string | number;
    unit?: string;
    total?: number;
    line_total?: number;
    [key: string]: any; // Allow additional fields
}

/**
 * Prepare a product for order item format
 * 
 * This is a thin wrapper around the shared `prepareItemForTransaction` utility,
 * ensuring the result matches the OrderItem type.
 */
export const prepareItemForOrder = (product: ProductInput): OrderItem => {
    return prepareItemForTransaction<OrderItem>(product);
};
