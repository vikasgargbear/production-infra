/**
 * Sales Orders API Module
 * Handles sales order CRUD and actions
 * 
 * ENDPOINTS: /sales-orders (backend: app/api/routes/sales/sales_orders.py)
 */

import { apiHelpers } from '../../apiClient';
import { cleanData } from '../../utils/dataUtils';
import { OrderStatus, PriorityLevel } from '../../../../constants';

const ENDPOINTS = {
  BASE: '/sales-orders',
  DETAILS: (id) => `/sales-orders/${id}`,
  ITEMS: (id) => `/sales-orders/${id}/items`,
  SEARCH: '/sales-orders/search',
  VALIDATE: '/sales-orders/validate',
  DUPLICATE: (id) => `/sales-orders/${id}/duplicate`,
  CONVERT_TO_INVOICE: (id) => `/sales-orders/${id}/convert-to-invoice`,
  CONVERT_TO_CHALLAN: (id) => `/sales-orders/${id}/convert-to-challan`,
  UPDATE_STATUS: (id) => `/sales-orders/${id}/status`,
  APPROVE: (id) => `/sales-orders/${id}/approve`,
  REJECT: (id) => `/sales-orders/${id}/reject`,
  CANCEL: (id) => `/sales-orders/${id}/cancel`,
  RESERVE_INVENTORY: (id) => `/sales-orders/${id}/reserve-inventory`,
  RELEASE_INVENTORY: (id) => `/sales-orders/${id}/release-inventory`,
  DELIVERY_SCHEDULE: (id) => `/sales-orders/${id}/delivery-schedule`,
  PAYMENT_TERMS: (id) => `/sales-orders/${id}/payment-terms`,
  HISTORY: (id) => `/sales-orders/${id}/history`,
  AUDIT: (id) => `/sales-orders/${id}/audit`,
  PDF: (id) => `/sales-orders/${id}/pdf`,
  EMAIL: (id) => `/sales-orders/${id}/email`,
  WHATSAPP: (id) => `/sales-orders/${id}/whatsapp`,
  ANALYTICS: '/sales-orders/analytics',
  DASHBOARD: '/sales-orders/dashboard',
  REPORTS: '/sales-orders/reports'
};

// Re-export constants
export const ORDER_STATUS = OrderStatus;
export const PRIORITY_LEVELS = PriorityLevel;
export const ORDER_TYPES = {
  STANDARD: 'standard',
  URGENT: 'urgent',
  SAMPLE: 'sample',
  REPLACEMENT: 'replacement',
  RETURN: 'return'
};

