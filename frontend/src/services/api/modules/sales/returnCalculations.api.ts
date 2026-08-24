/** Read-only sales and purchase return calculation contracts. */

import type { AxiosResponse } from 'axios';
import { apiHelpers } from '../../apiClient';

export type ReturnDecimalString = string;


export interface ReturnCalculationRequest {
    return_type: 'sales' | 'purchase';
    customer_id?: number | string;
    supplier_id?: number | string;
    gst_type?: 'CGST/SGST' | 'IGST';
    include_gst: boolean;
    items: Array<{
        product_id?: number | string;
        return_quantity: ReturnDecimalString;
        paid_quantity: ReturnDecimalString;
        free_quantity: ReturnDecimalString;
        unit_price: ReturnDecimalString;
        discount_percent: ReturnDecimalString;
        tax_percent: ReturnDecimalString;
    }>;
}

export interface ReturnCalculationPreviewLine extends Record<string, unknown> {
    return_quantity: ReturnDecimalString;
    taxable_quantity: ReturnDecimalString;
    unit_price: ReturnDecimalString;
    discount_percent: ReturnDecimalString;
    discount_amount: ReturnDecimalString;
    tax_percent: ReturnDecimalString;
    taxable_amount: ReturnDecimalString;
    cgst_amount: ReturnDecimalString;
    sgst_amount: ReturnDecimalString;
    igst_amount: ReturnDecimalString;
    tax_amount: ReturnDecimalString;
    total_amount: ReturnDecimalString;
}

export interface ReturnCalculationPreviewTotals extends Record<string, ReturnDecimalString> {
    subtotal: ReturnDecimalString;
    tax_amount: ReturnDecimalString;
    cgst_amount: ReturnDecimalString;
    sgst_amount: ReturnDecimalString;
    igst_amount: ReturnDecimalString;
    round_off_amount: ReturnDecimalString;
    total_amount: ReturnDecimalString;
    total_return_quantity: ReturnDecimalString;
}

export interface ReturnCalculationResponse {
    success: true;
    line_items: ReturnCalculationPreviewLine[];
    totals: ReturnCalculationPreviewTotals;
    calculation_timestamp: number;
    gst_type: 'CGST/SGST' | 'IGST';
}

export const returnCalculationsApi = {
    preview: (
        data: ReturnCalculationRequest
    ): Promise<AxiosResponse<ReturnCalculationResponse>> => {
        return apiHelpers.post<ReturnCalculationResponse>('/calculations/return', data);
    }
};
