import type { AxiosAdapter } from 'axios';

import { apiHelpers } from './apiClient';

const responseAdapter: AxiosAdapter = async config => ({
  data: {
    sale_price_per_unit: '150.00',
    total_amount: '188.16',
    mrp: '199.99',
    quantity_available: '82.000000',
  },
  status: 200,
  statusText: 'OK',
  headers: {},
  config,
});

describe('API exact-decimal response boundary', () => {
  it('preserves canonical decimal strings when the caller requests the exact contract', async () => {
    const response = await apiHelpers.get('/products/product-id/batches', {
      adapter: responseAdapter,
      preserveExactDecimals: true,
    });

    expect(response.data).toEqual({
      sale_price_per_unit: '150.00',
      total_amount: '188.16',
      mrp: '199.99',
      quantity_available: '82.000000',
    });
  });

  it('keeps the existing compatibility adapter for clients that have not migrated', async () => {
    const response = await apiHelpers.get('/legacy-money-model', {
      adapter: responseAdapter,
    });

    expect(response.data).toEqual({
      sale_price_per_unit: 150,
      total_amount: 188.16,
      mrp: 199.99,
      quantity_available: '82.000000',
    });
  });
});
