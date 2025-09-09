import { apiHelpers } from '../apiClient';
import { API_CONFIG } from '../../../config/api.config';
import { cleanData } from '../utils/dataUtils';

const ENDPOINTS = API_CONFIG.ENDPOINTS.PRODUCTS;

export const productsApi = {
  // Get all products with optional search
  getAll: (params = {}) => {
    // Support old search parameter format for backward compatibility
    if (params && params.search) {
      return apiHelpers.get(ENDPOINTS.BASE, { params });
    }
    return apiHelpers.get(ENDPOINTS.BASE, { params });
  },
  
  // Get product by ID
  getById: (id) => {
    return apiHelpers.get(`${ENDPOINTS.BASE}/${id}`);
  },
  
  // Create new product
  create: (data) => {
    const cleanedData = cleanData(data);
    return apiHelpers.post(ENDPOINTS.CREATE || ENDPOINTS.BASE, cleanedData);
  },
  
  // Update product
  update: (id, data) => {
    const cleanedData = cleanData(data);
    return apiHelpers.put(`${ENDPOINTS.BASE}/${id}`, cleanedData);
  },
  
  // Delete product
  delete: (id) => {
    return apiHelpers.delete(`${ENDPOINTS.BASE}/${id}`);
  },
  
  // Search products
  search: (query, params = {}) => {
    // Use the same endpoint as getAll with search parameter for backward compatibility
    return apiHelpers.get(ENDPOINTS.BASE, { 
      params: { search: query, ...params } 
    });
  },
  
  // Get product categories
  getCategories: () => {
    return apiHelpers.get(ENDPOINTS.CATEGORIES);
  },
  
  // Batch upload products
  batchUpload: (file, onProgress) => {
    const formData = new FormData();
    formData.append('file', file);
    return apiHelpers.upload(ENDPOINTS.BATCH_UPLOAD, formData, onProgress);
  },
  
  // Update stock levels
  updateStock: (productId, data) => {
    return apiHelpers.post(ENDPOINTS.STOCK_UPDATE, {
      product_id: productId,
      ...data
    });
  },
  
  // Get low stock products
  getLowStock: (threshold = 10) => {
    return apiHelpers.get(ENDPOINTS.BASE, {
      params: { low_stock: true, threshold }
    });
  },
  
  // Get expired products
  getExpired: () => {
    return apiHelpers.get(ENDPOINTS.BASE, {
      params: { expired: true }
    });
  },
  
  // Get expiring soon products
  getExpiringSoon: (days = 30) => {
    return apiHelpers.get(ENDPOINTS.BASE, {
      params: { expiring_soon: true, days }
    });
  },
};