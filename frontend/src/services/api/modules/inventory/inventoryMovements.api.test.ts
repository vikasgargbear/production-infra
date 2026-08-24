/**
 * API contract tests for inventoryMovementsApi
 *
 * These tests enforce:
 * 1. Batch/product movement reads use the canonical /inventory/movements UUID endpoint,
 *    not the legacy /inventory-movements/{int} path.
 * 2. Filters are passed as query params (batch_id, product_id) — never as URL segments.
 */

import { apiHelpers } from '../../apiClient';
import { inventoryMovementsApi } from './inventoryMovements.api';

jest.mock('../../apiClient', () => ({
    apiHelpers: {
        get: jest.fn(),
    },
}));

const CANONICAL_MOVEMENTS_BASE = '/inventory/movements';
const BATCH_UUID = 'b1000000-0000-4000-8000-000000000001';
const PRODUCT_UUID = 'a2000000-0000-4000-8000-000000000002';

describe('inventoryMovementsApi — canonical UUID endpoint contract', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        (apiHelpers.get as jest.Mock).mockResolvedValue({ data: [] });
    });

    it('getAll() calls the canonical /inventory/movements endpoint', async () => {
        await inventoryMovementsApi.getAll();
        expect(apiHelpers.get).toHaveBeenCalledWith(CANONICAL_MOVEMENTS_BASE, expect.anything());
    });

    it('getAll() does NOT call the legacy /inventory-movements integer path', async () => {
        await inventoryMovementsApi.getAll();
        const calledUrl = (apiHelpers.get as jest.Mock).mock.calls[0][0] as string;
        expect(calledUrl).not.toContain('/inventory-movements');
        expect(calledUrl).not.toMatch(/\/inventory-movements\/\d+/);
    });

    it('getByBatch() sends batch_id UUID as a query param, not a URL segment', async () => {
        await inventoryMovementsApi.getByBatch(BATCH_UUID);
        const [url, config] = (apiHelpers.get as jest.Mock).mock.calls[0];
        expect(url).toBe(CANONICAL_MOVEMENTS_BASE);
        expect(config?.params?.batch_id).toBe(BATCH_UUID);
        // Must NOT embed the id in the path (legacy pattern)
        expect(url).not.toContain(BATCH_UUID);
        expect(url).not.toMatch(/\/batch\/\d+/);
    });

    it('getByBatch() does NOT call legacy /inventory-movements/batch/{int}', async () => {
        await inventoryMovementsApi.getByBatch(BATCH_UUID);
        const calledUrl = (apiHelpers.get as jest.Mock).mock.calls[0][0] as string;
        expect(calledUrl).not.toMatch(/inventory-movements\/batch/);
    });

    it('getByProduct() sends product_id UUID as a query param', async () => {
        await inventoryMovementsApi.getByProduct(PRODUCT_UUID);
        const [url, config] = (apiHelpers.get as jest.Mock).mock.calls[0];
        expect(url).toBe(CANONICAL_MOVEMENTS_BASE);
        expect(config?.params?.product_id).toBe(PRODUCT_UUID);
    });

    it('getByBatch() merges additional params with batch_id', async () => {
        await inventoryMovementsApi.getByBatch(BATCH_UUID, { from_date: '2026-01-01', limit: 50 });
        const [, config] = (apiHelpers.get as jest.Mock).mock.calls[0];
        expect(config?.params).toMatchObject({
            batch_id: BATCH_UUID,
            from_date: '2026-01-01',
            limit: 50,
        });
    });
});
