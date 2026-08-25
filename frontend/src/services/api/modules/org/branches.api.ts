/**
 * Branches API Module
 */

import { rejectCanonicalWrite } from '../../canonicalWritePolicy';
import type { AxiosResponse } from 'axios';
import { apiHelpers } from '../../apiClient';
import { decodeCanonicalBranchList } from '../master/canonicalMasterReads';

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

export const branchesApi = {
    getAll: (): Promise<AxiosResponse> => apiHelpers.get('/branches')
        .then(response => ({ ...response, data: decodeCanonicalBranchList(response.data) })),
    create: (_data: BranchData) => rejectCanonicalWrite('Legacy branch creation'),
    update: (_branchId: number | string, _data: Partial<BranchData>) =>
        rejectCanonicalWrite('Legacy branch editing'),
    delete: (_branchId: number | string) => rejectCanonicalWrite('Legacy branch deletion'),
} as {
    getAll: () => Promise<AxiosResponse>;
    create: (data: BranchData) => Promise<AxiosResponse>;
    update: (branchId: number | string, data: Partial<BranchData>) => Promise<AxiosResponse>;
    delete: (branchId: number | string) => Promise<AxiosResponse>;
};
