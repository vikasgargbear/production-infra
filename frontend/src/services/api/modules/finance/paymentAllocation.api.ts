/** Canonical open-item context and posted receipt allocation readback. */

import { apiHelpers } from '../../apiClient';
import type { AxiosResponse } from 'axios';

const ENDPOINTS = {
    BASE: '/payment-allocation',
    UNPAID_INVOICES: '/payment-allocation/unpaid-invoices',
} as const;

export const paymentAllocationApi = {
    getUnpaidInvoices: (customerId: string): Promise<AxiosResponse> => {
        return apiHelpers.get(ENDPOINTS.UNPAID_INVOICES, {
            params: { customer_id: customerId }
        });
    },

    getInvoicePayments: (invoiceId: string): Promise<AxiosResponse> => {
        return apiHelpers.get(`${ENDPOINTS.BASE}/invoice/${invoiceId}/payments`);
    },

    getCustomerReceiptReadback: (paymentId: string): Promise<AxiosResponse> => {
        return apiHelpers.get(`${ENDPOINTS.BASE}/payment/${paymentId}/readback`);
    },

    getCustomerChequeActionReadback: (paymentId: string): Promise<AxiosResponse> => {
        return apiHelpers.get(`${ENDPOINTS.BASE}/payment/${paymentId}/cheque-action-readback`);
    },
};
