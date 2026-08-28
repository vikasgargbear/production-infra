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
        const response = { data: { parties: [], summary: { total_outstanding: '0.00' } } };
        get.mockResolvedValueOnce(response);

        await expect(ledgerApi.getCanonicalPartyAging({
            party_type: 'customer',
        })).resolves.toBe(response);

        expect(get).toHaveBeenCalledWith('/canonical/party-aging', {
            params: { party_type: 'customer' },
            preserveExactDecimals: true,
        });
    });
});
