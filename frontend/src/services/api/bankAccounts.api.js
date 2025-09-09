import apiClient from './apiClient';

export const bankAccountsAPI = {
  // Get all bank accounts for the organization
  getBankAccounts: async () => {
    try {
      const response = await apiClient.get('/bank-accounts/');
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  // Create a new bank account
  createBankAccount: async (accountData) => {
    try {
      const response = await apiClient.post('/bank-accounts/', accountData);
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  // Update a bank account
  updateBankAccount: async (accountId, accountData) => {
    try {
      const response = await apiClient.put(`/bank-accounts/${accountId}`, accountData);
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  // Delete a bank account
  deleteBankAccount: async (accountId) => {
    try {
      const response = await apiClient.delete(`/bank-accounts/${accountId}`);
      return response.data;
    } catch (error) {
      throw error;
    }
  },

  // Set a bank account as default
  setDefaultAccount: async (accountId) => {
    try {
      const response = await apiClient.put(`/bank-accounts/${accountId}/set-default`);
      return response.data;
    } catch (error) {
      throw error;
    }
  }
};