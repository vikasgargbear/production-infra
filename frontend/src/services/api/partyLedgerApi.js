import apiClient from './apiClient';

// Using simplified v2 API - based on working /sales/outstanding columns
const BASE_URL = '/party-ledger-v2';

export const partyLedgerApi = {
  // Get party info (maps to getBalance for now)
  getPartyInfo: async (partyId) => {
    // If partyId is undefined or null, check if we have a selected customer
    if (!partyId) {
      console.log('[PartyLedgerAPI] getPartyInfo called with null/undefined');
      return { balance: 0, transaction_count: 0 };
    }
    
    // Extract ID from various possible formats
    let actualId = partyId;
    
    // If partyId is an object, try to extract the ID
    if (partyId && typeof partyId === 'object') {
      console.log('[PartyLedgerAPI] Received customer object:', partyId);
      console.log('[PartyLedgerAPI] customer_id field:', partyId.customer_id);
      
      actualId = partyId.customer_id || 
                 partyId.id || 
                 partyId.ID ||
                 partyId.customerId ||
                 partyId.party_id ||
                 partyId.value;
                 
      // Hardcoded mapping for known customers (temporary fix)
      // TODO: Fix backend to return customer_id
      const customerCodeMapping = {
        'GAR0001': 108,
        'BAN0001': 106,
        'NEH0001': 107,
        'ROH0001': 109
      };
      
      if (!actualId && partyId.customer_code && customerCodeMapping[partyId.customer_code]) {
        actualId = customerCodeMapping[partyId.customer_code];
        console.log('[PartyLedgerAPI] Using hardcoded mapping for customer_code:', partyId.customer_code, '-> ID:', actualId);
      }
      
      console.log('[PartyLedgerAPI] getPartyInfo - Party object:', partyId);
      console.log('[PartyLedgerAPI] getPartyInfo - All keys:', Object.keys(partyId));
    }
    
    console.log('[PartyLedgerAPI] getPartyInfo - extracted ID:', actualId);
    
    if (!actualId) {
      console.error('[PartyLedgerAPI] Could not extract ID from party object:', partyId);
      return { balance: 0, transaction_count: 0 };
    }
    
    const response = await apiClient.get(`${BASE_URL}/balance/${actualId}`, {
      params: { party_type: 'customer' }
    });
    return response.data;
  },

  // Get enhanced ledger (maps to getStatement with additional params)
  getEnhancedLedger: async (params) => {
    const { party_id, party_type = 'customer', ...otherParams } = params;
    
    // If no party_id provided, return empty result
    if (!party_id) {
      console.log('[PartyLedgerAPI] getEnhancedLedger - No party_id provided, returning empty result');
      return { entries: [], summary: {} };
    }
    
    // Extract ID from various possible formats
    let actualId = party_id;
    
    // If party_id is an object, try to extract the ID
    if (party_id && typeof party_id === 'object') {
      console.log('[PartyLedgerAPI] getEnhancedLedger - Received customer object:', party_id);
      console.log('[PartyLedgerAPI] getEnhancedLedger - customer_id field:', party_id?.customer_id);
      console.log('[PartyLedgerAPI] getEnhancedLedger - All keys:', party_id ? Object.keys(party_id) : 'null/undefined');
      
      // Try different possible field names
      actualId = party_id.customer_id || 
                 party_id.id || 
                 party_id.ID ||
                 party_id.customerId ||
                 party_id.party_id ||
                 party_id.value ||
                 party_id.customer_code;
                 
      // Hardcoded mapping for known customers (temporary fix)
      // TODO: Fix backend to return customer_id
      const customerCodeMapping = {
        'GAR0001': 108,
        'BAN0001': 106,
        'NEH0001': 107,
        'ROH0001': 109
      };
      
      if (!actualId && party_id.customer_code && customerCodeMapping[party_id.customer_code]) {
        actualId = customerCodeMapping[party_id.customer_code];
        console.log('[PartyLedgerAPI] Using hardcoded mapping for customer_code:', party_id.customer_code, '-> ID:', actualId);
      }
      
      console.log('[PartyLedgerAPI] Party object:', party_id);
      console.log('[PartyLedgerAPI] All keys:', Object.keys(party_id));
    }
    
    console.log('[PartyLedgerAPI] getEnhancedLedger - extracted ID:', actualId, 'from party_id:', party_id);
    
    // If we still don't have an ID, log error
    if (!actualId) {
      console.error('[PartyLedgerAPI] Could not extract ID from party object:', party_id);
      return { entries: [], summary: {} };
    }
    
    const response = await apiClient.get(`${BASE_URL}/statement/${actualId}`, {
      params: { party_type, ...otherParams }
    });
    
    // Map the response to match frontend expectations
    const data = response.data;
    console.log('[PartyLedgerAPI] Raw response from statement API:', data);
    console.log('[PartyLedgerAPI] Statement entries count:', data.statement?.length);
    console.log('[PartyLedgerAPI] First entry:', data.statement?.[0]);
    
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