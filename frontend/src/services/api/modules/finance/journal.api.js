/**
 * Journal Entries API Module
 * Handles journal vouchers, chart of accounts, and general ledger
 * 
 * STANDARDIZED: Uses apiHelpers consistently
 */

import { apiHelpers } from '../../apiClient';

const JOURNAL_ENDPOINTS = {
  BASE: '/journal-entries',
  GENERATE_NUMBER: '/journal-entries/generate-journal-number',
  CHART_OF_ACCOUNTS: '/journal-entries/chart-of-accounts'
};

export const journalApi = {
  // Generate journal number
  generateJournalNumber: async () => {
    const response = await apiHelpers.get(JOURNAL_ENDPOINTS.GENERATE_NUMBER);
    return response.data;
  },

  // Get chart of accounts
  getChartOfAccounts: async (params = {}) => {
    const response = await apiHelpers.get(JOURNAL_ENDPOINTS.CHART_OF_ACCOUNTS, { params });
    return response.data;
  },

  // Create journal entry
  create: async (data) => {
    const response = await apiHelpers.post(JOURNAL_ENDPOINTS.BASE, data);
    return response.data;
  },

  // Get journal entries list
  list: async (params = {}) => {
    const response = await apiHelpers.get(JOURNAL_ENDPOINTS.BASE, { params });
    return response.data;
  },

  // Get journal entry details
  getById: async (id) => {
    const response = await apiHelpers.get(`${JOURNAL_ENDPOINTS.BASE}/${id}`);
    return response.data;
  },

  // Delete/cancel journal entry
  delete: async (id, reason) => {
    const response = await apiHelpers.delete(`${JOURNAL_ENDPOINTS.BASE}/${id}`, {
      params: { reason }
    });
    return response.data;
  },

  // Search accounts
  searchAccounts: async (query) => {
    const response = await apiHelpers.get(JOURNAL_ENDPOINTS.CHART_OF_ACCOUNTS, {
      params: { search: query, active_only: true }
    });
    return response.data;
  }
};

// For backward compatibility
export default journalApi;