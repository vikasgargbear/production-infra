import {
  addExactDecimals,
} from '../../../utils/exactDecimal';

const quantityOptions = { scale: 6, maximumWholeDigits: 14 } as const;

export function updatePurchaseReturnItem(items: any[], index: number, field: string, value: unknown): any[] {
  const stateField = field === 'quantity' ? 'return_quantity' : field;
  return items.map((item, itemIndex) => {
    if (itemIndex !== index) return item;
    const nextValue = ['return_paid_qty', 'return_free_qty'].includes(stateField)
      ? String(value ?? '').trim()
      : ['return_quantity', 'unit_price'].includes(stateField)
        ? String(value ?? '').trim()
        : value;
    if (stateField === 'return_paid_qty' || stateField === 'return_free_qty') {
      const billed = stateField === 'return_paid_qty'
        ? nextValue
        : item.return_paid_qty;
      const free = stateField === 'return_free_qty'
        ? nextValue
        : item.return_free_qty;
      let total = String(nextValue ?? '');
      try {
        total = addExactDecimals([billed, free], 'Purchase return quantity', quantityOptions);
      } catch { total = ''; }
      return { ...item, [stateField]: nextValue, return_quantity: total };
    }
    return { ...item, [stateField]: nextValue };
  });
}
