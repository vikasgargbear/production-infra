/**
 * Compliance API Module
 */

import { apiHelpers } from '../../apiClient';
import type { AxiosResponse } from 'axios';

// ============================================
// Type Definitions
// ============================================

export interface ComplianceParams {
    from_date?: string;
    to_date?: string;
    compliance_type?: string;
    status?: string;
}

export interface NarcoticEntryData {
    product_id: number;
    batch_id?: number;
    entry_type: 'purchase' | 'sale' | 'return';
    quantity: number;
    entry_date: string;
    reference_number?: string;
    customer_name?: string;
    prescriber_name?: string;
    prescription_number?: string;
    notes?: string;
}

// ============================================
// Endpoints
// ============================================

const ENDPOINTS = {
    BASE: '/compliance',
    NARCOTIC: '/compliance/narcotic-register',
    DRUG_LICENSE: '/compliance/drug-license',
    AUDIT_LOG: '/compliance/audit-log'
} as const;

// ============================================
// API Module
// ============================================

export const complianceApi = {
    // Narcotic Register
    getNarcoticEntries: (params: ComplianceParams = {}): Promise<AxiosResponse> => {
        return apiHelpers.get(ENDPOINTS.NARCOTIC, { params });
    },

    createNarcoticEntry: (data: NarcoticEntryData): Promise<AxiosResponse> => {
        return apiHelpers.post(ENDPOINTS.NARCOTIC, data);
    },

    updateNarcoticEntry: (entryId: number, data: Partial<NarcoticEntryData>): Promise<AxiosResponse> => {
        return apiHelpers.put(`${ENDPOINTS.NARCOTIC}/${entryId}`, data);
    },

    deleteNarcoticEntry: (entryId: number): Promise<AxiosResponse> => {
        return apiHelpers.delete(`${ENDPOINTS.NARCOTIC}/${entryId}`);
    },

    // Drug License
    getDrugLicenseInfo: (): Promise<AxiosResponse> => {
        return apiHelpers.get(ENDPOINTS.DRUG_LICENSE);
    },

    updateDrugLicense: (data: Record<string, any>): Promise<AxiosResponse> => {
        return apiHelpers.put(ENDPOINTS.DRUG_LICENSE, data);
    },

    // Audit Log
    getAuditLog: (params: ComplianceParams = {}): Promise<AxiosResponse> => {
        return apiHelpers.get(ENDPOINTS.AUDIT_LOG, { params });
    },

    // Export
    exportNarcoticRegister: (params: { format?: 'pdf' | 'excel' } = {}): Promise<AxiosResponse> => {
        return apiHelpers.get(`${ENDPOINTS.NARCOTIC}/export`, {
            params,
            responseType: 'blob'
        });
    }
};
