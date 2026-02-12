/**
 * Salary Slips API Module
 * ENDPOINTS: /payroll/slips
 */
import { createCrudApi } from '../../utils/createCrudApi';

export interface SalarySlip {
  payroll_slip_id: number;
  payroll_run_id: number;
  employee_id: number;
  employee_name: string;
  employee_code: string;
  designation?: string;
  department_name?: string;
  slip_number: string;
  payroll_month: number;
  payroll_year: number;
  run_number: string;
  working_days: number;
  days_present: number;
  days_absent: number;
  days_leave: number;
  days_holiday: number;
  lop_days: number;
  basic_earned: number;
  hra_earned: number;
  da_earned: number;
  conveyance_earned: number;
  medical_earned: number;
  special_earned: number;
  other_earned: number;
  gross_earned: number;
  pf_employee: number;
  pf_employer: number;
  esi_employee: number;
  esi_employer: number;
  professional_tax: number;
  tds: number;
  lop_deduction: number;
  other_deductions: number;
  total_deductions: number;
  net_pay: number;
  bank_name?: string;
  account_number?: string;
  ifsc_code?: string;
  status: string;
  created_at?: string;
}

const crud = createCrudApi({ basePath: '/payroll/slips', useCleanData: false });

export const salarySlipsApi = {
  getAll: crud.getAll,
  getById: crud.getById,
};
