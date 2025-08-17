/**
 * Credit/Debit Notes API Module
 * Handles credit notes and debit notes for financial adjustments
 * Updated to match actual backend endpoints
 */

import apiClient from '../apiClient';

export const notesApi = {
  // List all notes with filters
  list: async (params = {}) => {
    const response = await apiClient.get('/notes', { params });
    return response.data;
  },

  // Get note details by ID
  get: async (noteId) => {
    const response = await apiClient.get(`/notes/${noteId}`);
    return response.data;
  },

  // Create credit note
  createCreditNote: async (data) => {
    const response = await apiClient.post('/notes/credit-note', data);
    return response.data;
  },

  // Create debit note
  createDebitNote: async (data) => {
    const response = await apiClient.post('/notes/debit-note', data);
    return response.data;
  },

  // Get predefined reasons for notes
  getReasons: async () => {
    const response = await apiClient.get('/notes/reasons/list');
    return response.data;
  },

  // Get invoices for linking to notes
  getLinkedInvoices: async (partyId, invoiceType = 'sales') => {
    const response = await apiClient.get(`/notes/linked-invoices/${partyId}`, {
      params: { invoice_type: invoiceType }
    });
    return response.data;
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