/**
 * Departments API Module
 */

import { createCrudApi } from '../../utils/createCrudApi';
import { rejectCanonicalWrite } from '../../canonicalWritePolicy';
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
    create: (_data: DepartmentData) => rejectCanonicalWrite('Legacy department creation'),
    update: (_departmentId: number | string, _data: Partial<DepartmentData>) =>
        rejectCanonicalWrite('Legacy department editing'),
    delete: (_departmentId: number | string) => rejectCanonicalWrite('Legacy department deletion'),
} as {
    getAll: (params?: DepartmentParams) => Promise<AxiosResponse>;
    getById: (departmentId: number | string) => Promise<AxiosResponse>;
    create: (data: DepartmentData) => Promise<AxiosResponse>;
    update: (departmentId: number | string, data: Partial<DepartmentData>) => Promise<AxiosResponse>;
    delete: (departmentId: number | string) => Promise<AxiosResponse>;
};
