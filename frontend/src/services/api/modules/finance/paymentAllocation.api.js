/**
 * Payment Allocation API Module
 * Handles allocation of payments to invoices
 * 
 * ENDPOINTS: /payment-allocation (backend: app/api/routes/finance/allocation.py)
 */

import { apiHelpers } from '../../apiClient';
import { cleanData } from '../../utils/dataUtils';

const ENDPOINTS = {
    BASE: '/payment-allocation',
    ALLOCATE: '/payment-allocation/allocate',
    UNALLOCATE: '/payment-allocation/unallocate',
    AUTO_ALLOCATE: '/payment-allocation/auto-allocate',
    PENDING: '/payment-allocation/pending',
    HISTORY: '/payment-allocation/history',
    SUGGESTIONS: '/payment-allocation/suggestions'
};

export const paymentAllocationApi = {
    // =========================================================================
    // ALLOCATION OPERATIONS
    // =========================================================================

    // Allocate payment to invoices
    allocate: (data) => {
        const cleanedData = cleanData(data);
        return apiHelpers.post(ENDPOINTS.ALLOCATE, cleanedData);
    },

    // Unallocate payment from invoice
    unallocate: (data) => {
        return apiHelpers.post(ENDPOINTS.UNALLOCATE, data);
    },

    // Auto-allocate payment using FIFO
    autoAllocate: (paymentId) => {
        return apiHelpers.post(ENDPOINTS.AUTO_ALLOCATE, { payment_id: paymentId });
    },

    // =========================================================================
    // QUERIES
    // =========================================================================

    // Get unallocated payments
    getPending: (params = {}) => {
        return apiHelpers.get(ENDPOINTS.PENDING, { params });
    },

    // Get allocation history for a payment
    getHistory: (paymentId) => {
        return apiHelpers.get(`${ENDPOINTS.HISTORY}/${paymentId}`);
    },

    // Get allocation suggestions for a payment
    getSuggestions: (paymentId, partyId) => {
        return apiHelpers.get(ENDPOINTS.SUGGESTIONS, {
            params: { payment_id: paymentId, party_id: partyId }
        });
    },

    // =========================================================================
    // INVOICE ALLOCATIONS
    // =========================================================================

    // Get allocations for an invoice
    getInvoiceAllocations: (invoiceId) => {
        return apiHelpers.get(`${ENDPOINTS.BASE}/invoice/${invoiceId}`);
    },

    // Get allocations for a payment
    getPaymentAllocations: (paymentId) => {
        return apiHelpers.get(`${ENDPOINTS.BASE}/payment/${paymentId}`);
    },

    // =========================================================================
    // PARTY ALLOCATIONS
    // =========================================================================

    // Get unallocated payments for a party
    getPartyUnallocated: (partyId) => {
        return apiHelpers.get(`${ENDPOINTS.BASE}/party/${partyId}/unallocated`);
    },

    // Get pending invoices for a party
    getPartyPendingInvoices: (partyId) => {
        return apiHelpers.get(`${ENDPOINTS.BASE}/party/${partyId}/pending-invoices`);
    }
};
