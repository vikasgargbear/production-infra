/**
 * Credit/Debit Notes API Module
 * Handles credit notes and debit notes for financial adjustments
 * Updated to match actual backend endpoints
 */

import apiClient from '../apiClient';

export const notesApi = {
  // List all credit notes with filters
  listCreditNotes: async (params = {}) => {
    const response = await apiClient.get('/api/v1/credit-notes', { params });
    return response.data;
  },

  // List all debit notes with filters
  listDebitNotes: async (params = {}) => {
    const response = await apiClient.get('/api/v1/debit-notes', { params });
    return response.data;
  },

  // Get credit note details by ID
  getCreditNote: async (creditNoteId) => {
    const response = await apiClient.get(`/api/v1/credit-notes/${creditNoteId}`);
    return response.data;
  },

  // Get debit note details by ID
  getDebitNote: async (debitNoteId) => {
    const response = await apiClient.get(`/api/v1/debit-notes/${debitNoteId}`);
    return response.data;
  },

  // Create credit note
  createCreditNote: async (data) => {
    const response = await apiClient.post('/api/v1/credit-notes', data);
    return response.data;
  },

  // Create debit note
  createDebitNote: async (data) => {
    const response = await apiClient.post('/api/v1/debit-notes', data);
    return response.data;
  },

  // Update credit note
  updateCreditNote: async (creditNoteId, data) => {
    const response = await apiClient.put(`/api/v1/credit-notes/${creditNoteId}`, data);
    return response.data;
  },

  // Update debit note
  updateDebitNote: async (debitNoteId, data) => {
    const response = await apiClient.put(`/api/v1/debit-notes/${debitNoteId}`, data);
    return response.data;
  },

  // Apply credit note to invoice
  applyCreditNote: async (creditNoteId, applicationData) => {
    const response = await apiClient.post(`/api/v1/credit-notes/${creditNoteId}/apply`, applicationData);
    return response.data;
  },

  // Get credit note reasons
  getCreditNoteReasons: async () => {
    const response = await apiClient.get('/api/v1/credit-note-reasons');
    return response.data;
  },

  // Get debit note reasons
  getDebitNoteReasons: async () => {
    const response = await apiClient.get('/api/v1/debit-note-reasons');
    return response.data;
  },

  // Settlement types for credit notes (frontend fallback)
  getSettlementTypes: async () => {
    // Return standard settlement types
    return {
      data: [
        { value: 'future_invoice', label: 'Adjust Against Future Invoices' },
        { value: 'cash_refund', label: 'Cash Refund' },
        { value: 'bank_transfer', label: 'Bank Transfer' },
        { value: 'account_credit', label: 'Keep as Account Credit' }
      ]
    };
  },

  // Get invoices for linking to notes - use the same pattern as everywhere else
  getLinkedInvoices: async (partyId, invoiceType = 'sales') => {
    try {
      // Import the InvoiceApiService to use the working method
      const InvoiceApiService = require('../../invoiceApiService').default;
      
      // Use the same getInvoices method that works in InvoiceSelector, SalesReturnFlow, etc.
      const response = await InvoiceApiService.getInvoices({
        customer_id: partyId,
        limit: 100,
        // Get unpaid and partially paid invoices for credit note
        payment_status: 'pending,partial,unpaid'
      });
      
      if (response.success && response.data) {
        // Return in expected format
        return {
          invoices: response.data.invoices || response.data || []
        };
      }
      
      return { invoices: [] };
    } catch (error) {
      console.error('Error fetching customer invoices:', error);
      // Fallback to direct API call if service not available
      const response = await apiClient.get('/api/v1/invoices/list', {
        params: { 
          customer_id: partyId,
          limit: 100
        }
      });
      return response.data;
    }
  },

  // Cancel/delete a note
  cancel: async (noteId, cancellationReason) => {
    const response = await apiClient.delete(`/notes/${noteId}`, {
      data: { cancellation_reason: cancellationReason }
    });
    return response.data;
  },

  // Get note print data
  getPrintData: async (noteId) => {
    const response = await apiClient.get(`/notes/${noteId}/print`);
    return response.data;
  },

  // Get invoice items for credit/debit note creation
  getInvoiceItems: async (invoiceId) => {
    const response = await apiClient.get(`/notes/invoice-items/${invoiceId}`);
    return response.data;
  },

  // Backward compatibility - Credit Notes
  creditNotes: {
    list: async (params) => {
      return notesApi.list({ ...params, note_type: 'credit' });
    },
    
    create: async (data) => {
      return notesApi.createCreditNote(data);
    },
    
    get: async (id) => {
      return notesApi.get(id);
    },
    
    cancel: async (id, reason) => {
      return notesApi.cancel(id, reason);
    }
  },

  // Backward compatibility - Debit Notes
  debitNotes: {
    list: async (params) => {
      return notesApi.list({ ...params, note_type: 'debit' });
    },
    
    create: async (data) => {
      return notesApi.createDebitNote(data);
    },
    
    get: async (id) => {
      return notesApi.get(id);
    },
    
    cancel: async (id, reason) => {
      return notesApi.cancel(id, reason);
    }
  }
};