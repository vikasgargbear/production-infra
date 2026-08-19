/**
 * Invoices API Module
 * Handles all invoice-related API calls
 * 
 * ENDPOINTS: /invoices (backend: app/api/routes/sales/invoices.py)
 */

import { apiHelpers } from '../../apiClient';
import { API_CONFIG } from '../../../../config/api.config';
import { cleanData } from '../../utils/dataUtils';

// ==================== TYPE DEFINITIONS ====================

interface InvoiceParams {
    customer_id?: number;
    invoice_number?: string;
    sort?: string;
    order?: 'asc' | 'desc';
    limit?: number;
    offset?: number;
    [key: string]: unknown;
}

interface InvoiceData {
    customer_id: number;
    items: Array<{
        product_id: number;
        batch_id?: number;
        quantity: number;
        discount_percent?: number;
        [key: string]: unknown;
    }>;
    payment_mode?: string;
    delivery_type?: string;
    [key: string]: unknown;
}

interface EmailData {
    to: string;
    cc?: string;
    subject?: string;
    message?: string;
}

interface PaymentData {
    amount: number;
    payment_mode: string;
    reference_number?: string;
    payment_date?: string;
    [key: string]: unknown;
}

// ==================== ENDPOINTS ====================

const ENDPOINTS = API_CONFIG.ENDPOINTS.INVOICES;

// ==================== API MODULE ====================

export const invoicesApi = {
    // =========================================================================
    // CRUD OPERATIONS
    // =========================================================================

    /** Get all invoices with optional filters */
    getAll: (params: InvoiceParams = {}) => {
        return apiHelpers.get(ENDPOINTS.BASE, { params });
    },

    /** Get invoice by ID */
    getById: (id: number | string) => {
        return apiHelpers.get(ENDPOINTS.DETAILS(id));
    },

    /** Create new invoice */
    create: async (data: InvoiceData) => {
        const cleanedData = cleanData(data);
        const response = await apiHelpers.post(ENDPOINTS.CREATE, cleanedData);

        // Trigger delta sync after successful invoice creation
        // Stock levels changed - update IndexedDB
        if (response?.data?.success || response?.data?.invoice_id) {
            try {
                const { default: deltaSyncService } = await import('../../../offline/sync/deltaSyncService');
                deltaSyncService.afterInvoiceCreated();
            } catch (e) {
                console.warn('[InvoiceAPI] Delta sync trigger failed:', e);
            }
        }

        return response;
    },

    /** Update invoice (only for draft invoices) */
    update: (id: number | string, data: Partial<InvoiceData>) => {
        const cleanedData = cleanData(data);
        return apiHelpers.put(ENDPOINTS.UPDATE(id), cleanedData);
    },

    /** Delete invoice */
    delete: (id: number | string) => {
        return apiHelpers.delete(ENDPOINTS.DELETE(id));
    },

    // =========================================================================
    // INVOICE ACTIONS
    // =========================================================================

    /** Generate invoice number */
    generateNumber: () => {
        return apiHelpers.post(`${ENDPOINTS.BASE}/generate-number`, {});
    },

    /** Cancel invoice */
    cancel: (id: number | string, reason: string, createCreditNote: boolean = false) => {
        return apiHelpers.post(ENDPOINTS.CANCEL(id), { reason, create_credit_note: createCreditNote });
    },

    /** Get invoice PDF */
    getPDF: (id: number | string) => {
        return apiHelpers.download(ENDPOINTS.PDF(id), `invoice-${id}.pdf`);
    },

    /** Send invoice via email */
    sendEmail: (id: number | string, emailData: EmailData) => {
        return apiHelpers.post(ENDPOINTS.EMAIL(id), emailData);
    },

    // =========================================================================
    // SEARCH & FILTERS
    // =========================================================================

    /** Search invoices with filters */
    search: (params: InvoiceParams = {}) => {
        const cleanParams = Object.fromEntries(
            Object.entries(params).filter(([_, v]) => v !== undefined && v !== '')
        );
        return apiHelpers.get(ENDPOINTS.BASE, { params: cleanParams });
    },

    /** Get invoice by number */
    getByNumber: (invoiceNumber: string) => {
        return apiHelpers.get(ENDPOINTS.BASE, {
            params: { invoice_number: invoiceNumber }
        });
    },

    /** Get invoices by customer */
    getByCustomer: (customerId: number | string, params: InvoiceParams = {}) => {
        return apiHelpers.get(ENDPOINTS.BASE, {
            params: { customer_id: customerId, ...params }
        });
    },

    /** Get recent invoices */
    getRecent: (limit: number = 10) => {
        return apiHelpers.get(ENDPOINTS.BASE, {
            params: { sort: 'created_at', order: 'desc', limit }
        });
    },

    // =========================================================================
    // PAYMENTS
    // =========================================================================

    /** Get payment status for invoice */
    getPaymentStatus: (id: number | string) => {
        return apiHelpers.get(`${ENDPOINTS.BASE}/${id}/payment-status`);
    },

    /** Record payment for invoice */
    recordPayment: (id: number | string, paymentData: PaymentData) => {
        return apiHelpers.post(`${ENDPOINTS.BASE}/${id}/record-payment`, paymentData);
    },

    /** Get payment history for invoice */
    getPaymentHistory: (id: number | string) => {
        return apiHelpers.get(`${ENDPOINTS.BASE}/${id}/payments`);
    },

    // =========================================================================
    // ANALYTICS
    // =========================================================================

    /** Get last deals for a product (Marg ERP style - Alt+L) */
    getLastDeals: (productId: number | string, customerId: number | string | null = null) => {
        const params = customerId ? { customer_id: customerId } : {};
        return apiHelpers.get(`${ENDPOINTS.BASE}/last-deals/${productId}`, { params });
    },

    // =========================================================================
    // DRAFTS (migrated from invoiceApiService.ts)
    // =========================================================================

    /** Get saved invoice drafts */
    getDrafts: () => {
        return apiHelpers.get(`${ENDPOINTS.BASE}/drafts`);
    },

    /** Save invoice draft */
    saveDraft: (data: { draft_id?: string; customer_id?: number; items: unknown[]; totals?: unknown; created_by?: string }) => {
        return apiHelpers.post(`${ENDPOINTS.BASE}/drafts`, {
            draft_id: data.draft_id,
            customer_id: data.customer_id,
            items: data.items,
            totals: data.totals,
            metadata: {
                last_modified: new Date().toISOString(),
                created_by: data.created_by || 'CURRENT_USER'
            }
        });
    },

    // =========================================================================
    // ORDER CONVERSION (migrated from invoiceApiService.ts)
    // =========================================================================

    /** Generate invoice from order */
    generateFromOrder: (orderId: number | string) => {
        return apiHelpers.post(`${ENDPOINTS.BASE}/generate-from-order`, { order_id: orderId });
    }
};

// Re-export types for external use
export type { InvoiceParams, InvoiceData, EmailData, PaymentData };
