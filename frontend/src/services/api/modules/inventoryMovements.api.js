import apiClient from '../apiClient';

export const inventoryMovementsApi = {
  // Get all inventory movements
  getAll: () => apiClient.get('/inventory/movements/'),
  
  // Get movement by ID
  getById: (id) => apiClient.get(`/inventory/movements/${id}`),
  
  // Get movements by product
  getByProduct: (productId) => apiClient.get(`/inventory/movements/product/${productId}`),
  
  // Get movements by batch
  getByBatch: (batchId) => apiClient.get(`/inventory/movements/batch/${batchId}`),
  
  // Create new movement
  create: (data) => apiClient.post('/inventory/movements/', data),
  
  // Update movement
  update: (id, data) => apiClient.put(`/inventory/movements/${id}`, data),
  
  // Delete movement
  delete: (id) => apiClient.delete(`/inventory/movements/${id}`),
  
  // Get movements by type
  getByType: (type) => apiClient.get(`/inventory/movements/type/${type}`),
  
  // Get movements in date range
  getByDateRange: (startDate, endDate) => 
    apiClient.get(`/inventory/movements/range?start=${startDate}&end=${endDate}`),
};

export default inventoryMovementsApi;