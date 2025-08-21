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

  // Get bank accounts for reconciliation
  getBankAccounts: async () => {
    // This could map to a chart of accounts endpoint filtered for bank accounts
    // For now, return mock data structure that matches the expected format
    return {
      data: [
        {
          code: 'HDFC-001',
          name: 'HDFC Bank Current Account',
          balance: 150000,
          account_type: 'bank',
          bank_name: 'HDFC Bank'
        },
        {
          code: 'SBI-002', 
          name: 'SBI Savings Account',
          balance: 75000,
          account_type: 'bank',
          bank_name: 'State Bank of India'
        }
      ]
    };
  },

  // Reconcile entries
  reconcileEntries: async (data) => {
    const response = await apiClient.post('/ledger/reconcile', data);
    return response.data;
  }
};