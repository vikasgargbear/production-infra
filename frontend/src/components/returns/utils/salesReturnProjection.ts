import type { ReturnFormItem } from '../types/return.types';
import {
    addExactDecimals,
} from '../../../utils/exactDecimal';

const quantityOptions = { scale: 6, maximumWholeDigits: 14 } as const;
const sum = (values: readonly unknown[], label: string): string => (
    addExactDecimals(values, label, quantityOptions)
);

/** Keep paid, free and total return quantities as one coherent state transition. */
export function updateSalesReturnItem(
    item: ReturnFormItem,
    field: string,
    rawValue: unknown,
): ReturnFormItem {
    const value = typeof rawValue === 'string' ? rawValue.trim() : rawValue;
    if (field === 'return_paid_qty' || field === 'quantity') {
        const paid = value;
        const free = item.return_free_qty;
        let total = String(paid ?? '');
        try { total = sum([paid, free], 'Return quantity'); } catch { total = ''; }
        return { ...item, return_paid_qty: paid, return_quantity: total };
    }
    if (field === 'return_free_qty') {
        const paid = item.return_paid_qty;
        const free = value;
        let total = String(free ?? '');
        try { total = sum([paid, free], 'Return quantity'); } catch { total = ''; }
        return { ...item, return_free_qty: free, return_quantity: total };
    }
    return { ...item, [field]: rawValue };
}
