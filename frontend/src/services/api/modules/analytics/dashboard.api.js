/**
 * Dashboard API Module
 * Handles analytics and dashboard data
 * 
 * ENDPOINTS: /dashboard (backend: app/api/routes/analytics/dashboard.py)
 */

import { apiHelpers } from '../../apiClient';

const ENDPOINTS = {
  BASE: '/dashboard',
  OVERVIEW: '/dashboard/overview',
  STATS: '/dashboard/stats',
  KPIS: '/dashboard/kpis',
  REVENUE: '/dashboard/revenue',
  FINANCIAL: '/dashboard/financial-summary',
  SALES: '/dashboard/sales-analytics',
  INVENTORY: '/dashboard/inventory-summary',
  ORDERS: '/dashboard/recent-orders',
  ACTIVITIES: '/dashboard/recent-activities',
  PRODUCTS: '/dashboard/top-products',
  CUSTOMERS: '/dashboard/top-customers',
  CUSTOMER_ANALYTICS: '/dashboard/customer-analytics',
  ALERTS: {
    INVENTORY: '/dashboard/inventory-alerts',
    LOW_STOCK: '/dashboard/low-stock-alerts',
    EXPIRY: '/dashboard/expiry-alerts'
  },
  PAYMENTS: '/dashboard/pending-payments'
};

export const dashboardApi = {
  // =========================================================================
  // OVERVIEW
  // =========================================================================

  // Get main dashboard overview
  getOverview: () => {
    return apiHelpers.get(ENDPOINTS.OVERVIEW);
  },

  // Get dashboard statistics
  getStats: () => {
    return apiHelpers.get(ENDPOINTS.STATS);
  },

  // Get KPI summary
  getKPIs: () => {
    return apiHelpers.get(ENDPOINTS.KPIS);
  },

  // =========================================================================
  // REVENUE & FINANCIAL
  // =========================================================================

  // Get revenue data for charts
  getRevenue: (params = {}) => {
    // params: period ('daily'|'weekly'|'monthly'), start_date, end_date
    return apiHelpers.get(ENDPOINTS.REVENUE, { params });
  },

  // Get financial summary
  getFinancialSummary: (params = {}) => {
    return apiHelpers.get(ENDPOINTS.FINANCIAL, { params });
  },

  // Get sales analytics
  getSalesAnalytics: (params = {}) => {
    return apiHelpers.get(ENDPOINTS.SALES, { params });
  },

  // =========================================================================
  // INVENTORY
  // =========================================================================

  // Get inventory summary
  getInventorySummary: () => {
    return apiHelpers.get(ENDPOINTS.INVENTORY);
  },

  // Get inventory alerts
  getInventoryAlerts: () => {
    return apiHelpers.get(ENDPOINTS.ALERTS.INVENTORY);
  },

  // Get low stock alerts
  getLowStockAlerts: () => {
    return apiHelpers.get(ENDPOINTS.ALERTS.LOW_STOCK);
  },

  // Get expiry alerts
  getExpiryAlerts: (days = 90) => {
    return apiHelpers.get(ENDPOINTS.ALERTS.EXPIRY, { params: { days } });
  },

  // =========================================================================
  // RECENT DATA
  // =========================================================================

  // Get recent orders
  getRecentOrders: (limit = 10) => {
    return apiHelpers.get(ENDPOINTS.ORDERS, { params: { limit } });
  },

  // Get recent activities
  getRecentActivities: (limit = 20) => {
    return apiHelpers.get(ENDPOINTS.ACTIVITIES, { params: { limit } });
  },

  // =========================================================================
  // TOP ITEMS
  // =========================================================================

  // Get top products
  getTopProducts: (params = {}) => {
    // params: limit, period_days
    return apiHelpers.get(ENDPOINTS.PRODUCTS, { params });
  },

  // Get top customers
  getTopCustomers: (limit = 10) => {
    return apiHelpers.get(ENDPOINTS.CUSTOMERS, { params: { limit } });
  },

  // Get customer analytics
  getCustomerAnalytics: (params = {}) => {
    return apiHelpers.get(ENDPOINTS.CUSTOMER_ANALYTICS, { params });
  },

  // =========================================================================
  // PAYMENTS
  // =========================================================================

  // Get pending payments
  getPendingPayments: () => {
    return apiHelpers.get(ENDPOINTS.PAYMENTS);
  }
};