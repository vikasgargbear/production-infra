/**
 * Leave Management API Module
 * ENDPOINTS: /payroll/leave/*
 */
import { apiHelpers } from '../../apiClient';
import { cleanData } from '../../utils/dataUtils';

export interface LeaveBalance {
  leave_balance_id: number;
  employee_id: number;
  employee_name: string;
  employee_code: string;
  leave_policy_id: number;
  leave_type: string;
  leave_name: string;
  annual_quota: number;
  financial_year: string;
  opening_balance: number;
  used: number;
  carry_forwarded: number;
  available: number;
}

export interface LeaveApplication {
  leave_application_id: number;
  employee_id: number;
  employee_name: string;
  employee_code: string;
  leave_policy_id: number;
  leave_type: string;
  leave_name: string;
  from_date: string;
  to_date: string;
  number_of_days: number;
  half_day: boolean;
  reason?: string;
  status: 'pending' | 'approved' | 'rejected' | 'cancelled';
  approver_name?: string;
  approval_remarks?: string;
  created_at: string;
}

const BASE = '/payroll/leave';

export const leaveApi = {
  // Balances
  getBalances: (financialYear: string, employeeId?: number) =>
    apiHelpers.get(`${BASE}/balances`, { params: { financial_year: financialYear, employee_id: employeeId } }),

  initializeBalances: (financialYear: string) =>
    apiHelpers.post(`${BASE}/balances/initialize`, { financial_year: financialYear }),

  // Applications
  listApplications: (params: { status?: string; employee_id?: number; limit?: number; offset?: number } = {}) =>
    apiHelpers.get(`${BASE}/applications`, { params }),

  applyLeave: (data: Partial<LeaveApplication>) =>
    apiHelpers.post(`${BASE}/applications`, cleanData(data)),

  approveLeave: (applicationId: number, approvedBy: number, remarks?: string) =>
    apiHelpers.post(`${BASE}/applications/${applicationId}/approve`, { approved_by: approvedBy, remarks }),

  rejectLeave: (applicationId: number, approvedBy: number, remarks?: string) =>
    apiHelpers.post(`${BASE}/applications/${applicationId}/reject`, { approved_by: approvedBy, remarks }),
};
