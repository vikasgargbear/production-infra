/**
 * JavaScript wrapper for TypeScript API exports
 * This file provides proper JavaScript exports for the TypeScript APIs
 */

// Use dynamic import to avoid initialization order issues
import axios from 'axios';

// Create our own apiClient instance to avoid circular dependency
// Use HTTPS for Railway production deployment
const API_BASE_URL = process.env.REACT_APP_API_BASE_URL || 'https://pharma-backend-production-0c09.up.railway.app';
const apiClient = axios.create({
  baseURL: `${API_BASE_URL}/api`,  // Consolidated API - no version numbers
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  },
});

// Add request interceptor for auth token
apiClient.interceptors.request.use((config) => {
  const token = localStorage.getItem('auth_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Add response interceptor for error handling
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('auth_token');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

// Define the customerAPI directly in JavaScript to avoid TypeScript export issues
export const customerAPI = {
  /**
   * Search customers using PostgreSQL function
   */
  search: async (query, options = {}) => {
    const response = await apiClient.get('/customers/', {
      params: {
        search: query,
        customer_type: options.customerType,
        limit: options.limit || 50,
        offset: options.offset || 0,
      },
    });
    // Wrap the response to match expected format
    return {
      success: true,
      data: response.data.customers || [],
      total: response.data.total,
      page: response.data.page,
      per_page: response.data.per_page
    };
  },

  /**
   * Get customer details with ledger summary
   */
  getDetails: async (customerId) => {
    const response = await apiClient.get(`/customers/${customerId}`);
    return response.data;
  },

  /**
   * Create new customer
   */
  create: async (customerData) => {
    const response = await apiClient.post('/customers/', customerData);
    return response.data;
  },

  /**
   * Get outstanding invoices for customer
   */
  getOutstanding: async (customerId) => {
    const response = await apiClient.get(`/customers/${customerId}/outstanding`);
    return response.data;
  },
};

// Define the productAPI directly in JavaScript
export const productAPI = {
  /**
   * Search products using PostgreSQL function
   */
  search: async (query, options = {}) => {
    try {
      // Use products/search endpoint
      const response = await apiClient.get('/products/search', {
        params: {
          q: query,
          category: options.category,
          manufacturer: options.manufacturer,
          limit: options.limit || 50,
          offset: options.offset || 0,
        },
      });
      
      // Wrap response to match expected format
      return {
        success: true,
        data: response.data.products || response.data || [],
        total: response.data.total,
        page: response.data.page,
        per_page: response.data.per_page
      };
    } catch (error) {
      // Fallback to v1 endpoint
      try {
        const response = await apiClient.get('/products/search', {
          params: {
            q: query,
            category: options.category,
            manufacturer: options.manufacturer,
            limit: options.limit || 50,
            offset: options.offset || 0,
          },
        });
        return {
          success: true,
          data: response.data.products || response.data || [],
          total: response.data.total
        };
      } catch (fallbackError) {
        console.error('Product search failed:', fallbackError);
        // Return empty array on error
        return {
          success: false,
          data: [],
          total: 0,
          error: fallbackError.message
        };
      }
    }
  },

  /**
   * Get product details with stock info
   */
  getDetails: async (productId) => {
    const response = await apiClient.get(`/products/${productId}`);
    return response.data;
  },

  /**
   * Create new product
   */
  create: async (productData) => {
    const response = await apiClient.post('/products/', productData);
    return response.data;
  },

  /**
   * Get all products with stock data
   */
  getAll: async (options = {}) => {
    try {
      const response = await apiClient.get('/products/', {
        params: {
          limit: Math.min(options.limit || 100, 100), // Backend max limit is 100
          skip: options.offset || options.skip || 0,
          search: options.search || '',
          product_type: options.product_type || '',
          manufacturer: options.manufacturer || '',
        },
      });
      
      // Return in expected format
      return {
        success: true,
        data: response.data || [],
        total: response.data?.length || 0
      };
    } catch (error) {
      console.error('Error fetching products:', error);
      return {
        success: false,
        data: [],
        total: 0,
        error: error.message
      };
    }
  },

  /**
   * Get product batches
   */
  getBatches: async (productId) => {
    const response = await apiClient.get(`/pg/products/${productId}/batches`);
    return response.data;
  },

  /**
   * Generic GET method for any product endpoint
   */
  get: async (endpoint) => {
    const response = await apiClient.get(endpoint);
    return response;
  },

  /**
   * Generic POST method for any product endpoint
   */
  post: async (endpoint, data) => {
    const response = await apiClient.post(endpoint, data);
    return response;
  },
};

// Define other commonly used APIs
export const invoiceAPI = {
  search: async (query, options = {}) => {
    const response = await apiClient.get('/invoices', {
      params: {
        q: query,
        customer_id: options.customerId,
        date_from: options.dateFrom,
        date_to: options.dateTo,
        limit: options.limit || 50,
        offset: options.offset || 0,
      },
    });
    return response.data;
  },

  getDetails: async (invoiceId) => {
    const response = await apiClient.get(`/invoices/${invoiceId}`);
    return response.data;
  },
};

export const ordersAPI = {
  search: async (query, options = {}) => {
    const response = await apiClient.get('/orders', {
      params: {
        q: query,
        customer_id: options.customerId,
        status: options.status,
        limit: options.limit || 50,
        offset: options.offset || 0,
      },
    });
    return response.data;
  },
};

export const purchasesAPI = {
  search: async (query, options = {}) => {
    const response = await apiClient.get('/purchases', {
      params: {
        q: query,
        supplier_id: options.supplierId,
        limit: options.limit || 50,
        offset: options.offset || 0,
      },
    });
    return response.data;
  },
  
  getAll: async (params = {}) => {
    const response = await apiClient.get('/purchases', {
      params: {
        limit: params.limit || 100,
        skip: params.skip || 0,
        supplier_id: params.supplier_id,
        product_id: params.product_id,
        start_date: params.start_date,
        end_date: params.end_date,
        sort: params.sort,
        order: params.order,
      },
    });
    return { data: response.data };
  },
  
  getById: async (id) => {
    const response = await apiClient.get(`/purchases/${id}`);
    return response.data;
  },
  
  create: async (data) => {
    const response = await apiClient.post('/purchases', data);
    return response.data;
  },
  
  update: async (id, data) => {
    const response = await apiClient.put(`/purchases/${id}`, data);
    return response.data;
  },
  
  delete: async (id) => {
    const response = await apiClient.delete(`/purchases/${id}`);
    return response.data;
  },
  
  // Purchase Order specific methods
  generatePONumber: async () => {
    // Generate PO number locally since backend doesn't have this endpoint
    try {
      const year = new Date().getFullYear();
      const month = String(new Date().getMonth() + 1).padStart(2, '0');
      const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
      return {
        data: {
          po_number: `PO-${year}${month}-${random}`
        }
      };
    } catch (error) {
      throw error;
    }
  },
};

export const supplierAPI = {
  search: async (query, options = {}) => {
    const response = await apiClient.get('/suppliers/', {
      params: {
        q: query,
        limit: options.limit || 50,
        offset: options.offset || 0,
      },
    });
    return response.data;
  },

  create: async (supplierData) => {
    const response = await apiClient.post('/suppliers/', supplierData);
    return response.data;
  },
};

export const paymentAPI = {
  search: async (query, options = {}) => {
    const response = await apiClient.get('/pg/payments/search', {
      params: {
        q: query,
        party_id: options.partyId,
        party_type: options.partyType,
        limit: options.limit || 50,
        offset: options.offset || 0,
      },
    });
    return response.data;
  },
};

export const challansAPI = {
  search: async (query, options = {}) => {
    const response = await apiClient.get('/pg/challans/search', {
      params: {
        q: query,
        customer_id: options.customerId,
        limit: options.limit || 50,
        offset: options.offset || 0,
      },
    });
    return response.data;
  },
};

export const salesOrdersAPI = {
  search: async (query, options = {}) => {
    const response = await apiClient.get('/pg/sales-orders/search', {
      params: {
        q: query,
        customer_id: options.customerId,
        status: options.status,
        limit: options.limit || 50,
        offset: options.offset || 0,
      },
    });
    return response.data;
  },
  
  getAll: async (params = {}) => {
    const response = await apiClient.get('/sales-orders', {
      params: {
        limit: params.limit || 100,
        offset: params.offset || 0,
        status: params.status,
        customer_id: params.customer_id,
        date_from: params.date_from,
        date_to: params.date_to,
      },
    });
    return response.data;
  },
  
  getById: async (id) => {
    const response = await apiClient.get(`/sales-orders/${id}`);
    return response.data;
  },
  
  create: async (data) => {
    const response = await apiClient.post('/sales-orders', data);
    return response.data;
  },
  
  update: async (id, data) => {
    const response = await apiClient.put(`/sales-orders/${id}`, data);
    return response.data;
  },
  
  convertToInvoice: async (id) => {
    const response = await apiClient.post(`/sales-orders/${id}/convert-to-invoice`);
    return response.data;
  },
  
  convertToChallan: async (id) => {
    const response = await apiClient.post(`/sales-orders/${id}/convert-to-challan`);
    return response.data;
  },
};

// Note: We don't re-export apiClient here to avoid circular dependency
// The apiClient is already available through the main index.js