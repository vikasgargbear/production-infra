/**
 * Organizations API Module
 */

import { apiHelpers } from '../../apiClient';
import { rejectCanonicalWrite } from '../../canonicalWritePolicy';
import type { AxiosResponse } from 'axios';

// ============================================
// Type Definitions
// ============================================

export interface OrganizationData {
    org_name: string;
    org_code?: string;
    type?: string;
    is_active?: boolean;
}

// ============================================
// Endpoints
// ============================================

const ENDPOINTS = {
    BASE: '/organizations'
} as const;

// ============================================
// API Module
// ============================================

const organizationsApi = {
    getAll: (): Promise<AxiosResponse> => {
        return apiHelpers.get(ENDPOINTS.BASE);
    },

    getById: (orgId: number): Promise<AxiosResponse> => {
        return apiHelpers.get(`${ENDPOINTS.BASE}/${orgId}`);
    },

    create: (_data: OrganizationData): Promise<AxiosResponse> =>
        rejectCanonicalWrite('Creating an organization'),

    update: (_orgId: number, _data: Partial<OrganizationData>): Promise<AxiosResponse> =>
        rejectCanonicalWrite('Editing an organization'),

    delete: (_orgId: number): Promise<AxiosResponse> =>
        rejectCanonicalWrite('Deleting an organization')
};

export default organizationsApi;
