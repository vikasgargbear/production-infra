import { apiHelpers } from '../../apiClient';
import { ledgerApi } from './ledger.api';

jest.mock('../../apiClient', () => ({
    apiHelpers: {
        get: jest.fn(),
        post: jest.fn(),
    },
}));

describe('canonical ledger reads', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('requests authoritative aging without synthesizing dashboard facts', async () => {
        const get = apiHelpers.get as jest.Mock;
        const response = { data: { aging_data: [], summary: { total: '0.00' } } };
        get.mockResolvedValueOnce(response);

        await expect(ledgerApi.getAging({
            party_type: 'customer',
            as_of_date: '2026-08-25',
        })).resolves.toBe(response);

        expect(get).toHaveBeenCalledWith('/ledger/aging', {
            params: { party_type: 'customer', as_of_date: '2026-08-25' },
        });
    });
});
