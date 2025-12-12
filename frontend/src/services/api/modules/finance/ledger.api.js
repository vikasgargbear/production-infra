/**
 * Ledger API Module (Unified)
 * Handles all party ledger, account transactions, and reporting
 * 
 * ENDPOINTS: 
 *   - /ledger/* (backend: app/api/routes/finance/ledger.py)
 *   - /party-ledger-v2/* (backend: app/api/routes/party_ledger.py)
 */

import { apiHelpers } from '../../apiClient';

const ENDPOINTS = {
  // General ledger endpoints
  PARTY: '/ledger/party',
  STATEMENTS: '/ledger/statements',
  OUTSTANDING: '/ledger/outstanding',
  AGING: '/ledger/aging',
  ENTRIES: '/ledger/entries',
  SUMMARY: '/ledger/summary',
  RECONCILE: '/ledger/reconcile',
  COLLECTIONS: '/ledger/collections',
  REPORTS: '/ledger/reports',

  // Party-specific endpoints (v2)
  PARTY_V2_BASE: '/party-ledger-v2',
  PARTY_BALANCE: (id) => `/party-ledger-v2/balance/${id}`,
  PARTY_STATEMENT: (id) => `/party-ledger-v2/statement/${id}`,
  PARTY_OUTSTANDING: (id) => `/party-ledger-v2/outstanding-bills/${id}`,
  PARTY_AGING: '/party-ledger-v2/aging-analysis',
  PARTY_ENTRY: '/party-ledger-v2/entry',
  PARTY_RECONCILE: (id) => `/party-ledger-v2/reconcile/${id}`,
  PARTY_REMINDERS: '/party-ledger-v2/reminders/pending'
};

