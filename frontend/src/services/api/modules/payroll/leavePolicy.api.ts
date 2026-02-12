/**
 * Leave Policy API Module
 * ENDPOINTS: /payroll/leave-policies
 */
import { createCrudApi } from '../../utils/createCrudApi';

export interface LeavePolicy {
  leave_policy_id: number;
  leave_type: string;
  leave_name: string;
  annual_quota: number;
  carry_forward: boolean;
  max_carry_forward: number;
  max_consecutive_days: number;
  requires_document: boolean;
  applicable_after_days: number;
  is_active: boolean;
  created_at?: string;
}

const crud = createCrudApi({ basePath: '/payroll/leave-policies' });

export const leavePolicyApi = {
  getAll: crud.getAll,
  create: crud.create,
  update: crud.update,
  delete: crud.delete,
};
