/** Read-only sales and purchase return calculation contracts. */

import type { AxiosResponse } from 'axios';
import { apiHelpers } from '../../apiClient';
import type { InvoiceCalculationResponse } from './calculations.api';


export interface ReturnCalculationRequest {
    return_type: 'sales' | 'purchase';
    customer_id?: number;
    supplier_id?: number;
    gst_type?: 'CGST/SGST' | 'IGST';
    include_gst: boolean;
    items: Array<{
        product_id?: number;
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
