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
                    aging_data: [{ total_outstanding: '9007199254740993.01' }],
                    summary: { total: '9007199254740993.01', overdue: '0.00' },
                },
            })
            .mockResolvedValueOnce({
                data: {
                    aging_data: [{ total_outstanding: '400.00' }],
                    summary: { total: '400.00', overdue: '25.00' },
                },
            });

        const result = await ledgerApi.getDashboardStats();

        expect(result).toEqual({
            total_receivables: '9007199254740993.01',
            total_payables: '400.00',
            net_position: '9007199254740593.01',
            overdue_receivables: '0.00',
            overdue_payables: '25.00',
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
