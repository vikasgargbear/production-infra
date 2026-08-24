/**
 * Invoice Item Utilities
 * 
 * Invoice-specific wrapper around shared product transformation utilities.
 */

import { prepareItemForTransaction, ProductInput } from '../../utils/productItemTransform';
import type { InvoiceItem } from '../hooks/useInvoiceLogic';
import { normalizeExactDecimal } from '../../../../utils/exactDecimal';
import type { CanonicalImportLine } from '../../utils/documentImport';

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
    products: Array<ProductInput | CanonicalImportLine>,
): InvoiceItem[] => products.map((product, index) => {
    if (product.free_supply_tax_treatment !== 'excluded_from_taxable_value'
        && product.free_supply_tax_treatment !== 'included_at_unit_rate') {
        throw new Error(
            `Imported item ${index + 1} is missing its canonical free-supply tax treatment.`,
        );
    }
    const exact = product as Record<string, unknown>;
    const optionalQuantity = (value: unknown, label: string): string | undefined =>
        value === undefined || value === null || value === ''
            ? undefined
            : normalizeExactDecimal(value, label, { scale: 6 });
    const mapped = prepareItemForInvoice({
        ...product as ProductInput,
        quantity: 0,
        free_quantity: 0,
    });
    return {
        ...mapped,
        quantity: normalizeExactDecimal(exact.quantity, `Imported item ${index + 1} billed quantity`, { scale: 6 }),
        free_quantity: normalizeExactDecimal(exact.free_quantity, `Imported item ${index + 1} free quantity`, { scale: 6 }),
        unit_price: normalizeExactDecimal(exact.unit_price ?? exact.sale_price, `Imported item ${index + 1} unit rate`, { scale: 4 }),
        discount_percent: normalizeExactDecimal(exact.discount_percent ?? 0, `Imported item ${index + 1} discount`, { scale: 6 }),
        available_quantity: optionalQuantity(exact.available_quantity, `Imported item ${index + 1} availability`),
        base_billed_quantity: optionalQuantity(exact.base_billed_quantity, `Imported item ${index + 1} base billed quantity`),
        base_free_quantity: optionalQuantity(exact.base_free_quantity, `Imported item ${index + 1} base free quantity`),
        source_billed_quantity: optionalQuantity(exact.source_billed_quantity, `Imported item ${index + 1} source billed quantity`),
        source_free_quantity: optionalQuantity(exact.source_free_quantity, `Imported item ${index + 1} source free quantity`),
    } as unknown as InvoiceItem;
});
