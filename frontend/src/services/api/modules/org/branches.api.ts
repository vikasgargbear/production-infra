/**
 * Branches API Module
 */

import { createCrudApi } from '../../utils/createCrudApi';
import { rejectCanonicalWrite } from '../../canonicalWritePolicy';
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

const crud = createCrudApi({ basePath: '/branches', createPath: '/branches/', useCleanData: false });

export const branchesApi = {
    ...crud,
    create: (_data: BranchData) => rejectCanonicalWrite('Legacy branch creation'),
    update: (_branchId: number | string, _data: Partial<BranchData>) =>
        rejectCanonicalWrite('Legacy branch editing'),
    delete: (_branchId: number | string) => rejectCanonicalWrite('Legacy branch deletion'),
} as {
    getAll: (params?: BranchParams) => Promise<AxiosResponse>;
    getById: (branchId: number | string) => Promise<AxiosResponse>;
    create: (data: BranchData) => Promise<AxiosResponse>;
    update: (branchId: number | string, data: Partial<BranchData>) => Promise<AxiosResponse>;
    delete: (branchId: number | string) => Promise<AxiosResponse>;
};
