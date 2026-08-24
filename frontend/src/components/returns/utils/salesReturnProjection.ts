import type { ReturnFormItem } from '../types/return.types';
import { addExactDecimals, normalizeExactDecimal } from '../../../utils/exactDecimal';

const quantityOptions = { scale: 6, maximumWholeDigits: 14 } as const;
const rateOptions = { scale: 6, maximumWholeDigits: 14 } as const;
const exact = (value: unknown, label: string, fallback = '0'): string => (
    normalizeExactDecimal(value ?? fallback, label, quantityOptions)
);
const sum = (values: readonly unknown[], label: string): string => (
    addExactDecimals(values, label, quantityOptions)
);

/** Project one canonical invoice line without inventing tax or quantity facts. */
export function projectInvoiceLineToSalesReturn(item: Record<string, unknown>): ReturnFormItem {
    const paidQuantity = exact(item.paid_quantity ?? item.quantity, 'Paid quantity');
    const freeQuantity = exact(item.free_quantity, 'Free quantity');
    const totalQuantity = sum([paidQuantity, freeQuantity], 'Total quantity');
    const componentTax = addExactDecimals(
        [item.cgst_rate ?? '0', item.sgst_rate ?? '0', item.igst_rate ?? '0'],
        'Component tax rate',
        rateOptions,
    );
    const taxPercent = normalizeExactDecimal(
        item.tax_percent ?? item.gst_percent ?? item.tax_rate ?? componentTax,
        'Tax rate',
        rateOptions,
    );

    return {
        ...item,
        id: (item.invoice_item_id ?? item.id) as string | number | undefined,
        product_id: item.product_id as number | string,
        product_name: String(item.product_name ?? ''),
        batch_id: item.batch_id as number | string | undefined,
        quantity: totalQuantity,
        paid_quantity: paidQuantity,
        free_quantity: freeQuantity,
        return_quantity: totalQuantity,
        return_paid_qty: paidQuantity,
        return_free_qty: freeQuantity,
        unit_price: exact(item.unit_price, 'Unit price'),
        discount_percent: exact(item.discount_percent, 'Discount percent'),
        tax_percent: taxPercent,
        max_returnable_qty: totalQuantity,
        max_paid_qty: paidQuantity,
        max_free_qty: freeQuantity,
        selected: true,
        batch_number: String(item.batch_number ?? ''),
        expiry_date: item.expiry_date as string | undefined,
        manufacturing_date: item.manufacturing_date as string | undefined,
        invoice_item_id: item.invoice_item_id as number | string | undefined,
        disposition: 'RESTOCK',
        is_manual: false,
    };
}

/** Keep paid, free and total return quantities as one coherent state transition. */
export function updateSalesReturnItem(
    item: ReturnFormItem,
    field: string,
    rawValue: unknown,
): ReturnFormItem {
    const value = typeof rawValue === 'string' ? rawValue.trim() : rawValue;
    if (field === 'return_paid_qty' || field === 'quantity') {
        const paid = value;
        const free = item.return_free_qty ?? '0';
        let total = String(paid ?? '');
        try { total = sum([paid, free], 'Return quantity'); } catch { /* prepare fails closed */ }
        return { ...item, return_paid_qty: paid, return_quantity: total };
    }
    if (field === 'return_free_qty') {
        const paid = item.return_paid_qty ?? item.return_quantity ?? '0';
        const free = value;
        let total = String(free ?? '');
        try { total = sum([paid, free], 'Return quantity'); } catch { /* prepare fails closed */ }
        return { ...item, return_free_qty: free, return_quantity: total };
    }
    return { ...item, [field]: rawValue };
}
