/**
 * Salary Structure API Module
 * ENDPOINTS: /payroll/salary-structures
 */
import { apiHelpers } from '../../apiClient';
import { createCrudApi } from '../../utils/createCrudApi';

export interface SalaryStructure {
  salary_structure_id: number;
  employee_id: number;
  employee_name?: string;
  employee_code?: string;
  designation?: string;
  department_name?: string;
  basic_salary: number;
  hra: number;
  dearness_allowance: number;
  conveyance_allowance: number;
  medical_allowance: number;
  special_allowance: number;
  other_allowance: number;
  gross_salary: number;
  pf_applicable: boolean;
  pf_percent: number;
  esi_applicable: boolean;
  professional_tax_applicable: boolean;
  effective_from: string;
  effective_to?: string;
  is_active: boolean;
  created_at?: string;
}

const crud = createCrudApi({ basePath: '/payroll/salary-structures' });

export const salaryStructureApi = {
  getAll: crud.getAll,
  getById: crud.getById,
  create: crud.create,
  update: crud.update,

  getByEmployee: (employeeId: number) =>
    apiHelpers.get(`/payroll/salary-structures/employee/${employeeId}`),
};
