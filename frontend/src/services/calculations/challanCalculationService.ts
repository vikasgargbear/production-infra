/** Boundary between delivery-challan UI state and backend-owned calculations. */

import EnterpriseCalculator from '../enterpriseCalculator';
import { challanCalculationsApi } from '../api/modules/sales/calculations.api';


function numeric(value: unknown): number {
    const result = Number(value);
    return Number.isFinite(result) ? result : 0;
}

export async function calculateChallanPreview(challan: any, isOnline: boolean) {
    if (!isOnline) {
        const local = EnterpriseCalculator.calculateChallan(challan);
        return {
            items: local.items || [],
            totals: local.totals || {},
            gst_type: challan.gst_type || 'CGST/SGST'
        };
    }

    const customerId = numeric(challan.customer_id);
    if (customerId <= 0) {
        throw new Error('Select a customer before calculating a delivery challan.');
    }
    const items = (challan.items || []).map((item: any) => ({
        product_id: numeric(item.product_id) || undefined,
        quantity: numeric(item.quantity),
        unit_price: numeric(item.unit_price ?? item.sale_price),
        discount_percent: numeric(item.discount_percent),
        gst_percent: numeric(item.gst_percent ?? item.tax_percent)
    }));
    const response = await challanCalculationsApi.preview({
        customer_id: customerId,
        items,
        freight_charges: numeric(challan.freight_charges)
    });
    const data = response.data;
    return {
        items: data.line_items.map((line, index) => ({
            ...(challan.items[index] || {}),
            ...line,
            total: numeric(line.line_total),
            line_total: numeric(line.line_total)
        })),
        totals: data.totals,
        gst_type: data.gst_type
    };
}
