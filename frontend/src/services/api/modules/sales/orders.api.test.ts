import { apiHelpers } from '../../apiClient';
import { ordersApi } from './orders.api';

jest.mock('../../apiClient', () => ({
  apiHelpers: {
    get: jest.fn(),
  },
}));

describe('canonical sales-order read transport', () => {
  it('preserves exact decimals in the authoritative invoice-import detail', async () => {
    (apiHelpers.get as jest.Mock).mockResolvedValue({ data: {} });

    ordersApi.getById('10000000-0000-7000-8000-000000000001', '2026-08-29');

    expect(apiHelpers.get).toHaveBeenCalledWith(
      '/canonical/sales-orders/10000000-0000-7000-8000-000000000001/import-detail',
      {
        params: { dispatch_date: '2026-08-29' },
        preserveExactDecimals: true,
      },
    );
  });

  it('preserves exact decimals in the authoritative acceptance readback', async () => {
    (apiHelpers.get as jest.Mock).mockResolvedValue({ data: {} });

    await ordersApi.getCanonical('10000000-0000-7000-8000-000000000001');

    expect(apiHelpers.get).toHaveBeenCalledWith(
      '/canonical/sales-orders/10000000-0000-7000-8000-000000000001/acceptance-readback',
      { preserveExactDecimals: true },
    );
  });
});
