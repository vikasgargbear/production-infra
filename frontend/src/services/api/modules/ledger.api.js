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
  },

  // Get collection data for collection center
  // Uses aging data to show overdue collections
  getCollectionData: async (params) => {
    try {
      // Use the aging endpoint to get overdue customer data
      const response = await apiClient.get('/party-ledger-v2/aging-analysis', { 
        params: { party_type: 'customer', ...params } 
      });
      
      // Transform aging data to collection format
      const collections = (response.data?.aging_data || []).map(customer => ({
        customer_id: customer.customer_id,
        customer_name: customer.customer_name,
        total_outstanding: customer.total_outstanding,
        overdue_amount: customer.days_31_60 + customer.days_61_90 + customer.over_90,
        days_overdue: customer.over_90 > 0 ? 90 : customer.days_61_90 > 0 ? 60 : customer.days_31_60 > 0 ? 30 : 0,
        status: customer.over_90 > 0 ? 'critical' : customer.days_61_90 > 0 ? 'high' : customer.days_31_60 > 0 ? 'medium' : 'low',
        priority: customer.over_90 > 0 ? 'urgent' : customer.days_61_90 > 0 ? 'high' : 'normal',
        assigned_to: 'unassigned',
        last_contact_date: null,
        next_follow_up: null,
        invoice_count: customer.invoice_count
      }));
      
      return {
        collections: collections.filter(c => c.total_outstanding > 0),
        summary: response.data?.summary || {
          total: 0,
          current: 0,
          overdue: 0
        }
      };
    } catch (error) {
      console.error('Error fetching collection data:', error);
      // Return empty data structure to prevent UI errors
      return {
        collections: [],
        summary: {
          total: 0,
          current: 0,
          overdue: 0
        }
      };
    }
  },

  // Set reminder for collection
  setCollectionReminder: async (customerId, reminderData) => {
    const response = await apiClient.post(`/ledger/collections/${customerId}/reminder`, reminderData);
    return response.data;
  },

  // Update collection status
  updateCollectionStatus: async (customerId, status) => {
    const response = await apiClient.patch(`/ledger/collections/${customerId}/status`, { status });
    return response.data;
  }
};