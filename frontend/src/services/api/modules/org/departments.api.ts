/**
 * Departments API Module
 */

import { createCrudApi } from '../../utils/createCrudApi';
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
// API Module
// ============================================

const crud = createCrudApi({ basePath: '/departments', useCleanData: false });

export const departmentsApi = {
    ...crud,
} as {
    getAll: (params?: DepartmentParams) => Promise<AxiosResponse>;
    getById: (departmentId: number | string) => Promise<AxiosResponse>;
    create: (data: DepartmentData) => Promise<AxiosResponse>;
    update: (departmentId: number | string, data: Partial<DepartmentData>) => Promise<AxiosResponse>;
    delete: (departmentId: number | string) => Promise<AxiosResponse>;
};
