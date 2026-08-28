/** Read-only credit and debit note calculation contract. */

import type { AxiosResponse } from 'axios';
import { apiHelpers } from '../../apiClient';
import type {
    CalculationDecimalString,
    CalculationEntityId,
} from '../sales/calculations.api';


export interface NoteCalculationRequest {
    note_type: 'credit' | 'debit';
    party_type: 'customer' | 'supplier';
    party_id?: CalculationEntityId;
    gst_type?: 'CGST/SGST' | 'IGST';
    include_gst: boolean;
    items: Array<{
        product_id?: CalculationEntityId;
        product_name?: string;
        quantity: CalculationDecimalString;
        free_quantity?: CalculationDecimalString;
        free_supply_tax_treatment?: 'excluded_from_taxable_value' | 'included_at_unit_rate';
        unit_price: CalculationDecimalString;
        mrp?: CalculationDecimalString;
        discount_percent?: CalculationDecimalString;
        gst_percent?: CalculationDecimalString;
    }>;
}

export interface NoteCalculationPreviewLine {
    product_id?: CalculationEntityId;
    product_name?: string;
    quantity: CalculationDecimalString;
    free_quantity: CalculationDecimalString;
    free_supply_tax_treatment: 'excluded_from_taxable_value' | 'included_at_unit_rate';
    unit_price: CalculationDecimalString;
    mrp: CalculationDecimalString;
    discount_percent: CalculationDecimalString;
    gst_percent: CalculationDecimalString;
    tax_percent?: CalculationDecimalString;
    subtotal_amount: CalculationDecimalString;
    discount_amount: CalculationDecimalString;
    taxable_amount: CalculationDecimalString;
    cgst_amount: CalculationDecimalString;
    sgst_amount: CalculationDecimalString;
    igst_amount: CalculationDecimalString;
    tax_amount: CalculationDecimalString;
    total_amount: CalculationDecimalString;
}

export interface NoteCalculationPreviewTotals {
    subtotal_amount: CalculationDecimalString;
    discount_amount: CalculationDecimalString;
    taxable_amount: CalculationDecimalString;
    cgst_amount: CalculationDecimalString;
    sgst_amount: CalculationDecimalString;
    igst_amount: CalculationDecimalString;
    tax_amount: CalculationDecimalString;
    total_amount: CalculationDecimalString;
}

export interface NoteCalculationResponse {
    success: true;
    line_items: NoteCalculationPreviewLine[];
    totals: NoteCalculationPreviewTotals;
    calculation_timestamp: number;
    gst_type: 'CGST/SGST' | 'IGST';
}

export const noteCalculationsApi = {
    preview: (
        data: NoteCalculationRequest
    ): Promise<AxiosResponse<NoteCalculationResponse>> => {
        return apiHelpers.post<NoteCalculationResponse>('/calculations/note', data);
    }
};
