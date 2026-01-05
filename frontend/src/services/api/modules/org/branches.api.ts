/**
 * Branches API Module
 */

import { apiHelpers } from '../../apiClient';
import type { AxiosResponse } from 'axios';

// ============================================
// Type Definitions
// ============================================

export interface BranchParams {
    is_active?: boolean;
    limit?: number;
    offset?: number;
}

export interface BranchData {
    branch_name: string;
    branch_code?: string;
    address?: string;
    city?: string;
    state?: string;
    pincode?: string;
    phone?: string;
    email?: string;
    is_active?: boolean;
    is_main?: boolean;
}

// ============================================
// Endpoints
// ============================================

const ENDPOINTS = {
    BASE: '/branches'
} as const;

// ============================================
// API Module
// ============================================

export const branchesApi = {
    getAll: (params: BranchParams = {}): Promise<AxiosResponse> => {
        return apiHelpers.get(ENDPOINTS.BASE, { params });
    },

    getById: (branchId: number): Promise<AxiosResponse> => {
        return apiHelpers.get(`${ENDPOINTS.BASE}/${branchId}`);
    },

    create: (data: BranchData): Promise<AxiosResponse> => {
        return apiHelpers.post(ENDPOINTS.BASE, data);
    },

    update: (branchId: number, data: Partial<BranchData>): Promise<AxiosResponse> => {
        return apiHelpers.put(`${ENDPOINTS.BASE}/${branchId}`, data);
    },

    delete: (branchId: number): Promise<AxiosResponse> => {
        return apiHelpers.delete(`${ENDPOINTS.BASE}/${branchId}`);
    }
};
