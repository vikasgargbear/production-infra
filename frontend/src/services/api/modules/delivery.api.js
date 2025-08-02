import apiClient from '../apiClient';

// Delivery API - Similar to challans but kept separate for backward compatibility
export const deliveryApi = {
  // Get all delivery challans
  getAll: () => apiClient.get('/challans/'),
  
  // Get delivery challan by ID
  getById: (id) => apiClient.get(`/challans/${id}`),
  
  // Create new delivery challan
  create: (data) => apiClient.post('/challans/', data),
  
  // Update delivery challan
  update: (id, data) => apiClient.put(`/challans/${id}`, data),
  
  // Delete delivery challan
  delete: (id) => apiClient.delete(`/challans/${id}`),
  
  // Get challans by customer
  getByCustomer: (customerId) => apiClient.get(`/challans/customer/${customerId}`),
  
  // Convert challan to invoice
  convertToInvoice: (id) => apiClient.post(`/challans/${id}/convert-to-invoice`),
  
  // Update delivery status
  updateStatus: (id, status) => apiClient.patch(`/challans/${id}/status`, { status }),
};

export default deliveryApi;