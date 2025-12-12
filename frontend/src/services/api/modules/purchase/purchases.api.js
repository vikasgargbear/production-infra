/**
 * Purchases API Module
 * Handles purchase orders and supplier invoices
 * 
 * ENDPOINTS: /purchases (backend: app/api/routes/purchase/orders.py)
 */

import { apiHelpers } from '../../apiClient';
import { API_CONFIG } from '../../../../config/api.config';
import { cleanData } from '../../utils/dataUtils';

const ENDPOINTS = API_CONFIG.ENDPOINTS.PURCHASES;

export const purchasesApi = {
  // =========================================================================
  // CRUD OPERATIONS
  // =========================================================================

  // Get all purchases with optional filters
  getAll: (params = {}) => {
    return apiHelpers.get(ENDPOINTS.BASE, { params });
  },

  // Get purchase by ID
  getById: (id) => {
    return apiHelpers.get(ENDPOINTS.DETAILS(id));
  },

  // Create new purchase
  create: (data) => {
    const cleanedData = cleanData(data);
    return apiHelpers.post(ENDPOINTS.CREATE, cleanedData);
  },

  // Update purchase
  update: (id, data) => {
    const cleanedData = cleanData(data);
    return apiHelpers.put(ENDPOINTS.UPDATE(id), cleanedData);
  },

  // Delete purchase
  delete: (id) => {
    return apiHelpers.delete(ENDPOINTS.DELETE(id));
  },

  // =========================================================================
  // ENHANCED OPERATIONS (with items)
  // =========================================================================

  // Create purchase with items
  createWithItems: (data) => {
    const cleanedData = cleanData(data);
    return apiHelpers.post(`${ENDPOINTS.ENHANCED}/with-items`, cleanedData);
  },

  // Create purchase entry
  createEntry: (data) => {
    const cleanedData = cleanData(data);
    return apiHelpers.post(`${ENDPOINTS.ENHANCED}/entry`, cleanedData);
  },

  // =========================================================================
  // SEARCH & FILTERS
  // =========================================================================

  // Get purchases by supplier
  getBySupplier: (supplierId, params = {}) => {
    return apiHelpers.get(ENDPOINTS.BASE, {
      params: { supplier_id: supplierId, ...params }
    });
  },

  // Get pending payments
  getPendingPayments: () => {
    return apiHelpers.get(ENDPOINTS.BASE, {
      params: { payment_status: 'pending' }
    });
  },

  // Get pending receipts
  getPendingReceipts: () => {
    return apiHelpers.get(ENDPOINTS.PENDING_RECEIPTS);
  },

  // =========================================================================
  // RETURNS
  // =========================================================================

  // Get returns for a purchase
  getReturns: (purchaseId) => {
    return apiHelpers.get(`${ENDPOINTS.BASE}/${purchaseId}/returns`);
  },

  // Create purchase return
  createReturn: (purchaseId, returnData) => {
    const cleanedData = cleanData(returnData);
    return apiHelpers.post(`${ENDPOINTS.BASE}/${purchaseId}/returns`, cleanedData);
  },

  // =========================================================================
  // PURCHASE ORDERS
  // =========================================================================

  // Generate PO number
  generatePONumber: () => {
    return apiHelpers.get(`${ENDPOINTS.BASE}/purchase-orders/generate-number`);
  },

  // Create purchase order
  createPurchaseOrder: (data) => {
    const cleanedData = cleanData(data);
    return apiHelpers.post(`${ENDPOINTS.BASE}/purchase-orders`, cleanedData);
  },

  // Get all purchase orders
  getPurchaseOrders: (params = {}) => {
    return apiHelpers.get(`${ENDPOINTS.BASE}/purchase-orders`, { params });
  },

  // Get purchase order by ID
  getPurchaseOrderById: (id) => {
    return apiHelpers.get(`${ENDPOINTS.BASE}/purchase-orders/${id}`);
  },

  // Update purchase order
  updatePurchaseOrder: (id, data) => {
    const cleanedData = cleanData(data);
    return apiHelpers.put(`${ENDPOINTS.BASE}/purchase-orders/${id}`, cleanedData);
  },

  // Cancel purchase order
  cancelPurchaseOrder: (id, reason) => {
    return apiHelpers.post(`${ENDPOINTS.BASE}/purchase-orders/${id}/cancel`, { reason });
  },

  // =========================================================================
  // GRN (Goods Receipt Notes)
  // =========================================================================

  // Generate GRN number
  generateGRNNumber: () => {
    return apiHelpers.get('/grn/generate-number');
  },

  // Create GRN
  createGRN: (data) => {
    const cleanedData = cleanData(data);
    return apiHelpers.post('/grn', cleanedData);
  },

  // Get all GRNs
  getGRNs: (params = {}) => {
    return apiHelpers.get('/grn', { params });
  },

  // Get GRN by ID
  getGRNById: (id) => {
    return apiHelpers.get(`/grn/${id}`);
  },

  // Approve GRN
  approveGRN: (id, approvalData = {}) => {
    return apiHelpers.post(`/grn/${id}/approve`, approvalData);
  },

  // =========================================================================
  // SUPPLIER INVOICES
  // =========================================================================

  // Get returnable supplier invoices
  getReturnableInvoices: (params = {}) => {
    return apiHelpers.get('/supplier-invoices/returnable/', { params });
  },

  // Get supplier invoice by ID
  getSupplierInvoice: (invoiceId) => {
    return apiHelpers.get(`/supplier-invoices/${invoiceId}`);
  },

  // Get supplier invoice items
  getSupplierInvoiceItems: (invoiceId) => {
    return apiHelpers.get(`/supplier-invoices/${invoiceId}/items`);
  },

  // =========================================================================
  // RECEIVE ITEMS
  // =========================================================================

  // Receive items against a purchase
  receiveItems: (purchaseId, data) => {
    return apiHelpers.post(ENDPOINTS.RECEIVE_ITEMS(purchaseId), data);
  },

  // =========================================================================
  // PDF UPLOAD
  // =========================================================================

  // Parse invoice PDF (requires multipart/form-data)
  parseInvoice: (formData) => {
    return apiHelpers.post(ENDPOINTS.PDF_PARSE, formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
  }
};