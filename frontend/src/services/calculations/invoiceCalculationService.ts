/** Exact boundary between invoice UI state and canonical backend calculations. */

import {
    invoiceCalculationsApi,
    type InvoiceCalculationPreviewLine,
    type InvoiceCalculationPreviewTotals,
    type InvoiceCalculationRequest,
    type InvoiceCalculationResponse,
} from '../api/modules/sales/calculations.api';
import {
    assertCalculationEnvelope,
    assertExactEqual,
    calculationEntityId,
    calculationQuantityOptions,
    calculationSignedMoneyOptions,
    inputMoney,
    inputPercent,
    inputQuantity,
    inputRate,
    outputMoney,
    outputPercent,
    outputQuantity,
    outputSignedMoney,
    sumMoney,
    sumSignedMoney,
} from './exactCalculationPreview';
import { subtractExactDecimals } from '../../utils/exactDecimal';

const requiredInput = <T>(value: T | null | undefined | '', label: string): T => {
    if (value === undefined || value === null || value === '') {
        throw new Error(`${label} is missing its explicit value.`);
    }
    return value;
};

const requiredGstType = (value: unknown): 'CGST/SGST' | 'IGST' => {
    if (value === 'CGST/SGST' || value === 'IGST') return value;
    throw new Error('Invoice GST treatment is unavailable. Re-select the delivery address.');
};

const requiredFreeSupplyTreatment = (
    value: unknown,
    label: string,
): 'excluded_from_taxable_value' | 'included_at_unit_rate' => {
    if (value === 'excluded_from_taxable_value' || value === 'included_at_unit_rate') return value;
    throw new Error(`${label} is missing its explicit value.`);
};

const unsupportedCharge = (value: unknown, label: string): string => {
    if (value === undefined || value === null || value === '') return '0.00';
    const normalized = inputMoney(value, label);
    if (normalized !== '0.00') {
        throw new Error(`${label} is not supported by canonical invoice posting.`);
    }
    return normalized;
};

function toRequest(invoice: any): InvoiceCalculationRequest {
    const customer = invoice?.customer_details;
    const customerId = customer?.customer_id ?? customer?.id;
    return {
        customer_id: calculationEntityId(customerId, 'Customer'),
        gst_type: requiredGstType(invoice?.gst_type),
        items: (invoice?.items || []).map((item: any, index: number) => {
            const label = `Invoice calculation items[${index}]`;
            return {
                product_id: calculationEntityId(item.product_id, `${label}.product_id`),
                quantity: inputQuantity(requiredInput(item.quantity, `${label}.quantity`), `${label}.quantity`),
                free_quantity: inputQuantity(requiredInput(item.free_quantity, `${label}.free_quantity`), `${label}.free_quantity`),
                free_supply_tax_treatment: requiredFreeSupplyTreatment(item.free_supply_tax_treatment, `${label}.free_supply_tax_treatment`),
                unit_price: inputRate(requiredInput(item.unit_price, `${label}.unit_price`), `${label}.unit_price`),
                discount_percent: inputPercent(requiredInput(item.discount_percent, `${label}.discount_percent`), `${label}.discount_percent`),
                gst_percent: inputPercent(requiredInput(item.gst_percent ?? item.tax_percent, `${label}.gst_percent`), `${label}.gst_percent`),
            };
        }),
        freight_charges: inputMoney(requiredInput(invoice?.freight_charges, 'Invoice freight charges'), 'Invoice freight charges'),
        insurance_charges: unsupportedCharge(invoice?.insurance_charges, 'Invoice insurance charges'),
        other_charges: unsupportedCharge(invoice?.other_charges, 'Invoice other charges'),
        discount_type: requiredInput(invoice?.discount_type, 'Invoice discount type'),
        discount_percent: inputPercent(requiredInput(invoice?.discount_percent, 'Invoice discount percent'), 'Invoice discount percent'),
        discount_amount: inputMoney(requiredInput(invoice?.discount_amount, 'Invoice discount amount'), 'Invoice discount amount'),
    };
}

