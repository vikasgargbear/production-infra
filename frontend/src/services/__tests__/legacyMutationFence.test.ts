import { apiHelpers } from '../api/apiClient';
import { challansApi } from '../api/modules/sales/challans.api';
import { ordersApi } from '../api/modules/sales/orders.api';
import { purchasesApi } from '../api/modules/purchase/purchases.api';
import { grnApi } from '../api/modules/purchase/grn.api';
import { employeesApi } from '../api/modules/master/employees.api';
import settingsApi from '../api/modules/settings/settings.api';
import { createCrudApi } from '../api/utils/createCrudApi';
import { updateFeatureFlag } from '../../hooks/useFeatureFlags';

jest.mock('../api/apiClient', () => ({
  apiHelpers: {
    get: jest.fn(), post: jest.fn(), put: jest.fn(), patch: jest.fn(), delete: jest.fn(),
  },
}));

const unavailable = { code: 'CANONICAL_WRITE_UNAVAILABLE' };

describe('legacy mutation adapters fail before transport', () => {
  beforeEach(() => jest.clearAllMocks());

  it.each([
    ['sales order', () => ordersApi.approve('legacy-1')],
    ['delivery challan', () => challansApi.createFromOrder('legacy-1', {})],
    ['purchase order', () => purchasesApi.create({} as any)],
    ['goods receipt', () => grnApi.create({} as any)],
    ['employee', () => employeesApi.create({})],
    ['stock settings update', () => settingsApi.updateStock({ allow_negative_stock: false })],
    ['feature flag update', () => updateFeatureFlag('offline_mode', true)],
    ['generic CRUD mutation', () => createCrudApi({ basePath: '/legacy' }).create({})],
  ])('%s rejects without an HTTP mutation', async (_label, action) => {
    await expect(action()).rejects.toMatchObject(unavailable);
    expect(apiHelpers.post).not.toHaveBeenCalled();
    expect(apiHelpers.put).not.toHaveBeenCalled();
    expect(apiHelpers.patch).not.toHaveBeenCalled();
    expect(apiHelpers.delete).not.toHaveBeenCalled();
  });

  it('keeps the explicitly safe upload-parse transport', () => {
    purchasesApi.parseInvoice(new FormData());

    expect(apiHelpers.post).toHaveBeenCalledWith(
      '/purchase-upload/parse-invoice-safe', expect.any(FormData),
    );
  });
});
