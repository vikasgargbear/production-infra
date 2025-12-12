/**
 * Invoices API Module
 * Handles all invoice-related API calls
 * 
 * ENDPOINTS: /invoices (backend: app/api/routes/sales/invoices.py)
 */

import { apiHelpers } from '../../apiClient';
import { API_CONFIG } from '../../../../config/api.config';
import { cleanData } from '../../utils/dataUtils';

const ENDPOINTS = API_CONFIG.ENDPOINTS.INVOICES;

export const invoicesApi = {
  // =========================================================================
  // CRUD OPERATIONS
  // =========================================================================

  // Get all invoices with optional filters
  getAll: (params = {}) => {
    return apiHelpers.get(ENDPOINTS.BASE, { params });
  },

  // Get invoice by ID
  getById: (id) => {
    return apiHelpers.get(ENDPOINTS.DETAILS(id));
  },

  // Create new invoice
  create: (data) => {
    const cleanedData = cleanData(data);
    return apiHelpers.post(ENDPOINTS.CREATE, cleanedData);
  },

  // Update invoice (only for draft invoices)
  update: (id, data) => {
    const cleanedData = cleanData(data);
    return apiHelpers.put(ENDPOINTS.UPDATE(id), cleanedData);
  },

  // Delete invoice
  delete: (id) => {
    return apiHelpers.delete(ENDPOINTS.DELETE(id));
  },

  // =========================================================================
  // INVOICE ACTIONS
  // =========================================================================

  // Generate invoice number
  generateNumber: () => {
    return apiHelpers.get(`${ENDPOINTS.BASE}/generate-number`);
  },

  // Cancel invoice
  cancel: (id, reason) => {
    return apiHelpers.post(ENDPOINTS.CANCEL(id), { reason });
  },

  // Get invoice PDF
  getPDF: (id) => {
    return apiHelpers.download(ENDPOINTS.PDF(id), `invoice-${id}.pdf`);
  },

  // Send invoice via email
  sendEmail: (id, emailData) => {
    return apiHelpers.post(ENDPOINTS.EMAIL(id), emailData);
  },

  // =========================================================================
  // SEARCH & FILTERS
  // =========================================================================

  // Search invoices with filters
  search: (params = {}) => {
    // Remove undefined values
    const cleanParams = Object.fromEntries(
      Object.entries(params).filter(([_, v]) => v !== undefined && v !== '')
    );
    return apiHelpers.get(ENDPOINTS.BASE, { params: cleanParams });
  },

  // Get invoice by number
  getByNumber: (invoiceNumber) => {
    return apiHelpers.get(ENDPOINTS.BASE, {
      params: { invoice_number: invoiceNumber }
    });
  },

  // Get invoices by customer
  getByCustomer: (customerId, params = {}) => {
    return apiHelpers.get(ENDPOINTS.BASE, {
      params: { customer_id: customerId, ...params }
    });
  },

  // Get recent invoices
  getRecent: (limit = 10) => {
    return apiHelpers.get(ENDPOINTS.BASE, {
      params: { sort: 'created_at', order: 'desc', limit }
    });
  },

  // =========================================================================
  // PAYMENTS
  // =========================================================================

  // Get payment status for invoice
  getPaymentStatus: (id) => {
    return apiHelpers.get(`${ENDPOINTS.BASE}/${id}/payment-status`);
  },

  // Record payment for invoice
  recordPayment: (id, paymentData) => {
    return apiHelpers.post(`${ENDPOINTS.BASE}/${id}/record-payment`, paymentData);
  },

  // Get payment history for invoice
  getPaymentHistory: (id) => {
    return apiHelpers.get(`${ENDPOINTS.BASE}/${id}/payments`);
  },

  // =========================================================================
  // ANALYTICS
  // =========================================================================

  // Get last deals for a product (Marg ERP style - Alt+L)
  getLastDeals: (productId, customerId = null) => {
    const params = customerId ? { customer_id: customerId } : {};
    return apiHelpers.get(`${ENDPOINTS.BASE}/last-deals/${productId}`, { params });
  }
};