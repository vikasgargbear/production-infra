// Party Ledger Data Transformer
// Handles data transformation between frontend and backend formats

export const ledgerDataTransformer = {
  // Transform frontend filters to backend format
  transformFiltersToBackend: (filters) => {
    if (!filters) return {};
    
    return {
      party_id: filters.party_id,
      from_date: filters.from_date || filters.startDate,
      to_date: filters.to_date || filters.endDate,
      party_type: filters.party_type === 'all' ? null : filters.party_type
    };
  },
  
  // Transform backend ledger data to frontend format
  transformLedgerToFrontend: (backendData) => {
    if (!backendData) return null;
    
    return {
      party_details: {
        party_id: backendData.party?.party_id,
        party_name: backendData.party?.party_name,
        party_type: backendData.party?.party_type,
        phone: backendData.party?.phone,
        email: backendData.party?.email,
        address: backendData.party?.address,
        gstin: backendData.party?.gstin
      },
      opening_balance: parseFloat(backendData.opening_balance || 0),
      closing_balance: parseFloat(backendData.closing_balance || 0),
      total_debit: parseFloat(backendData.total_debit || 0),
      total_credit: parseFloat(backendData.total_credit || 0),
      transactions: (backendData.entries || []).map(entry => ({
        id: entry.ledger_id,
        date: entry.transaction_date,
        type: ledgerDataTransformer.mapTransactionType(entry.transaction_type),
        reference_type: entry.reference_type,
        reference: entry.reference_number || entry.reference_id,
        debit: parseFloat(entry.debit_amount || 0),
        credit: parseFloat(entry.credit_amount || 0),
        balance: parseFloat(entry.running_balance || 0),
        description: entry.description || entry.notes || '',
        due_date: entry.due_date,
        reconciled: entry.reconciled || false
      })),
      outstanding: parseFloat(backendData.current_outstanding || 0)
    };
  },
  
  // Map transaction types
  mapTransactionType: (type) => {
    const typeMap = {
      'sale': 'Invoice',
      'purchase': 'Bill',
      'payment': 'Payment',
      'receipt': 'Receipt',
      'sale_return': 'Sales Return',
      'purchase_return': 'Purchase Return',
      'credit_note': 'Credit Note',
      'debit_note': 'Debit Note',
      'opening': 'Opening Balance',
      'adjustment': 'Adjustment'
    };
    return typeMap[type] || type;
  },
  
  // Transform outstanding data
  transformOutstandingToFrontend: (backendData) => {
    if (!backendData) return null;
    
    return {
      total: backendData.total || 0,
      parties: (backendData.parties || []).map(party => ({
        party_id: party.party_id,
        party_name: party.party_name,
        party_type: party.party_type,
        phone: party.phone,
        email: party.email,
        outstanding_amount: parseFloat(party.outstanding_amount || 0),
        days_overdue: party.days_overdue || 0,
        oldest_due_date: party.oldest_due_date,
        ageing: {
          current: parseFloat(party.ageing?.current || 0),
          days_0_30: parseFloat(party.ageing?.['0_30'] || 0),
          days_31_60: parseFloat(party.ageing?.['31_60'] || 0),
          days_61_90: parseFloat(party.ageing?.['61_90'] || 0),
          above_90: parseFloat(party.ageing?.above_90 || 0)
        }
      }))
    };
  },
  
  // Transform summary data
  transformSummaryToFrontend: (backendData) => {
    if (!backendData) return null;
    
    return {
      total_parties: backendData.total_parties || 0,
      parties_with_dues: backendData.parties_with_dues || 0,
      total_receivable: parseFloat(backendData.total_receivable || 0),
      total_payable: parseFloat(backendData.total_payable || 0),
      parties_overdue: backendData.parties_overdue || 0,
      amount_overdue: parseFloat(backendData.amount_overdue || 0)
    };
  },
  
  // Transform statement request
  transformStatementRequest: (partyId, dateRange, format = 'pdf') => {
    return {
      party_id: partyId,
      from_date: dateRange.from_date || dateRange.startDate,
      to_date: dateRange.to_date || dateRange.endDate,
      format: format
    };
  },
  
  // Transform reminder data
  transformReminderToBackend: (reminderData) => {
    if (!reminderData) return null;
    
    return {
      party_id: reminderData.party_id,
      reminder_type: reminderData.type || 'email',
      message: reminderData.message || 'Payment reminder',
      include_statement: reminderData.includeStatement || false,
      cc_emails: reminderData.ccEmails || []
    };
  },
  
  // Validate ledger filters
  validateFilters: (filters) => {
    const errors = [];
    
    if (!filters.party_id && filters.party_type === 'all') {
      // It's okay to fetch all parties
    } else if (!filters.party_id) {
      errors.push('Please select a party');
    }
    
    if (filters.from_date && filters.to_date) {
      const fromDate = new Date(filters.from_date);
      const toDate = new Date(filters.to_date);
      if (fromDate > toDate) {
        errors.push('From date cannot be after to date');
      }
    }
    
    return {
      isValid: errors.length === 0,
      errors
    };
  }
};

export default ledgerDataTransformer;