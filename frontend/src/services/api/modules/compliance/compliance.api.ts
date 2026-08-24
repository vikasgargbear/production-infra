/**
 * Compliance API Module
 */

import { apiHelpers } from '../../apiClient';
import { rejectCanonicalWrite } from '../../canonicalWritePolicy';
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

// ============================================
// Endpoints
// ============================================

const ENDPOINTS = {
    BASE: '/compliance',
    DRUG_LICENSE: '/compliance/drug-license',
    AUDIT_LOG: '/compliance/audit-log'
} as const;

// ============================================
// API Module
// ============================================

export const complianceApi = {
    // Drug License
    getDrugLicenseInfo: (): Promise<AxiosResponse> => {
        return apiHelpers.get(ENDPOINTS.DRUG_LICENSE);
    },

    updateDrugLicense: (_data: Record<string, any>): Promise<AxiosResponse> =>
        rejectCanonicalWrite('Legacy drug-license editing'),

    // Audit Log
    getAuditLog: (params: ComplianceParams = {}): Promise<AxiosResponse> => {
        return apiHelpers.get(ENDPOINTS.AUDIT_LOG, { params });
    }
};