export const ledgerApi = {
  // =========================================================================
  // PARTY BALANCE & STATEMENT (from partyLedger.api.js)
  // =========================================================================

  // Get party info/balance
  getPartyInfo: (partyId, partyType = 'customer') => {
    return apiHelpers.get(ENDPOINTS.PARTY_BALANCE(partyId), {
      params: { party_type: partyType }
    });
  },

  // Get party balance
  getBalance: (partyId, partyType, asOfDate = null) => {
    const params = { party_type: partyType };
    if (asOfDate) params.as_of_date = asOfDate;
    return apiHelpers.get(ENDPOINTS.PARTY_BALANCE(partyId), { params });
  },

  // Get party statement
  getStatement: (partyId, partyType, params = {}) => {
    return apiHelpers.get(ENDPOINTS.PARTY_STATEMENT(partyId), {
      params: { party_type: partyType, ...params }
    });
  },

  // Get enhanced ledger (alias for getStatement)
  getEnhancedLedger: (params = {}) => {
    const { party_id, party_type = 'customer', ...otherParams } = params;
    return apiHelpers.get(ENDPOINTS.PARTY_STATEMENT(party_id), {
      params: { party_type, ...otherParams }
    });
  },

  // Get outstanding bills for a party
  getOutstandingBills: (partyId, partyType, params = {}) => {
    return apiHelpers.get(ENDPOINTS.PARTY_OUTSTANDING(partyId), {
      params: { party_type: partyType, ...params }
    });
  },

  // =========================================================================
  // GENERAL LEDGER OPERATIONS
  // =========================================================================

  // Get party ledger entries
  getPartyLedger: (params = {}) => {
    return apiHelpers.get(ENDPOINTS.PARTY, { params });
  },

  // Get ledger by party ID
  getPartyLedgerById: (partyId, params = {}) => {
    return apiHelpers.get(`${ENDPOINTS.PARTY}/${partyId}`, { params });
  },

  // Get ledger statements
  getStatements: (params = {}) => {
    return apiHelpers.get(ENDPOINTS.STATEMENTS, { params });
  },

  // Get outstanding balances
  getOutstanding: (params = {}) => {
    return apiHelpers.get(ENDPOINTS.OUTSTANDING, { params });
  },

  // Get ledger summary
  getSummary: (params = {}) => {
    return apiHelpers.get(ENDPOINTS.SUMMARY, { params });
  },

  // =========================================================================
  // AGING ANALYSIS
  // =========================================================================

  // Get aging report (legacy endpoint)
  getAging: (params = {}) => {
    return apiHelpers.get(ENDPOINTS.AGING, { params });
  },

  // Get aging analysis (v2 endpoint - primary)
  getAgingAnalysis: (params = {}) => {
    return apiHelpers.get(ENDPOINTS.PARTY_AGING, { params });
  },

  // =========================================================================
  // ENTRIES & RECONCILIATION
  // =========================================================================

  // Create ledger entry
  createEntry: (data) => {
    return apiHelpers.post(ENDPOINTS.PARTY_ENTRY, data);
  },

  // Reconcile entries (bulk)
  reconcileEntries: (data) => {
    return apiHelpers.post(ENDPOINTS.RECONCILE, data);
  },

  // Reconcile single entry
  reconcileEntry: (ledgerId) => {
    return apiHelpers.post(ENDPOINTS.PARTY_RECONCILE(ledgerId));
  },

  // Reconcile multiple transactions
  reconcileTransactions: (transactionIds) => {
    return apiHelpers.post(`${ENDPOINTS.PARTY_V2_BASE}/reconcile-bulk`, { transaction_ids: transactionIds });
  },

  // =========================================================================
  // REMINDERS
  // =========================================================================

  // Get pending reminders
  getPendingReminders: (reminderDate = null) => {
    const params = {};
    if (reminderDate) params.reminder_date = reminderDate;
    return apiHelpers.get(ENDPOINTS.PARTY_REMINDERS, { params });
  },

  // =========================================================================
  // COLLECTIONS
  // =========================================================================

  // Get collection data for collection center
  getCollectionData: (params = {}) => {
    return apiHelpers.get(ENDPOINTS.PARTY_AGING, {
      params: { party_type: 'customer', ...params }
    });
  },

  // Set reminder for collection
  setCollectionReminder: (customerId, reminderData) => {
    return apiHelpers.post(`${ENDPOINTS.COLLECTIONS}/${customerId}/reminder`, reminderData);
  },

  // Update collection status
  updateCollectionStatus: (customerId, status) => {
    return apiHelpers.patch(`${ENDPOINTS.COLLECTIONS}/${customerId}/status`, { status });
  },

  // =========================================================================
  // DASHBOARD & ANALYTICS
  // =========================================================================

  // Get dashboard stats
  getDashboardStats: async (params = {}) => {
    const [customerAging, supplierAging] = await Promise.all([
      apiHelpers.get(ENDPOINTS.PARTY_AGING, { params: { ...params, party_type: 'customer' } }),
      apiHelpers.get(ENDPOINTS.PARTY_AGING, { params: { ...params, party_type: 'supplier' } })
    ]);

    const customerData = customerAging.data?.aging_data || [];
    const supplierData = supplierAging.data?.aging_data || [];

    const totalReceivables = customerData.reduce((sum, c) => sum + (c.total_outstanding || 0), 0);
    const totalPayables = supplierData.reduce((sum, s) => sum + (s.total_outstanding || 0), 0);

    return {
      total_receivables: totalReceivables,
      total_payables: totalPayables,
      net_position: totalReceivables - totalPayables
    };
  },

  // =========================================================================
  // REPORTS
  // =========================================================================

  // Get overview report
  getOverviewReport: (filters = {}) => {
    return apiHelpers.get(`${ENDPOINTS.REPORTS}/overview`, { params: filters });
  },

  // Get aging report
  getAgingReport: (filters = {}) => {
    return apiHelpers.get(ENDPOINTS.PARTY_AGING, { params: filters });
  },

  // Get cash flow report
  getCashFlowReport: (filters = {}) => {
    return apiHelpers.get(`${ENDPOINTS.REPORTS}/cashflow`, { params: filters });
  },

  // Get party performance report
  getPartyPerformanceReport: (filters = {}) => {
    return apiHelpers.get(`${ENDPOINTS.REPORTS}/party-performance`, { params: filters });
  },

  // Get collection report
  getCollectionReport: (filters = {}) => {
    return apiHelpers.get(`${ENDPOINTS.REPORTS}/collection`, { params: filters });
  },

  // Get trend analysis
  getTrendAnalysis: (filters = {}) => {
    return apiHelpers.get(`${ENDPOINTS.REPORTS}/trends`, { params: filters });
  },

  // =========================================================================
  // EXPORT
  // =========================================================================

  // Export report (generic)
  exportReport: (params = {}) => {
    return apiHelpers.post(`${ENDPOINTS.REPORTS}/export`, params, { responseType: 'blob' });
  },

  // Export party ledger as PDF/Excel
  exportLedger: (partyId, partyType, format = 'pdf') => {
    return apiHelpers.get(`${ENDPOINTS.PARTY_V2_BASE}/export/${partyId}`, {
      params: { party_type: partyType, format },
      responseType: 'blob'
    });
  }
};

// Also export as partyLedgerApi for backward compatibility
export const partyLedgerApi = ledgerApi;

export default ledgerApi;