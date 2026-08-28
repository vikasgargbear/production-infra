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

  it('does not coerce nested canonical sales-import decimals or batch allocations', async () => {
    const importAdapter: AxiosAdapter = async config => ({
      data: {
        total_amount: '212.80',
        items: [{
          quantity: '2.000000',
          free_quantity: '1.000000',
          unit_price: '100.0000',
          mrp: '150.0000',
          discount_percent: '5.000000',
          gst_percent: '12.000000',
          taxable_amount: '190.00',
          cgst_amount: '11.40',
          sgst_amount: '11.40',
          igst_amount: '0.00',
          line_total: '212.80',
          eligible_batches: [{
            mrp: '150.0000',
            available_quantity: '19.000000',
            available_base_quantity: '190.000000',
          }],
          default_batch_allocations: [{
            billed_quantity: '2.000000',
            free_quantity: '1.000000',
            base_billed_quantity: '20.000000',
            base_free_quantity: '10.000000',
          }],
          batch_allocations: [{
            base_quantity: '30.000000',
            billed_quantity: '2.000000',
            free_quantity: '1.000000',
            base_billed_quantity: '20.000000',
            base_free_quantity: '10.000000',
          }],
        }],
      },
      status: 200,
      statusText: 'OK',
      headers: {},
      config,
    });

    const response = await apiHelpers.get('/canonical/challans/challan-id/import-detail', {
      adapter: importAdapter,
      preserveExactDecimals: true,
    });

    const item = response.data.items[0];
    expect(response.data.total_amount).toBe('212.80');
    expect(item).toEqual(expect.objectContaining({
      quantity: '2.000000',
      free_quantity: '1.000000',
      unit_price: '100.0000',
      mrp: '150.0000',
      discount_percent: '5.000000',
      gst_percent: '12.000000',
      taxable_amount: '190.00',
      cgst_amount: '11.40',
      sgst_amount: '11.40',
      igst_amount: '0.00',
      line_total: '212.80',
    }));
    expect(item.eligible_batches[0]).toEqual(expect.objectContaining({
      mrp: '150.0000',
      available_quantity: '19.000000',
      available_base_quantity: '190.000000',
    }));
    expect(item.default_batch_allocations[0]).toEqual(expect.objectContaining({
      billed_quantity: '2.000000',
      free_quantity: '1.000000',
      base_billed_quantity: '20.000000',
      base_free_quantity: '10.000000',
    }));
    expect(item.batch_allocations[0]).toEqual(expect.objectContaining({
      base_quantity: '30.000000',
      billed_quantity: '2.000000',
      free_quantity: '1.000000',
      base_billed_quantity: '20.000000',
      base_free_quantity: '10.000000',
    }));
  });
});
