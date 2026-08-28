/**
 * Employees API Module
 * Handles employee CRUD operations
 *
 * ENDPOINTS: /employees (backend: app/api/routes/master/employees.py)
 */

import { apiHelpers } from '../../apiClient';
import { rejectCanonicalWrite } from '../../canonicalWritePolicy';
import { decodeCanonicalEmployeeList } from './canonicalMasterReads';

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

export const employeesApi = {
  getAll: (params: { limit?: number; offset?: number; search?: string; include_inactive?: boolean } = {}) =>
    apiHelpers.get('/employees', { params })
      .then(response => ({ ...response, data: decodeCanonicalEmployeeList(response.data) })),
  create: (_data: any) => rejectCanonicalWrite('Legacy employee creation'),
  update: (_employeeId: number | string, _data: any) => rejectCanonicalWrite('Legacy employee editing'),
  delete: (_employeeId: number | string) => rejectCanonicalWrite('Legacy employee deletion'),

};
