/**
 * Settings API Module
 */

import { apiHelpers } from '../../apiClient';
import { rejectCanonicalWrite } from '../../canonicalWritePolicy';
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

    updateGeneral: (_data: GeneralSettings): Promise<AxiosResponse> =>
        rejectCanonicalWrite('Updating general settings'),

    getInvoice: (): Promise<AxiosResponse> => {
        return apiHelpers.get(ENDPOINTS.INVOICE);
    },

    updateInvoice: (_data: InvoiceSettings): Promise<AxiosResponse> =>
        rejectCanonicalWrite('Updating invoice settings'),

    getStock: (): Promise<AxiosResponse> => {
        return apiHelpers.get(ENDPOINTS.STOCK);
    },

    updateStock: (data: StockSettings): Promise<AxiosResponse> => {
        return apiHelpers.put(ENDPOINTS.STOCK, data);
    },

    getTax: (): Promise<AxiosResponse> => {
        return apiHelpers.get(ENDPOINTS.TAX);
    },

    updateTax: (_data: TaxSettings): Promise<AxiosResponse> =>
        rejectCanonicalWrite('Updating tax settings'),

    getNotification: (): Promise<AxiosResponse> => {
        return apiHelpers.get(ENDPOINTS.NOTIFICATION);
    },

    updateNotification: (_data: NotificationSettings): Promise<AxiosResponse> =>
        rejectCanonicalWrite('Updating notification settings'),

    getCompanyInfo: (): Promise<AxiosResponse> => {
        return apiHelpers.get(ENDPOINTS.COMPANY);
    },

    updateCompanyInfo: (data: Record<string, any>): Promise<AxiosResponse> => {
        return apiHelpers.put(ENDPOINTS.COMPANY, data);
    },

    createBackup: (): Promise<AxiosResponse> => rejectCanonicalWrite('Creating a system backup'),

    restoreBackup: (_file: File): Promise<AxiosResponse> => rejectCanonicalWrite('Restoring a system backup'),

    // ============================================
    // Taxes Sub-module (for TaxMaster)
    // ============================================
    taxes: {
        getAll: (): Promise<AxiosResponse> => apiHelpers.get('/taxes'),
        getById: (id: number | string): Promise<AxiosResponse> => apiHelpers.get(`/taxes/${id}`),
        create: (_data: Record<string, any>): Promise<AxiosResponse> => rejectCanonicalWrite('Creating a tax rate'),
        update: (_id: number | string, _data: Record<string, any>): Promise<AxiosResponse> => rejectCanonicalWrite('Editing a tax rate'),
        delete: (_id: number | string): Promise<AxiosResponse> => rejectCanonicalWrite('Deleting a tax rate')
    },

    // ============================================
    // Units Sub-module (for UnitMaster)
    // ============================================
    units: {
        getAll: (): Promise<AxiosResponse> => apiHelpers.get('/units'),
        getById: (id: number | string): Promise<AxiosResponse> => apiHelpers.get(`/units/${id}`),
        create: (_data: Record<string, any>): Promise<AxiosResponse> => rejectCanonicalWrite('Creating a unit'),
        update: (_id: number | string, _data: Record<string, any>): Promise<AxiosResponse> => rejectCanonicalWrite('Editing a unit'),
        delete: (_id: number | string): Promise<AxiosResponse> => rejectCanonicalWrite('Deleting a unit')
    },

    // ============================================
    // System Sub-module (for SystemSettings)
    // ============================================
    system: {
        getAll: (): Promise<AxiosResponse> => apiHelpers.get('/settings/system'),
        update: (_data: Record<string, any>): Promise<AxiosResponse> => rejectCanonicalWrite('Updating system settings')
    },

    // ============================================
    // Warehouses Sub-module (for WarehouseMaster)
    // ============================================
    warehouses: {
        getAll: (params?: Record<string, any>): Promise<AxiosResponse> => apiHelpers.get('/warehouses', { params }),
        getById: (id: number | string): Promise<AxiosResponse> => apiHelpers.get(`/warehouses/${id}`),
        create: (_data: Record<string, any>): Promise<AxiosResponse> => rejectCanonicalWrite('Creating a location'),
        update: (_id: number | string, _data: Record<string, any>): Promise<AxiosResponse> => rejectCanonicalWrite('Editing a location'),
        delete: (_id: number | string): Promise<AxiosResponse> => rejectCanonicalWrite('Deleting a location')
    },

    // ============================================
    // Features Sub-module (for FeatureSettings)
    // ============================================
    features: {
        getAll: (): Promise<AxiosResponse> => apiHelpers.get('/settings/features'),
        update: (_data: Record<string, any>): Promise<AxiosResponse> => rejectCanonicalWrite('Updating feature settings'),
        toggle: (_featureId: string, _enabled: boolean): Promise<AxiosResponse> => rejectCanonicalWrite('Toggling a feature')
    },

    // ============================================
    // Integrations Sub-module (for ThirdPartyIntegrations)
    // ============================================
    integrations: {
        getAll: (): Promise<AxiosResponse> => apiHelpers.get('/settings/integrations'),
        getById: (id: string): Promise<AxiosResponse> => apiHelpers.get(`/settings/integrations/${id}`),
        update: (_id: string, _data: Record<string, any>): Promise<AxiosResponse> => rejectCanonicalWrite('Updating an integration'),
        test: (_integrationId: string): Promise<AxiosResponse> => rejectCanonicalWrite('Testing a legacy integration')
    }
};

export default settingsApi;
