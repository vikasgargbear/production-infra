import apiClient from '../apiClient';

// Legacy apiUtils for backward compatibility
export const apiUtils = {
  // Get orders with customer details
  getOrdersWithCustomers: async () => {
    try {
      // Import dynamically to avoid circular dependencies
      const { ordersApi, customersApi } = await import('../index');
      
      const [ordersResponse, customersResponse] = await Promise.all([
        ordersApi.getAll(),
        customersApi.getAll()
      ]);
      
      const orders = ordersResponse.data;
      const customers = customersResponse.data;
      
      // Map customer names to orders
      return orders.map(order => {
        const customer = customers.find(c => c.customer_id === order.customer_id);
        return {
          ...order,
          customer_name: customer ? customer.name : 'Unknown Customer'
        };
      });
    } catch (error) {
      console.error('Error fetching orders with customers:', error);
      throw error;
    }
  },

  // Get batches with product details
  getBatchesWithProducts: async () => {
    try {
      // Import dynamically to avoid circular dependencies
      const { batchesApi, productsApi } = await import('../index');
      
      const [batchesResponse, productsResponse] = await Promise.all([
        batchesApi.getAll(),
        productsApi.getAll()
      ]);
      
      const batches = batchesResponse.data;
      const products = productsResponse.data;
      
      return batches.map(batch => {
        const product = products.find(p => p.product_id === batch.product_id);
        return {
          ...batch,
          product_name: product ? product.product_name : 'Unknown Product'
        };
      });
    } catch (error) {
      console.error('Error fetching batches with products:', error);
      throw error;
    }
  },

  // Get dashboard statistics
  getDashboardStats: async () => {
    try {
      // Try to use the new dashboard API endpoint first
      try {
        const { dashboardApi } = await import('../index');
        const response = await dashboardApi.getStats();
        return response.data;
      } catch (dashboardError) {
        console.warn('Dashboard API not available, calculating stats manually:', dashboardError.message);
        // Fallback to manual calculation
        const { productsApi, customersApi, ordersApi, paymentsApi } = await import('../index');
        
        const [products, customers, orders, payments] = await Promise.all([
          productsApi.getAll(),
          customersApi.getAll(),
          ordersApi.getAll(),
          paymentsApi.getAll()
        ]);

        const totalRevenue = orders.data.reduce((sum, order) => sum + (order.final_amount || 0), 0);
        const completedPayments = payments.data.filter(p => p.payment_mode).length;
        
        return {
          totalProducts: products.data.length,
          totalCustomers: customers.data.length,
          totalOrders: orders.data.length,
          totalRevenue,
          completedPayments,
          pendingPayments: orders.data.length - completedPayments
        };
      }
    } catch (error) {
      console.error('Error fetching dashboard stats:', error);
      throw error;
    }
  }
};

export const utilsApi = {
  // File upload/download utilities
  upload: (file, type) => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('type', type);
    return apiClient.post('/utils/upload', formData, {
      headers: { 'Content-Type': 'multipart/form-data' }
    });
  },
  
  download: (fileId) => apiClient.get(`/utils/download/${fileId}`, {
    responseType: 'blob'
  }),
  
  // Import/Export utilities
  import: {
    validate: (file, type) => {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('type', type);
      return apiClient.post('/utils/import/validate', formData);
    },
    process: (fileId, options) => apiClient.post('/utils/import/process', { fileId, ...options }),
    getStatus: (importId) => apiClient.get(`/utils/import/status/${importId}`),
  },
  
  export: {
    generate: (type, filters) => apiClient.post('/utils/export/generate', { type, filters }),
    download: (exportId) => apiClient.get(`/utils/export/download/${exportId}`, {
      responseType: 'blob'
    }),
  },
  
  // Search utilities
  search: {
    global: (query) => apiClient.get('/utils/search', { params: { q: query } }),
    products: (query) => apiClient.get('/utils/search/products', { params: { q: query } }),
    parties: (query) => apiClient.get('/utils/search/parties', { params: { q: query } }),
  },
  
  // Validation utilities
  validate: {
    gst: (gstin) => apiClient.post('/utils/validate/gst', { gstin }),
    pan: (pan) => apiClient.post('/utils/validate/pan', { pan }),
    email: (email) => apiClient.post('/utils/validate/email', { email }),
    phone: (phone) => apiClient.post('/utils/validate/phone', { phone }),
  },
  
  // Miscellaneous utilities
  generateBarcode: (data) => apiClient.post('/utils/barcode', data),
  getStates: () => apiClient.get('/utils/states'),
  getCurrencies: () => apiClient.get('/utils/currencies'),
  getTimezones: () => apiClient.get('/utils/timezones'),
};

export default utilsApi;