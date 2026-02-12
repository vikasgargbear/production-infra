/**
 * Payroll Run API Module
 * ENDPOINTS: /payroll/runs, /payroll/calculate, /payroll/generate
 */
import { apiHelpers } from '../../apiClient';

export interface PayrollRun {
  payroll_run_id: number;
  run_number: string;
  payroll_month: number;
  payroll_year: number;
  total_employees: number;
  total_gross: number;
  total_deductions: number;
  total_net_pay: number;
  total_employer_pf: number;
  total_employer_esi: number;
  status: 'draft' | 'calculated' | 'confirmed' | 'paid';
  processed_at?: string;
  confirmed_at?: string;
}

export interface PayrollSlipPreview {
  employee_id: number;
  employee_name: string;
  employee_code: string;
  working_days: number;
  days_present: number;
  days_absent: number;
  days_leave: number;
  lop_days: number;
  gross_earned: number;
  pf_employee: number;
  esi_employee: number;
  professional_tax: number;
  total_deductions: number;
  net_pay: number;
}

const BASE = '/payroll';

export const payrollRunApi = {
  listRuns: (year?: number) =>
    apiHelpers.get(`${BASE}/runs`, { params: { year } }),

  getRun: (runId: number) =>
    apiHelpers.get(`${BASE}/runs/${runId}`),

  calculate: (year: number, month: number) =>
    apiHelpers.post(`${BASE}/calculate`, { year, month }),

  generate: (year: number, month: number) =>
    apiHelpers.post(`${BASE}/generate`, { year, month }),

  confirm: (runId: number) =>
    apiHelpers.post(`${BASE}/runs/${runId}/confirm`, {}),

  // Reports
  getMonthlySummary: (year: number, month: number) =>
    apiHelpers.get(`${BASE}/reports/summary`, { params: { year, month } }),

  getPFRegister: (year: number, month: number) =>
    apiHelpers.get(`${BASE}/reports/pf-register`, { params: { year, month } }),

  getESIRegister: (year: number, month: number) =>
    apiHelpers.get(`${BASE}/reports/esi-register`, { params: { year, month } }),

  getBankSheet: (year: number, month: number) =>
    apiHelpers.get(`${BASE}/reports/bank-sheet`, { params: { year, month } }),

  getDepartmentCost: (year: number, month: number) =>
    apiHelpers.get(`${BASE}/reports/department-cost`, { params: { year, month } }),
};
