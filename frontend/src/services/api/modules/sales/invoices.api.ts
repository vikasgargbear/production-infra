/**
 * Invoices API Module
 * Handles all invoice-related API calls
 * 
 * ENDPOINTS: /invoices (backend: app/api/routes/sales/invoices.py)
 */

import { apiHelpers } from '../../apiClient';
import { API_CONFIG } from '../../../../config/api.config';
import {
    approveAndExecuteCanonicalAction,
    canonicalExecutionCompleted,
    executeCanonicalAction,
    prepareCanonicalAction,
    type CanonicalCommandPreview,
} from '../../canonicalOperatorActions';
import { rejectCanonicalWrite } from '../../canonicalWritePolicy';
import type { CanonicalInvoiceDetail } from './canonicalSalesDocuments.types';

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
    customer_id: number | string;
    items: Array<{
        product_id: number | string;
        batch_id?: number | string;
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
        return apiHelpers.get<CanonicalInvoiceDetail>(`/canonical/invoices/${id}`, {
            preserveExactDecimals: true,
        });
    },

    /** Create new invoice */
    create: (_data: InvoiceData) => rejectCanonicalWrite('Legacy invoice creation'),

    /**
     * Post a reviewed canonical invoice command from the first-party ERP UI.
     * The final Generate click is the actor confirmation; every later step is
     * hash-bound so a changed preview cannot be executed.
     */
    createCanonical: async (data: Record<string, unknown>) => {
        const { invoice_number: _displayNumber, ...payload } = data;
        const { prepared, executed } = await executeCanonicalAction(
            'sales.invoice.prepare',
            payload,
        );
        const completed = canonicalExecutionCompleted(executed.data);
        const resourceId = executed?.data?.resource_id;
        const canonicalInvoice = completed && resourceId
            ? await apiHelpers.get<CanonicalInvoiceDetail>(`/canonical/invoices/${resourceId}`, {
                preserveExactDecimals: true,
            })
            : null;
        return {
            ...executed,
            data: {
                ...executed.data,
                success: completed,
                invoice_id: resourceId,
                invoice_number: canonicalInvoice?.data?.invoice_number,
                total_amount: canonicalInvoice?.data?.total_amount,
                canonical_preview: prepared.data,
            },
        };
    },

    /** Prepare the immutable authoritative server preview without approving it. */
    prepareCanonical: (data: Record<string, unknown>) => {
        const { invoice_number: _displayNumber, ...payload } = data;
        return prepareCanonicalAction('sales.invoice.prepare', payload);
    },

    /** Approve and execute only the exact preview the actor just confirmed. */
    executePreparedCanonical: async (preview: CanonicalCommandPreview, lifecycleId: string) => {
        const { executed } = await approveAndExecuteCanonicalAction(
            'sales.invoice.prepare',
            preview,
            lifecycleId,
        );
        const completed = canonicalExecutionCompleted(executed.data);
        const resourceId = executed?.data?.resource_id;
        return {
            ...executed,
            data: {
                ...executed.data,
                success: completed,
                invoice_id: resourceId,
                canonical_preview: preview,
            },
        };
    },

    /** Browser-safe posted readback with invoice, tax, receivable and stock-quantity lineage. */
    getCanonicalPostingReadback: (id: string) =>
        apiHelpers.get(`/canonical/sales-invoices/${id}/posting-readback`),

    /** Update invoice (only for draft invoices) */
    update: (_id: number | string, _data: Partial<InvoiceData>) =>
        rejectCanonicalWrite('Invoice editing'),

    /** Delete invoice */
    delete: (_id: number | string) => rejectCanonicalWrite('Invoice deletion'),

    // =========================================================================
    // INVOICE ACTIONS
    // =========================================================================

    /** Generate invoice number */
    generateNumber: () => rejectCanonicalWrite('Standalone invoice numbering'),

    /** Cancel invoice */
    cancel: (_id: number | string, _reason: string, _createCreditNote: boolean = false) =>
        rejectCanonicalWrite('Invoice cancellation'),

    /** Get invoice PDF */
    getPDF: (id: number | string) => {
        return apiHelpers.download(ENDPOINTS.PDF(id), `invoice-${id}.pdf`);
    },

    /** Send invoice via email */
    sendEmail: (_id: number | string, _emailData: EmailData) =>
        rejectCanonicalWrite('Invoice email delivery'),

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
    recordPayment: (_id: number | string, _paymentData: PaymentData) =>
        rejectCanonicalWrite('Invoice payment recording'),

    /** Get payment history for invoice */
    getPaymentHistory: (id: number | string) => {
        return apiHelpers.get(`${ENDPOINTS.BASE}/${id}/payments`);
    },

    // =========================================================================
    // DRAFTS (migrated from invoiceApiService.ts)
    // =========================================================================

    /** Get saved invoice drafts */
    getDrafts: () => {
        return apiHelpers.get(`${ENDPOINTS.BASE}/drafts`);
    },

    /** Save invoice draft */
    saveDraft: (_data: { draft_id?: string; customer_id?: number; items: unknown[]; totals?: unknown; created_by?: string }) =>
        rejectCanonicalWrite('Invoice drafts'),

    // =========================================================================
    // ORDER CONVERSION (migrated from invoiceApiService.ts)
    // =========================================================================

    /** Generate invoice from order */
    generateFromOrder: (_orderId: number | string) =>
        rejectCanonicalWrite('Sales-order conversion')
};

// Re-export types for external use
export type { InvoiceParams, InvoiceData, EmailData, PaymentData };
