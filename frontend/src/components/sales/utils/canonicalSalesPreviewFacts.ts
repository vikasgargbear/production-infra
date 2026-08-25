import { normalizeAuthoritativeDecimal } from '../../../utils/exactDecimal';
import { isCanonicalUuid } from '../../../utils/canonicalUuid';

const quantityOptions = { scale: 6, maximumWholeDigits: 14 } as const;
const rateOptions = { scale: 6, maximumWholeDigits: 4 } as const;
const moneyOptions = { scale: 2, maximumWholeDigits: 20, allowNegative: true } as const;

type RecordValue = Record<string, unknown>;

const record = (value: unknown): RecordValue | null => (
    value && typeof value === 'object' && !Array.isArray(value)
        ? value as RecordValue
        : null
);

const exact = (
    value: unknown,
    label: string,
    options: typeof quantityOptions | typeof rateOptions | typeof moneyOptions,
): string | null => {
    if (typeof value !== 'string' || value.trim() === '') return `${label} is unavailable.`;
    try {
        normalizeAuthoritativeDecimal(value, label, options);
        return null;
    } catch (error) {
        return error instanceof Error ? error.message : `${label} is invalid.`;
    }
};

const exactFields = (
    source: RecordValue,
    fields: readonly string[],
    prefix: string,
    options: typeof quantityOptions | typeof rateOptions | typeof moneyOptions,
): string | null => {
    for (const field of fields) {
        const error = exact(source[field], `${prefix} ${field.replace(/_/g, ' ')}`, options);
        if (error) return error;
    }
    return null;
};

const lineArray = (value: unknown, label: string): RecordValue[] | string => {
    if (!Array.isArray(value) || value.length === 0) return `${label} has no authoritative lines.`;
    const lines = value.map(record);
    if (lines.some(line => line === null)) return `${label} contains an invalid line.`;
    return lines as RecordValue[];
};

export const canonicalInvoicePreviewUnavailableReason = (value: unknown): string | null => {
    const invoice = record(value);
    if (!invoice) return 'Invoice preview is unavailable.';
    const totals = record(invoice.totals);
    if (!totals) return 'Invoice totals are unavailable from the canonical calculation API.';
    const totalsError = exactFields(totals, [
        'subtotal_amount', 'discount_amount', 'scheme_discount', 'taxable_amount', 'cgst_amount',
        'sgst_amount', 'igst_amount', 'total_tax_amount', 'freight_charges',
        'round_off_amount', 'final_amount',
    ], 'Invoice total', moneyOptions);
    if (totalsError) return totalsError;
    const lines = lineArray(invoice.items, 'Invoice preview');
    if (typeof lines === 'string') return lines;
    for (const [index, line] of lines.entries()) {
        const quantityError = exactFields(
            line,
            ['quantity', 'free_quantity'],
            `Invoice line ${index + 1}`,
            quantityOptions,
        );
        if (quantityError) return quantityError;
        const rateError = exactFields(
            line,
            ['unit_price', 'discount_percent', 'gst_percent'],
            `Invoice line ${index + 1}`,
            rateOptions,
        );
        if (rateError) return rateError;
        const moneyError = exactFields(line, [
            'taxable_amount', 'cgst_amount', 'sgst_amount', 'igst_amount',
            'total_tax_amount', 'line_total',
        ], `Invoice line ${index + 1}`, moneyOptions);
        if (moneyError) return moneyError;
    }
    return null;
};

export const canonicalOrderPreviewUnavailableReason = (value: unknown): string | null => {
    const order = record(value);
    if (!order) return 'Sales-order preview is unavailable.';
    const totalError = exactFields(order, [
        'subtotal_amount', 'discount_amount', 'tax_amount', 'cgst_amount',
        'sgst_amount', 'igst_amount', 'total_amount',
    ], 'Sales-order total', moneyOptions);
    if (totalError) return totalError;
    const lines = lineArray(order.items, 'Sales-order preview');
    if (typeof lines === 'string') return lines;
    for (const [index, line] of lines.entries()) {
        const error = exactFields(
            line,
            ['calculated_total', 'taxable_amount', 'tax_amount'],
            `Sales-order line ${index + 1}`,
            moneyOptions,
        );
        if (error) return error;
    }
    return null;
};

export const canonicalDispatchPreviewUnavailableReason = (value: unknown): string | null => {
    const dispatch = record(value);
    if (!dispatch) return 'Delivery-challan preview is unavailable.';
    if (!isCanonicalUuid(String(dispatch.source_order_id ?? ''))) {
        return 'Delivery-challan source sales order identity is unavailable.';
    }
    if (String(dispatch.customer_name ?? '').trim() === '') {
        return 'Delivery-challan customer identity is unavailable.';
    }
    const lines = lineArray(dispatch.items, 'Delivery-challan preview');
    if (typeof lines === 'string') return lines;
    for (const [index, line] of lines.entries()) {
        for (const [field, label] of [
            ['source_order_line_id', 'sales-order line'],
            ['product_id', 'product'],
            ['branch_id', 'branch'],
            ['location_id', 'stock location'],
            ['batch_id', 'batch'],
        ] as const) {
            if (!isCanonicalUuid(String(line[field] ?? ''))) {
                return `Delivery-challan line ${index + 1} ${label} identity is unavailable.`;
            }
        }
        if (String(line.product_name ?? '').trim() === '') {
            return `Delivery-challan line ${index + 1} product name is unavailable.`;
        }
        if (String(line.batch_number ?? '').trim() === '') {
            return `Delivery-challan line ${index + 1} batch number is unavailable.`;
        }
        if (String(line.uom_code ?? line.unit ?? '').trim() === '') {
            return `Delivery-challan line ${index + 1} unit is unavailable.`;
        }
        const error = exactFields(
            line,
            ['quantity', 'free_quantity'],
            `Delivery-challan line ${index + 1}`,
            quantityOptions,
        );
        if (error) return error;
    }
    return null;
};
