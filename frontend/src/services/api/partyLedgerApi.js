import { apiClient } from './apiClient';

const BASE_URL = '/api/v1/party-ledger';

export const partyLedgerApi = {
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