export const salesOrdersApi = {
  // =========================================================================
  // CRUD OPERATIONS
  // =========================================================================

  // Get all sales orders
  getAll: (params = {}) => {
    return apiHelpers.get(ENDPOINTS.BASE, { params });
  },

  // Get sales order by ID
  getById: (id, params = {}) => {
    return apiHelpers.get(ENDPOINTS.DETAILS(id), { params });
  },

  // Create new sales order
  create: (data) => {
    const cleanedData = cleanData(data);
    return apiHelpers.post(ENDPOINTS.BASE, cleanedData);
  },

  // Create multiple orders in bulk
  createBulk: (ordersData) => {
    return apiHelpers.post(`${ENDPOINTS.BASE}/bulk`, { orders: ordersData });
  },

  // Update sales order
  update: (id, data) => {
    const cleanedData = cleanData(data);
    return apiHelpers.put(ENDPOINTS.DETAILS(id), cleanedData);
  },

  // Delete sales order
  delete: (id) => {
    return apiHelpers.delete(ENDPOINTS.DETAILS(id));
  },

  // =========================================================================
  // SEARCH & VALIDATION
  // =========================================================================

  // Search orders
  search: (query, params = {}) => {
    return apiHelpers.get(ENDPOINTS.SEARCH, { params: { q: query, ...params } });
  },

  // Validate order data
  validate: (data) => {
    return apiHelpers.post(ENDPOINTS.VALIDATE, data);
  },

  // =========================================================================
  // STATUS ACTIONS
  // =========================================================================

  // Update order status
  updateStatus: (id, status, reason = '') => {
    return apiHelpers.patch(ENDPOINTS.UPDATE_STATUS(id), { status, reason });
  },

  // Approve order
  approve: (id) => {
    return apiHelpers.post(ENDPOINTS.APPROVE(id));
  },

  // Reject order
  reject: (id, reason = '') => {
    return apiHelpers.post(ENDPOINTS.REJECT(id), { reason });
  },

  // Cancel order
  cancel: (id, reason = '') => {
    return apiHelpers.post(ENDPOINTS.CANCEL(id), { reason });
  },

  // =========================================================================
  // CONVERSIONS
  // =========================================================================

  // Duplicate order
  duplicate: (id, modifications = {}) => {
    return apiHelpers.post(ENDPOINTS.DUPLICATE(id), modifications);
  },

  // Convert to invoice
  convertToInvoice: (id, options = {}) => {
    return apiHelpers.post(ENDPOINTS.CONVERT_TO_INVOICE(id), options);
  },

  // Convert to challan
  convertToChallan: (id, options = {}) => {
    return apiHelpers.post(ENDPOINTS.CONVERT_TO_CHALLAN(id), options);
  },

  // =========================================================================
  // INVENTORY
  // =========================================================================

  // Reserve inventory for order
  reserveInventory: (id) => {
    return apiHelpers.post(ENDPOINTS.RESERVE_INVENTORY(id));
  },

  // Release reserved inventory
  releaseInventory: (id) => {
    return apiHelpers.post(ENDPOINTS.RELEASE_INVENTORY(id));
  },

  // =========================================================================
  // ORDER DETAILS
  // =========================================================================

  // Get order items
  getItems: (id) => {
    return apiHelpers.get(ENDPOINTS.ITEMS(id));
  },

  // Update delivery schedule
  updateDeliverySchedule: (id, schedule) => {
    return apiHelpers.put(ENDPOINTS.DELIVERY_SCHEDULE(id), schedule);
  },

  // Get delivery schedule
  getDeliverySchedule: (id) => {
    return apiHelpers.get(ENDPOINTS.DELIVERY_SCHEDULE(id));
  },

  // Update payment terms
  updatePaymentTerms: (id, terms) => {
    return apiHelpers.put(ENDPOINTS.PAYMENT_TERMS(id), terms);
  },

  // =========================================================================
  // HISTORY & AUDIT
  // =========================================================================

  // Get order history
  getHistory: (id) => {
    return apiHelpers.get(ENDPOINTS.HISTORY(id));
  },

  // Get audit trail
  getAuditTrail: (id) => {
    return apiHelpers.get(ENDPOINTS.AUDIT(id));
  },

  // =========================================================================
  // EXPORT & SHARE
  // =========================================================================

  // Generate PDF
  generatePDF: (id) => {
    return apiHelpers.get(ENDPOINTS.PDF(id), { responseType: 'blob' });
  },

  // Send via email
  sendEmail: (id, recipients) => {
    return apiHelpers.post(ENDPOINTS.EMAIL(id), { recipients });
  },

  // Send via WhatsApp
  sendWhatsApp: (id, phoneNumber) => {
    return apiHelpers.post(ENDPOINTS.WHATSAPP(id), { phone: phoneNumber });
  },

  // =========================================================================
  // ANALYTICS & REPORTS
  // =========================================================================

  // Get analytics
  getAnalytics: (params = {}) => {
    return apiHelpers.get(ENDPOINTS.ANALYTICS, { params });
  },

  // Get dashboard data
  getDashboard: () => {
    return apiHelpers.get(ENDPOINTS.DASHBOARD);
  },

  // Get reports
  getReports: (params = {}) => {
    return apiHelpers.get(ENDPOINTS.REPORTS, { params });
  }
};

export default salesOrdersApi;