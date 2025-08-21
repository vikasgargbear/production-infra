/**
 * Expense Claims API Module
 * Handles employee expense claims and reimbursements
 */

import apiClient from '../apiClient';

export const expensesApi = {
  // Generate claim number
  generateClaimNumber: async () => {
    const response = await apiClient.get('/expense-claims/generate-claim-number');
    return response.data;
  },

  // Get expense types
  getExpenseTypes: async () => {
    const response = await apiClient.get('/expense-claims/expense-types');
    return response.data;
  },

  // Create expense claim
  create: async (data) => {
    const response = await apiClient.post('/expense-claims', data);
    return response.data;
  },

  // Get expense claims list
  list: async (params = {}) => {
    const response = await apiClient.get('/expense-claims', { params });
    return response.data;
  },

  // Get expense claim details
  getById: async (id) => {
    const response = await apiClient.get(`/expense-claims/${id}`);
    return response.data;
  },

  // Approve expense claim
  approve: async (id, approvalData) => {
    const response = await apiClient.put(`/expense-claims/${id}/approve`, approvalData);
    return response.data;
  },

  // Reject expense claim
  reject: async (id, rejectionData) => {
    const response = await apiClient.put(`/expense-claims/${id}/reject`, rejectionData);
    return response.data;
  },

  // Get pending expense claims
  getPending: async () => {
    const response = await apiClient.get('/expense-claims', {
      params: { status: 'submitted' }
    });
    return response.data;
  },

  // Get employee expense claims
  getByEmployee: async (employeeId) => {
    const response = await apiClient.get('/expense-claims', {
      params: { employee_id: employeeId }
    });
    return response.data;
  }
};

// For backward compatibility
export default expensesApi;