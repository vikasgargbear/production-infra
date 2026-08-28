/**
 * Orders API Module
 * Handles order CRUD and actions
 *
 * ENDPOINTS: /sales-orders (backend: app/api/routes/sales/orders/routes.py)
 */

import { apiHelpers } from '../../apiClient';
import type { AxiosResponse } from 'axios';
import { createCrudApi } from '../../utils/createCrudApi';
import { rejectCanonicalWrite } from '../../canonicalWritePolicy';
import { OrderStatus, PriorityLevel } from '../../../../constants';
import {
  approveAndExecuteCanonicalAction,
  canonicalExecutionCompleted,
  prepareCanonicalAction,
  type CanonicalCommandPreview,
} from '../../canonicalOperatorActions';
import type { CanonicalSalesOrderImportDetail } from './canonicalSalesDocuments.types';
import {
  canonicalDocumentHistoryApi,
  requireCanonicalHistoryAmount,
} from '../history/canonicalDocumentHistory.api';

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
  getById: (id: OrderId, dispatchDate: string) => apiHelpers.get<CanonicalSalesOrderImportDetail>(
    `/canonical/sales-orders/${id}/import-detail`,
    { params: { dispatch_date: dispatchDate } },
  ),
  create: (_data: any) => rejectCanonicalWrite('Legacy sales-order creation'),
  update: (_id: OrderId, _data: any) => rejectCanonicalWrite('Legacy sales-order editing'),
  delete: (_id: OrderId) => rejectCanonicalWrite('Legacy sales-order deletion'),

  prepareCanonical: (payload: Record<string, unknown>) =>
    prepareCanonicalAction('sales.order.prepare', payload),

  executePreparedCanonical: async (preview: CanonicalCommandPreview, lifecycleId: string) => {
    const { executed } = await approveAndExecuteCanonicalAction('sales.order.prepare', preview, lifecycleId);
    if (!canonicalExecutionCompleted(executed.data) || !executed.data.resource_id) {
      throw new Error('Canonical sales-order execution did not return a completed resource identity.');
    }
    return executed;
  },
  getCanonical: (id: string) => apiHelpers.get(
    `/canonical/sales-orders/${id}/acceptance-readback`,
    { preserveExactDecimals: true },
  ),

  /** Canonical approved orders eligible for explicit dispatch selection. */
  listApprovedForDispatch: async (search = '', pageSize = 50) => {
    const response = await canonicalDocumentHistoryApi.get({
      document_kind: 'sales_order', status: 'approved', search, page: 1, page_size: pageSize,
    });
    return response.items.map(row => {
      if (row.document_kind !== 'sales_order' || row.status !== 'approved') {
        throw new Error('Dispatch eligibility returned a document that is not an approved sales order.');
      }
      return {
        order_id: row.document_id,
        branch_id: row.branch_id,
        order_number: row.document_number,
        order_date: row.document_date,
        customer_id: row.party_account_id,
        customer_name: row.party_name,
        total_amount: requireCanonicalHistoryAmount(row.total_amount, 'Approved sales-order total'),
        order_status: 'approved' as const,
      };
    });
  },

  /** Create multiple orders in bulk */
  createBulk: (_ordersData: any[]) => rejectCanonicalWrite('Bulk sales-order creation'),

  // Search & Validation
  search: (query: string, params: OrderParams = {}) => {
    return apiHelpers.get('/sales-orders/', { params: { search: query, ...params } });
  },

  validate: (_data: any) => rejectCanonicalWrite('Legacy sales-order validation'),

  // Status Actions
  updateStatus: (_id: OrderId, _status: string, _reason: string = '') =>
    rejectCanonicalWrite('Legacy sales-order status changes'),

  approve: (_id: OrderId) => rejectCanonicalWrite('Legacy sales-order approval'),

  reject: (_id: OrderId, _reason: string = '') => rejectCanonicalWrite('Legacy sales-order rejection'),

  cancel: (_id: OrderId, _reason: string = '') => rejectCanonicalWrite('Legacy sales-order cancellation'),

  // Conversions
  duplicate: (_id: OrderId, _modifications: any = {}) => rejectCanonicalWrite('Legacy sales-order duplication'),

  convertToInvoice: (_id: OrderId, _options: any = {}): Promise<AxiosResponse> =>
    rejectCanonicalWrite('Legacy order-to-invoice conversion'),

  convertToChallan: (_id: OrderId, _options: any = {}) => rejectCanonicalWrite('Legacy order-to-challan conversion'),

  // Inventory
  reserveInventory: (_id: OrderId) => rejectCanonicalWrite('Legacy sales-order inventory reservation'),

  releaseInventory: (_id: OrderId) => rejectCanonicalWrite('Legacy sales-order inventory release'),

  // Order Details
  getItems: (id: OrderId) => {
    return apiHelpers.get(`/sales-orders/${id}/items`);
  },

  updateDeliverySchedule: (_id: OrderId, _schedule: any) => rejectCanonicalWrite('Legacy delivery-schedule editing'),

  getDeliverySchedule: (id: OrderId) => {
    return apiHelpers.get(`/sales-orders/${id}/delivery-schedule`);
  },

  updatePaymentTerms: (_id: OrderId, _terms: any) => rejectCanonicalWrite('Legacy payment-term editing'),

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

  sendEmail: (_id: OrderId, _recipients: string[]) => rejectCanonicalWrite('Sending a sales order by email'),

  sendWhatsApp: (_id: OrderId, _phoneNumber: string) => rejectCanonicalWrite('Sending a sales order by WhatsApp'),

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
