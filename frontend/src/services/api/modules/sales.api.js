/**
 * Sales API Module
 * Handles all sales-related API calls (invoices, direct sales)
 */

import { apiClient } from '../apiClient';
import { API_CONFIG } from '../../../config/api.config';
import { salesDataTransformer } from '../utils/salesDataTransformer';

const { ENDPOINTS } = API_CONFIG;

export const salesApi = {
  // Get all sales
  getAll: async (params = {}) => {
    return apiClient.get('/sales', { params });
  },

  // Get single sale
  getById: async (id) => {
    return apiClient.get(`/sales/${id}`);
  },

  // Create direct sale/invoice
  create: async (data) => {
    // Transform frontend data to backend format
    const transformedData = salesDataTransformer.transformInvoiceToSale(data);
    
    // Validate before sending
    const validation = salesDataTransformer.validateSaleData(transformedData);
    if (!validation.isValid) {
      throw new Error(validation.errors.join(', '));
    }
    
    const response = await apiClient.post('/sales', transformedData);
    
    // Transform response back to frontend format
    if (response.data) {
      response.data = salesDataTransformer.transformSaleToInvoice(response.data);
    }
    
    return response;
  },

  // Get sale by invoice number
  getByInvoiceNumber: async (invoiceNumber) => {
    return apiClient.get(`/sales/invoice/${invoiceNumber}`);
  },

  // Get print data
  getPrintData: async (saleId) => {
    return apiClient.post(`/sales/${saleId}/print`);
  },

  // Calculate sale totals (for preview)
  calculateTotals: async (data) => {
    return apiClient.post('/sales/calculate', data);
  },

  // Validate sale data
  validate: async (data) => {
    return apiClient.post('/sales/validate', data);
  },

  // Get available batches for a product
  getProductBatches: async (productId) => {
    return apiClient.get(`/products/${productId}/batches`);
  },

  // Check product availability
  checkAvailability: async (items) => {
    return apiClient.post('/sales/check-availability', { items });
  },

  // Cancel sale
  cancel: async (saleId, reason) => {
    return apiClient.post(`/sales/${saleId}/cancel`, { reason });
  },

  // Get sale statistics
  getStats: async (params = {}) => {
    return apiClient.get('/sales/stats', { params });
  },

  // Export sales data
  export: async (params = {}, format = 'xlsx') => {
    return apiClient.get('/sales/export', {
      params: { ...params, format },
      responseType: 'blob'
    });
  },

  // Email invoice
  sendEmail: async (saleId, emailData) => {
    return apiClient.post(`/sales/${saleId}/email`, emailData);
  },

  // Generate invoice PDF
  generatePDF: async (saleId) => {
    return apiClient.get(`/sales/${saleId}/pdf`, {
      responseType: 'blob'
    });
  },

  // Create sales order (fallback for orders endpoint)
  createOrder: async (data) => {
    // Transform order data to sales format for fallback
    const salesOrderData = {
      ...data,
      invoice_type: 'order',
      status: 'draft'
    };
    
    return apiClient.post('/sales/orders', salesOrderData);
  },
};