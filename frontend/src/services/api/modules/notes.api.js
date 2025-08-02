/**
 * Credit/Debit Notes API Module
 * Handles all credit and debit note API calls
 */

import { apiClient } from '../apiClient';
import { API_CONFIG } from '../../../config/api.config';

const { ENDPOINTS } = API_CONFIG;

export const notesApi = {
  // Credit Notes
  creditNotes: {
    // Get all credit notes
    getAll: async (params = {}) => {
      return apiClient.get(ENDPOINTS.NOTES.CREDIT, { params });
    },

    // Get single credit note
    getById: async (id) => {
      return apiClient.get(`${ENDPOINTS.NOTES.CREDIT}/${id}`);
    },

    // Create credit note
    create: async (data) => {
      return apiClient.post(ENDPOINTS.NOTES.CREDIT, data);
    },

    // Update credit note
    update: async (id, data) => {
      return apiClient.put(`${ENDPOINTS.NOTES.CREDIT}/${id}`, data);
    },

    // Delete credit note
    delete: async (id) => {
      return apiClient.delete(`${ENDPOINTS.NOTES.CREDIT}/${id}`);
    },

    // Approve credit note
    approve: async (id) => {
      return apiClient.post(ENDPOINTS.NOTES.APPROVE('credit', id));
    },

    // Cancel credit note
    cancel: async (id, reason) => {
      return apiClient.post(ENDPOINTS.NOTES.CANCEL('credit', id), { reason });
    },

    // Apply to invoice
    applyToInvoice: async (creditNoteId, invoiceId, amount) => {
      return apiClient.post(`${ENDPOINTS.NOTES.CREDIT}/${creditNoteId}/apply`, {
        invoice_id: invoiceId,
        amount
      });
    },
  },

  // Debit Notes
  debitNotes: {
    // Get all debit notes
    getAll: async (params = {}) => {
      return apiClient.get(ENDPOINTS.NOTES.DEBIT, { params });
    },

    // Get single debit note
    getById: async (id) => {
      return apiClient.get(`${ENDPOINTS.NOTES.DEBIT}/${id}`);
    },

    // Create debit note
    create: async (data) => {
      return apiClient.post(ENDPOINTS.NOTES.DEBIT, data);
    },

    // Update debit note
    update: async (id, data) => {
      return apiClient.put(`${ENDPOINTS.NOTES.DEBIT}/${id}`, data);
    },

    // Delete debit note
    delete: async (id) => {
      return apiClient.delete(`${ENDPOINTS.NOTES.DEBIT}/${id}`);
    },

    // Approve debit note
    approve: async (id) => {
      return apiClient.post(ENDPOINTS.NOTES.APPROVE('debit', id));
    },

    // Cancel debit note
    cancel: async (id, reason) => {
      return apiClient.post(ENDPOINTS.NOTES.CANCEL('debit', id), { reason });
    },

    // Apply to purchase
    applyToPurchase: async (debitNoteId, purchaseId, amount) => {
      return apiClient.post(`${ENDPOINTS.NOTES.DEBIT}/${debitNoteId}/apply`, {
        purchase_id: purchaseId,
        amount
      });
    },
  },

  // Common functions
  // Get reasons for notes
  getReasons: async (type) => {
    const endpoint = type === 'credit' ? ENDPOINTS.NOTES.CREDIT : ENDPOINTS.NOTES.DEBIT;
    return apiClient.get(`${endpoint}/reasons`);
  },

  // Generate note number
  generateNoteNumber: async (type) => {
    const endpoint = type === 'credit' ? ENDPOINTS.NOTES.CREDIT : ENDPOINTS.NOTES.DEBIT;
    return apiClient.get(`${endpoint}/generate-number`);
  },

  // Get pending adjustments
  getPendingAdjustments: async (partyId, type) => {
    const endpoint = type === 'credit' ? ENDPOINTS.NOTES.CREDIT : ENDPOINTS.NOTES.DEBIT;
    return apiClient.get(`${endpoint}/pending`, {
      params: { party_id: partyId }
    });
  },
};