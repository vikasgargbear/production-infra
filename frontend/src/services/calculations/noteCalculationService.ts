/** Exact boundary between credit/debit note forms and backend-owned calculations. */

import {
    noteCalculationsApi,
    type NoteCalculationPreviewLine,
    type NoteCalculationPreviewTotals,
    type NoteCalculationRequest,
    type NoteCalculationResponse,
} from '../api/modules/finance/noteCalculations.api';
import {
    assertCalculationEnvelope,
    assertExactEqual,
    calculationEntityId,
    calculationQuantityOptions,
    inputPercent,
    inputQuantity,
    inputRate,
    outputMoney,
    outputPercent,
    outputQuantity,
    outputRate,
    sumMoney,
} from './exactCalculationPreview';

export interface NotePreviewResult {
    items: Array<Record<string, unknown>>;
    subtotal: string;
    taxAmount: string;
    grandTotal: string;
    gstType: 'CGST/SGST' | 'IGST';
}

function normalizeLine(line: NoteCalculationPreviewLine, index: number) {
    const label = `Note preview lines[${index}]`;
    return {
        ...line,
        quantity: outputQuantity(line.quantity, `${label}.quantity`),
        free_quantity: outputQuantity(line.free_quantity, `${label}.free_quantity`),
        unit_price: outputRate(line.unit_price, `${label}.unit_price`),
        mrp: outputRate(line.mrp, `${label}.mrp`),
        discount_percent: outputPercent(line.discount_percent, `${label}.discount_percent`),
        gst_percent: outputPercent(line.gst_percent, `${label}.gst_percent`),
        tax_percent: line.tax_percent === undefined ? undefined : outputPercent(line.tax_percent, `${label}.tax_percent`),
        subtotal_amount: outputMoney(line.subtotal_amount, `${label}.subtotal_amount`),
        discount_amount: outputMoney(line.discount_amount, `${label}.discount_amount`),
        taxable_amount: outputMoney(line.taxable_amount, `${label}.taxable_amount`),
        cgst_amount: outputMoney(line.cgst_amount, `${label}.cgst_amount`),
        sgst_amount: outputMoney(line.sgst_amount, `${label}.sgst_amount`),
        igst_amount: outputMoney(line.igst_amount, `${label}.igst_amount`),
        tax_amount: outputMoney(line.tax_amount, `${label}.tax_amount`),
        total_amount: outputMoney(line.total_amount, `${label}.total_amount`),
    };
}

function normalizeTotals(totals: NoteCalculationPreviewTotals) {
    return {
        subtotal_amount: outputMoney(totals.subtotal_amount, 'Note totals.subtotal_amount'),
        discount_amount: outputMoney(totals.discount_amount, 'Note totals.discount_amount'),
        taxable_amount: outputMoney(totals.taxable_amount, 'Note totals.taxable_amount'),
        cgst_amount: outputMoney(totals.cgst_amount, 'Note totals.cgst_amount'),
        sgst_amount: outputMoney(totals.sgst_amount, 'Note totals.sgst_amount'),
        igst_amount: outputMoney(totals.igst_amount, 'Note totals.igst_amount'),
        tax_amount: outputMoney(totals.tax_amount, 'Note totals.tax_amount'),
        total_amount: outputMoney(totals.total_amount, 'Note totals.total_amount'),
    };
}

function normalizeNotePreview(
    items: any[],
    data: NoteCalculationResponse,
    request: NoteCalculationRequest,
): NotePreviewResult {
    assertCalculationEnvelope(data, 'Note preview response');
    const lines = data.line_items.map(normalizeLine);
    const totals = normalizeTotals(data.totals);
    if (lines.length !== request.items.length) {
        throw new Error('Note preview line count does not match the submitted calculation lines.');
    }
    lines.forEach((line, index) => {
        assertExactEqual(line.quantity, request.items[index].quantity, `Note preview lines[${index}] quantity`, calculationQuantityOptions);
    });
    assertExactEqual(totals.subtotal_amount, sumMoney(lines.map(line => line.subtotal_amount), 'Note line subtotal'), 'Note subtotal');
    assertExactEqual(totals.discount_amount, sumMoney(lines.map(line => line.discount_amount), 'Note line discount'), 'Note discount');
    assertExactEqual(totals.taxable_amount, sumMoney(lines.map(line => line.taxable_amount), 'Note line taxable'), 'Note taxable amount');
    assertExactEqual(totals.tax_amount, sumMoney(lines.map(line => line.tax_amount), 'Note line tax'), 'Note total tax');
    assertExactEqual(totals.total_amount, sumMoney(lines.map(line => line.total_amount), 'Note line total'), 'Note grand total');
    return {
        items: lines.map((line, index) => ({ ...(items[index] || {}), ...line })),
        subtotal: totals.taxable_amount,
        taxAmount: totals.tax_amount,
        grandTotal: totals.total_amount,
        gstType: data.gst_type,
    };
}

export async function calculateNotePreview(
    items: any[],
    options: {
        noteType: 'credit' | 'debit';
        partyType?: 'customer' | 'supplier';
        partyId?: number | string;
        includeGst: boolean;
        isOnline: boolean;
    },
): Promise<NotePreviewResult> {
    if (!options.isOnline) {
        throw new Error('Credit and debit note previews require the live ERP API. Reconnect and try again.');
    }
    const request: NoteCalculationRequest = {
        note_type: options.noteType,
        party_type: options.partyType || 'customer',
        party_id: calculationEntityId(options.partyId, 'Note party'),
        include_gst: options.includeGst,
        items: items.map((item, index) => {
            const label = `Note calculation items[${index}]`;
            return {
                product_id: calculationEntityId(item.product_id, `${label}.product_id`),
                product_name: item.product_name,
                quantity: inputQuantity(item.quantity, `${label}.quantity`),
                free_quantity: inputQuantity(item.free_quantity, `${label}.free_quantity`),
                free_supply_tax_treatment: item.free_supply_tax_treatment || 'excluded_from_taxable_value',
                unit_price: inputRate(item.unit_price, `${label}.unit_price`),
                mrp: inputRate(item.mrp, `${label}.mrp`),
                discount_percent: inputPercent(item.discount_percent, `${label}.discount_percent`),
                gst_percent: inputPercent(item.gst_percent ?? item.tax_percent, `${label}.gst_percent`),
            };
        }),
    };
    const response = await noteCalculationsApi.preview(request);
    return normalizeNotePreview(items, response.data, request);
}
