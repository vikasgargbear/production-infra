/** Read-only sales and purchase return calculation contracts. */

import type { AxiosResponse } from 'axios';
import { apiHelpers } from '../../apiClient';
import type { InvoiceCalculationResponse } from './calculations.api';


export interface ReturnCalculationRequest {
    return_type: 'sales' | 'purchase';
    customer_id?: number | string;
    supplier_id?: number | string;
    gst_type?: 'CGST/SGST' | 'IGST';
    include_gst: boolean;
    items: Array<{
        product_id?: number | string;
        return_quantity: number;
        paid_quantity?: number;
        free_quantity?: number;
        unit_price: number;
        discount_percent?: number;
        tax_percent?: number;
    }>;
}

export const returnCalculationsApi = {
    preview: (
        data: ReturnCalculationRequest
    ): Promise<AxiosResponse<InvoiceCalculationResponse>> => {
        return apiHelpers.post<InvoiceCalculationResponse>('/calculations/return', data);
    }
};
