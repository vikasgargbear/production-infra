/**
 * Employees API Module
 * Handles employee CRUD operations
 * 
 * ENDPOINTS: /employees (backend: app/api/routes/master/employees.py)
 */

import { apiHelpers } from '../../apiClient';
import { cleanData } from '../../utils/dataUtils';

const ENDPOINTS = {
  BASE: '/employees',
  DETAILS: (id) => `/employees/${id}`
};

export const employeesApi = {
  // =========================================================================
  // CRUD OPERATIONS
  // =========================================================================

  // Get all employees with pagination and search
  getAll: (params = {}) => {
    // params: limit, offset, search, is_active
    return apiHelpers.get(ENDPOINTS.BASE, { params });
  },

  // Get employee by ID
  getById: (id) => {
    return apiHelpers.get(ENDPOINTS.DETAILS(id));
  },

  // Create new employee
  create: (data) => {
    const cleanedData = cleanData(data);
    return apiHelpers.post(ENDPOINTS.BASE, cleanedData);
  },

  // Update employee
  update: (id, data) => {
    const cleanedData = cleanData(data);
    return apiHelpers.put(ENDPOINTS.DETAILS(id), cleanedData);
  },

  // Delete employee (soft delete)
  delete: (id) => {
    return apiHelpers.delete(ENDPOINTS.DETAILS(id));
  },

  // =========================================================================
  // SEARCH & FILTERS
  // =========================================================================

  // Search employees
  search: (query, params = {}) => {
    return apiHelpers.get(ENDPOINTS.BASE, {
      params: { search: query, ...params }
    });
  },

  // Get active employees only
  getActive: (params = {}) => {
    return apiHelpers.get(ENDPOINTS.BASE, {
      params: { is_active: true, ...params }
    });
  },

  // Get inactive employees
  getInactive: (params = {}) => {
    return apiHelpers.get(ENDPOINTS.BASE, {
      params: { is_active: false, ...params }
    });
  }
};
