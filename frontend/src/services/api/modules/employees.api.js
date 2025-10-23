import { apiHelpers } from '../apiClient';

const BASE_URL = '/api/employees';

export const employeesApi = {
  // Get all employees
  getAll: (params = {}) => {
    return apiHelpers.get(BASE_URL, { params });
  },
  
  // Get employee by ID
  getById: (id) => {
    return apiHelpers.get(`${BASE_URL}/${id}`);
  },
  
  // Create new employee
  create: (data) => {
    return apiHelpers.post(BASE_URL, data);
  },
  
  // Update employee
  update: (id, data) => {
    return apiHelpers.put(`${BASE_URL}/${id}`, data);
  },
  
  // Delete employee (soft delete)
  delete: (id) => {
    return apiHelpers.delete(`${BASE_URL}/${id}`);
  },
  
  // Search employees
  search: (query, params = {}) => {
    return apiHelpers.get(BASE_URL, { 
      params: { search: query, ...params } 
    });
  }
};

export default employeesApi;
