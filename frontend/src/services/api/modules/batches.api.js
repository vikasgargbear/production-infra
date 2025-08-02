import apiClient from '../apiClient';

export const batchesApi = {
  // Get all batches
  getAll: () => apiClient.get('/inventory/batches'),
  
  // Get batch by ID
  getById: (id) => apiClient.get(`/inventory/batches/${id}`),
  
  // Get batches by product
  getByProduct: (productId) => apiClient.get(`/inventory/batches?product_id=${productId}`),
  
  // Create new batch
  create: (data) => apiClient.post('/inventory/batches', data),
  
  // Update batch
  update: (id, data) => apiClient.put(`/inventory/batches/${id}`, data),
  
  // Delete batch
  delete: (id) => apiClient.delete(`/inventory/batches/${id}`),
  
  // Get available batches for a product (non-expired, with stock)
  getAvailable: (productId) => apiClient.get(`/inventory/batches/available/${productId}`),
  
  // Get expiring batches
  getExpiring: (days = 30) => apiClient.get(`/inventory/batches/expiring?days=${days}`),
  
  // Update batch quantity
  updateQuantity: (id, quantity) => apiClient.patch(`/inventory/batches/${id}/quantity`, { quantity }),
};

export default batchesApi;