/**
 * Expense Claims API Module
 * Handles employee expense claims and reimbursements
 * 
 * STANDARDIZED: Uses apiHelpers consistently
 */

import { apiHelpers } from '../../apiClient';

const EXPENSE_ENDPOINTS = {
  BASE: '/expense-claims',
  GENERATE_NUMBER: '/expense-claims/generate-claim-number',
  EXPENSE_TYPES: '/expense-claims/expense-types'
};

export const expensesApi = {
  // Generate claim number
  generateClaimNumber: async () => {
    const response = await apiHelpers.get(EXPENSE_ENDPOINTS.GENERATE_NUMBER);
    return response.data;
  },

  // Get expense types
  getExpenseTypes: async () => {
    const response = await apiHelpers.get(EXPENSE_ENDPOINTS.EXPENSE_TYPES);
    return response.data;
  },

  // Create expense claim
  create: async (data) => {
    const response = await apiHelpers.post(EXPENSE_ENDPOINTS.BASE, data);
    return response.data;
  },

  // Get expense claims list
  list: async (params = {}) => {
    const response = await apiHelpers.get(EXPENSE_ENDPOINTS.BASE, { params });
    return response.data;
  },

  // Get expense claim details
  getById: async (id) => {
    const response = await apiHelpers.get(`${EXPENSE_ENDPOINTS.BASE}/${id}`);
    return response.data;
  },

  // Approve expense claim
  approve: async (id, approvalData) => {
    const response = await apiHelpers.put(`${EXPENSE_ENDPOINTS.BASE}/${id}/approve`, approvalData);
    return response.data;
  },

  // Reject expense claim
  reject: async (id, rejectionData) => {
    const response = await apiHelpers.put(`${EXPENSE_ENDPOINTS.BASE}/${id}/reject`, rejectionData);
    return response.data;
  },

  // Get pending expense claims
  getPending: async () => {
    const response = await apiHelpers.get(EXPENSE_ENDPOINTS.BASE, {
      params: { status: 'submitted' }
    });
    return response.data;
  },

  // Get employee expense claims
  getByEmployee: async (employeeId) => {
    const response = await apiHelpers.get(EXPENSE_ENDPOINTS.BASE, {
      params: { employee_id: employeeId }
    });
    return response.data;
  }
};

// For backward compatibility
export default expensesApi;