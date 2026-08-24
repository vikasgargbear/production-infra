import { apiHelpers } from '../../apiClient';
import { ledgerApi } from './ledger.api';

jest.mock('../../apiClient', () => ({
    apiHelpers: {
        get: jest.fn(),
        post: jest.fn(),
    },
}));

describe('canonical ledger dashboard projection', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('returns complete, non-invented dashboard fields', async () => {
        const get = apiHelpers.get as jest.Mock;
        get
            .mockResolvedValueOnce({
                data: {
                    aging_data: [{ total_outstanding: 1563.99 }],
                    summary: { overdue: 0 },
                },
            })
            .mockResolvedValueOnce({
                data: {
                    aging_data: [{ total_outstanding: 400 }],
                    summary: { overdue: 25 },
                },
            });

        const result = await ledgerApi.getDashboardStats();

        expect(result).toEqual({
            total_receivables: 1563.99,
            total_payables: 400,
            net_position: 1163.99,
            overdue_receivables: 0,
            overdue_payables: 25,
            collection_efficiency: null,
            payment_efficiency: null,
            cash_flow_trend: 'neutral',
        });
        expect(get).toHaveBeenNthCalledWith(1, '/ledger/aging', {
            params: { party_type: 'customer' },
        });
        expect(get).toHaveBeenNthCalledWith(2, '/ledger/aging', {
            params: { party_type: 'supplier' },
        });
    });
});
