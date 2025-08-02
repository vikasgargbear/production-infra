/**
 * Ledger API Module
 * Handles party ledger and account transactions
 */

import apiClient from '../apiClient';

export const ledgerApi = {
  // Get party ledger entries
  getPartyLedger: async (params) => {
    const response = await apiClient.get('/ledger/party', { params });
    return response.data;
  },

  // Get ledger by party ID
  getPartyLedgerById: async (partyId, params) => {
    const response = await apiClient.get(`/ledger/party/${partyId}`, { params });
    return response.data;
  },

  // Get ledger statements
  getStatements: async (params) => {
    const response = await apiClient.get('/ledger/statements', { params });
    return response.data;
  },

  // Get outstanding balances
  getOutstanding: async (params) => {
    const response = await apiClient.get('/ledger/outstanding', { params });
    return response.data;
  },

  // Get aging report
  getAging: async (params) => {
    const response = await apiClient.get('/ledger/aging', { params });
    return response.data;
  },

  // Create ledger entry
  createEntry: async (data) => {
    const response = await apiClient.post('/ledger/entries', data);
    return response.data;
  },

  // Get ledger summary
  getSummary: async (params) => {
    const response = await apiClient.get('/ledger/summary', { params });
    return response.data;
  },

  // Reconcile entries
  reconcileEntries: async (data) => {
    const response = await apiClient.post('/ledger/reconcile', data);
    return response.data;
  }
};