/**
 * Journal Entries API Module
 * Handles journal vouchers, chart of accounts, and general ledger
 */

import apiClient from '../apiClient';

export const journalApi = {
  // Generate journal number
  generateJournalNumber: async () => {
    const response = await apiClient.get('/journal-entries/generate-journal-number');
    return response.data;
  },

  // Get chart of accounts
  getChartOfAccounts: async (params = {}) => {
    const response = await apiClient.get('/journal-entries/chart-of-accounts', { params });
    return response.data;
  },

  // Create journal entry
  create: async (data) => {
    const response = await apiClient.post('/journal-entries', data);
    return response.data;
  },

  // Get journal entries list
  list: async (params = {}) => {
    const response = await apiClient.get('/journal-entries', { params });
    return response.data;
  },

  // Get journal entry details
  getById: async (id) => {
    const response = await apiClient.get(`/journal-entries/${id}`);
    return response.data;
  },

  // Delete/cancel journal entry
  delete: async (id, reason) => {
    const response = await apiClient.delete(`/journal-entries/${id}`, {
      params: { reason }
    });
    return response.data;
  },

  // Search accounts
  searchAccounts: async (query) => {
    const response = await apiClient.get('/journal-entries/chart-of-accounts', {
      params: { search: query, active_only: true }
    });
    return response.data;
  }
};

// For backward compatibility
export default journalApi;