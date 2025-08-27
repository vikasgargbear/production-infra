import apiClient from '../apiClient';

export const dashboardApi = {
  // Get dashboard statistics
  getStats: () => apiClient.get('/dashboard/stats'),
  
  // Get recent orders
  getRecentOrders: (limit = 10) => apiClient.get(`/dashboard/recent-orders?limit=${limit}`),
  
  // Get revenue data
  getRevenueData: (period = 'monthly') => apiClient.get(`/dashboard/revenue?period=${period}`),
  
  // Get top selling products
  getTopProducts: (limit = 10) => apiClient.get(`/dashboard/top-products?limit=${limit}`),
  
  // Get top customers
  getTopCustomers: (limit = 10) => apiClient.get(`/dashboard/top-customers?limit=${limit}`),
  
  // Get inventory alerts
  getInventoryAlerts: () => apiClient.get('/dashboard/inventory-alerts'),
  
  // Get pending payments
  getPendingPayments: () => apiClient.get('/dashboard/pending-payments'),
  
  // Get expiring products
  getExpiringProducts: (days = 30) => apiClient.get(`/dashboard/expiring-products?days=${days}`),
  
  // Get data quality metrics
  getDataQuality: () => apiClient.get('/dashboard/data-quality'),
  
  // Get system health status
  getSystemHealth: () => apiClient.get('/dashboard/system-health'),
  
  // Get recent activity
  getRecentActivity: (limit = 20) => apiClient.get(`/dashboard/recent-activity?limit=${limit}`),
};

export default dashboardApi;