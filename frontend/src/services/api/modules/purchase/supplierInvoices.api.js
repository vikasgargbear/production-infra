/**
 * Supplier Invoices API Module
 * Handles supplier invoice management
 * 
 * ENDPOINTS: /supplier-invoices (backend: app/api/routes/purchase/supplier_invoices.py)
 */

import { apiHelpers } from '../../apiClient';
import { cleanData } from '../../utils/dataUtils';

const ENDPOINTS = {
    BASE: '/supplier-invoices',
    DETAILS: (id) => `/supplier-invoices/${id}`,
    ITEMS: (id) => `/supplier-invoices/${id}/items`,
    RETURNABLE: '/supplier-invoices/returnable',
    PENDING: '/supplier-invoices/pending',
    MATCH: '/supplier-invoices/match'
};

export const supplierInvoicesApi = {
    // =========================================================================
    // CRUD OPERATIONS
    // =========================================================================

    // Get all supplier invoices
    getAll: (params = {}) => {
        return apiHelpers.get(ENDPOINTS.BASE, { params });
    },

    // Get supplier invoice by ID
    getById: (id) => {
        return apiHelpers.get(ENDPOINTS.DETAILS(id));
    },

    // Create supplier invoice
    create: (data) => {
        const cleanedData = cleanData(data);
        return apiHelpers.post(ENDPOINTS.BASE, cleanedData);
    },

    // Update supplier invoice
    update: (id, data) => {
        const cleanedData = cleanData(data);
        return apiHelpers.put(ENDPOINTS.DETAILS(id), cleanedData);
    },

    // Delete supplier invoice
    delete: (id) => {
        return apiHelpers.delete(ENDPOINTS.DETAILS(id));
    },

    // =========================================================================
    // ITEMS
    // =========================================================================

    // Get invoice items
    getItems: (invoiceId) => {
        return apiHelpers.get(ENDPOINTS.ITEMS(invoiceId));
    },

    // Add item to invoice
    addItem: (invoiceId, itemData) => {
        return apiHelpers.post(ENDPOINTS.ITEMS(invoiceId), itemData);
    },

    // =========================================================================
    // RETURNS
    // =========================================================================

    // Get returnable invoices
    getReturnable: (params = {}) => {
        return apiHelpers.get(ENDPOINTS.RETURNABLE, { params });
    },

    // Get returnable items for an invoice
    getReturnableItems: (invoiceId) => {
        return apiHelpers.get(`${ENDPOINTS.DETAILS(invoiceId)}/returnable-items`);
    },

    // =========================================================================
    // MATCHING
    // =========================================================================

    // Get pending invoices for matching
    getPending: (supplierId) => {
        return apiHelpers.get(ENDPOINTS.PENDING, { params: { supplier_id: supplierId } });
    },

    // Match invoice to PO/GRN
    matchToPO: (invoiceId, poId) => {
        return apiHelpers.post(ENDPOINTS.MATCH, { invoice_id: invoiceId, po_id: poId });
    }
};
