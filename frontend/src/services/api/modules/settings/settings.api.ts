/**
 * Settings API Module
 */

import { apiHelpers } from '../../apiClient';
import { rejectCanonicalWrite } from '../../canonicalWritePolicy';
import type { AxiosResponse } from 'axios';

export interface WarehouseViewDto {
    id: string;
    code: string;
    name: string;
    type: string;
    branchId: string;
    branchName: string;
    allowsSale: boolean;
    allowsNegativeStock: boolean;
    isActive: boolean;
    status: string;
}

export interface UnitViewDto {
    id: string;
    code: string;
    name: string;
    symbol: string;
    category: string;
    decimalPlaces: number;
    isActive: boolean;
    status: string;
}

export interface TaxViewDto {
    id: string;
    code: string;
    name: string;
    type: string;
    totalRate: number;
    cgst: number;
    sgst: number;
    igst: number;
    cess: number;
    effectiveFrom: string;
    effectiveTo: string | null;
    isActive: boolean;
    status: string;
}

const asString = (value: unknown): string => value == null ? '' : String(value);
const asNumber = (value: unknown): number => {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
};

/** Translate canonical read DTOs once at the API boundary, never in individual screens. */
export const adaptCanonicalWarehouse = (row: Record<string, unknown>): WarehouseViewDto => ({
    id: asString(row.warehouse_id ?? row.id),
    code: asString(row.warehouse_code ?? row.code),
    name: asString(row.warehouse_name ?? row.name),
    type: asString(row.warehouse_type ?? row.type),
    branchId: asString(row.branch_id),
    branchName: asString(row.branch_name),
    allowsSale: Boolean(row.allows_sale ?? row.allowsSale),
    allowsNegativeStock: Boolean(row.allows_negative_stock ?? row.allowsNegativeStock),
    isActive: Boolean(row.is_active ?? row.isActive),
    status: asString(row.status),
});

export const adaptCanonicalUnit = (row: Record<string, unknown>): UnitViewDto => ({
    id: asString(row.unit_id ?? row.id ?? row.unit_code ?? row.code),
    code: asString(row.unit_code ?? row.code),
    name: asString(row.unit_name ?? row.name),
    symbol: asString(row.symbol),
    category: asString(row.unit_type ?? row.category ?? row.dimension),
    decimalPlaces: asNumber(row.decimal_places ?? row.decimalPlaces),
    isActive: Boolean(row.is_active ?? row.isActive),
    status: asString(row.status),
});

export const adaptCanonicalTax = (row: Record<string, unknown>): TaxViewDto => ({
    id: asString(row.tax_id ?? row.id ?? row.tax_code ?? row.code),
    code: asString(row.tax_code ?? row.code),
    name: asString(row.tax_name ?? row.name ?? row.description),
    type: asString(row.taxability ?? row.type),
    totalRate: asNumber(row.total_rate ?? row.totalRate ?? row.unit_price),
    cgst: asNumber(row.cgst_rate ?? row.cgst),
    sgst: asNumber(row.sgst_rate ?? row.sgst),
    igst: asNumber(row.igst_rate ?? row.igst),
    cess: asNumber(row.cess_rate ?? row.cess),
    effectiveFrom: asString(row.effective_from ?? row.effectiveFrom),
    effectiveTo: row.effective_to == null && row.effectiveTo == null
        ? null
        : asString(row.effective_to ?? row.effectiveTo),
    isActive: Boolean(row.is_active ?? row.isActive),
    status: asString(row.status),
});

const adaptListResponse = <T>(
    response: AxiosResponse,
    adapter: (row: Record<string, unknown>) => T,
): AxiosResponse<T[]> => ({
    ...response,
    data: (Array.isArray(response.data) ? response.data : []).map(row => adapter(row)),
});

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

    updateStock: (_data: StockSettings): Promise<AxiosResponse> =>
        rejectCanonicalWrite('Updating stock settings'),

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

    updateCompanyInfo: (_data: Record<string, any>): Promise<AxiosResponse> =>
        rejectCanonicalWrite('Updating company settings'),

    createBackup: (): Promise<AxiosResponse> => rejectCanonicalWrite('Creating a system backup'),

    restoreBackup: (_file: File): Promise<AxiosResponse> => rejectCanonicalWrite('Restoring a system backup'),

    // ============================================
    // Taxes Sub-module (for TaxMaster)
    // ============================================
    taxes: {
        getAll: (): Promise<AxiosResponse<TaxViewDto[]>> =>
            apiHelpers.get('/taxes').then(response => adaptListResponse(response, adaptCanonicalTax)),
        getById: (id: number | string): Promise<AxiosResponse> => apiHelpers.get(`/taxes/${id}`),
        create: (_data: Record<string, any>): Promise<AxiosResponse> => rejectCanonicalWrite('Creating a tax rate'),
        update: (_id: number | string, _data: Record<string, any>): Promise<AxiosResponse> => rejectCanonicalWrite('Editing a tax rate'),
        delete: (_id: number | string): Promise<AxiosResponse> => rejectCanonicalWrite('Deleting a tax rate')
    },

    // ============================================
    // Units Sub-module (for UnitMaster)
    // ============================================
    units: {
        getAll: (): Promise<AxiosResponse<UnitViewDto[]>> =>
            apiHelpers.get('/units').then(response => adaptListResponse(response, adaptCanonicalUnit)),
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
        getAll: (params?: Record<string, any>): Promise<AxiosResponse<WarehouseViewDto[]>> =>
            apiHelpers.get('/warehouses', { params }).then(response => adaptListResponse(response, adaptCanonicalWarehouse)),
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