function normalizeLine(line: InvoiceCalculationPreviewLine, index: number) {
    const label = `Invoice preview lines[${index}]`;
    const optionalPercent = (value: unknown, field: string) => (
        value === undefined ? undefined : outputPercent(value, `${label}.${field}`)
    );
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

function normalizeTotals(totals: InvoiceCalculationPreviewTotals) {
    return {
        subtotal_amount: outputMoney(totals.subtotal_amount, 'Invoice totals.subtotal_amount'),
        discount_amount: outputMoney(totals.discount_amount, 'Invoice totals.discount_amount'),
        scheme_discount: outputMoney(totals.scheme_discount, 'Invoice totals.scheme_discount'),
        scheme_discount_percent: outputPercent(totals.scheme_discount_percent, 'Invoice totals.scheme_discount_percent'),
        taxable_amount: outputMoney(totals.taxable_amount, 'Invoice totals.taxable_amount'),
        cgst_amount: outputMoney(totals.cgst_amount, 'Invoice totals.cgst_amount'),
        sgst_amount: outputMoney(totals.sgst_amount, 'Invoice totals.sgst_amount'),
        igst_amount: outputMoney(totals.igst_amount, 'Invoice totals.igst_amount'),
        total_tax_amount: outputMoney(totals.total_tax_amount, 'Invoice totals.total_tax_amount'),
        freight_charges: outputMoney(totals.freight_charges, 'Invoice totals.freight_charges'),
        insurance_charges: outputMoney(totals.insurance_charges, 'Invoice totals.insurance_charges'),
        other_charges: outputMoney(totals.other_charges, 'Invoice totals.other_charges'),
        round_off_amount: outputSignedMoney(totals.round_off_amount, 'Invoice totals.round_off_amount'),
        final_amount: outputMoney(totals.final_amount, 'Invoice totals.final_amount'),
    };
}

function assertReconciled(
    request: InvoiceCalculationRequest,
    lines: ReturnType<typeof normalizeLine>[],
    totals: ReturnType<typeof normalizeTotals>,
) {
    if (lines.length !== request.items.length) {
        throw new Error('Invoice preview line count does not match the submitted calculation lines.');
    }
    lines.forEach((line, index) => {
        assertExactEqual(line.quantity, request.items[index].quantity, `Invoice preview lines[${index}] quantity`, calculationQuantityOptions);
        assertExactEqual(line.free_quantity, request.items[index].free_quantity, `Invoice preview lines[${index}] free quantity`, calculationQuantityOptions);
        assertExactEqual(line.total_tax, line.total_tax_amount, `Invoice preview lines[${index}] tax aliases`);
    });
    assertExactEqual(totals.subtotal_amount, sumMoney(lines.map(line => line.subtotal), 'Invoice line subtotal'), 'Invoice subtotal');
    assertExactEqual(totals.cgst_amount, sumMoney(lines.map(line => line.cgst_amount), 'Invoice line CGST'), 'Invoice CGST');
    assertExactEqual(totals.sgst_amount, sumMoney(lines.map(line => line.sgst_amount), 'Invoice line SGST'), 'Invoice SGST');
    assertExactEqual(totals.igst_amount, sumMoney(lines.map(line => line.igst_amount), 'Invoice line IGST'), 'Invoice IGST');
    assertExactEqual(totals.total_tax_amount, sumMoney(lines.map(line => line.total_tax_amount), 'Invoice line tax'), 'Invoice total tax');
    const beforeRound = sumMoney([
        totals.taxable_amount,
        totals.total_tax_amount,
        totals.freight_charges,
        totals.insurance_charges,
        totals.other_charges,
    ], 'Invoice before-round total');
    assertExactEqual(totals.final_amount, sumSignedMoney([beforeRound, totals.round_off_amount], 'Invoice rounded total'), 'Invoice final amount');
}

export function normalizeInvoicePreview(
    invoice: any,
    data: InvoiceCalculationResponse,
    request = toRequest(invoice),
) {
    assertCalculationEnvelope(data, 'Invoice preview response');
    const lines = data.line_items.map(normalizeLine);
    const totals = normalizeTotals(data.totals);
    assertReconciled(request, lines, totals);
    const items = lines.map((line, index) => ({
        ...(invoice.items[index] || {}),
        ...line,
        gst_amount: line.total_tax_amount,
        total_amount: line.line_total,
    }));
    return {
        items,
        totals: {
            ...totals,
            subtotal: totals.subtotal_amount,
            gross_amount: totals.subtotal_amount,
            total_discount: totals.discount_amount,
            taxable_before_scheme: sumMoney([totals.taxable_amount, totals.scheme_discount], 'Invoice taxable before scheme'),
            tax_amount: totals.total_tax_amount,
            total_tax: totals.total_tax_amount,
            total_gst: totals.total_tax_amount,
            cgst_total: totals.cgst_amount,
            sgst_total: totals.sgst_amount,
            igst_total: totals.igst_amount,
            round_off: totals.round_off_amount,
            net_amount: subtractExactDecimals(totals.final_amount, totals.round_off_amount, 'Invoice net before round-off', calculationSignedMoneyOptions),
            total_amount: totals.final_amount,
        },
        gst_type: data.gst_type,
    };
}

export async function calculateInvoicePreview(invoice: any, isOnline: boolean) {
    if (!isOnline) {
        throw new Error('Invoice preview requires the live ERP API. Reconnect and try again.');
    }
    const request = toRequest(invoice);
    const response = await invoiceCalculationsApi.preview(request);
    return normalizeInvoicePreview(invoice, response.data, request);
}
