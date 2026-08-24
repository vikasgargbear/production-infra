/** Exact boundary between delivery-challan state and backend-owned calculations. */

import {
    challanCalculationsApi,
    type ChallanCalculationRequest,
    type ChallanCalculationResponse,
    type InvoiceCalculationPreviewLine,
} from '../api/modules/sales/calculations.api';
import type { Challan } from '../../components/sales/challan/types/challanTypes';
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
    sumMoney,
} from './exactCalculationPreview';

function toRequest(challan: Challan): ChallanCalculationRequest {
    return {
        customer_id: calculationEntityId(challan.customer_id, 'Customer', true)!,
        gst_type: challan.gst_type,
        items: challan.items.map((item, index) => {
            const label = `Challan calculation items[${index}]`;
            return {
                product_id: calculationEntityId(item.product_id, `${label}.product_id`, true),
                quantity: inputQuantity(item.quantity, `${label}.quantity`),
                free_quantity: inputQuantity(item.free_quantity, `${label}.free_quantity`),
                free_supply_tax_treatment: item.free_supply_tax_treatment ?? 'excluded_from_taxable_value',
                unit_price: inputRate(item.unit_price ?? item.sale_price, `${label}.unit_price`),
                discount_percent: inputPercent(item.discount_percent, `${label}.discount_percent`),
                gst_percent: inputPercent(item.gst_percent ?? item.tax_percent, `${label}.gst_percent`),
            };
        }),
        freight_charges: inputMoney(challan.freight_charges, 'Challan freight charges'),
    };
}

function normalizeLine(line: InvoiceCalculationPreviewLine, index: number) {
    const label = `Challan preview lines[${index}]`;
    const optionalPercent = (value: unknown, field: string) => value === undefined
        ? undefined
        : outputPercent(value, `${label}.${field}`);
    return {
        ...line,
        quantity: outputQuantity(line.quantity, `${label}.quantity`),
        free_quantity: outputQuantity(line.free_quantity, `${label}.free_quantity`),
        subtotal: outputMoney(line.subtotal, `${label}.subtotal`),
        discount_amount: outputMoney(line.discount_amount, `${label}.discount_amount`),
        taxable_amount: outputMoney(line.taxable_amount, `${label}.taxable_amount`),
        cgst_amount: outputMoney(line.cgst_amount, `${label}.cgst_amount`),
        sgst_amount: outputMoney(line.sgst_amount, `${label}.sgst_amount`),
        igst_amount: outputMoney(line.igst_amount, `${label}.igst_amount`),
        total_tax: outputMoney(line.total_tax, `${label}.total_tax`),
        total_tax_amount: outputMoney(line.total_tax_amount, `${label}.total_tax_amount`),
        line_total: outputMoney(line.line_total, `${label}.line_total`),
        gst_percent: optionalPercent(line.gst_percent, 'gst_percent'),
        cgst_percent: optionalPercent(line.cgst_percent, 'cgst_percent'),
        sgst_percent: optionalPercent(line.sgst_percent, 'sgst_percent'),
        igst_percent: optionalPercent(line.igst_percent, 'igst_percent'),
        scheme_discount: line.scheme_discount === undefined
            ? undefined
            : outputMoney(line.scheme_discount, `${label}.scheme_discount`),
    };
}

function normalizeTotals(totals: ChallanCalculationResponse['totals']) {
    return {
        subtotal_amount: outputMoney(totals.subtotal_amount, 'Challan totals.subtotal_amount'),
        discount_amount: outputMoney(totals.discount_amount, 'Challan totals.discount_amount'),
        taxable_amount: outputMoney(totals.taxable_amount, 'Challan totals.taxable_amount'),
        cgst_amount: outputMoney(totals.cgst_amount, 'Challan totals.cgst_amount'),
        sgst_amount: outputMoney(totals.sgst_amount, 'Challan totals.sgst_amount'),
        igst_amount: outputMoney(totals.igst_amount, 'Challan totals.igst_amount'),
        total_tax_amount: outputMoney(totals.total_tax_amount, 'Challan totals.total_tax_amount'),
        freight_charges: outputMoney(totals.freight_charges, 'Challan totals.freight_charges'),
        final_amount: outputMoney(totals.final_amount, 'Challan totals.final_amount'),
    };
}

export function normalizeChallanPreview(
    challan: Challan,
    data: ChallanCalculationResponse,
    request = toRequest(challan),
) {
    assertCalculationEnvelope(data, 'Challan preview response');
    const lines = data.line_items.map(normalizeLine);
    const totals = normalizeTotals(data.totals);
    if (lines.length !== request.items.length) {
        throw new Error('Challan preview line count does not match the submitted calculation lines.');
    }
    lines.forEach((line, index) => {
        assertExactEqual(line.quantity, request.items[index].quantity, `Challan preview lines[${index}] quantity`, calculationQuantityOptions);
        assertExactEqual(line.free_quantity, request.items[index].free_quantity || '0', `Challan preview lines[${index}] free quantity`, calculationQuantityOptions);
        assertExactEqual(line.total_tax, line.total_tax_amount, `Challan preview lines[${index}] tax aliases`);
    });
    assertExactEqual(totals.subtotal_amount, sumMoney(lines.map(line => line.subtotal), 'Challan line subtotal'), 'Challan subtotal');
    assertExactEqual(totals.taxable_amount, sumMoney(lines.map(line => line.taxable_amount), 'Challan line taxable'), 'Challan taxable amount');
    assertExactEqual(totals.total_tax_amount, sumMoney(lines.map(line => line.total_tax_amount), 'Challan line tax'), 'Challan total tax');
    assertExactEqual(totals.final_amount, sumMoney([totals.taxable_amount, totals.total_tax_amount, totals.freight_charges], 'Challan final total'), 'Challan final amount');

    return {
        items: lines.map((line, index) => ({
            ...(challan.items[index] || {}),
            ...line,
            product_id: challan.items[index]?.product_id,
            batch_id: challan.items[index]?.batch_id,
            free_quantity: request.items[index].free_quantity || '0.000000',
            free_supply_tax_treatment: request.items[index].free_supply_tax_treatment,
            total: line.line_total,
        })),
        totals,
        gst_type: data.gst_type,
    };
}

export async function calculateChallanPreview(challan: Challan, isOnline: boolean) {
    if (!isOnline) throw new Error('Delivery challan preview requires the live API');
    const request = toRequest(challan);
    const response = await challanCalculationsApi.preview(request);
    return normalizeChallanPreview(challan, response.data, request);
}
