/**
 * Attendance API Module
 * ENDPOINTS: /payroll/attendance
 */
import { apiHelpers } from '../../apiClient';

export interface AttendanceRecord {
  attendance_id?: number;
  employee_id: number;
  employee_name?: string;
  employee_code?: string;
  attendance_date: string;
  status: 'present' | 'absent' | 'half_day' | 'leave' | 'holiday' | 'week_off';
  remarks?: string;
}

export interface AttendanceSummary {
  days_present: number;
  days_absent: number;
  half_days: number;
  days_leave: number;
  days_holiday: number;
  days_week_off: number;
  total_records: number;
}

const BASE = '/payroll/attendance';

export const attendanceApi = {
  getMonthly: (year: number, month: number, employeeId?: number) =>
    apiHelpers.get(BASE, { params: { year, month, employee_id: employeeId } }),

  getSummary: (employeeId: number, year: number, month: number) =>
    apiHelpers.get(`${BASE}/summary`, { params: { employee_id: employeeId, year, month } }),

  mark: (data: { employee_id: number; attendance_date: string; status: string; remarks?: string }) =>
    apiHelpers.post(BASE, data),

  bulkMark: (records: Array<{ employee_id: number; attendance_date: string; status: string }>) =>
    apiHelpers.post(`${BASE}/bulk`, { records }),
};
