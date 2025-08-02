import { apiHelpers } from '../apiClient';
import { API_CONFIG } from '../../../config/api.config';

const ENDPOINTS = API_CONFIG.ENDPOINTS.ORDERS;

export const ordersApi = {
  // Get all orders
  getAll: async (params = {}) => {
    try {
      let response = await apiHelpers.get(ENDPOINTS.BASE, { params });
      
      // Fix null payment_terms in the response
      if (response && response.orders && Array.isArray(response.orders)) {
        response.orders = response.orders.map(order => ({
          ...order,
          payment_terms: order.payment_terms || 'credit' // Default to 'credit' if null
        }));
      } else if (response && response.data && Array.isArray(response.data)) {
        response.data = response.data.map(order => ({
          ...order,
          payment_terms: order.payment_terms || 'credit' // Default to 'credit' if null
        }));
      } else if (response && response.data && response.data.orders && Array.isArray(response.data.orders)) {
        // Handle nested structure from axios response
        const nestedData = response.data;
        nestedData.orders = nestedData.orders.map(order => ({
          ...order,
          payment_terms: order.payment_terms || 'credit' // Default to 'credit' if null
        }));
        return nestedData;
      }
      
      return response;
    } catch (error) {
      console.error('Error in ordersApi.getAll:', error);
      throw error;
    }
  },
  
  // Get order by ID
  getById: (id) => {
    return apiHelpers.get(`${ENDPOINTS.BASE}/${id}`);
  },
  
  // Create new order
  create: async (data) => {
    console.log('=== ORDERS API DEBUG ===');
    console.log('ordersApi.create called with:', JSON.stringify(data, null, 2));
    
    // Remove any order_id from create data to avoid confusion
    const { order_id, ...createData } = data;
    console.log('Data after removing order_id:', JSON.stringify(createData, null, 2));
    
    // Use standard API call
    try {
      const response = await apiHelpers.post(ENDPOINTS.BASE, createData);
      console.log('Order created successfully:', response);
      return response;
    } catch (error) {
      console.error('Order creation failed:', error);
      throw error;
    }
  },
  
  // Update order
  update: (id, data) => {
    return apiHelpers.put(`${ENDPOINTS.BASE}/${id}`, data);
  },
  
  // Delete order (for backward compatibility)
  delete: (id) => {
    return apiHelpers.delete(`${ENDPOINTS.BASE}/${id}`);
  },
  
  // Confirm order
  confirm: (id) => {
    return apiHelpers.post(ENDPOINTS.CONFIRM(id));
  },
  
  // Cancel order
  cancel: (id, reason = '') => {
    return apiHelpers.post(ENDPOINTS.CANCEL(id), { reason });
  },
  
  // Generate invoice from order
  generateInvoice: (id, data = {}) => {
    // Accept data parameter for backward compatibility
    return apiHelpers.post(ENDPOINTS.GENERATE_INVOICE(id), data);
  },
  
  // Search orders
  search: (query) => {
    return apiHelpers.get(ENDPOINTS.BASE, { 
      params: { search: query } 
    });
  },
  
  // Get order items
  getItems: (orderId) => {
    return apiHelpers.get(`${ENDPOINTS.BASE}/${orderId}/items`);
  },
};

export default ordersApi;