import { act, renderHook, waitFor } from '@testing-library/react';

import { branchesApi } from '../../../../services/api';
import { canonicalBusinessContextApi } from '../../../../services/api/modules/org/canonicalBusinessContext.api';
import { usePurchaseOrderLogic } from './usePurchaseOrderLogic';

jest.mock('../../../../contexts/AuthContext', () => ({
    useAuth: () => ({
        user: {
            user_id: 'd3000000-0000-7000-8000-000000000001',
            org_id: 'd3000000-0000-7000-8000-000000000002',
            email: 'operator@example.invalid',
            role_id: null,
            permissions: {},
        },
        isOnline: true,
    }),
}));
jest.mock('../../../../services/api', () => ({
    branchesApi: { getAll: jest.fn() },
}));
jest.mock('../../../../services/api/modules/org/canonicalBusinessContext.api', () => ({
    canonicalBusinessContextApi: { get: jest.fn() },
}));
jest.mock('./usePurchaseOrderSave', () => ({
    usePurchaseOrderSave: () => ({
        saving: false,
        preparingReview: false,
        canonicalReview: null,
        executedResourceId: null,
        prepareForReview: jest.fn(),
        handleSavePurchaseOrder: jest.fn(),
    }),
}));
jest.mock('react-toastify', () => ({
    toast: { error: jest.fn() },
}));

const BRANCH_ID = 'd3000000-0000-7000-8000-000000000005';

describe('purchase-order branch authority', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        (branchesApi.getAll as jest.Mock).mockResolvedValue({ data: { branches: [{
            branch_id: BRANCH_ID,
            branch_code: 'MAIN',
            branch_name: 'Main branch',
            is_active: true,
        }] } });
        (canonicalBusinessContextApi.get as jest.Mock).mockResolvedValue({
            business_date: '2026-08-27',
            document_policy: null,
        });
    });

    it('requires an explicit branch for an organization-scoped session', async () => {
        const { result } = renderHook(() => usePurchaseOrderLogic({ onClose: jest.fn() }));

        await waitFor(() => expect(result.current.branches).toEqual([{
            branch_id: BRANCH_ID,
            branch_code: 'MAIN',
            branch_name: 'Main branch',
        }]));
        expect(result.current.branchId).toBe('');
        expect(result.current.purchaseOrderValidationError).toBe(
            'Purchase-order branch is missing its canonical UUID. Re-select it and try again.',
        );

        act(() => result.current.setBranchId(BRANCH_ID));

        expect(result.current.purchaseOrderValidationError).toBe(
            'Supplier is missing its canonical UUID. Re-select it and try again.',
        );
    });
});
