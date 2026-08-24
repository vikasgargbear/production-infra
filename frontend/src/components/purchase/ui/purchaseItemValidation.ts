export interface PurchaseItemDraft {
    product_name?: string;
    expiry_date?: string;
    mrp?: number | string;
    unit_price?: number | string;
    selling_price?: number | string;
    quantity?: number | string;
    tax_percent?: number | string;
    discount_percent?: number | string;
}

const safeNumber = (value: unknown): number => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
};

export const getPurchaseItemErrors = (item: PurchaseItemDraft): string[] => {
    const errors: string[] = [];
    if (!String(item.product_name || '').trim()) errors.push('Product');
    if (!item.expiry_date) errors.push('Expiry date');
    if (safeNumber(item.quantity) <= 0) errors.push('Quantity');
    if (safeNumber(item.mrp) <= 0) errors.push('MRP');
    if (safeNumber(item.unit_price) <= 0) errors.push('Purchase Price/Cost');
    if (safeNumber(item.selling_price) <= 0) errors.push('Selling Price');
    if (item.tax_percent === undefined || item.tax_percent === null || item.tax_percent === '') {
        errors.push('GST %');
    }
    return errors;
};

export const calculatePurchaseItemTotal = (item: PurchaseItemDraft): number => {
    const qty = safeNumber(item.quantity);
    const cost = safeNumber(item.unit_price);
    const taxPercent = safeNumber(item.tax_percent);
    const discountPercent = safeNumber(item.discount_percent);
    const baseAmount = qty * cost;
    const discountedAmount = baseAmount - (baseAmount * discountPercent / 100);
    return discountedAmount + (discountedAmount * taxPercent / 100);
};
