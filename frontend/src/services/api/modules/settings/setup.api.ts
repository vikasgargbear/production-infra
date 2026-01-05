/**
 * Setup API Module
 */

import { apiHelpers } from '../../apiClient';
import type { AxiosResponse } from 'axios';

// ============================================
// Type Definitions
// ============================================

export interface SetupData {
    company_name: string;
    gst_number?: string;
    address?: string;
    phone?: string;
    email?: string;
    admin_email: string;
    admin_password: string;
}

// ============================================
// Endpoints
// ============================================

const ENDPOINTS = {
    BASE: '/setup',
    STATUS: '/setup/status',
    INITIAL: '/setup/initial',
    COMPLETE: '/setup/complete'
} as const;

// ============================================
// API Module
// ============================================

export const setupApi = {
    getStatus: (): Promise<AxiosResponse> => {
        return apiHelpers.get(ENDPOINTS.STATUS);
    },

    runInitialSetup: (data: SetupData): Promise<AxiosResponse> => {
        return apiHelpers.post(ENDPOINTS.INITIAL, data);
    },

    completeSetup: (): Promise<AxiosResponse> => {
        return apiHelpers.post(ENDPOINTS.COMPLETE);
    },

    seedData: (dataType: string): Promise<AxiosResponse> => {
        return apiHelpers.post(`${ENDPOINTS.BASE}/seed`, { data_type: dataType });
    }
};
