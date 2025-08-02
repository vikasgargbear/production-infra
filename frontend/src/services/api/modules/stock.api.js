/**
 * Stock Movement API Module
 * Handles all stock movement related API calls
 */

import { apiClient } from '../apiClient';
import { API_CONFIG } from '../../../config/api.config';
import { stockDataTransformer } from '../utils/stockDataTransformer';

const { ENDPOINTS } = API_CONFIG;

export const stockApi = {
  // Get all stock movements
  getMovements: async (params = {}) => {
    return apiClient.get(ENDPOINTS.STOCK.MOVEMENTS, { params });
  },

  // Get single movement
  getMovementById: async (id) => {
    return apiClient.get(`${ENDPOINTS.STOCK.MOVEMENTS}/${id}`);
  },

  // Stock receive
  receive: async (data) => {
    const movements = stockDataTransformer.transformMovementToBackend(data, 'receive');
    
    // Handle single or multiple movements
    if (Array.isArray(movements)) {
      // Multiple items - use bulk endpoint if available
      const promises = movements.map(movement => {
        const validation = stockDataTransformer.validateMovementData(movement, 'receive');
        if (!validation.isValid) {
          throw new Error(validation.errors.join(', '));
        }
        return apiClient.post(ENDPOINTS.STOCK.RECEIVE, movement);
      });
      return Promise.all(promises);
    } else {
      const validation = stockDataTransformer.validateMovementData(movements, 'receive');
      if (!validation.isValid) {
        throw new Error(validation.errors.join(', '));
      }
      return apiClient.post(ENDPOINTS.STOCK.RECEIVE, movements);
    }
  },

  // Stock issue
  issue: async (data) => {
    const movements = stockDataTransformer.transformMovementToBackend(data, 'issue');
    
    // Handle single or multiple movements
    if (Array.isArray(movements)) {
      // Multiple items - use bulk endpoint if available
      const promises = movements.map(movement => {
        const validation = stockDataTransformer.validateMovementData(movement, 'issue');
        if (!validation.isValid) {
          throw new Error(validation.errors.join(', '));
        }
        return apiClient.post(ENDPOINTS.STOCK.ISSUE, movement);
      });
      return Promise.all(promises);
    } else {
      const validation = stockDataTransformer.validateMovementData(movements, 'issue');
      if (!validation.isValid) {
        throw new Error(validation.errors.join(', '));
      }
      return apiClient.post(ENDPOINTS.STOCK.ISSUE, movements);
    }
  },

  // Stock transfer
  transfer: async (data) => {
    const transformedData = stockDataTransformer.transformTransferToBackend(data);
    const validation = stockDataTransformer.validateMovementData(transformedData, 'transfer');
    
    if (!validation.isValid) {
      throw new Error(validation.errors.join(', '));
    }
    
    return apiClient.post(ENDPOINTS.STOCK.TRANSFER, transformedData);
  },

  // Stock adjustment
  adjust: async (data) => {
    const transformedData = stockDataTransformer.transformAdjustmentToBackend(data);
    const validation = stockDataTransformer.validateMovementData(transformedData, 'adjustment');
    
    if (!validation.isValid) {
      throw new Error(validation.errors.join(', '));
    }
    
    return apiClient.post(ENDPOINTS.STOCK.ADJUST, transformedData);
  },

  // Update movement
  updateMovement: async (id, data) => {
    return apiClient.put(`${ENDPOINTS.STOCK.MOVEMENTS}/${id}`, data);
  },

  // Cancel movement
  cancelMovement: async (id, reason) => {
    return apiClient.post(`${ENDPOINTS.STOCK.MOVEMENTS}/${id}/cancel`, { reason });
  },

  // Get stock levels
  getStockLevels: async (params = {}) => {
    try {
      // Use products endpoint with include_stock instead of non-existent stock-levels endpoint
      const response = await apiClient.get(ENDPOINTS.PRODUCTS.BASE, { 
        params: {
          include_stock: true,
          ...params
        }
      });
      
      // Transform response to match expected format
      if (response.data) {
        return {
          success: true,
          data: {
            products: response.data.products || response.data,
            total: response.data.total || (response.data.products ? response.data.products.length : response.data.length)
          }
        };
      }
      
      return response;
    } catch (error) {
      console.error('Error fetching stock levels:', error);
      throw error;
    }
  },

  // Get product stock
  getProductStock: async (productId) => {
    try {
      // Use products endpoint to get specific product with stock
      const response = await apiClient.get(`${ENDPOINTS.PRODUCTS.BASE}/${productId}`, {
        params: { include_stock: true }
      });
      
      if (response.data) {
        return {
          success: true,
          data: {
            product_id: response.data.product_id,
            product_name: response.data.product_name,
            total_quantity: response.data.total_quantity || 0,
            available_quantity: response.data.available_quantity || 0,
            reserved_quantity: response.data.reserved_quantity || 0,
            batches: response.data.batches || []
          }
        };
      }
      
      return response;
    } catch (error) {
      console.error('Error fetching product stock:', error);
      throw error;
    }
  },

  // Get batch stock
  getBatchStock: async (batchId) => {
    return apiClient.get(`${ENDPOINTS.INVENTORY.BATCHES}/${batchId}/stock`);
  },

  // Get movement types
  getMovementTypes: async () => {
    return apiClient.get(`${ENDPOINTS.STOCK.MOVEMENTS}/types`);
  },

  // Get movement reasons
  getMovementReasons: async (type) => {
    return apiClient.get(`${ENDPOINTS.STOCK.MOVEMENTS}/reasons`, {
      params: { type }
    });
  },

  // Bulk movements
  bulkMovements: async (movements) => {
    return apiClient.post(`${ENDPOINTS.STOCK.MOVEMENTS}/bulk`, { movements });
  },

  // Get stock history
  getStockHistory: async (productId, params = {}) => {
    return apiClient.get(`${ENDPOINTS.STOCK.MOVEMENTS}/history`, {
      params: { product_id: productId, ...params }
    });
  },

  // Export movements
  exportMovements: async (filters = {}, format = 'xlsx') => {
    return apiClient.get(`${ENDPOINTS.STOCK.MOVEMENTS}/export`, {
      params: { ...filters, format },
      responseType: 'blob'
    });
  },

  // Validate movement
  validateMovement: async (data) => {
    return apiClient.post(`${ENDPOINTS.STOCK.MOVEMENTS}/validate`, data);
  },

  // Dashboard endpoints
  getDashboardMetrics: async () => {
    return apiClient.get(`${ENDPOINTS.STOCK.BASE}/dashboard`);
  },

  getStockAlerts: async (params = {}) => {
    return apiClient.get(`${ENDPOINTS.STOCK.BASE}/alerts`, { params });
  },

  getRecentMovements: async (params = {}) => {
    return apiClient.get(`${ENDPOINTS.STOCK.MOVEMENTS}/recent`, { params });
  },

  getStockByCategory: async () => {
    return apiClient.get(`${ENDPOINTS.STOCK.BASE}/analytics/by-category`);
  },

  // Current stock endpoints
  getCurrentStock: async (params = {}) => {
    return apiClient.get(`${ENDPOINTS.STOCK.BASE}/current`, { params });
  },

  getStockByProduct: async (productId) => {
    return apiClient.get(`${ENDPOINTS.STOCK.BASE}/products/${productId}`);
  },

  getStockByLocation: async (locationId) => {
    return apiClient.get(`${ENDPOINTS.STOCK.BASE}/locations/${locationId}`);
  },

  // Batch management
  getBatches: async (params = {}) => {
    return apiClient.get(`${ENDPOINTS.STOCK.BASE}/batches`, { params });
  },

  getBatchById: async (batchId) => {
    return apiClient.get(`${ENDPOINTS.STOCK.BASE}/batches/${batchId}`);
  },

  updateBatch: async (batchId, data) => {
    return apiClient.put(`${ENDPOINTS.STOCK.BASE}/batches/${batchId}`, data);
  },

  // Stock transfers
  createTransfer: async (data) => {
    return apiClient.post(`${ENDPOINTS.STOCK.BASE}/transfers`, data);
  },

  getTransfers: async (params = {}) => {
    return apiClient.get(`${ENDPOINTS.STOCK.BASE}/transfers`, { params });
  },

  updateTransferStatus: async (transferId, status) => {
    return apiClient.put(`${ENDPOINTS.STOCK.BASE}/transfers/${transferId}/status`, { status });
  },

  // Reorder management
  getReorderSuggestions: async () => {
    return apiClient.get(`${ENDPOINTS.STOCK.BASE}/reorder/suggestions`);
  },

  getReorderRules: async (params = {}) => {
    return apiClient.get(`${ENDPOINTS.STOCK.BASE}/reorder/rules`, { params });
  },

  createReorderRule: async (data) => {
    return apiClient.post(`${ENDPOINTS.STOCK.BASE}/reorder/rules`, data);
  },

  updateReorderRule: async (ruleId, data) => {
    return apiClient.put(`${ENDPOINTS.STOCK.BASE}/reorder/rules/${ruleId}`, data);
  },

  // Stock valuation
  getValuation: async (params = {}) => {
    return apiClient.get(`${ENDPOINTS.STOCK.BASE}/valuation`, { params });
  },

  getValuationByCategory: async () => {
    return apiClient.get(`${ENDPOINTS.STOCK.BASE}/valuation/by-category`);
  },

  // Physical verification
  createStockTake: async (data) => {
    return apiClient.post(`${ENDPOINTS.STOCK.BASE}/physical-verification`, data);
  },

  getStockTakes: async (params = {}) => {
    return apiClient.get(`${ENDPOINTS.STOCK.BASE}/physical-verification`, { params });
  },

  submitStockTake: async (stockTakeId, data) => {
    return apiClient.post(`${ENDPOINTS.STOCK.BASE}/physical-verification/${stockTakeId}/submit`, data);
  },

  // Reports
  getStockLedger: async (params = {}) => {
    return apiClient.get(`${ENDPOINTS.STOCK.BASE}/reports/ledger`, { params });
  },

  getExpiryReport: async (params = {}) => {
    return apiClient.get(`${ENDPOINTS.STOCK.BASE}/reports/expiry`, { params });
  },

  getMovementAnalysis: async (params = {}) => {
    return apiClient.get(`${ENDPOINTS.STOCK.BASE}/reports/movement-analysis`, { params });
  },

  getABCAnalysis: async () => {
    return apiClient.get(`${ENDPOINTS.STOCK.BASE}/reports/abc-analysis`);
  },

  // Location management
  getLocations: async () => {
    return apiClient.get(`${ENDPOINTS.STOCK.BASE}/locations`);
  },

  createLocation: async (data) => {
    return apiClient.post(`${ENDPOINTS.STOCK.BASE}/locations`, data);
  },

  updateLocation: async (locationId, data) => {
    return apiClient.put(`${ENDPOINTS.STOCK.BASE}/locations/${locationId}`, data);
  },

  // Stock adjustments
  createAdjustment: async (data) => {
    return apiClient.post(`${ENDPOINTS.STOCK.BASE}/adjustments`, data);
  },

  getAdjustments: async (params = {}) => {
    return apiClient.get(`${ENDPOINTS.STOCK.BASE}/adjustments`, { params });
  },

  // Stock write-off endpoints
  getExpiryReport: async (params = {}) => {
    return apiClient.get('/stock-writeoff/expiry-report', { params });
  },

  createWriteOff: async (data) => {
    return apiClient.post('/stock-writeoff', data);
  },

  getWriteOffs: async (params = {}) => {
    return apiClient.get('/stock-writeoff', { params });
  },

  getITCReversalSummary: async (params = {}) => {
    return apiClient.get('/stock-writeoff/itc-reversal-summary', { params });
  },

  // Update product properties
  updateProductProperties: async (productId, data) => {
    // Backend expects query parameters, not body
    const params = new URLSearchParams();
    
    if (data.category) params.append('category', data.category);
    if (data.pack_type) params.append('pack_type', data.pack_type);
    if (data.pack_size) params.append('pack_size', data.pack_size);
    if (data.minimum_stock_level) params.append('minimum_stock_level', data.minimum_stock_level);
    if (data.pack_unit_quantity) params.append('pack_unit_quantity', data.pack_unit_quantity);
    if (data.sub_unit_quantity) params.append('sub_unit_quantity', data.sub_unit_quantity);
    if (data.purchase_unit) params.append('purchase_unit', data.purchase_unit);
    if (data.sale_unit) params.append('sale_unit', data.sale_unit);
    
    return apiClient.patch(`${ENDPOINTS.STOCK.BASE}/products/${productId}?${params.toString()}`);
  }
};