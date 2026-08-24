import { apiHelpers } from '../../apiClient';
import { stockApi } from './stock.api';

jest.mock('../../apiClient', () => ({
    apiHelpers: {
        get: jest.fn(),
        post: jest.fn(),
    },
}));

describe('canonical stock movement reads', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('uses the canonical movement endpoint for a UUID batch', () => {
        const batchId = '10000000-0000-4000-8000-000000000001';

        stockApi.getBatchMovements(batchId);

        expect(apiHelpers.get).toHaveBeenCalledWith('/inventory/movements', {
            params: { batch_id: batchId },
        });
    });

    it('uses the canonical movement endpoint for a UUID product', () => {
        const productId = '10000000-0000-4000-8000-000000000002';

        stockApi.getProductMovements(productId, { date_from: '2026-08-01' });

        expect(apiHelpers.get).toHaveBeenCalledWith('/inventory/movements', {
            params: { date_from: '2026-08-01', product_id: productId },
        });
    });
});
