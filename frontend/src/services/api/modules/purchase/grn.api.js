/**
 * GRN (Goods Receipt Notes) API Module
 * Handles goods receipt against purchase orders
 * 
 * ENDPOINTS: /grn (backend: app/api/routes/purchase/grn.py)
 */

import { apiHelpers } from '../../apiClient';
import { cleanData } from '../../utils/dataUtils';

const ENDPOINTS = {
    BASE: '/grn',
    DETAILS: (id) => `/grn/${id}`,
    ITEMS: (id) => `/grn/${id}/items`,
    GENERATE_NUMBER: '/grn/generate-number',
    APPROVE: (id) => `/grn/${id}/approve`,
    PENDING: '/grn/pending',
    BY_PO: (poId) => `/grn/po/${poId}`
};

export const grnApi = {
    // =========================================================================
    // CRUD OPERATIONS
    // =========================================================================

    // Get all GRNs
    getAll: (params = {}) => {
        return apiHelpers.get(ENDPOINTS.BASE, { params });
    },

    // Get GRN by ID
    getById: (id) => {
        return apiHelpers.get(ENDPOINTS.DETAILS(id));
    },

    // Create GRN
    create: (data) => {
        const cleanedData = cleanData(data);
        return apiHelpers.post(ENDPOINTS.BASE, cleanedData);
    },

    // Update GRN
    update: (id, data) => {
        const cleanedData = cleanData(data);
        return apiHelpers.put(ENDPOINTS.DETAILS(id), cleanedData);
    },

    // Delete GRN
    delete: (id) => {
        return apiHelpers.delete(ENDPOINTS.DETAILS(id));
    },

    // =========================================================================
    // NUMBER GENERATION
    // =========================================================================

    // Generate GRN number
    generateNumber: () => {
        return apiHelpers.get(ENDPOINTS.GENERATE_NUMBER);
    },

    // =========================================================================
    // ITEMS
    // =========================================================================

    // Get GRN items
    getItems: (grnId) => {
        return apiHelpers.get(ENDPOINTS.ITEMS(grnId));
    },

    // Add item to GRN
    addItem: (grnId, itemData) => {
        return apiHelpers.post(ENDPOINTS.ITEMS(grnId), itemData);
    },

    // =========================================================================
    // WORKFLOW
    // =========================================================================

    // Approve GRN
    approve: (grnId, approvalData = {}) => {
        return apiHelpers.post(ENDPOINTS.APPROVE(grnId), approvalData);
    },

    // Get pending GRNs
    getPending: () => {
        return apiHelpers.get(ENDPOINTS.PENDING);
    },

    // =========================================================================
    // PO RELATED
    // =========================================================================

    // Get GRNs for a PO
    getByPO: (poId) => {
        return apiHelpers.get(ENDPOINTS.BY_PO(poId));
    },

    // Get pending items from PO for GRN
    getPOPendingItems: (poId) => {
        return apiHelpers.get(`/purchases/${poId}/pending-items`);
    }
};
