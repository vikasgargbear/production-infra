/** Read-only sales calculation contracts. Document writes recalculate server-side. */

import type { AxiosResponse } from 'axios';
import { apiHelpers } from '../../apiClient';

export type CalculationDecimalString = string;
export type CalculationEntityId = number | string;

export interface InvoiceCalculationLine {
    product_id?: CalculationEntityId;
    quantity: CalculationDecimalString;
    free_quantity?: CalculationDecimalString;
    free_supply_tax_treatment?:
        | 'excluded_from_taxable_value'
        | 'included_at_unit_rate';
    unit_price: CalculationDecimalString;
    mrp?: CalculationDecimalString;
    discount_percent?: CalculationDecimalString;
    gst_percent?: CalculationDecimalString;
    tax_percent?: CalculationDecimalString;
}

export interface InvoiceCalculationRequest {
    customer_id?: CalculationEntityId;
    gst_type?: string;
    items: InvoiceCalculationLine[];
    freight_charges?: CalculationDecimalString;
    insurance_charges?: CalculationDecimalString;
    other_charges?: CalculationDecimalString;
    discount_type?: 'percentage' | 'amount' | 'fixed';
    discount_percent?: CalculationDecimalString;
    discount_amount?: CalculationDecimalString;
}

export interface InvoiceCalculationPreviewLine {
    product_id?: CalculationEntityId;
    batch_id?: CalculationEntityId;
    quantity: CalculationDecimalString;
    free_quantity: CalculationDecimalString;
    free_supply_tax_treatment:
        | 'excluded_from_taxable_value'
        | 'included_at_unit_rate';
    subtotal: CalculationDecimalString;
    discount_amount: CalculationDecimalString;
    taxable_amount: CalculationDecimalString;
    cgst_amount: CalculationDecimalString;
    sgst_amount: CalculationDecimalString;
    igst_amount: CalculationDecimalString;
    total_tax: CalculationDecimalString;
    total_tax_amount: CalculationDecimalString;
    line_total: CalculationDecimalString;
    gst_percent?: CalculationDecimalString;
    cgst_percent?: CalculationDecimalString;
    sgst_percent?: CalculationDecimalString;
    igst_percent?: CalculationDecimalString;
    scheme_discount?: CalculationDecimalString;
}

export interface InvoiceCalculationPreviewTotals {
    subtotal_amount: CalculationDecimalString;
    discount_amount: CalculationDecimalString;
    scheme_discount: CalculationDecimalString;
    scheme_discount_percent: CalculationDecimalString;
    taxable_amount: CalculationDecimalString;
    cgst_amount: CalculationDecimalString;
    sgst_amount: CalculationDecimalString;
    igst_amount: CalculationDecimalString;
    total_tax_amount: CalculationDecimalString;
    freight_charges: CalculationDecimalString;
    insurance_charges: CalculationDecimalString;
    other_charges: CalculationDecimalString;
    round_off_amount: CalculationDecimalString;
    final_amount: CalculationDecimalString;
}

export interface ChallanCalculationPreviewTotals {
    subtotal_amount: CalculationDecimalString;
    discount_amount: CalculationDecimalString;
    taxable_amount: CalculationDecimalString;
    cgst_amount: CalculationDecimalString;
    sgst_amount: CalculationDecimalString;
    igst_amount: CalculationDecimalString;
    total_tax_amount: CalculationDecimalString;
    freight_charges: CalculationDecimalString;
    final_amount: CalculationDecimalString;
}

export interface InvoiceCalculationResponse {
    success: true;
    line_items: InvoiceCalculationPreviewLine[];
    totals: InvoiceCalculationPreviewTotals;
    calculation_timestamp: number;
    gst_type: 'CGST/SGST' | 'IGST';
}

export interface SalesOrderCalculationRequest {
    customer_id: CalculationEntityId;
    gst_type?: string;
    order_date?: string;
    delivery_date?: string;
    items: Array<{
        product_id: CalculationEntityId;
        batch_id?: CalculationEntityId;
        batch_number?: string;
        quantity: CalculationDecimalString;
        free_quantity?: CalculationDecimalString;
        free_supply_tax_treatment?:
            | 'excluded_from_taxable_value'
            | 'included_at_unit_rate';
        unit_price: CalculationDecimalString;
        mrp?: CalculationDecimalString;
        discount_percent?: CalculationDecimalString;
        tax_percent?: CalculationDecimalString;
        uom?: string;
        pack_type?: string;
    }>;
    delivery_charges?: CalculationDecimalString;
    other_charges?: CalculationDecimalString;
    discount_type?: 'percentage' | 'amount' | 'fixed';
    discount_percent?: CalculationDecimalString;
    discount_amount?: CalculationDecimalString;
}

export interface ChallanCalculationRequest {
    customer_id: CalculationEntityId;
    gst_type: 'CGST/SGST' | 'IGST';
    items: InvoiceCalculationLine[];
    freight_charges?: CalculationDecimalString;
}

export interface ChallanCalculationResponse extends Omit<InvoiceCalculationResponse, 'totals'> {
    totals: ChallanCalculationPreviewTotals;
}

export const invoiceCalculationsApi = {
    preview: (
        data: InvoiceCalculationRequest
    ): Promise<AxiosResponse<InvoiceCalculationResponse>> => {
        return apiHelpers.post<InvoiceCalculationResponse>('/calculations/invoice', data);
    }
};

export const salesOrderCalculationsApi = {
    preview: (
        data: SalesOrderCalculationRequest
    ): Promise<AxiosResponse<InvoiceCalculationResponse>> => {
        return apiHelpers.post<InvoiceCalculationResponse>('/calculations/sales-order', data);
    }
};

export const challanCalculationsApi = {
    preview: (
        data: ChallanCalculationRequest
    ): Promise<AxiosResponse<ChallanCalculationResponse>> => {
        return apiHelpers.post<ChallanCalculationResponse>('/calculations/challan', data);
    }
};
