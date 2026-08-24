import type { ReturnFormItem } from '../types/return.types';

const finiteNumber = (value: unknown, fallback = 0): number => {
    const result = Number(value);
    return Number.isFinite(result) ? result : fallback;
};

/** Project one canonical invoice line without inventing tax or quantity facts. */
export function projectInvoiceLineToSalesReturn(item: Record<string, unknown>): ReturnFormItem {
    const paidQuantity = finiteNumber(item.paid_quantity ?? item.quantity);
    const freeQuantity = finiteNumber(item.free_quantity);
    const totalQuantity = paidQuantity + freeQuantity;
    const componentTax = finiteNumber(item.cgst_rate) + finiteNumber(item.sgst_rate) + finiteNumber(item.igst_rate);
    const taxPercent = finiteNumber(item.tax_percent ?? item.gst_percent ?? item.tax_rate, componentTax);

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
        unit_price: finiteNumber(item.unit_price),
        discount_percent: finiteNumber(item.discount_percent),
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
        const free = finiteNumber(item.return_free_qty);
        return { ...item, return_paid_qty: paid, return_quantity: finiteNumber(paid) + free };
    }
    if (field === 'return_free_qty') {
        const paid = finiteNumber(item.return_paid_qty ?? item.return_quantity);
        const free = value;
        return { ...item, return_free_qty: free, return_quantity: paid + finiteNumber(free) };
    }
    return { ...item, [field]: rawValue };
}
