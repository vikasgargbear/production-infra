/**
 * Employees API Module
 * Handles employee CRUD operations
 * 
 * ENDPOINTS: /employees (backend: app/api/routes/master/employees.py)
 */

import { apiHelpers } from '../../apiClient';
import { cleanData } from '../../utils/dataUtils';

// ============================================================================
// TYPES
// ============================================================================

export interface EmployeeParams {
  limit?: number;
  offset?: number;
  search?: string;
  is_active?: boolean;
}

export interface Employee {
  employee_id: number | string;
  employee_code: string;
  employee_name: string;
  full_name?: string;
  first_name?: string;
  last_name?: string;
  designation?: string;
  department_id?: number;
  department_name?: string;
  branch_id?: number;
  branch_name?: string;
  date_of_joining?: string;
  personal_mobile?: string;
  personal_email?: string;
  date_of_birth?: string;
  gender?: string;
  pan_number?: string;
  aadhar_number?: string;
  current_address?: any;
  permanent_address?: any;
  emergency_contact?: any;
  bank_account_details?: any;
  employment_status?: string;
  is_active?: boolean;
  created_at?: string;
  updated_at?: string;
}

// ============================================================================
// API
// ============================================================================

const ENDPOINTS = {
  BASE: '/employees',
  DETAILS: (id: number | string) => `/employees/${id}`
} as const;

export const employeesApi = {
  // =========================================================================
  // CRUD OPERATIONS
  // =========================================================================

  // Get all employees with pagination and search
  getAll: (params: EmployeeParams = {}) => {
    return apiHelpers.get(ENDPOINTS.BASE, { params });
  },

  // Get employee by ID
  getById: (id: number | string) => {
    return apiHelpers.get(ENDPOINTS.DETAILS(id));
  },

  // Create new employee
  create: (data: Partial<Employee>) => {
    const cleanedData = cleanData(data);
    return apiHelpers.post(ENDPOINTS.BASE, cleanedData);
  },

  // Update employee
  update: (id: number | string, data: Partial<Employee>) => {
    const cleanedData = cleanData(data);
    return apiHelpers.put(ENDPOINTS.DETAILS(id), cleanedData);
  },

  // Delete employee (soft delete)
  delete: (id: number | string) => {
    return apiHelpers.delete(ENDPOINTS.DETAILS(id));
  },

  // =========================================================================
  // SEARCH & FILTERS
  // =========================================================================

  // Search employees
  search: (query: string, params: EmployeeParams = {}) => {
    return apiHelpers.get(ENDPOINTS.BASE, {
      params: { search: query, ...params }
    });
  },

  // Get active employees only
  getActive: (params: EmployeeParams = {}) => {
    return apiHelpers.get(ENDPOINTS.BASE, {
      params: { is_active: true, ...params }
    });
  },

  // Get inactive employees
  getInactive: (params: EmployeeParams = {}) => {
    return apiHelpers.get(ENDPOINTS.BASE, {
      params: { is_active: false, ...params }
    });
  }
};
