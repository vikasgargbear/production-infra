import { apiHelpers } from '../../apiClient';
import { canonicalReturnsApi } from './canonicalReturns.api';

jest.mock('../../apiClient', () => ({
  apiHelpers: { get: jest.fn(), post: jest.fn() },
}));

describe('canonical return context transport', () => {
  beforeEach(() => jest.clearAllMocks());

  it.each([
    ['sales', canonicalReturnsApi.getSalesContext, '/canonical/returns/sales-invoices/invoice-id/context'],
    ['purchase', canonicalReturnsApi.getPurchaseContext, '/canonical/returns/supplier-invoices/invoice-id/context'],
  ])('preserves exact decimals for %s return authority', (_kind, getContext, path) => {
    getContext('invoice-id', '2026-08-29');

    expect(apiHelpers.get).toHaveBeenCalledWith(path, {
      params: { return_date: '2026-08-29' },
      preserveExactDecimals: true,
    });
  });
});
