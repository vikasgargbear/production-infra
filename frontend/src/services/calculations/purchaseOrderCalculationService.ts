/** Boundary between purchase-order UI state and backend-owned calculations. */

import {
    purchaseCalculationsApi,
    PurchaseCalculationRequest
} from '../api/modules/purchase/calculations.api';
import { isCanonicalUuid } from '../../utils/canonicalUuid';


interface PurchasePreviewResult {
    items: Array<Record<string, unknown>>;
    totals: Record<string, number | undefined>;
    gst_type?: string;
}


function numeric(value: unknown, fallback: number = 0): number {
    const result = Number(value);
    return Number.isFinite(result) ? result : fallback;
}

function entityId(value: unknown, label: string): number | string | undefined {
    if (value === undefined || value === null || value === '') return undefined;
    const normalized = String(value).trim();
    if (isCanonicalUuid(normalized)) return normalized;
    const legacyId = Number(normalized);
    if (Number.isInteger(legacyId) && legacyId > 0) return legacyId;
    throw new Error(`${label} is missing its canonical identifier. Re-select it and try again.`);
}

export function toPurchaseCalculationRequest(order: any): PurchaseCalculationRequest {
    return {
        supplier_id: entityId(order.supplier_id, 'Supplier'),
        gst_type: order.gst_type,
        items: (order.items || []).filter((item: any) => item.product_id).map((item: any) => ({
            product_id: entityId(item.product_id, 'Product') as number | string,
            product_name: item.product_name,
            quantity: numeric(item.quantity),
            free_quantity: numeric(item.free_quantity),
            unit_price: numeric(item.unit_price),
            mrp: numeric(item.mrp),
            discount_percent: numeric(item.discount_percent),
            tax_percent: numeric(item.tax_percent ?? item.gst_percent)
        })),
        freight_charges: numeric(order.freight_charges),
        insurance_charges: numeric(order.insurance_charges),
        other_charges: numeric(order.other_charges)
    };
}

export async function calculatePurchaseOrderPreview(
    order: any,
    isOnline: boolean
): Promise<PurchasePreviewResult> {
    if (!isOnline) {
        throw new Error('Purchase calculations require the live ERP API. Reconnect and try again.');
    }

    if (numeric(order.discount_amount) !== 0) {
        throw new Error(
            'Purchase-order header discounts are blocked until their tax and persistence contract is baselined.'
        );
    }

    const response = await purchaseCalculationsApi.preview(toPurchaseCalculationRequest(order));
    const data = response.data;
    const items = data.line_items.map((line, index) => {
        const taxable = numeric(line.taxable_amount);
        const tax = numeric(line.tax_amount ?? line.total_tax_amount);
        return {
            ...(order.items[index] || {}),
            ...line,
            total: taxable + tax,
            total_amount: taxable + tax
        };
    });
    return {
        items,
        totals: {
            ...data.totals,
            gross_amount: data.totals.subtotal_amount,
            total_tax: data.totals.tax_amount,
            net_amount: data.totals.total_amount,
            final_amount: data.totals.total_amount
        },
        gst_type: data.gst_type
    };
}
