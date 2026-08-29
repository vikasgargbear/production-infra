/**
 * Invoice Item Utilities
 * 
 * Invoice-specific wrapper around shared product transformation utilities.
 */

import { prepareItemForTransaction, ProductInput } from '../../utils/productItemTransform';
import type { InvoiceItem } from '../hooks/useInvoiceLogic';
import {
    exactDecimalString,
    exactDecimalUnits,
    normalizeExactDecimal,
} from '../../../../utils/exactDecimal';
import type { CanonicalImportLine } from '../../utils/documentImport';

type SelectedProductInput = Omit<ProductInput, 'quantity' | 'free_quantity'> & {
    quantity: string;
    free_quantity: string;
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

const roundToVisiblePrecision = (
    value: unknown,
    label: string,
    sourceScale: number,
    visibleScale: number,
): string => {
    const sourceUnits = exactDecimalUnits(value, label, {
        scale: sourceScale,
        maximumWholeDigits: 16,
    });
    const divisor = 10n ** BigInt(sourceScale - visibleScale);
    const roundedVisibleUnits = (sourceUnits + (divisor / 2n)) / divisor;
    return exactDecimalString(roundedVisibleUnits, visibleScale);
};

/**
 * Direct invoice entry intentionally exposes two-decimal commercial inputs.
 * Round the reviewed master-data suggestion once, before it becomes the draft
 * command value, so the amount displayed to the operator is also the amount
 * submitted to canonical calculation/posting.
 */
export const normalizeDirectInvoiceCommercialInputs = (item: InvoiceItem): InvoiceItem => ({
    ...item,
    unit_price: roundToVisiblePrecision(item.unit_price, 'Selected invoice unit rate', 4, 2),
    discount_percent: roundToVisiblePrecision(
        item.discount_percent ?? '0',
        'Selected invoice discount percent',
        6,
        2,
    ),
});

/** UI selections must carry the operator's exact billed/free quantity intent. */
export const prepareSelectedProductForInvoice = (
    product: SelectedProductInput,
): InvoiceItem => {
    if (typeof product.quantity !== 'string' || typeof product.free_quantity !== 'string') {
        throw new Error('Selected product billed and free quantities must remain exact decimal strings.');
    }
    return normalizeDirectInvoiceCommercialInputs(prepareItemForInvoice(product));
};

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
    const billedQuantity = normalizeExactDecimal(
        exact.quantity,
        `Imported item ${index + 1} billed quantity`,
        { scale: 6 },
    );
    const freeQuantity = normalizeExactDecimal(
        exact.free_quantity,
        `Imported item ${index + 1} free quantity`,
        { scale: 6 },
    );
    const unitPrice = normalizeExactDecimal(
        exact.unit_price ?? exact.sale_price,
        `Imported item ${index + 1} unit rate`,
        { scale: 4 },
    );
    const mapped = prepareItemForInvoice({
        ...product as ProductInput,
        quantity: billedQuantity,
        free_quantity: freeQuantity,
        unit_price: unitPrice,
    });
    return {
        ...mapped,
        quantity: billedQuantity,
        free_quantity: freeQuantity,
        unit_price: unitPrice,
        discount_percent: normalizeExactDecimal(exact.discount_percent, `Imported item ${index + 1} discount`, { scale: 6 }),
        available_quantity: optionalQuantity(exact.available_quantity, `Imported item ${index + 1} availability`),
        base_billed_quantity: optionalQuantity(exact.base_billed_quantity, `Imported item ${index + 1} base billed quantity`),
        base_free_quantity: optionalQuantity(exact.base_free_quantity, `Imported item ${index + 1} base free quantity`),
        source_billed_quantity: optionalQuantity(exact.source_billed_quantity, `Imported item ${index + 1} source billed quantity`),
        source_free_quantity: optionalQuantity(exact.source_free_quantity, `Imported item ${index + 1} source free quantity`),
    } as unknown as InvoiceItem;
});
