/**
 * Payments API Module
 * Handles payment recording, tracking, and reconciliation
 */

import apiClient from '../apiClient';

export const paymentsApi = {
  // List payments
  list: async (params) => {
    const response = await apiClient.get('/payments', { params });
    return response.data;
  },

  // Search payments
  search: async (query, options = {}) => {
    const response = await apiClient.get('/payments/search', {
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
    const response = await apiClient.get(`/payments/${id}`);
    return response.data;
  },

  // Create payment
  create: async (data) => {
    const response = await apiClient.post('/payments', data);
    return response.data;
  },

  // Update payment
  update: async (id, data) => {
    const response = await apiClient.put(`/payments/${id}`, data);
    return response.data;
  },

  // Delete/Cancel payment
  cancel: async (id, reason) => {
    const response = await apiClient.post(`/payments/${id}/cancel`, { reason });
    return response.data;
  },

  // Record invoice payment
  recordInvoicePayment: async (invoiceId, paymentData) => {
    const response = await apiClient.post(`/invoices/${invoiceId}/payment`, paymentData);
    return response.data;
  },

  // Record purchase payment
  recordPurchasePayment: async (purchaseId, paymentData) => {
    const response = await apiClient.post(`/purchases/${purchaseId}/payment`, paymentData);
    return response.data;
  },

  // Get pending payments
  getPending: async (params) => {
    const response = await apiClient.get('/payments/pending', { params });
    return response.data;
  },

  // Get payment methods
  getPaymentMethods: async () => {
    const response = await apiClient.get('/payments/methods');
    return response.data;
  },

  // Reconcile payments
  reconcile: async (data) => {
    const response = await apiClient.post('/payments/reconcile', data);
    return response.data;
  },

  // Get payment summary
  getSummary: async (params) => {
    const response = await apiClient.get('/payments/summary', { params });
    return response.data;
  },

  // Bulk payment recording
  bulkCreate: async (payments) => {
    const response = await apiClient.post('/payments/bulk', { payments });
    return response.data;
  },

  // Generate receipt
  getReceipt: async (id) => {
    const response = await apiClient.get(`/payments/${id}/receipt`, {
      responseType: 'blob'
    });
    return response.data;
  }
};

// For backward compatibility
export default paymentsApi;