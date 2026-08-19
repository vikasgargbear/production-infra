/** Read-only credit and debit note calculation contract. */

import type { AxiosResponse } from 'axios';
import { apiHelpers } from '../../apiClient';
import type { InvoiceCalculationResponse } from '../sales/calculations.api';


export interface NoteCalculationRequest {
    note_type: 'credit' | 'debit';
    party_type: 'customer' | 'supplier';
    party_id?: number;
    gst_type?: 'CGST/SGST' | 'IGST';
    include_gst: boolean;
    items: Array<{
        product_id?: number;
        product_name?: string;
        quantity: number;
        unit_price: number;
        discount_percent?: number;
        gst_percent?: number;
    }>;
}

export const noteCalculationsApi = {
    preview: (
        data: NoteCalculationRequest
    ): Promise<AxiosResponse<InvoiceCalculationResponse>> => {
        return apiHelpers.post<InvoiceCalculationResponse>('/calculations/note', data);
    }
};
