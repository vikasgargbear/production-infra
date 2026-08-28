export interface PurchaseItemDraft {
    product_name?: string;
    batch_number?: string;
    pack_type?: string;
    pack_size?: number | string;
    units_per_pack?: number | string;
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
    if (!String(item.batch_number || '').trim()) errors.push('Batch number');
    if (!String(item.pack_type || '').trim()) errors.push('Pack type');
    if (safeNumber(item.pack_size) <= 0) errors.push('Pack size');
    if (safeNumber(item.units_per_pack) <= 0) errors.push('Units per pack');
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
