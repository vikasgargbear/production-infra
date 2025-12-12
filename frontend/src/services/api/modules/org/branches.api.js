/**
 * Branches API Module
 * Handles branch/location management
 * 
 * ENDPOINTS: /branches (backend: app/api/routes/master/branches.py)
 */

import { apiHelpers } from '../../apiClient';
import { cleanData } from '../../utils/dataUtils';

const ENDPOINTS = {
    BASE: '/branches',
    DETAILS: (id) => `/branches/${id}`,
    USERS: (id) => `/branches/${id}/users`,
    STATS: (id) => `/branches/${id}/stats`,
    TRANSFER: '/branches/transfer'
};

export const branchesApi = {
    // =========================================================================
    // CRUD OPERATIONS
    // =========================================================================

    // Get all branches
    getAll: (params = {}) => {
        return apiHelpers.get(ENDPOINTS.BASE, { params });
    },

    // Get branch by ID
    getById: (id) => {
        return apiHelpers.get(ENDPOINTS.DETAILS(id));
    },

    // Create new branch
    create: (data) => {
        const cleanedData = cleanData(data);
        return apiHelpers.post(ENDPOINTS.BASE, cleanedData);
    },

    // Update branch
    update: (id, data) => {
        const cleanedData = cleanData(data);
        return apiHelpers.put(ENDPOINTS.DETAILS(id), cleanedData);
    },

    // Delete branch
    delete: (id) => {
        return apiHelpers.delete(ENDPOINTS.DETAILS(id));
    },

    // =========================================================================
    // BRANCH USERS
    // =========================================================================

    // Get users in a branch
    getUsers: (branchId) => {
        return apiHelpers.get(ENDPOINTS.USERS(branchId));
    },

    // Assign user to branch
    assignUser: (branchId, userId) => {
        return apiHelpers.post(ENDPOINTS.USERS(branchId), { user_id: userId });
    },

    // Remove user from branch
    removeUser: (branchId, userId) => {
        return apiHelpers.delete(`${ENDPOINTS.USERS(branchId)}/${userId}`);
    },

    // =========================================================================
    // STATS & ANALYTICS
    // =========================================================================

    // Get branch statistics
    getStats: (branchId) => {
        return apiHelpers.get(ENDPOINTS.STATS(branchId));
    },

    // Get all branches with stats
    getAllWithStats: () => {
        return apiHelpers.get(ENDPOINTS.BASE, { params: { include_stats: true } });
    },

    // =========================================================================
    // TRANSFERS
    // =========================================================================

    // Transfer inventory between branches
    transferInventory: (data) => {
        return apiHelpers.post(ENDPOINTS.TRANSFER, data);
    }
};
