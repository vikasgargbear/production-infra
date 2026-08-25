import * as publicApi from './index';
import { apiModules } from './index';

describe('public frontend API client boundary', () => {
  it('does not export the retired expense client through either public shape', () => {
    expect(publicApi).not.toHaveProperty('expensesApi');
    expect(apiModules.finance).not.toHaveProperty('expenses');
  });

  it('keeps the supported finance clients explicitly exported', () => {
    expect(Object.keys(apiModules.finance).sort()).toEqual([
      'ledger',
      'paymentAllocation',
      'payments',
    ]);
    expect(publicApi).toEqual(expect.objectContaining({
      ledgerApi: expect.any(Object),
      paymentAllocationApi: expect.any(Object),
      paymentsApi: expect.any(Object),
    }));
  });
});
