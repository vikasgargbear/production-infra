/**
 * JavaScript wrapper for TypeScript API exports
 * This file provides proper JavaScript exports for the TypeScript APIs
 */

// Use dynamic import to avoid initialization order issues
import axios from 'axios';

// Create our own apiClient instance to avoid circular dependency
const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000';
const apiClient = axios.create({
  baseURL: `${API_BASE_URL}/api/v1`,
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
    return response.data;
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
    const response = await apiClient.get('/products/search', {
      params: {
        q: query,
        category: options.category,
        manufacturer: options.manufacturer,
        limit: options.limit || 50,
        offset: options.offset || 0,
      },
    });
    return response.data;
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
    const response = await apiClient.post('/pg/products', productData);
    return response.data;
  },

  /**
   * Get product batches
   */
  getBatches: async (productId) => {
    const response = await apiClient.get(`/pg/products/${productId}/batches`);
    return response.data;
  },
};

// Define other commonly used APIs
export const invoiceAPI = {
  search: async (query, options = {}) => {
    const response = await apiClient.get('/pg/invoices/search', {
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
    const response = await apiClient.get(`/pg/invoices/${invoiceId}`);
    return response.data;
  },
};

export const ordersAPI = {
  search: async (query, options = {}) => {
    const response = await apiClient.get('/pg/orders/search', {
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
    const response = await apiClient.get('/pg/purchases/search', {
      params: {
        q: query,
        supplier_id: options.supplierId,
        limit: options.limit || 50,
        offset: options.offset || 0,
      },
    });
    return response.data;
  },
};

export const supplierAPI = {
  search: async (query, options = {}) => {
    const response = await apiClient.get('/pg/suppliers/search', {
      params: {
        q: query,
        limit: options.limit || 50,
        offset: options.offset || 0,
      },
    });
    return response.data;
  },

  create: async (supplierData) => {
    const response = await apiClient.post('/pg/suppliers', supplierData);
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
};

// Note: We don't re-export apiClient here to avoid circular dependency
// The apiClient is already available through the main index.js