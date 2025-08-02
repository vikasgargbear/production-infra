/**
 * Returns API Module
 * Handles all return-related API calls
 */

import { apiClient } from '../apiClient';
import { API_CONFIG } from '../../../config/api.config';
import { returnsDataTransformer } from '../utils/returnsDataTransformer';

const { ENDPOINTS } = API_CONFIG;

export const returnsApi = {
  // Get all returns
  getAll: async (params = {}) => {
    return apiClient.get(ENDPOINTS.RETURNS.BASE, { params });
  },

  // Get single return
  getById: async (id) => {
    return apiClient.get(`${ENDPOINTS.RETURNS.BASE}/${id}`);
  },

  // Create return
  create: async (data) => {
    return apiClient.post(ENDPOINTS.RETURNS.BASE, data);
  },

  // Update return
  update: async (id, data) => {
    return apiClient.put(`${ENDPOINTS.RETURNS.BASE}/${id}`, data);
  },

  // Delete return
  delete: async (id) => {
    return apiClient.delete(`${ENDPOINTS.RETURNS.BASE}/${id}`);
  },

  // Approve return
  approve: async (id) => {
    return apiClient.post(ENDPOINTS.RETURNS.APPROVE(id));
  },

  // Reject return
  reject: async (id, reason) => {
    return apiClient.post(ENDPOINTS.RETURNS.REJECT(id), { reason });
  },

  // Customer returns
  getCustomerReturns: async (params = {}) => {
    return apiClient.get(ENDPOINTS.RETURNS.CUSTOMER_RETURNS, { params });
  },

  // Supplier returns
  getSupplierReturns: async (params = {}) => {
    return apiClient.get(ENDPOINTS.RETURNS.SUPPLIER_RETURNS, { params });
  },

  // Process return (customer or supplier)
  processReturn: async (type, data) => {
    const endpoint = type === 'customer' 
      ? ENDPOINTS.RETURNS.CUSTOMER_RETURNS 
      : ENDPOINTS.RETURNS.SUPPLIER_RETURNS;
    return apiClient.post(endpoint, data);
  },

  // Get return reasons
  getReturnReasons: async () => {
    return apiClient.get(`${ENDPOINTS.RETURNS.BASE}/reasons`);
  },

  // Get returnable items for a document
  getReturnableItems: async (documentType, documentId) => {
    return apiClient.get(`${ENDPOINTS.RETURNS.BASE}/returnable`, {
      params: { document_type: documentType, document_id: documentId }
    });
  },

  // Create sale return (customer return)
  createSaleReturn: async (data) => {
    const transformedData = returnsDataTransformer.transformSaleReturnToBackend(data);
    const validation = returnsDataTransformer.validateReturnData(transformedData, 'sale');
    
    if (!validation.isValid) {
      throw new Error(validation.errors.join(', '));
    }
    
    const response = await apiClient.post('/sale-returns', transformedData);
    
    if (response.data) {
      response.data = returnsDataTransformer.transformBackendSaleReturn(response.data);
    }
    
    return response;
  },

  // Create purchase return (supplier return)
  createPurchaseReturn: async (data) => {
    const transformedData = returnsDataTransformer.transformPurchaseReturnToBackend(data);
    const validation = returnsDataTransformer.validateReturnData(transformedData, 'purchase');
    
    if (!validation.isValid) {
      throw new Error(validation.errors.join(', '));
    }
    
    const response = await apiClient.post('/purchase-returns', transformedData);
    
    if (response.data) {
      response.data = returnsDataTransformer.transformBackendPurchaseReturn(response.data);
    }
    
    return response;
  },

  // Get sale returns
  getSaleReturns: async (params = {}) => {
    const response = await apiClient.get('/sale-returns', { params });
    
    if (response.data && response.data.returns) {
      response.data.returns = response.data.returns.map(ret => 
        returnsDataTransformer.transformBackendSaleReturn(ret)
      );
    }
    
    return response;
  },

  // Get purchase returns
  getPurchaseReturns: async (params = {}) => {
    const response = await apiClient.get('/purchase-returns', { params });
    
    if (response.data && response.data.returns) {
      response.data.returns = response.data.returns.map(ret => 
        returnsDataTransformer.transformBackendPurchaseReturn(ret)
      );
    }
    
    return response;
  },

  // Get returnable invoices
  getReturnableInvoices: async (params = {}) => {
    return apiClient.get('/sale-returns/returnable-invoices', { params });
  },

  // Get returnable purchases
  getReturnablePurchases: async (params = {}) => {
    return apiClient.get('/purchase-returns/returnable-purchases/', { params });
  },

  // Get purchase items for return
  getPurchaseItems: async (purchaseId) => {
    return apiClient.get(`/purchase-returns/purchase/${purchaseId}/items`);
  }
};