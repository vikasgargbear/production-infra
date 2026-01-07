/**
 * Settings API Module
 */

import { apiHelpers } from '../../apiClient';
import type { AxiosResponse } from 'axios';

// ============================================
// Type Definitions
// ============================================

export interface SettingsData {
    general?: GeneralSettings;
    invoice?: InvoiceSettings;
    stock?: StockSettings;
    tax?: TaxSettings;
    notification?: NotificationSettings;
}

export interface GeneralSettings {
    company_name?: string;
    timezone?: string;
    currency?: string;
    date_format?: string;
    financial_year_start?: string;
}

export interface InvoiceSettings {
    invoice_prefix?: string;
    invoice_footer?: string;
    terms_conditions?: string;
    show_logo?: boolean;
    auto_print?: boolean;
}

export interface StockSettings {
    low_stock_threshold?: number;
    expiry_warning_days?: number;
    allow_negative_stock?: boolean;
    auto_deduct_stock?: boolean;
}

export interface TaxSettings {
    default_gst_percent?: number;
    show_gst_breakup?: boolean;
    round_off_total?: boolean;
}

export interface NotificationSettings {
    email_notifications?: boolean;
    sms_notifications?: boolean;
    low_stock_alerts?: boolean;
    expiry_alerts?: boolean;
}

// ============================================
// Endpoints
// ============================================

const ENDPOINTS = {
    BASE: '/settings',
    GENERAL: '/settings/general',
    INVOICE: '/settings/invoice',
    STOCK: '/settings/stock',
    TAX: '/settings/tax',
    NOTIFICATION: '/settings/notification',
    BACKUP: '/settings/backup',
    COMPANY: '/settings/company-info'
} as const;

// ============================================
// API Module
// ============================================

const settingsApi = {
    getAll: (): Promise<AxiosResponse> => {
        return apiHelpers.get(ENDPOINTS.BASE);
    },

    getGeneral: (): Promise<AxiosResponse> => {
        return apiHelpers.get(ENDPOINTS.GENERAL);
    },

    updateGeneral: (data: GeneralSettings): Promise<AxiosResponse> => {
        return apiHelpers.put(ENDPOINTS.GENERAL, data);
    },

    getInvoice: (): Promise<AxiosResponse> => {
        return apiHelpers.get(ENDPOINTS.INVOICE);
    },

    updateInvoice: (data: InvoiceSettings): Promise<AxiosResponse> => {
        return apiHelpers.put(ENDPOINTS.INVOICE, data);
    },

    getStock: (): Promise<AxiosResponse> => {
        return apiHelpers.get(ENDPOINTS.STOCK);
    },

    updateStock: (data: StockSettings): Promise<AxiosResponse> => {
        return apiHelpers.put(ENDPOINTS.STOCK, data);
    },

    getTax: (): Promise<AxiosResponse> => {
        return apiHelpers.get(ENDPOINTS.TAX);
    },

    updateTax: (data: TaxSettings): Promise<AxiosResponse> => {
        return apiHelpers.put(ENDPOINTS.TAX, data);
    },

    getNotification: (): Promise<AxiosResponse> => {
        return apiHelpers.get(ENDPOINTS.NOTIFICATION);
    },

    updateNotification: (data: NotificationSettings): Promise<AxiosResponse> => {
        return apiHelpers.put(ENDPOINTS.NOTIFICATION, data);
    },

    getCompanyInfo: (): Promise<AxiosResponse> => {
        return apiHelpers.get(ENDPOINTS.COMPANY);
    },

    updateCompanyInfo: (data: Record<string, any>): Promise<AxiosResponse> => {
        return apiHelpers.put(ENDPOINTS.COMPANY, data);
    },

    createBackup: (): Promise<AxiosResponse> => {
        return apiHelpers.post(`${ENDPOINTS.BACKUP}/create`, {}, { responseType: 'blob' });
    },

    restoreBackup: (file: File): Promise<AxiosResponse> => {
        const formData = new FormData();
        formData.append('backup', file);
        return apiHelpers.post(`${ENDPOINTS.BACKUP}/restore`, formData);
    },

    // ============================================
    // Taxes Sub-module (for TaxMaster)
    // ============================================
    taxes: {
        getAll: (): Promise<AxiosResponse> => apiHelpers.get('/taxes'),
        getById: (id: number | string): Promise<AxiosResponse> => apiHelpers.get(`/taxes/${id}`),
        create: (data: Record<string, any>): Promise<AxiosResponse> => apiHelpers.post('/taxes', data),
        update: (id: number | string, data: Record<string, any>): Promise<AxiosResponse> => apiHelpers.put(`/taxes/${id}`, data),
        delete: (id: number | string): Promise<AxiosResponse> => apiHelpers.delete(`/taxes/${id}`)
    },

    // ============================================
    // Units Sub-module (for UnitMaster)
    // ============================================
    units: {
        getAll: (): Promise<AxiosResponse> => apiHelpers.get('/units'),
        getById: (id: number | string): Promise<AxiosResponse> => apiHelpers.get(`/units/${id}`),
        create: (data: Record<string, any>): Promise<AxiosResponse> => apiHelpers.post('/units', data),
        update: (id: number | string, data: Record<string, any>): Promise<AxiosResponse> => apiHelpers.put(`/units/${id}`, data),
        delete: (id: number | string): Promise<AxiosResponse> => apiHelpers.delete(`/units/${id}`)
    },

    // ============================================
    // System Sub-module (for SystemSettings)
    // ============================================
    system: {
        getAll: (): Promise<AxiosResponse> => apiHelpers.get('/settings/system'),
        update: (data: Record<string, any>): Promise<AxiosResponse> => apiHelpers.put('/settings/system', data)
    }
};

export default settingsApi;
