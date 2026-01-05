/**
 * Departments API Module
 */

import { apiHelpers } from '../../apiClient';
import type { AxiosResponse } from 'axios';

// ============================================
// Type Definitions
// ============================================

export interface DepartmentParams {
    is_active?: boolean;
    limit?: number;
    offset?: number;
}

export interface DepartmentData {
    department_name: string;
    department_code?: string;
    description?: string;
    is_active?: boolean;
}

// ============================================
// Endpoints
// ============================================

const ENDPOINTS = {
    BASE: '/departments'
} as const;

// ============================================
// API Module
// ============================================

export const departmentsApi = {
    getAll: (params: DepartmentParams = {}): Promise<AxiosResponse> => {
        return apiHelpers.get(ENDPOINTS.BASE, { params });
    },

    getById: (departmentId: number): Promise<AxiosResponse> => {
        return apiHelpers.get(`${ENDPOINTS.BASE}/${departmentId}`);
    },

    create: (data: DepartmentData): Promise<AxiosResponse> => {
        return apiHelpers.post(ENDPOINTS.BASE, data);
    },

    update: (departmentId: number, data: Partial<DepartmentData>): Promise<AxiosResponse> => {
        return apiHelpers.put(`${ENDPOINTS.BASE}/${departmentId}`, data);
    },

    delete: (departmentId: number): Promise<AxiosResponse> => {
        return apiHelpers.delete(`${ENDPOINTS.BASE}/${departmentId}`);
    }
};
