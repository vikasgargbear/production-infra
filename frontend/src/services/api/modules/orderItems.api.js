import apiClient from '../apiClient';

export const orderItemsApi = {
  // Get all order items
  getAll: () => apiClient.get('/order-items/'),
  
  // Get order item by ID
  getById: (id) => apiClient.get(`/order-items/${id}`),
  
  // Get items by order ID
  getByOrderId: (orderId) => apiClient.get(`/order-items/order/${orderId}`),
  
  // Create new order item
  create: (data) => apiClient.post('/order-items/', data),
  
  // Update order item
  update: (id, data) => apiClient.put(`/order-items/${id}`, data),
  
  // Delete order item
  delete: (id) => apiClient.delete(`/order-items/${id}`),
  
  // Bulk create order items
  bulkCreate: (items) => apiClient.post('/order-items/bulk', { items }),
  
  // Update multiple order items
  bulkUpdate: (updates) => apiClient.put('/order-items/bulk', { updates }),
};

export default orderItemsApi;