/**
 * Payments API Module
 * Handles payment recording, tracking, and reconciliation
 * 
 * STANDARDIZED: Uses apiHelpers and API_CONFIG for consistency
 */

import { apiHelpers } from '../../apiClient';
import { API_CONFIG } from '../../../../config/api.config';

const ENDPOINTS = API_CONFIG.ENDPOINTS.PAYMENTS;
const INVOICES_ENDPOINTS = API_CONFIG.ENDPOINTS.INVOICES;
const PURCHASES_ENDPOINTS = API_CONFIG.ENDPOINTS.PURCHASES;

export const paymentsApi = {
  // List payments
  list: async (params) => {
    const response = await apiHelpers.get(ENDPOINTS.BASE, { params });
    return response.data;
  },

  // Search payments
  search: async (query, options = {}) => {
    const response = await apiHelpers.get(`${ENDPOINTS.BASE}/search`, {
      params: {
        q: query,
        party_id: options.partyId,
        party_type: options.partyType,
        payment_mode: options.paymentMode,
        date_from: options.dateFrom,
        date_to: options.dateTo,
        limit: options.limit || 50,
        offset: options.offset || 0,
      },
    });
    return response.data;
  },

  // Get payment details
  get: async (id) => {
    const response = await apiHelpers.get(ENDPOINTS.DETAILS(id));
    return response.data;
  },

  // Create payment
  create: async (data) => {
    const response = await apiHelpers.post(ENDPOINTS.CREATE, data);
    return response.data;
  },

  // Update payment
  update: async (id, data) => {
    const response = await apiHelpers.put(ENDPOINTS.UPDATE(id), data);
    return response.data;
  },

  // Delete/Cancel payment
  cancel: async (id, reason) => {
    const response = await apiHelpers.post(`${ENDPOINTS.BASE}/${id}/cancel`, { reason });
    return response.data;
  },

  // Record invoice payment
  recordInvoicePayment: async (invoiceId, paymentData) => {
    const response = await apiHelpers.post(`${INVOICES_ENDPOINTS.BASE}/${invoiceId}/payment`, paymentData);
    return response.data;
  },

  // Record purchase payment
  recordPurchasePayment: async (purchaseId, paymentData) => {
    const response = await apiHelpers.post(`${PURCHASES_ENDPOINTS.BASE}/${purchaseId}/payment`, paymentData);
    return response.data;
  },

  // Get pending payments
  getPending: async (params) => {
    const response = await apiHelpers.get(`${ENDPOINTS.BASE}/pending`, { params });
    return response.data;
  },

  // Get outstanding invoices
  getOutstanding: async (params) => {
    const response = await apiHelpers.get(ENDPOINTS.OUTSTANDING, { params });
    return response.data;
  },

  // Get payment methods
  getPaymentMethods: async () => {
    const response = await apiHelpers.get(`${ENDPOINTS.BASE}/methods`);
    return response.data;
  },

  // Reconcile payments
  reconcile: async (data) => {
    const response = await apiHelpers.post(`${ENDPOINTS.BASE}/reconcile`, data);
    return response.data;
  },

  // Get payment summary
  getSummary: async (params) => {
    const response = await apiHelpers.get(`${ENDPOINTS.BASE}/summary`, { params });
    return response.data;
  },

  // Bulk payment recording
  bulkCreate: async (payments) => {
    const response = await apiHelpers.post(`${ENDPOINTS.BASE}/bulk`, { payments });
    return response.data;
  },

  // Generate receipt
  getReceipt: async (id) => {
    const response = await apiHelpers.get(`${ENDPOINTS.BASE}/${id}/receipt`, {
      responseType: 'blob'
    });
    return response.data;
  },

  // Generate receipt number
  generateReceiptNumber: async (paymentType = 'receipt') => {
    const response = await apiHelpers.get(`${ENDPOINTS.BASE}/generate-receipt-number`, {
      params: { payment_type: paymentType }
    });
    return response.data;
  },

  // Bank reconciliation methods
  createBankReconciliation: async (reconciliationData) => {
    const response = await apiHelpers.post(`${ENDPOINTS.BASE}/bank-reconciliation`, reconciliationData);
    return response.data;
  },

  getUnreconciledTransactions: async (params = {}) => {
    const response = await apiHelpers.get(ENDPOINTS.OUTSTANDING, { params });
    return response.data;
  },

  // Aging report
  getAgingReport: async (params = {}) => {
    const response = await apiHelpers.get(`${ENDPOINTS.BASE}/aging-report`, { params });
    return response.data;
  },

  // Payment allocation
  allocatePayment: async (allocationData) => {
    const response = await apiHelpers.post(`${ENDPOINTS.BASE}/payment-allocation`, allocationData);
    return response.data;
  }
};

// For backward compatibility
export default paymentsApi;