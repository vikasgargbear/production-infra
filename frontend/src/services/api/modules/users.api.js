import apiClient from '../apiClient';

export const usersApi = {
  // Get all users
  getAll: () => apiClient.get('/users/'),
  
  // Get user by ID
  getById: (id) => apiClient.get(`/users/${id}`),
  
  // Create new user
  create: (data) => apiClient.post('/users/', data),
  
  // Update user
  update: (id, data) => apiClient.put(`/users/${id}`, data),
  
  // Delete user
  delete: (id) => apiClient.delete(`/users/${id}`),
  
  // Get current user
  getCurrent: () => apiClient.get('/users/current'),
  
  // Update password
  updatePassword: (id, passwords) => apiClient.post(`/users/${id}/password`, passwords),
  
  // Reset password
  resetPassword: (email) => apiClient.post('/users/reset-password', { email }),
};

export default usersApi;