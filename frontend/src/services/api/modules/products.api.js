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
    console.log('products.api.js - Creating product:', data);
    
    // Temporary mock implementation until backend POST endpoint is deployed
    // TODO: Replace with actual API call once backend is fixed
    const mockProduct = {
      product_id: 'PROD_' + Date.now(),
      product_code: data.product_code || 'PROD' + Math.random().toString(36).substr(2, 6).toUpperCase(),
      product_name: data.product_name,
      generic_name: data.generic_name || '',
      manufacturer: data.manufacturer || '',
      brand: data.brand || data.manufacturer || '',
      hsn_code: data.hsn_code || '3004',
      gst_percentage: data.gst_percent || data.gst_percentage || 12,
      mrp: data.mrp || 0,
      sale_price: data.sale_price || 0,
      purchase_price: data.purchase_price || 0,
      is_active: data.is_active !== false,
      is_purchasable: data.is_purchasable !== false,
      is_saleable: data.is_saleable !== false,
      maintain_batch: data.maintain_batch !== false,
      maintain_expiry: data.maintain_expiry !== false,
      pack_config: data.pack_config || {
        base_uom: data.base_unit || 'TAB',
        pack_size: 10,
        pack_unit: 'Strip',
        box_size: 10
      },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    
    // Store in localStorage for testing
    const storedProducts = JSON.parse(localStorage.getItem('mockProducts') || '[]');
    storedProducts.push(mockProduct);
    localStorage.setItem('mockProducts', JSON.stringify(storedProducts));
    
    console.log('Mock product created:', mockProduct);
    alert('Product created successfully (Mock Mode - Backend POST endpoint not available)');
    
    return Promise.resolve({ data: mockProduct });
    
    // Original implementation - uncomment when backend is fixed
    // const cleanedData = cleanData(data);
    // return apiHelpers.post(ENDPOINTS.BASE, cleanedData);
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