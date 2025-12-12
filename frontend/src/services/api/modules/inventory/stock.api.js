/**
 * Stock API Module
 * Handles inventory stock levels, movements, and adjustments
 * 
 * ENDPOINTS: /inventory, /stock-movements, /stock-adjustments
 */

import { apiHelpers } from '../../apiClient';
import { API_CONFIG } from '../../../../config/api.config';

const ENDPOINTS = API_CONFIG.ENDPOINTS.STOCK;

export const stockApi = {
  // =========================================================================
  // STOCK LEVELS
  // =========================================================================

  // Get stock levels
  getLevels: (params = {}) => {
    return apiHelpers.get(ENDPOINTS.LEVELS, { params });
  },

  // Get stock by product ID
  getByProduct: (productId) => {
    return apiHelpers.get(`${ENDPOINTS.BASE}/${productId}`);
  },

  // Get low stock items
  getLowStock: (params = {}) => {
    return apiHelpers.get(ENDPOINTS.LOW_STOCK, { params });
  },

  // Get out of stock items
  getOutOfStock: (params = {}) => {
    return apiHelpers.get(ENDPOINTS.OUT_OF_STOCK, { params });
  },

  // =========================================================================
  // STOCK MOVEMENTS
  // =========================================================================

  // Get stock movements
  getMovements: (params = {}) => {
    return apiHelpers.get(ENDPOINTS.MOVEMENTS, { params });
  },

  // Create stock movement
  createMovement: (data) => {
    return apiHelpers.post(ENDPOINTS.MOVEMENTS, data);
  },

  // Get movements for a product
  getProductMovements: (productId, params = {}) => {
    return apiHelpers.get(`${ENDPOINTS.MOVEMENTS}`, {
      params: { product_id: productId, ...params }
    });
  },

  // =========================================================================
  // STOCK ADJUSTMENTS
  // =========================================================================

  // Get adjustments
  getAdjustments: (params = {}) => {
    return apiHelpers.get(ENDPOINTS.ADJUSTMENTS, { params });
  },

  // Create adjustment
  createAdjustment: (data) => {
    return apiHelpers.post(ENDPOINTS.ADJUSTMENTS, data);
  },

  // Approve adjustment
  approveAdjustment: (id) => {
    return apiHelpers.post(`${ENDPOINTS.ADJUSTMENTS}/${id}/approve`);
  },

  // Get adjustment reasons
  getAdjustmentReasons: () => {
    return apiHelpers.get(`${ENDPOINTS.ADJUSTMENTS}/reasons`);
  },

  // =========================================================================
  // BATCHES
  // =========================================================================

  // Get batches
  getBatches: (params = {}) => {
    return apiHelpers.get(ENDPOINTS.BATCHES, { params });
  },

  // Get batches by product
  getProductBatches: (productId, params = {}) => {
    return apiHelpers.get(`${ENDPOINTS.BASE}/${productId}/batches`, { params });
  },

  // Get expiring batches
  getExpiringBatches: (params = {}) => {
    return apiHelpers.get(`${ENDPOINTS.BATCHES}/expiring`, { params });
  },

  // Get expired batches
  getExpiredBatches: (params = {}) => {
    return apiHelpers.get(`${ENDPOINTS.BATCHES}/expired`, { params });
  },

  // =========================================================================
  // REPORTS
  // =========================================================================

  // Get stock report
  getStockReport: (params = {}) => {
    return apiHelpers.get(`${ENDPOINTS.BASE}/reports/stock`, { params });
  },

  // Get valuation report
  getValuationReport: (params = {}) => {
    return apiHelpers.get(`${ENDPOINTS.BASE}/reports/valuation`, { params });
  },

  // Get movement summary
  getMovementSummary: (params = {}) => {
    return apiHelpers.get(`${ENDPOINTS.MOVEMENTS}/summary`, { params });
  },

  // =========================================================================
  // STOCK RECEIVE
  // =========================================================================

  // Receive stock
  receiveStock: (data) => {
    return apiHelpers.post('/stock/receive', data);
  },

  // Get pending receipts
  getPendingReceipts: () => {
    return apiHelpers.get('/stock/pending-receipts');
  },

  // =========================================================================
  // WRITE-OFF
  // =========================================================================

  // Create write-off
  createWriteOff: (data) => {
    return apiHelpers.post('/stock-writeoff', data);
  },

  // Get write-offs
  getWriteOffs: (params = {}) => {
    return apiHelpers.get('/stock-writeoff', { params });
  },

  // =========================================================================
  // DASHBOARD
  // =========================================================================

  // Get dashboard stats
  getDashboardStats: () => {
    return apiHelpers.get('/stock-dashboard/stats');
  },

  // Get dashboard alerts
  getDashboardAlerts: () => {
    return apiHelpers.get('/stock-dashboard/alerts');
  }
};