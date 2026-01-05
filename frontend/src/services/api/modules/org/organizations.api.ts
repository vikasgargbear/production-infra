/**
 * Organizations API Module
 */

import { apiHelpers } from '../../apiClient';
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

    create: (data: OrganizationData): Promise<AxiosResponse> => {
        return apiHelpers.post(ENDPOINTS.BASE, data);
    },

    update: (orgId: number, data: Partial<OrganizationData>): Promise<AxiosResponse> => {
        return apiHelpers.put(`${ENDPOINTS.BASE}/${orgId}`, data);
    },

    delete: (orgId: number): Promise<AxiosResponse> => {
        return apiHelpers.delete(`${ENDPOINTS.BASE}/${orgId}`);
    }
};

export default organizationsApi;
