/**
 * Notes API Module
 * Handles credit notes and debit notes
 * 
 * ENDPOINTS: /credit-debit-notes (backend: app/api/routes/finance/credit_notes.py)
 */

import { apiHelpers } from '../../apiClient';
import { cleanData } from '../../utils/dataUtils';

const ENDPOINTS = {
  BASE: '/credit-debit-notes',
  CREDIT: '/credit-debit-notes/credit-notes',
  DEBIT: '/credit-debit-notes/debit-notes',
  CREDIT_REASONS: '/credit-debit-notes/credit-note-reasons',
  DEBIT_REASONS: '/credit-debit-notes/debit-note-reasons'
};

export const notesApi = {
  // =========================================================================
  // LIST OPERATIONS
  // =========================================================================

  // List all notes
  list: (params = {}) => {
    return apiHelpers.get(ENDPOINTS.BASE, { params });
  },

  // List credit notes
  listCreditNotes: (params = {}) => {
    return apiHelpers.get(ENDPOINTS.BASE, { params: { ...params, note_type: 'credit' } });
  },

  // List debit notes
  listDebitNotes: (params = {}) => {
    return apiHelpers.get(ENDPOINTS.BASE, { params: { ...params, note_type: 'debit' } });
  },

  // =========================================================================
  // GET OPERATIONS
  // =========================================================================

  // Get note by ID
  get: (noteId) => {
    return apiHelpers.get(`${ENDPOINTS.BASE}/${noteId}`);
  },

  // =========================================================================
  // CREATE OPERATIONS
  // =========================================================================

  // Create credit note
  createCreditNote: (data) => {
    const cleanedData = cleanData(data);
    return apiHelpers.post(ENDPOINTS.CREDIT, cleanedData);
  },

  // Create debit note
  createDebitNote: (data) => {
    const cleanedData = cleanData(data);
    return apiHelpers.post(ENDPOINTS.DEBIT, cleanedData);
  },

  // =========================================================================
  // UPDATE OPERATIONS
  // =========================================================================

  // Update note
  update: (noteId, data) => {
    const cleanedData = cleanData(data);
    return apiHelpers.put(`${ENDPOINTS.BASE}/${noteId}`, cleanedData);
  },

  // =========================================================================
  // ACTIONS
  // =========================================================================

  // Apply credit note to invoice
  applyCreditNote: (creditNoteId, applicationData) => {
    return apiHelpers.post(`${ENDPOINTS.BASE}/${creditNoteId}/apply`, applicationData);
  },

  // Cancel note
  cancel: (noteId, cancellationReason) => {
    return apiHelpers.delete(`${ENDPOINTS.BASE}/${noteId}`, {
      data: { cancellation_reason: cancellationReason }
    });
  },

  // =========================================================================
  // METADATA
  // =========================================================================

  // Get credit note reasons
  getCreditNoteReasons: () => {
    return apiHelpers.get(ENDPOINTS.CREDIT_REASONS);
  },

  // Get debit note reasons
  getDebitNoteReasons: () => {
    return apiHelpers.get(ENDPOINTS.DEBIT_REASONS);
  },

  // Get linked invoices for a party
  getLinkedInvoices: (partyId) => {
    return apiHelpers.get('/invoices', {
      params: { customer_id: partyId, payment_status: 'pending,partial', limit: 100 }
    });
  },

  // =========================================================================
  // PRINT
  // =========================================================================

  // Get print data
  getPrintData: (noteId) => {
    return apiHelpers.get(`${ENDPOINTS.BASE}/${noteId}/print`);
  }
};