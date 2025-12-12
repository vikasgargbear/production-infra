/**
 * Collection Center API Module
 * Handles collection tracking and follow-ups
 * 
 * ENDPOINTS: /collection-center (backend: app/api/routes/analytics/collection.py)
 */

import { apiHelpers } from '../../apiClient';

const ENDPOINTS = {
    BASE: '/collection-center',
    DASHBOARD: '/collection-center/dashboard',
    CUSTOMERS: '/collection-center/customers',
    FOLLOW_UPS: '/collection-center/follow-ups',
    REMINDERS: '/collection-center/reminders',
    PROMISES: '/collection-center/promises',
    STATS: '/collection-center/stats'
};

export const collectionCenterApi = {
    // =========================================================================
    // DASHBOARD
    // =========================================================================

    // Get collection dashboard
    getDashboard: () => {
        return apiHelpers.get(ENDPOINTS.DASHBOARD);
    },

    // Get collection stats
    getStats: (params = {}) => {
        return apiHelpers.get(ENDPOINTS.STATS, { params });
    },

    // =========================================================================
    // CUSTOMERS
    // =========================================================================

    // Get customers with outstanding
    getCustomers: (params = {}) => {
        return apiHelpers.get(ENDPOINTS.CUSTOMERS, { params });
    },

    // Get customer collection details
    getCustomerDetails: (customerId) => {
        return apiHelpers.get(`${ENDPOINTS.CUSTOMERS}/${customerId}`);
    },

    // Update customer collection status
    updateStatus: (customerId, status) => {
        return apiHelpers.patch(`${ENDPOINTS.CUSTOMERS}/${customerId}/status`, { status });
    },

    // =========================================================================
    // FOLLOW-UPS
    // =========================================================================

    // Get follow-ups
    getFollowUps: (params = {}) => {
        return apiHelpers.get(ENDPOINTS.FOLLOW_UPS, { params });
    },

    // Create follow-up
    createFollowUp: (data) => {
        return apiHelpers.post(ENDPOINTS.FOLLOW_UPS, data);
    },

    // Complete follow-up
    completeFollowUp: (followUpId, result) => {
        return apiHelpers.post(`${ENDPOINTS.FOLLOW_UPS}/${followUpId}/complete`, { result });
    },

    // =========================================================================
    // REMINDERS
    // =========================================================================

    // Get reminders
    getReminders: (params = {}) => {
        return apiHelpers.get(ENDPOINTS.REMINDERS, { params });
    },

    // Create reminder
    createReminder: (data) => {
        return apiHelpers.post(ENDPOINTS.REMINDERS, data);
    },

    // Send reminder (SMS/WhatsApp)
    sendReminder: (customerId, channel) => {
        return apiHelpers.post(`${ENDPOINTS.REMINDERS}/send`, { customer_id: customerId, channel });
    },

    // =========================================================================
    // PROMISES
    // =========================================================================

    // Get payment promises
    getPromises: (params = {}) => {
        return apiHelpers.get(ENDPOINTS.PROMISES, { params });
    },

    // Record payment promise
    recordPromise: (data) => {
        return apiHelpers.post(ENDPOINTS.PROMISES, data);
    },

    // Update promise status
    updatePromise: (promiseId, status) => {
        return apiHelpers.patch(`${ENDPOINTS.PROMISES}/${promiseId}`, { status });
    }
};
