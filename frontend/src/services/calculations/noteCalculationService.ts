/** Boundary between credit/debit note forms and backend-owned calculations. */

import EnterpriseCalculator from '../enterpriseCalculator';
import {
    noteCalculationsApi,
    NoteCalculationRequest
} from '../api/modules/finance/noteCalculations.api';


export interface NotePreviewResult {
    items: Array<Record<string, unknown>>;
    subtotal: number;
    taxAmount: number;
    grandTotal: number;
    gstType: string;
}

function numeric(value: unknown, fallback: number = 0): number {
    const result = Number(value);
    return Number.isFinite(result) ? result : fallback;
}

export async function calculateNotePreview(
    items: any[],
    options: {
        noteType: 'credit' | 'debit';
        partyType?: 'customer' | 'supplier';
        partyId?: number | string;
        includeGst: boolean;
        isOnline: boolean;
    }
): Promise<NotePreviewResult> {
    if (!options.isOnline) {
        const local = EnterpriseCalculator.calculateNoteTotals(items, {
            include_gst: options.includeGst,
            selected_only: false,
            quantity_field: 'quantity',
            round_final_amount: false
        });
        return {
            items: local.items as unknown as Array<Record<string, unknown>>,
            subtotal: numeric(local.totals.subtotal_amount ?? local.totals.subtotal),
            taxAmount: numeric(local.totals.tax_amount ?? local.totals.total_tax_amount),
            grandTotal: numeric(local.totals.total_amount ?? local.totals.final_amount),
            gstType: 'CGST/SGST'
        };
    }

    const request: NoteCalculationRequest = {
        note_type: options.noteType,
        party_type: options.partyType || 'customer',
        party_id: options.partyId ? numeric(options.partyId) : undefined,
        include_gst: options.includeGst,
        items: items.map(item => ({
            product_id: item.product_id ? numeric(item.product_id) : undefined,
            product_name: item.product_name,
            quantity: numeric(item.quantity),
            unit_price: numeric(item.unit_price),
            discount_percent: numeric(item.discount_percent),
            gst_percent: numeric(item.gst_percent ?? item.tax_percent)
        }))
    };
    const response = await noteCalculationsApi.preview(request);
    const totals = response.data.totals;
    return {
        items: response.data.line_items.map((line, index) => ({
            ...(items[index] || {}),
            ...line
        })),
        subtotal: numeric(totals.taxable_amount),
        taxAmount: numeric(totals.tax_amount),
        grandTotal: numeric(totals.total_amount),
        gstType: response.data.gst_type
    };
}
