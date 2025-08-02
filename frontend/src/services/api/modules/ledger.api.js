import { apiClient } from '../apiClient';

// Party Ledger API Service
export const ledgerApi = {
  // Get party balance
  getPartyBalance: async (partyId, partyType, asOfDate = null) => {
    const params = new URLSearchParams({ party_type: partyType });
    if (asOfDate) params.append('as_of_date', asOfDate);
    
    // Convert integer ID to UUID format for backend compatibility
    // Using a deterministic UUID v5 namespace approach
    const uuidPartyId = `00000000-0000-0000-0000-${String(partyId).padStart(12, '0')}`;
    
    return apiClient.get(`/party-ledger/balance/${uuidPartyId}?${params}`);
  },

  // Get party statement
  getPartyStatement: async (partyId, partyType, options = {}) => {
    const params = new URLSearchParams({ 
      party_type: partyType,
      skip: options.skip || 0,
      limit: options.limit || 50
    });
    
    if (options.fromDate) params.append('from_date', options.fromDate);
    if (options.toDate) params.append('to_date', options.toDate);
    
    // Convert integer ID to UUID format for backend compatibility
    const uuidPartyId = `00000000-0000-0000-0000-${String(partyId).padStart(12, '0')}`;
    
    return apiClient.get(`/party-ledger/statement/${uuidPartyId}?${params}`);
  },

  // Get all party balances
  getAllBalances: async (partyType = 'customer', options = {}) => {
    const params = new URLSearchParams({ 
      party_type: partyType,
      skip: options.skip || 0,
      limit: options.limit || 100
    });
    
    if (options.minBalance) params.append('min_balance', options.minBalance);
    if (options.maxBalance) params.append('max_balance', options.maxBalance);
    if (options.balanceType) params.append('balance_type', options.balanceType);
    
    return apiClient.get(`/party-ledger/balances?${params}`);
  },

  // Get outstanding bills
  getOutstandingBills: async (partyId = null, options = {}) => {
    const params = new URLSearchParams({
      skip: options.skip || 0,
      limit: options.limit || 100
    });
    
    if (partyId) params.append('party_id', partyId);
    if (options.partyType) params.append('party_type', options.partyType);
    if (options.status) params.append('status', options.status);
    if (options.dueDateBefore) params.append('due_date_before', options.dueDateBefore);
    if (options.dueDateAfter) params.append('due_date_after', options.dueDateAfter);
    if (options.agingBucket) params.append('aging_bucket', options.agingBucket);
    
    return apiClient.get(`/party-ledger/outstanding-bills?${params}`);
  },

  // Get aging analysis
  getAgingAnalysis: async (partyType = 'customer', options = {}) => {
    const params = new URLSearchParams({ 
      party_type: partyType,
      skip: options.skip || 0,
      limit: options.limit || 100
    });
    
    if (options.minAmount) params.append('min_amount', options.minAmount);
    if (options.sortBy) params.append('sort_by', options.sortBy);
    if (options.sortOrder) params.append('sort_order', options.sortOrder);
    
    return apiClient.get(`/party-ledger/aging-analysis?${params}`);
  },

  // Get collection reminders
  getCollectionReminders: async (options = {}) => {
    const params = new URLSearchParams({
      skip: options.skip || 0,
      limit: options.limit || 50
    });
    
    if (options.partyId) params.append('party_id', options.partyId);
    if (options.reminderType) params.append('reminder_type', options.reminderType);
    if (options.status) params.append('status', options.status);
    if (options.fromDate) params.append('from_date', options.fromDate);
    if (options.toDate) params.append('to_date', options.toDate);
    
    return apiClient.get(`/party-ledger/collection-reminders?${params}`);
  },

  // Create collection reminder
  createCollectionReminder: async (reminderData) => {
    return apiClient.post('/party-ledger/collection-reminders', reminderData);
  },

  // Update reminder status
  updateReminderStatus: async (reminderId, status, responseNotes = null) => {
    return apiClient.patch(`/party-ledger/collection-reminders/${reminderId}`, {
      status,
      response_notes: responseNotes,
      response_date: new Date().toISOString().split('T')[0]
    });
  },

  // Allocate payment to bills
  allocatePayment: async (paymentId, allocations) => {
    return apiClient.post(`/party-ledger/allocate-payment/${paymentId}`, {
      allocations
    });
  },

  // Get payment allocations
  getPaymentAllocations: async (paymentId) => {
    return apiClient.get(`/party-ledger/payment-allocations/${paymentId}`);
  },

  // Generate statement report
  generateStatementReport: async (partyId, partyType, options = {}) => {
    const params = new URLSearchParams({ 
      party_type: partyType,
      format: options.format || 'pdf'
    });
    
    if (options.fromDate) params.append('from_date', options.fromDate);
    if (options.toDate) params.append('to_date', options.toDate);
    if (options.includeZeroBalance) params.append('include_zero_balance', options.includeZeroBalance);
    
    return apiClient.get(`/party-ledger/generate-statement/${partyId}?${params}`, {
      responseType: 'blob'
    });
  },

  // Export aging analysis
  exportAgingAnalysis: async (partyType = 'customer', format = 'excel') => {
    const params = new URLSearchParams({ 
      party_type: partyType,
      format
    });
    
    return apiClient.get(`/party-ledger/export-aging?${params}`, {
      responseType: 'blob'
    });
  },

  // Get ledger summary
  getLedgerSummary: async (partyType = 'customer') => {
    return apiClient.get(`/party-ledger/summary?party_type=${partyType}`);
  },

  // Search parties with balances
  searchPartiesWithBalances: async (searchTerm, partyType = 'customer') => {
    const params = new URLSearchParams({ 
      party_type: partyType,
      search: searchTerm,
      limit: 20
    });
    
    return apiClient.get(`/party-ledger/search-parties?${params}`);
  }
};

export default ledgerApi;