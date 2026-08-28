import { apiHelpers } from '../../apiClient';
import { canonicalInventoryReadsApi } from './canonicalInventoryReads.api';

jest.mock('../../apiClient', () => ({ apiHelpers: { get: jest.fn() } }));

describe('canonical inventory reads', () => {
  beforeEach(() => jest.clearAllMocks());

  it('preserves exact decimals for inventory context', async () => {
    const response = { data: {} };
    (apiHelpers.get as jest.Mock).mockResolvedValueOnce(response);

    await expect(canonicalInventoryReadsApi.context()).resolves.toBe(response);

    expect(apiHelpers.get).toHaveBeenCalledWith('/canonical/inventory/context', {
      preserveExactDecimals: true,
    });
  });

  test.each([
    ['currentStock', '/canonical/inventory/current-stock'],
    ['batches', '/canonical/inventory/batches'],
    ['movements', '/canonical/inventory/movements'],
  ] as const)('%s preserves exact inventory decimals', async (method, route) => {
    const response = { data: {} };
    (apiHelpers.get as jest.Mock).mockResolvedValueOnce(response);
    const params = { branch_id: 'd3000000-0000-7000-8000-000000000005', limit: 200 };

    await expect(canonicalInventoryReadsApi[method](params)).resolves.toBe(response);

    expect(apiHelpers.get).toHaveBeenCalledWith(route, {
      params,
      preserveExactDecimals: true,
    });
  });
});
