/** Boundary between return UI state and backend-owned calculations. */

import EnterpriseCalculator from '../enterpriseCalculator';
import {
    returnCalculationsApi,
    ReturnCalculationRequest
} from '../api/modules/sales/returnCalculations.api';


function numeric(value: unknown, fallback: number = 0): number {
    const result = Number(value);
    return Number.isFinite(result) ? result : fallback;
}

interface ReturnPreviewResult {
    items: Array<Record<string, unknown>>;
    totals: Record<string, number | undefined>;
    gst_type: string;
}

export async function calculateReturnPreview(
    returnData: any,
    returnType: 'sales' | 'purchase',
    isOnline: boolean
): Promise<ReturnPreviewResult> {
    const selectedItems = (returnData.items || []).filter(
        (item: any) => item.selected !== false && numeric(item.return_quantity ?? item.quantity) > 0
    );
    const includeGst = returnType === 'sales'
        ? !Boolean(returnData.withhold_gst)
        : returnData.include_gst !== false;

    if (!isOnline) {
        const local = returnType === 'sales'
            ? EnterpriseCalculator.calculateSalesReturn(returnData)
            : EnterpriseCalculator.calculatePurchaseReturn(returnData);
        return {
            items: local.items as unknown as Array<Record<string, unknown>>,
            totals: local.totals as unknown as Record<string, number | undefined>,
            gst_type: returnData.gst_type || 'CGST/SGST'
        };
    }

    const request: ReturnCalculationRequest = {
        return_type: returnType,
        customer_id: returnType === 'sales' && returnData.customer_id
            ? numeric(returnData.customer_id)
            : undefined,
        supplier_id: returnType === 'purchase' && returnData.supplier_id
            ? numeric(returnData.supplier_id)
            : undefined,
        gst_type: returnData.gst_type,
        include_gst: includeGst,
        items: selectedItems.map((item: any) => ({
            product_id: item.product_id ? numeric(item.product_id) : undefined,
            return_quantity: numeric(item.return_quantity ?? item.quantity),
            paid_quantity: numeric(item.paid_quantity ?? item.quantity),
            free_quantity: numeric(item.free_quantity),
            unit_price: numeric(item.unit_price ?? item.rate),
            discount_percent: numeric(item.discount_percent),
            tax_percent: numeric(item.tax_percent ?? item.gst_percent)
        }))
    };
    const response = await returnCalculationsApi.preview(request);
    const totals = response.data.totals;
    const items = response.data.line_items.map((line, index) => ({
        ...(selectedItems[index] || {}),
        ...line,
        return_value: numeric(line.taxable_amount),
        gst_amount: numeric(line.tax_amount),
        line_total: numeric(line.total_amount)
    }));
    return {
        items,
        totals: {
            ...totals,
            subtotal_amount: totals.subtotal,
            total_tax_amount: totals.tax_amount,
            final_amount: totals.total_amount
        },
        gst_type: response.data.gst_type
    };
}
