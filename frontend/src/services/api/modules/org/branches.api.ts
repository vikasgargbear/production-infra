/**
 * Branches API Module
 */

import { createCrudApi } from '../../utils/createCrudApi';
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
// API Module
// ============================================

const crud = createCrudApi({ basePath: '/branches', useCleanData: false });

export const branchesApi = {
    ...crud,
} as {
    getAll: (params?: BranchParams) => Promise<AxiosResponse>;
    getById: (branchId: number | string) => Promise<AxiosResponse>;
    create: (data: BranchData) => Promise<AxiosResponse>;
    update: (branchId: number | string, data: Partial<BranchData>) => Promise<AxiosResponse>;
    delete: (branchId: number | string) => Promise<AxiosResponse>;
};
