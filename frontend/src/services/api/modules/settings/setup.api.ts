/**
 * Setup API Module
 */

import { apiHelpers } from '../../apiClient';
import { rejectCanonicalWrite } from '../../canonicalWritePolicy';
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

    runInitialSetup: (_data: SetupData): Promise<AxiosResponse> =>
        rejectCanonicalWrite('Running legacy initial setup'),

    completeSetup: (): Promise<AxiosResponse> =>
        rejectCanonicalWrite('Completing legacy setup'),

    seedData: (_dataType: string): Promise<AxiosResponse> =>
        rejectCanonicalWrite('Seeding legacy setup data')
};
