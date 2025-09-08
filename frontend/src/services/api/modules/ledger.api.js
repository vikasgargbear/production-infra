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
        customer_id: String(customer.customer_id),
        customer_name: customer.customer_name,
        customer_phone: '9876543210', // Mock phone - would come from customer data
        customer_email: `${customer.customer_name.toLowerCase().replace(/\s+/g, '.')}@example.com`,
        customer_address: 'Mumbai, Maharashtra', // Mock address
        total_outstanding: customer.total_outstanding,
        overdue_amount: customer.days_31_60 + customer.days_61_90 + customer.over_90,
        days_overdue: customer.over_90 > 0 ? 90 : customer.days_61_90 > 0 ? 60 : customer.days_31_60 > 0 ? 30 : 0,
        collection_status: customer.over_90 > 0 ? 'dispute' : customer.days_61_90 > 0 ? 'promised' : customer.days_31_60 > 0 ? 'contacted' : 'pending',
        priority: customer.over_90 > 0 ? 'critical' : customer.days_61_90 > 0 ? 'high' : customer.days_31_60 > 0 ? 'medium' : 'low',
        assigned_to: null,
        last_contact_date: null,
        contact_attempts: 0,
        next_follow_up: null,
        promise_date: null,
        promise_amount: 0,
        notes: null,
        payment_behavior: 'regular',
        invoice_count: customer.invoice_count
      }));
      
      // Calculate stats from the data
      const totalOutstanding = collections.reduce((sum, c) => sum + c.total_outstanding, 0);
      const overdueAmount = collections.reduce((sum, c) => sum + c.overdue_amount, 0);
      const criticalCount = collections.filter(c => c.priority === 'critical').length;
      
      return {
        collections: collections.filter(c => c.total_outstanding > 0),
        stats: {
          total_outstanding: totalOutstanding,
          total_overdue: overdueAmount,
          collections_today: Math.round(totalOutstanding * 0.05), // Mock 5% daily collection
          collections_mtd: Math.round(totalOutstanding * 0.35), // Mock 35% MTD collection
          promise_amount: Math.round(overdueAmount * 0.4), // Mock 40% promised
          customers_count: collections.length,
          critical_accounts: criticalCount,
          success_rate: 72, // Mock success rate
          collection_change: 15 // Mock positive change
        }
      };
    } catch (error) {
      console.error('Error fetching collection data:', error);
      // Return empty data structure to prevent UI errors
      return {
        collections: [],
        stats: {
          total_outstanding: 0,
          total_overdue: 0,
          collections_today: 0,
          collections_mtd: 0,
          promise_amount: 0,
          customers_count: 0,
          critical_accounts: 0,
          success_rate: 0,
          collection_change: 0
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
  },

  // Export collection list
  exportCollectionList: async (params) => {
    // Mock implementation - in production would generate actual Excel file
    return {
      data: new Blob(['Collection Data Export'], { type: 'application/vnd.ms-excel' })
    };
  },

  // Get collection agents - stub for now
  getCollectionAgents: async () => {
    return [];
  },

  // Assign collection agent
  assignCollectionAgent: async (customerIds, agentId) => {
    // Mock implementation
    return { success: true };
  },

  // Record collection contact
  recordCollectionContact: async (data) => {
    // Mock implementation
    return { success: true };
  },

  // Send bulk reminders
  sendBulkReminders: async (data) => {
    // Mock implementation
    return { success: true };
  }
};