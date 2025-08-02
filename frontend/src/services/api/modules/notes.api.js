/**
 * Credit/Debit Notes API Module
 * Handles credit notes and debit notes for returns
 */

import apiClient from '../apiClient';

export const notesApi = {
  // Credit Notes
  creditNotes: {
    // List credit notes
    list: async (params) => {
      const response = await apiClient.get('/credit-notes', { params });
      return response.data;
    },

    // Get credit note details
    get: async (id) => {
      const response = await apiClient.get(`/credit-notes/${id}`);
      return response.data;
    },

    // Create credit note
    create: async (data) => {
      const response = await apiClient.post('/credit-notes', data);
      return response.data;
    },

    // Update credit note
    update: async (id, data) => {
      const response = await apiClient.put(`/credit-notes/${id}`, data);
      return response.data;
    },

    // Approve credit note
    approve: async (id) => {
      const response = await apiClient.post(`/credit-notes/${id}/approve`);
      return response.data;
    },

    // Cancel credit note
    cancel: async (id, reason) => {
      const response = await apiClient.post(`/credit-notes/${id}/cancel`, { reason });
      return response.data;
    },

    // Generate PDF
    getPDF: async (id) => {
      const response = await apiClient.get(`/credit-notes/${id}/pdf`, {
        responseType: 'blob'
      });
      return response.data;
    }
  },

  // Debit Notes
  debitNotes: {
    // List debit notes
    list: async (params) => {
      const response = await apiClient.get('/debit-notes', { params });
      return response.data;
    },

    // Get debit note details
    get: async (id) => {
      const response = await apiClient.get(`/debit-notes/${id}`);
      return response.data;
    },

    // Create debit note
    create: async (data) => {
      const response = await apiClient.post('/debit-notes', data);
      return response.data;
    },

    // Update debit note
    update: async (id, data) => {
      const response = await apiClient.put(`/debit-notes/${id}`, data);
      return response.data;
    },

    // Approve debit note
    approve: async (id) => {
      const response = await apiClient.post(`/debit-notes/${id}/approve`);
      return response.data;
    },

    // Cancel debit note
    cancel: async (id, reason) => {
      const response = await apiClient.post(`/debit-notes/${id}/cancel`, { reason });
      return response.data;
    },

    // Generate PDF
    getPDF: async (id) => {
      const response = await apiClient.get(`/debit-notes/${id}/pdf`, {
        responseType: 'blob'
      });
      return response.data;
    }
  },

  // Common operations
  // Get notes for a specific invoice
  getByInvoice: async (invoiceId) => {
    const response = await apiClient.get(`/invoices/${invoiceId}/notes`);
    return response.data;
  },

  // Get notes for a specific party
  getByParty: async (partyId, partyType = 'customer') => {
    const response = await apiClient.get(`/${partyType}s/${partyId}/notes`);
    return response.data;
  }
};