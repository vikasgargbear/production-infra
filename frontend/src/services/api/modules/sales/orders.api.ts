/**
 * Orders API Module
 * Handles order CRUD and actions
 * 
 * ENDPOINTS: /orders (backend: app/api/routes/sales/orders.py)
 */

import { apiHelpers } from '../../apiClient';
import { cleanData } from '../../utils/dataUtils';
import { OrderStatus, PriorityLevel } from '../../../../constants';

// Type definitions
type OrderId = number | string;

interface OrderParams {
  skip?: number;
  limit?: number;
  customer_id?: number;
  status?: string;
  from_date?: string;
  to_date?: string;
  [key: string]: unknown;
}

const ENDPOINTS = {
  BASE: '/orders',
  DETAILS: (id: OrderId) => `/orders/${id}`,
  ITEMS: (id: OrderId) => `/orders/${id}/items`,
  SEARCH: '/orders/search',
  VALIDATE: '/orders/validate',
  DUPLICATE: (id: OrderId) => `/orders/${id}/duplicate`,
  CONVERT_TO_INVOICE: (id: OrderId) => `/orders/${id}/convert-to-invoice`,
  CONVERT_TO_CHALLAN: (id: OrderId) => `/orders/${id}/convert-to-challan`,
  UPDATE_STATUS: (id: OrderId) => `/orders/${id}/status`,
  APPROVE: (id: OrderId) => `/orders/${id}/approve`,
  REJECT: (id: OrderId) => `/orders/${id}/reject`,
  CANCEL: (id: OrderId) => `/orders/${id}/cancel`,
  RESERVE_INVENTORY: (id: OrderId) => `/orders/${id}/reserve-inventory`,
  RELEASE_INVENTORY: (id: OrderId) => `/orders/${id}/release-inventory`,
  DELIVERY_SCHEDULE: (id: OrderId) => `/orders/${id}/delivery-schedule`,
  PAYMENT_TERMS: (id: OrderId) => `/orders/${id}/payment-terms`,
  HISTORY: (id: OrderId) => `/orders/${id}/history`,
  AUDIT: (id: OrderId) => `/orders/${id}/audit`,
  PDF: (id: OrderId) => `/orders/${id}/pdf`,
  EMAIL: (id: OrderId) => `/orders/${id}/email`,
  WHATSAPP: (id: OrderId) => `/orders/${id}/whatsapp`,
  ANALYTICS: '/orders/analytics',
  DASHBOARD: '/orders/dashboard',
  REPORTS: '/orders/reports'
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

export const ordersApi = {
  // =========================================================================
  // CRUD OPERATIONS
  // =========================================================================

  /** Get all orders */
  getAll: (params: OrderParams = {}) => {
    return apiHelpers.get(ENDPOINTS.BASE, { params });
  },

  /** Get order by ID */
  getById: (id: OrderId, params: OrderParams = {}) => {
    return apiHelpers.get(ENDPOINTS.DETAILS(id), { params });
  },

  /** Create new order */
  create: (data: any) => {
    const cleanedData = cleanData(data);
    return apiHelpers.post(ENDPOINTS.BASE, cleanedData);
  },

  /** Create multiple orders in bulk */
  createBulk: (ordersData: any[]) => {
    return apiHelpers.post(`${ENDPOINTS.BASE}/bulk`, { orders: ordersData });
  },

  /** Update order */
  update: (id: OrderId, data: any) => {
    const cleanedData = cleanData(data);
    return apiHelpers.put(ENDPOINTS.DETAILS(id), cleanedData);
  },

  /** Delete order */
  delete: (id: OrderId) => {
    return apiHelpers.delete(ENDPOINTS.DETAILS(id));
  },

  // =========================================================================
  // SEARCH & VALIDATION
  // =========================================================================

  /** Search orders */
  search: (query: string, params: OrderParams = {}) => {
    return apiHelpers.get(ENDPOINTS.SEARCH, { params: { q: query, ...params } });
  },

  /** Validate order data */
  validate: (data: any) => {
    return apiHelpers.post(ENDPOINTS.VALIDATE, data);
  },

  // =========================================================================
  // STATUS ACTIONS
  // =========================================================================

  /** Update order status */
  updateStatus: (id: OrderId, status: string, reason: string = '') => {
    return apiHelpers.patch(ENDPOINTS.UPDATE_STATUS(id), { status, reason });
  },

  /** Approve order */
  approve: (id: OrderId) => {
    return apiHelpers.post(ENDPOINTS.APPROVE(id));
  },

  /** Reject order */
  reject: (id: OrderId, reason: string = '') => {
    return apiHelpers.post(ENDPOINTS.REJECT(id), { reason });
  },

  /** Cancel order */
  cancel: (id: OrderId, reason: string = '') => {
    return apiHelpers.post(ENDPOINTS.CANCEL(id), { reason });
  },

  // =========================================================================
  // CONVERSIONS
  // =========================================================================

  /** Duplicate order */
  duplicate: (id: OrderId, modifications: any = {}) => {
    return apiHelpers.post(ENDPOINTS.DUPLICATE(id), modifications);
  },

  /** Convert to invoice */
  convertToInvoice: (id: OrderId, options: any = {}) => {
    return apiHelpers.post(ENDPOINTS.CONVERT_TO_INVOICE(id), options);
  },

  /** Convert to challan */
  convertToChallan: (id: OrderId, options: any = {}) => {
    return apiHelpers.post(ENDPOINTS.CONVERT_TO_CHALLAN(id), options);
  },

  // =========================================================================
  // INVENTORY
  // =========================================================================

  /** Reserve inventory for order */
  reserveInventory: (id: OrderId) => {
    return apiHelpers.post(ENDPOINTS.RESERVE_INVENTORY(id));
  },

  /** Release reserved inventory */
  releaseInventory: (id: OrderId) => {
    return apiHelpers.post(ENDPOINTS.RELEASE_INVENTORY(id));
  },

  // =========================================================================
  // ORDER DETAILS
  // =========================================================================

  /** Get order items */
  getItems: (id: OrderId) => {
    return apiHelpers.get(ENDPOINTS.ITEMS(id));
  },

  /** Update delivery schedule */
  updateDeliverySchedule: (id: OrderId, schedule: any) => {
    return apiHelpers.put(ENDPOINTS.DELIVERY_SCHEDULE(id), schedule);
  },

  /** Get delivery schedule */
  getDeliverySchedule: (id: OrderId) => {
    return apiHelpers.get(ENDPOINTS.DELIVERY_SCHEDULE(id));
  },

  /** Update payment terms */
  updatePaymentTerms: (id: OrderId, terms: any) => {
    return apiHelpers.put(ENDPOINTS.PAYMENT_TERMS(id), terms);
  },

  // =========================================================================
  // HISTORY & AUDIT
  // =========================================================================

  /** Get order history */
  getHistory: (id: OrderId) => {
    return apiHelpers.get(ENDPOINTS.HISTORY(id));
  },

  /** Get audit trail */
  getAuditTrail: (id: OrderId) => {
    return apiHelpers.get(ENDPOINTS.AUDIT(id));
  },

  // =========================================================================
  // EXPORT & SHARE
  // =========================================================================

  /** Generate PDF */
  generatePDF: (id: OrderId) => {
    return apiHelpers.get(ENDPOINTS.PDF(id), { responseType: 'blob' });
  },

  /** Send via email */
  sendEmail: (id: OrderId, recipients: string[]) => {
    return apiHelpers.post(ENDPOINTS.EMAIL(id), { recipients });
  },

  /** Send via WhatsApp */
  sendWhatsApp: (id: OrderId, phoneNumber: string) => {
    return apiHelpers.post(ENDPOINTS.WHATSAPP(id), { phone: phoneNumber });
  },

  // =========================================================================
  // ANALYTICS & REPORTS
  // =========================================================================

  /** Get analytics */
  getAnalytics: (params: OrderParams = {}) => {
    return apiHelpers.get(ENDPOINTS.ANALYTICS, { params });
  },

  /** Get dashboard data */
  getDashboard: () => {
    return apiHelpers.get(ENDPOINTS.DASHBOARD);
  },

  /** Get reports */
  getReports: (params: OrderParams = {}) => {
    return apiHelpers.get(ENDPOINTS.REPORTS, { params });
  }
};

// Backward compatibility alias
export const salesOrdersApi = ordersApi;

export default ordersApi;