import apiClient from './apiClient';

const BASE_URL = '/api/party-ledger';

export const partyLedgerApi = {
  // Get party info (maps to getBalance for now)
  getPartyInfo: async (partyId) => {
    // Handle both id and customer_id fields
    const actualId = partyId?.customer_id || partyId?.id || partyId;
    console.log('[PartyLedgerAPI] getPartyInfo called with:', partyId, 'using ID:', actualId);
    
    const response = await apiClient.get(`${BASE_URL}/balance/${actualId}`, {
      params: { party_type: 'customer' }
    });
    return response.data;
  },

  // Get enhanced ledger (maps to getStatement with additional params)
  getEnhancedLedger: async (params) => {
    const { party_id, party_type = 'customer', ...otherParams } = params;
    // Handle both id and customer_id fields
    const actualId = party_id?.customer_id || party_id?.id || party_id;
    console.log('[PartyLedgerAPI] getEnhancedLedger called with party_id:', party_id, 'using ID:', actualId);
    
    const response = await apiClient.get(`${BASE_URL}/statement/${actualId}`, {
      params: { party_type, ...otherParams }
    });
    
    // Map the response to match frontend expectations
    const data = response.data;
    return {
      entries: data.statement || [], // Frontend expects 'entries', API returns 'statement'
      summary: data.summary || {
        total_debit: 0,
        total_credit: 0,
        outstanding_amount: 0,
        transaction_count: 0
      },
      party: data.party,
      filters: data.filters
    };
  },

  // Reconcile transactions
  reconcileTransactions: async (transactionIds) => {
    // For now, just return success
    return { success: true, transactionIds };
  },

  // Export enhanced ledger
  exportEnhancedLedger: async (params) => {
    // For now, return mock data
    return { data: new Blob(['Ledger Export'], { type: 'application/pdf' }) };
  },

  // Get party balance
  getBalance: async (partyId, partyType, asOfDate = null) => {
    const params = { party_type: partyType };
    if (asOfDate) params.as_of_date = asOfDate;
    
    return apiClient.get(`${BASE_URL}/balance/${partyId}`, { params });
  },

  // Get party statement
  getStatement: async (partyId, partyType, params = {}) => {
    return apiClient.get(`${BASE_URL}/statement/${partyId}`, {
      params: { party_type: partyType, ...params }
    });
  },

  // Get outstanding bills
  getOutstandingBills: async (partyId, partyType, params = {}) => {
    return apiClient.get(`${BASE_URL}/outstanding-bills/${partyId}`, {
      params: { party_type: partyType, ...params }
    });
  },

  // Get aging analysis
  getAgingAnalysis: async (params = {}) => {
    return apiClient.get(`${BASE_URL}/aging-analysis`, { params });
  },

  // Create ledger entry
  createEntry: async (entryData) => {
    return apiClient.post(`${BASE_URL}/entry`, entryData);
  },

  // Reconcile entry
  reconcileEntry: async (ledgerId) => {
    return apiClient.post(`${BASE_URL}/reconcile/${ledgerId}`);
  },

  // Get pending reminders
  getPendingReminders: async (reminderDate = null) => {
    const params = {};
    if (reminderDate) params.reminder_date = reminderDate;
    
    return apiClient.get(`${BASE_URL}/reminders/pending`, { params });
  }
};

export default partyLedgerApi;