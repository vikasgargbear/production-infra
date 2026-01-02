/**
 * Loyalty Points API Module
 * Handles customer loyalty program
 * 
 * ENDPOINTS: /loyalty-points (backend: app/api/routes/loyalty_points.py)
 */

import { apiHelpers } from '../../apiClient';

const ENDPOINTS = {
    BASE: '/loyalty-points',
    BALANCE: (customerId: number | string) => `/loyalty-points/customer/${customerId}/balance`,
    HISTORY: (customerId: number | string) => `/loyalty-points/customer/${customerId}/history`,
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
    getBalance: (customerId: number | string) => {
        return apiHelpers.get<{ balance: number }>(ENDPOINTS.BALANCE(customerId));
    },

    // Get points history
    getHistory: (customerId: number | string, params: Record<string, any> = {}) => {
        return apiHelpers.get<any>(ENDPOINTS.HISTORY(customerId), { params });
    },

    // =========================================================================
    // TRANSACTIONS
    // =========================================================================

    // Earn points
    earnPoints: (data: any) => {
        return apiHelpers.post<any>(ENDPOINTS.EARN, data);
    },

    // Redeem points
    redeemPoints: (data: any) => {
        return apiHelpers.post<any>(ENDPOINTS.REDEEM, data);
    },

    // Calculate points for order
    calculatePoints: (orderAmount: number, customerId: number | string | null = null) => {
        return apiHelpers.post<{ points: number }>(`${ENDPOINTS.BASE}/calculate`, {
            order_amount: orderAmount,
            customer_id: customerId
        });
    },

    // =========================================================================
    // CONFIGURATION
    // =========================================================================

    // Get earning rules
    getRules: () => {
        return apiHelpers.get<any>(ENDPOINTS.RULES);
    },

    // Update earning rules
    updateRules: (data: any) => {
        return apiHelpers.put<any>(ENDPOINTS.RULES, data);
    },

    // Get loyalty tiers
    getTiers: () => {
        return apiHelpers.get<any>(ENDPOINTS.TIERS);
    },

    // Update tiers
    updateTiers: (data: any) => {
        return apiHelpers.put<any>(ENDPOINTS.TIERS, data);
    }
};
