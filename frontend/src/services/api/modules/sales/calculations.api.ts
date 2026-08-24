/** Read-only sales calculation contracts. Document writes recalculate server-side. */

import type { AxiosResponse } from 'axios';
import { apiHelpers } from '../../apiClient';


export interface InvoiceCalculationLine {
    product_id?: number | string;
    quantity: number | string;
    free_quantity?: number | string;
    unit_price: number | string;
    discount_percent?: number | string;
    gst_percent?: number | string;
    [key: string]: unknown;
}

export interface InvoiceCalculationRequest {
    customer_id?: number | string;
    gst_type?: string;
    items: InvoiceCalculationLine[];
    freight_charges?: number | string;
    insurance_charges?: number | string;
    other_charges?: number | string;
    discount_type?: 'percentage' | 'amount' | 'fixed';
    discount_percent?: number | string;
    discount_amount?: number | string;
}

export interface InvoiceCalculationResponse {
    success: true;
    line_items: Array<Record<string, number>>;
    totals: Record<string, number>;
    calculation_timestamp: number;
    gst_type: 'CGST/SGST' | 'IGST';
}

export interface SalesOrderCalculationRequest {
    customer_id: number | string;
    order_date?: string;
    delivery_date?: string;
    items: Array<{
        product_id: number | string;
        batch_id?: number | string;
        batch_number?: string;
        quantity: number;
        free_quantity?: number;
        unit_price: number;
        mrp?: number;
        discount_percent?: number;
        tax_percent?: number;
        gst_type?: string;
        uom?: string;
        pack_type?: string;
    }>;
    delivery_charges?: number;
    other_charges?: number;
    discount_amount?: number;
}

export interface ChallanCalculationRequest {
    customer_id: number | string;
    items: InvoiceCalculationLine[];
    freight_charges?: number | string;
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
    ): Promise<AxiosResponse<InvoiceCalculationResponse>> => {
        return apiHelpers.post<InvoiceCalculationResponse>('/calculations/challan', data);
    }
};
