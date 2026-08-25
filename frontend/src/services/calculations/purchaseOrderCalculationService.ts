/** Exact boundary between purchase-order UI state and backend-owned calculations. */

import {
    purchaseCalculationsApi,
    type PurchaseCalculationPreviewLine,
    type PurchaseCalculationPreviewTotals,
    type PurchaseCalculationRequest,
    type PurchaseCalculationResponse,
} from '../api/modules/purchase/calculations.api';
import {
    assertCalculationEnvelope,
    assertExactEqual,
    calculationEntityId,
    calculationQuantityOptions,
    inputMoney,
    inputPercent,
    inputQuantity,
    inputRate,
    outputMoney,
    outputPercent,
    outputQuantity,
    outputRate,
    outputSignedMoney,
    sumMoney,
    sumSignedMoney,
} from './exactCalculationPreview';

interface PurchasePreviewResult {
    items: Array<Record<string, unknown>>;
    totals: Record<string, string>;
    gst_type: 'CGST/SGST' | 'IGST';
}

const requiredFact = (value: unknown, label: string): unknown => {
    if (value === '' || value === null || value === undefined) {
        throw new Error(`${label} must be explicit (zero is allowed).`);
    }
    return value;
};

export function toPurchaseCalculationRequest(order: any): PurchaseCalculationRequest {
    return {
        supplier_id: calculationEntityId(order.supplier_id, 'Supplier'),
        gst_type: order.gst_type || 'CGST/SGST',
        items: (order.items || []).filter((item: any) => item.product_id).map((item: any, index: number) => {
            const label = `Purchase calculation items[${index}]`;
            return {
                product_id: calculationEntityId(item.product_id, `${label}.product_id`, true)!,
                product_name: item.product_name,
                quantity: inputQuantity(requiredFact(item.quantity, `${label}.quantity`), `${label}.quantity`),
                free_quantity: inputQuantity(requiredFact(item.free_quantity, `${label}.free_quantity`), `${label}.free_quantity`),
                unit_price: inputRate(requiredFact(item.unit_price, `${label}.unit_price`), `${label}.unit_price`),
                mrp: inputRate(requiredFact(item.mrp, `${label}.mrp`), `${label}.mrp`),
                discount_percent: inputPercent(requiredFact(item.discount_percent, `${label}.discount_percent`), `${label}.discount_percent`),
                tax_percent: inputPercent(requiredFact(item.tax_percent ?? item.gst_percent, `${label}.tax_percent`), `${label}.tax_percent`),
            };
        }),
        freight_charges: inputMoney(requiredFact(order.freight_charges, 'Purchase freight charges'), 'Purchase freight charges'),
        insurance_charges: inputMoney(requiredFact(order.insurance_charges, 'Purchase insurance charges'), 'Purchase insurance charges'),
        other_charges: inputMoney(requiredFact(order.other_charges, 'Purchase other charges'), 'Purchase other charges'),
    };
}

function normalizeLine(line: PurchaseCalculationPreviewLine, index: number) {
    const label = `Purchase preview lines[${index}]`;
    return {
        ...line,
        quantity: outputQuantity(line.quantity, `${label}.quantity`),
        unit_price: outputRate(line.unit_price, `${label}.unit_price`),
        discount_percent: outputPercent(line.discount_percent, `${label}.discount_percent`),
        discount_amount: outputMoney(line.discount_amount, `${label}.discount_amount`),
        tax_percent: outputPercent(line.tax_percent, `${label}.tax_percent`),
        taxable_amount: outputMoney(line.taxable_amount, `${label}.taxable_amount`),
        cgst_amount: outputMoney(line.cgst_amount, `${label}.cgst_amount`),
        sgst_amount: outputMoney(line.sgst_amount, `${label}.sgst_amount`),
        igst_amount: outputMoney(line.igst_amount, `${label}.igst_amount`),
        tax_amount: outputMoney(line.tax_amount, `${label}.tax_amount`),
        line_total: outputMoney(line.line_total, `${label}.line_total`),
        mrp: outputRate(line.mrp, `${label}.mrp`),
    };
}

