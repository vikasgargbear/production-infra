/**
 * Users API Module
 * Handles user CRUD operations
 * 
 * ENDPOINTS: /users (backend: app/api/routes/auth/users.py)
 */

import { apiHelpers } from '../../apiClient';
import { cleanData } from '../../utils/dataUtils';

const ENDPOINTS = {
  BASE: '/users',
  DETAILS: (id) => `/users/${id}`,
  CURRENT: '/users/current',
  PASSWORD: (id) => `/users/${id}/password`,
  RESET_PASSWORD: '/users/reset-password'
};

export const usersApi = {
  // =========================================================================
  // CRUD OPERATIONS
  // =========================================================================

  // Get all users
  getAll: (params = {}) => {
    return apiHelpers.get(ENDPOINTS.BASE, { params });
  },

  // Get user by ID
  getById: (id) => {
    return apiHelpers.get(ENDPOINTS.DETAILS(id));
  },

  // Create new user
  create: (data) => {
    const cleanedData = cleanData(data);
    return apiHelpers.post(ENDPOINTS.BASE, cleanedData);
  },

  // Update user
  update: (id, data) => {
    const cleanedData = cleanData(data);
    return apiHelpers.put(ENDPOINTS.DETAILS(id), cleanedData);
  },

  // Delete user
  delete: (id) => {
    return apiHelpers.delete(ENDPOINTS.DETAILS(id));
  },

  // =========================================================================
  // CURRENT USER
  // =========================================================================

  // Get current user
  getCurrent: () => {
    return apiHelpers.get(ENDPOINTS.CURRENT);
  },

  // =========================================================================
  // PASSWORD
  // =========================================================================

  // Update password
  updatePassword: (id, passwords) => {
    return apiHelpers.post(ENDPOINTS.PASSWORD(id), passwords);
  },

  // Reset password
  resetPassword: (email) => {
    return apiHelpers.post(ENDPOINTS.RESET_PASSWORD, { email });
  }
};

export default usersApi;