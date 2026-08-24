/**
 * Orders API Module
 * Handles order CRUD and actions
 *
 * ENDPOINTS: /sales-orders (backend: app/api/routes/sales/orders/routes.py)
 */

import { apiHelpers } from '../../apiClient';
import { createCrudApi } from '../../utils/createCrudApi';
import { OrderStatus, PriorityLevel } from '../../../../constants';
import {
  approveAndExecuteCanonicalAction,
  canonicalExecutionCompleted,
  prepareCanonicalAction,
  type CanonicalCommandPreview,
} from '../../canonicalOperatorActions';

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

const crud = createCrudApi({ basePath: '/sales-orders/' });

export const ordersApi = {
  ...crud,

  prepareCanonical: (payload: Record<string, unknown>) =>
    prepareCanonicalAction('sales.order.prepare', payload),

  executePreparedCanonical: async (preview: CanonicalCommandPreview, lifecycleId: string) => {
    const { executed } = await approveAndExecuteCanonicalAction('sales.order.prepare', preview, lifecycleId);
    if (!canonicalExecutionCompleted(executed.data) || !executed.data.resource_id) {
      throw new Error('Canonical sales-order execution did not return a completed resource identity.');
    }
    return executed;
  },
  getCanonical: (id: string) => apiHelpers.get(`/canonical/sales-orders/${id}/acceptance-readback`),

  /** Create multiple orders in bulk */
  createBulk: (ordersData: any[]) => {
    return apiHelpers.post('/sales-orders/bulk', { orders: ordersData });
  },

  // Search & Validation
  search: (query: string, params: OrderParams = {}) => {
    return apiHelpers.get('/sales-orders/', { params: { search: query, ...params } });
  },

  validate: (data: any) => {
    return apiHelpers.post('/sales-orders/validate', data);
  },

  // Status Actions
  updateStatus: (id: OrderId, status: string, reason: string = '') => {
    return apiHelpers.patch(`/sales-orders/${id}/status`, { status, reason });
  },

  approve: (id: OrderId) => {
    return apiHelpers.post(`/sales-orders/${id}/approve`);
  },

  reject: (id: OrderId, reason: string = '') => {
    return apiHelpers.post(`/sales-orders/${id}/reject`, { reason });
  },

  cancel: (id: OrderId, reason: string = '') => {
    return apiHelpers.post(`/sales-orders/${id}/cancel`, { reason });
  },

  // Conversions
  duplicate: (id: OrderId, modifications: any = {}) => {
    return apiHelpers.post(`/sales-orders/${id}/duplicate`, modifications);
  },

  convertToInvoice: (id: OrderId, options: any = {}) => {
    return apiHelpers.post(`/sales-orders/${id}/convert-to-invoice`, options);
  },

  convertToChallan: (id: OrderId, options: any = {}) => {
    return apiHelpers.post(`/sales-orders/${id}/convert-to-challan`, options);
  },

  // Inventory
  reserveInventory: (id: OrderId) => {
    return apiHelpers.post(`/sales-orders/${id}/reserve-inventory`);
  },

  releaseInventory: (id: OrderId) => {
    return apiHelpers.post(`/sales-orders/${id}/release-inventory`);
  },

  // Order Details
  getItems: (id: OrderId) => {
    return apiHelpers.get(`/sales-orders/${id}/items`);
  },

  updateDeliverySchedule: (id: OrderId, schedule: any) => {
    return apiHelpers.put(`/sales-orders/${id}/delivery-schedule`, schedule);
  },

  getDeliverySchedule: (id: OrderId) => {
    return apiHelpers.get(`/sales-orders/${id}/delivery-schedule`);
  },

  updatePaymentTerms: (id: OrderId, terms: any) => {
    return apiHelpers.put(`/sales-orders/${id}/payment-terms`, terms);
  },

  // History & Audit
  getHistory: (id: OrderId) => {
    return apiHelpers.get(`/sales-orders/${id}/history`);
  },

  getAuditTrail: (id: OrderId) => {
    return apiHelpers.get(`/sales-orders/${id}/audit`);
  },

  // Export & Share
  generatePDF: (id: OrderId) => {
    return apiHelpers.get(`/sales-orders/${id}/pdf`, { responseType: 'blob' });
  },

  sendEmail: (id: OrderId, recipients: string[]) => {
    return apiHelpers.post(`/sales-orders/${id}/email`, { recipients });
  },

  sendWhatsApp: (id: OrderId, phoneNumber: string) => {
    return apiHelpers.post(`/sales-orders/${id}/whatsapp`, { phone: phoneNumber });
  },

  // Analytics & Reports
  getAnalytics: (params: OrderParams = {}) => {
    return apiHelpers.get('/sales-orders/analytics', { params });
  },

  getDashboard: () => {
    return apiHelpers.get('/sales-orders/dashboard');
  },

  getReports: (params: OrderParams = {}) => {
    return apiHelpers.get('/sales-orders/reports', { params });
  }
};

export default ordersApi;
