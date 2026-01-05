/**
 * Reports API Module
 * Handles analytics reports
 */

import { apiHelpers } from '../../apiClient';
import type { AxiosResponse } from 'axios';

// ============================================
// Type Definitions
// ============================================

export interface ReportParams {
    start_date?: string;
    end_date?: string;
    period?: 'daily' | 'weekly' | 'monthly' | 'yearly';
    group_by?: string;
    format?: 'json' | 'csv' | 'pdf';
}

export interface SalesReportParams extends ReportParams {
    customer_id?: number;
    product_id?: number;
    category_id?: number;
}

export interface PurchaseReportParams extends ReportParams {
    supplier_id?: number;
    product_id?: number;
}

// ============================================
// Endpoints
// ============================================

const ENDPOINTS = {
    BASE: '/reports',
    SALES: '/reports/sales',
    PURCHASES: '/reports/purchases',
    INVENTORY: '/reports/inventory',
    FINANCIAL: '/reports/financial',
    PROFIT_LOSS: '/reports/profit-loss',
    GST: '/reports/gst',
    STOCK_SUMMARY: '/reports/stock-summary',
    EXPIRY: '/reports/expiry',
    OUTSTANDING: '/reports/outstanding',
    PAYMENT: '/reports/payment'
} as const;

// ============================================
// API Module
// ============================================

const reportsApi = {
    // Sales Reports
    getSalesReport: (params: SalesReportParams = {}): Promise<AxiosResponse> => {
        return apiHelpers.get(ENDPOINTS.SALES, { params });
    },

    getSalesSummary: (params: ReportParams = {}): Promise<AxiosResponse> => {
        return apiHelpers.get(`${ENDPOINTS.SALES}/summary`, { params });
    },

    getSalesByProduct: (params: ReportParams = {}): Promise<AxiosResponse> => {
        return apiHelpers.get(`${ENDPOINTS.SALES}/by-product`, { params });
    },

    getSalesByCustomer: (params: ReportParams = {}): Promise<AxiosResponse> => {
        return apiHelpers.get(`${ENDPOINTS.SALES}/by-customer`, { params });
    },

    // Purchase Reports
    getPurchaseReport: (params: PurchaseReportParams = {}): Promise<AxiosResponse> => {
        return apiHelpers.get(ENDPOINTS.PURCHASES, { params });
    },

    getPurchaseSummary: (params: ReportParams = {}): Promise<AxiosResponse> => {
        return apiHelpers.get(`${ENDPOINTS.PURCHASES}/summary`, { params });
    },

    // Inventory Reports
    getInventoryReport: (params: ReportParams = {}): Promise<AxiosResponse> => {
        return apiHelpers.get(ENDPOINTS.INVENTORY, { params });
    },

    getStockSummary: (params: ReportParams = {}): Promise<AxiosResponse> => {
        return apiHelpers.get(ENDPOINTS.STOCK_SUMMARY, { params });
    },

    getExpiryReport: (params: { days?: number } = {}): Promise<AxiosResponse> => {
        return apiHelpers.get(ENDPOINTS.EXPIRY, { params });
    },

    // Financial Reports
    getFinancialReport: (params: ReportParams = {}): Promise<AxiosResponse> => {
        return apiHelpers.get(ENDPOINTS.FINANCIAL, { params });
    },

    getProfitLoss: (params: ReportParams = {}): Promise<AxiosResponse> => {
        return apiHelpers.get(ENDPOINTS.PROFIT_LOSS, { params });
    },

    // GST Reports
    getGSTReport: (params: ReportParams = {}): Promise<AxiosResponse> => {
        return apiHelpers.get(ENDPOINTS.GST, { params });
    },

    // Outstanding Reports
    getOutstandingReport: (params: ReportParams = {}): Promise<AxiosResponse> => {
        return apiHelpers.get(ENDPOINTS.OUTSTANDING, { params });
    },

    // Payment Reports
    getPaymentReport: (params: ReportParams = {}): Promise<AxiosResponse> => {
        return apiHelpers.get(ENDPOINTS.PAYMENT, { params });
    },

    // Export
    exportReport: (reportType: string, params: ReportParams = {}): Promise<AxiosResponse> => {
        return apiHelpers.get(`${ENDPOINTS.BASE}/${reportType}/export`, {
            params,
            responseType: 'blob'
        });
    }
};

export default reportsApi;
