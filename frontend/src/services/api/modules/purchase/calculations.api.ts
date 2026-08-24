/** Read-only purchase calculation contracts. */

import type { AxiosResponse } from 'axios';
import { apiHelpers } from '../../apiClient';
import type {
    CalculationDecimalString,
    CalculationEntityId,
} from '../sales/calculations.api';


export interface PurchaseCalculationRequest {
    supplier_id?: CalculationEntityId;
    gst_type?: 'CGST/SGST' | 'IGST';
    items: Array<{
        product_id: CalculationEntityId;
        product_name?: string;
        quantity: CalculationDecimalString;
        free_quantity?: CalculationDecimalString;
        unit_price: CalculationDecimalString;
        mrp?: CalculationDecimalString;
        discount_percent?: CalculationDecimalString;
        tax_percent?: CalculationDecimalString;
        gst_percent?: CalculationDecimalString;
    }>;
    freight_charges?: CalculationDecimalString;
    insurance_charges?: CalculationDecimalString;
    other_charges?: CalculationDecimalString;
}

export interface PurchaseCalculationPreviewLine {
    product_id?: CalculationEntityId;
    product_name?: string;
    quantity: CalculationDecimalString;
    unit_price: CalculationDecimalString;
    discount_percent: CalculationDecimalString;
    discount_amount: CalculationDecimalString;
    tax_percent: CalculationDecimalString;
    taxable_amount: CalculationDecimalString;
    cgst_amount: CalculationDecimalString;
    sgst_amount: CalculationDecimalString;
    igst_amount: CalculationDecimalString;
    tax_amount: CalculationDecimalString;
    line_total: CalculationDecimalString;
    mrp: CalculationDecimalString;
}

export interface PurchaseCalculationPreviewTotals {
    subtotal_amount: CalculationDecimalString;
    discount_amount: CalculationDecimalString;
    taxable_amount: CalculationDecimalString;
    cgst_amount: CalculationDecimalString;
    sgst_amount: CalculationDecimalString;
    igst_amount: CalculationDecimalString;
    tax_amount: CalculationDecimalString;
    freight_charges: CalculationDecimalString;
    insurance_charges: CalculationDecimalString;
    other_charges: CalculationDecimalString;
    round_off_amount: CalculationDecimalString;
    total_amount: CalculationDecimalString;
    invoice_total: CalculationDecimalString;
}

export interface PurchaseCalculationResponse {
    success: true;
    line_items: PurchaseCalculationPreviewLine[];
    totals: PurchaseCalculationPreviewTotals;
    calculation_timestamp: number;
    gst_type: 'CGST/SGST' | 'IGST';
}

export const purchaseCalculationsApi = {
    preview: (
        data: PurchaseCalculationRequest
    ): Promise<AxiosResponse<PurchaseCalculationResponse>> => {
        return apiHelpers.post<PurchaseCalculationResponse>('/calculations/purchase-order', data);
    }
};
