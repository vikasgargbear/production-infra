/**
 * Loyalty Points API Module
 * Handles customer loyalty program
 * 
 * ENDPOINTS: /loyalty-points (backend: app/api/routes/loyalty_points.py)
 */

import { apiHelpers } from '../../apiClient';

const ENDPOINTS = {
    BASE: '/loyalty-points',
    BALANCE: (customerId) => `/loyalty-points/customer/${customerId}/balance`,
    HISTORY: (customerId) => `/loyalty-points/customer/${customerId}/history`,
    EARN: '/loyalty-points/earn',
    REDEEM: '/loyalty-points/redeem',
    RULES: '/loyalty-points/rules',
    TIERS: '/loyalty-points/tiers'
};

export const loyaltyPointsApi = {
    // =========================================================================
    // BALANCE & HISTORY
    // =========================================================================

    // Get customer balance
    getBalance: (customerId) => {
        return apiHelpers.get(ENDPOINTS.BALANCE(customerId));
    },

    // Get points history
    getHistory: (customerId, params = {}) => {
        return apiHelpers.get(ENDPOINTS.HISTORY(customerId), { params });
    },

    // =========================================================================
    // TRANSACTIONS
    // =========================================================================

    // Earn points
    earnPoints: (data) => {
        return apiHelpers.post(ENDPOINTS.EARN, data);
    },

    // Redeem points
    redeemPoints: (data) => {
        return apiHelpers.post(ENDPOINTS.REDEEM, data);
    },

    // Calculate points for order
    calculatePoints: (orderAmount, customerId = null) => {
        return apiHelpers.post(`${ENDPOINTS.BASE}/calculate`, {
            order_amount: orderAmount,
            customer_id: customerId
        });
    },

    // =========================================================================
    // CONFIGURATION
    // =========================================================================

    // Get earning rules
    getRules: () => {
        return apiHelpers.get(ENDPOINTS.RULES);
    },

    // Update earning rules
    updateRules: (data) => {
        return apiHelpers.put(ENDPOINTS.RULES, data);
    },

    // Get loyalty tiers
    getTiers: () => {
        return apiHelpers.get(ENDPOINTS.TIERS);
    },

    // Update tiers
    updateTiers: (data) => {
        return apiHelpers.put(ENDPOINTS.TIERS, data);
    }
};
