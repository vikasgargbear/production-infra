/** Read-only purchase calculation contracts. */

import type { AxiosResponse } from 'axios';
import { apiHelpers } from '../../apiClient';
import type { InvoiceCalculationResponse } from '../sales/calculations.api';


export interface PurchaseCalculationRequest {
    supplier_id?: number | string;
    gst_type?: 'CGST/SGST' | 'IGST';
    items: Array<{
        product_id: number | string;
        product_name?: string;
        quantity: number;
        free_quantity?: number;
        unit_price: number;
        mrp?: number;
        discount_percent?: number;
        tax_percent?: number;
        gst_percent?: number;
    }>;
    freight_charges?: number;
    insurance_charges?: number;
    other_charges?: number;
}

export const purchaseCalculationsApi = {
    preview: (
        data: PurchaseCalculationRequest
    ): Promise<AxiosResponse<InvoiceCalculationResponse>> => {
        return apiHelpers.post<InvoiceCalculationResponse>('/calculations/purchase-order', data);
    }
};