function normalizeTotals(totals: PurchaseCalculationPreviewTotals) {
    return {
        subtotal_amount: outputMoney(totals.subtotal_amount, 'Purchase totals.subtotal_amount'),
        discount_amount: outputMoney(totals.discount_amount, 'Purchase totals.discount_amount'),
        taxable_amount: outputMoney(totals.taxable_amount, 'Purchase totals.taxable_amount'),
        cgst_amount: outputMoney(totals.cgst_amount, 'Purchase totals.cgst_amount'),
        sgst_amount: outputMoney(totals.sgst_amount, 'Purchase totals.sgst_amount'),
        igst_amount: outputMoney(totals.igst_amount, 'Purchase totals.igst_amount'),
        tax_amount: outputMoney(totals.tax_amount, 'Purchase totals.tax_amount'),
        freight_charges: outputMoney(totals.freight_charges, 'Purchase totals.freight_charges'),
        insurance_charges: outputMoney(totals.insurance_charges, 'Purchase totals.insurance_charges'),
        other_charges: outputMoney(totals.other_charges, 'Purchase totals.other_charges'),
        round_off_amount: outputSignedMoney(totals.round_off_amount, 'Purchase totals.round_off_amount'),
        total_amount: outputMoney(totals.total_amount, 'Purchase totals.total_amount'),
        invoice_total: outputMoney(totals.invoice_total, 'Purchase totals.invoice_total'),
    };
}

function normalizePurchasePreview(
    order: any,
    data: PurchaseCalculationResponse,
    request: PurchaseCalculationRequest,
): PurchasePreviewResult {
    assertCalculationEnvelope(data, 'Purchase preview response');
    const lines = data.line_items.map(normalizeLine);
    const totals = normalizeTotals(data.totals);
    if (lines.length !== request.items.length) {
        throw new Error('Purchase preview line count does not match the submitted calculation lines.');
    }
    lines.forEach((line, index) => {
        assertExactEqual(line.quantity, request.items[index].quantity, `Purchase preview lines[${index}] quantity`, calculationQuantityOptions);
    });
    assertExactEqual(totals.subtotal_amount, sumMoney(lines.map(line => line.line_total), 'Purchase line subtotal'), 'Purchase subtotal');
    assertExactEqual(totals.discount_amount, sumMoney(lines.map(line => line.discount_amount), 'Purchase line discount'), 'Purchase discount');
    assertExactEqual(totals.taxable_amount, sumMoney(lines.map(line => line.taxable_amount), 'Purchase line taxable'), 'Purchase taxable amount');
    assertExactEqual(totals.tax_amount, sumMoney(lines.map(line => line.tax_amount), 'Purchase line tax'), 'Purchase total tax');
    const beforeRound = sumMoney([
        totals.taxable_amount,
        totals.tax_amount,
        totals.freight_charges,
        totals.insurance_charges,
        totals.other_charges,
    ], 'Purchase before-round total');
    assertExactEqual(totals.total_amount, sumSignedMoney([beforeRound, totals.round_off_amount], 'Purchase rounded total'), 'Purchase total amount');
    assertExactEqual(totals.invoice_total, totals.total_amount, 'Purchase invoice/order total aliases');
    return {
        items: lines.map((line, index) => {
            const total = sumMoney([line.taxable_amount, line.tax_amount], `Purchase preview lines[${index}] total`);
            return { ...(order.items[index] || {}), ...line, total, total_amount: total };
        }),
        totals: {
            ...totals,
            gross_amount: totals.subtotal_amount,
            total_tax: totals.tax_amount,
            net_amount: totals.total_amount,
            final_amount: totals.total_amount,
            round_off: totals.round_off_amount,
        },
        gst_type: data.gst_type,
    };
}

export async function calculatePurchaseOrderPreview(order: any, isOnline: boolean): Promise<PurchasePreviewResult> {
    if (!isOnline) {
        throw new Error('Purchase calculations require the live ERP API. Reconnect and try again.');
    }
    const request = toPurchaseCalculationRequest(order);
    const response = await purchaseCalculationsApi.preview(request);
    return normalizePurchasePreview(order, response.data, request);
}
