/** Boundary between purchase-order UI state and backend-owned calculations. */

import EnterpriseCalculator from '../enterpriseCalculator';
import {
    purchaseCalculationsApi,
    PurchaseCalculationRequest
} from '../api/modules/purchase/calculations.api';


interface PurchasePreviewResult {
    items: Array<Record<string, unknown>>;
    totals: Record<string, number | undefined>;
    gst_type?: string;
}


function numeric(value: unknown, fallback: number = 0): number {
    const result = Number(value);
    return Number.isFinite(result) ? result : fallback;
}

function toRequest(order: any): PurchaseCalculationRequest {
    return {
        supplier_id: order.supplier_id ? numeric(order.supplier_id) : undefined,
        gst_type: order.gst_type,
        items: (order.items || []).filter((item: any) => item.product_id).map((item: any) => ({
            product_id: numeric(item.product_id),
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
        const local = EnterpriseCalculator.calculateTotals(
            (order.items || []).filter((item: any) => item.product_id),
            {
                invoice_discount: numeric(order.discount_amount),
                freight_charges: numeric(order.freight_charges),
                round_final_amount: true
            }
        );
        return {
            items: local.items as unknown as Array<Record<string, unknown>>,
            totals: local.totals as unknown as Record<string, number | undefined>,
            gst_type: order.gst_type || 'CGST/SGST'
        };
    }

    if (numeric(order.discount_amount) !== 0) {
        throw new Error(
            'Purchase-order header discounts are blocked until their tax and persistence contract is baselined.'
        );
    }

    const response = await purchaseCalculationsApi.preview(toRequest(order));
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
