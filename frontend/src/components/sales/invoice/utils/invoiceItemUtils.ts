/**
 * Invoice Item Utilities
 * 
 * Invoice-specific wrapper around shared product transformation utilities.
 */

import { prepareItemForTransaction, ProductInput } from '../../utils/productItemTransform';
import type { InvoiceItem } from '../hooks/useInvoiceLogic';

/**
 * Prepare a product for invoice item format
 * 
 * This is a thin wrapper around the shared `prepareItemForTransaction` utility,
 * ensuring the result matches the InvoiceItem type.
 */
export const prepareItemForInvoice = (product: ProductInput): InvoiceItem => {
    return prepareItemForTransaction<InvoiceItem>(product);
};
