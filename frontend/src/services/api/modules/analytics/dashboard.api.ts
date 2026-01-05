/**
 * Dashboard API Module
 * Handles analytics and dashboard data
 * 
 * ENDPOINTS: /dashboard (backend: app/api/routes/analytics/dashboard.py)
 */

import { apiHelpers } from '../../apiClient';
import type { AxiosResponse } from 'axios';

// ============================================
// Type Definitions
// ============================================

export interface DashboardParams {
    period?: 'daily' | 'weekly' | 'monthly';
    start_date?: string;
    end_date?: string;
    limit?: number;
    period_days?: number;
}

export interface DashboardOverview {
    total_sales: number;
    total_purchases: number;
    total_customers: number;
    total_products: number;
}

export interface DashboardStats {
    revenue: number;
    orders: number;
    customers: number;
    products: number;
}

export interface RevenueData {
    date: string;
    revenue: number;
    orders: number;
}

export interface AlertData {
    product_id: number;
    product_name: string;
    batch_number?: string;
    quantity?: number;
    expiry_date?: string;
}

// ============================================
// Endpoints
// ============================================

const ENDPOINTS = {
    BASE: '/dashboard',
    OVERVIEW: '/dashboard/overview',
    STATS: '/dashboard/stats',
    KPIS: '/dashboard/kpis',
    REVENUE: '/dashboard/revenue',
    FINANCIAL: '/dashboard/financial-summary',
    SALES: '/dashboard/sales-analytics',
    INVENTORY: '/dashboard/inventory-summary',
    ORDERS: '/dashboard/recent-orders',
    ACTIVITIES: '/dashboard/recent-activities',
    PRODUCTS: '/dashboard/top-products',
    CUSTOMERS: '/dashboard/top-customers',
    CUSTOMER_ANALYTICS: '/dashboard/customer-analytics',
    ALERTS: {
        INVENTORY: '/dashboard/inventory-alerts',
        LOW_STOCK: '/dashboard/low-stock-alerts',
        EXPIRY: '/dashboard/expiry-alerts'
    },
    PAYMENTS: '/dashboard/pending-payments'
} as const;

// ============================================
// API Module
// ============================================

export const dashboardApi = {
    // OVERVIEW
    getOverview: (): Promise<AxiosResponse> => {
        return apiHelpers.get(ENDPOINTS.OVERVIEW);
    },

    getStats: (): Promise<AxiosResponse> => {
        return apiHelpers.get(ENDPOINTS.STATS);
    },

    getKPIs: (): Promise<AxiosResponse> => {
        return apiHelpers.get(ENDPOINTS.KPIS);
    },

    // REVENUE & FINANCIAL
    getRevenue: (params: DashboardParams = {}): Promise<AxiosResponse> => {
        return apiHelpers.get(ENDPOINTS.REVENUE, { params });
    },

    getFinancialSummary: (params: DashboardParams = {}): Promise<AxiosResponse> => {
        return apiHelpers.get(ENDPOINTS.FINANCIAL, { params });
    },

    getSalesAnalytics: (params: DashboardParams = {}): Promise<AxiosResponse> => {
        return apiHelpers.get(ENDPOINTS.SALES, { params });
    },

    // INVENTORY
    getInventorySummary: (): Promise<AxiosResponse> => {
        return apiHelpers.get(ENDPOINTS.INVENTORY);
    },

    getInventoryAlerts: (): Promise<AxiosResponse> => {
        return apiHelpers.get(ENDPOINTS.ALERTS.INVENTORY);
    },

    getLowStockAlerts: (): Promise<AxiosResponse> => {
        return apiHelpers.get(ENDPOINTS.ALERTS.LOW_STOCK);
    },

    getExpiryAlerts: (days: number = 90): Promise<AxiosResponse> => {
        return apiHelpers.get(ENDPOINTS.ALERTS.EXPIRY, { params: { days } });
    },

    // RECENT DATA
    getRecentOrders: (limit: number = 10): Promise<AxiosResponse> => {
        return apiHelpers.get(ENDPOINTS.ORDERS, { params: { limit } });
    },

    getRecentActivities: (limit: number = 20): Promise<AxiosResponse> => {
        return apiHelpers.get(ENDPOINTS.ACTIVITIES, { params: { limit } });
    },

    // TOP ITEMS
    getTopProducts: (params: DashboardParams = {}): Promise<AxiosResponse> => {
        return apiHelpers.get(ENDPOINTS.PRODUCTS, { params });
    },

    getTopCustomers: (limit: number = 10): Promise<AxiosResponse> => {
        return apiHelpers.get(ENDPOINTS.CUSTOMERS, { params: { limit } });
    },

    getCustomerAnalytics: (params: DashboardParams = {}): Promise<AxiosResponse> => {
        return apiHelpers.get(ENDPOINTS.CUSTOMER_ANALYTICS, { params });
    },

    // PAYMENTS
    getPendingPayments: (): Promise<AxiosResponse> => {
        return apiHelpers.get(ENDPOINTS.PAYMENTS);
    }
};
