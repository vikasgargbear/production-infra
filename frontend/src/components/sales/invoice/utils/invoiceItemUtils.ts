/**
 * Invoice Item Utilities
 * 
 * Invoice-specific wrapper around shared product transformation utilities.
 */

import { prepareItemForTransaction, ProductInput } from '../../utils/productItemTransform';
import type { InvoiceItem } from '../hooks/useInvoiceLogic';

type SelectedProductInput = Omit<ProductInput, 'quantity' | 'free_quantity'> & {
    quantity?: number;
    free_quantity?: number;
};

/**
 * Prepare a product for invoice item format
 * 
 * This is a thin wrapper around the shared `prepareItemForTransaction` utility,
 * ensuring the result matches the InvoiceItem type.
 */
export const prepareItemForInvoice = (product: ProductInput): InvoiceItem => {
    return prepareItemForTransaction<InvoiceItem>(product);
};

/** New UI selections start with one billed unit and no free units. */
export const prepareSelectedProductForInvoice = (
    product: SelectedProductInput,
): InvoiceItem => prepareItemForInvoice({
    ...product,
    quantity: product.quantity ?? 1,
    free_quantity: product.free_quantity ?? 0,
});

/** Canonical imports must carry both quantities explicitly; no UI defaults apply. */
export const prepareImportedItemsForInvoice = (
    products: ProductInput[],
): InvoiceItem[] => products.map((product, index) => {
    if (product.free_supply_tax_treatment !== 'excluded_from_taxable_value'
        && product.free_supply_tax_treatment !== 'included_at_unit_rate') {
        throw new Error(
            `Imported item ${index + 1} is missing its canonical free-supply tax treatment.`,
        );
    }
    return prepareItemForInvoice(product);
});
