import { apiHelpers } from '../api/apiClient';
import { challansApi } from '../api/modules/sales/challans.api';
import { ordersApi } from '../api/modules/sales/orders.api';
import { purchasesApi } from '../api/modules/purchase/purchases.api';
import { grnApi } from '../api/modules/purchase/grn.api';
import { supplierInvoicesApi } from '../api/modules/purchase/supplierInvoices.api';
import { conversionsApi } from '../api/modules/inventory/conversions.api';
import { taxEntriesApi } from '../api/modules/compliance/taxEntries.api';
import { employeesApi } from '../api/modules/master/employees.api';
import { documentsApi } from '../api/modules/system/documents.api';
import settingsApi from '../api/modules/settings/settings.api';
import organizationsApi from '../api/modules/org/organizations.api';
import { setupApi } from '../api/modules/settings/setup.api';
import { metadataApi } from '../api/modules/settings/metadata.api';
import utilsApi from '../api/modules/settings/utils.api';
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
    ['supplier invoice', () => supplierInvoicesApi.create({} as any)],
    ['unit conversion', () => conversionsApi.create({} as any)],
    ['tax entry', () => taxEntriesApi.create({})],
    ['employee', () => employeesApi.create({})],
    ['document-number reservation', () => documentsApi.reserveNumber('INV')],
    ['stock settings update', () => settingsApi.updateStock({ allow_negative_stock: false })],
    ['organization creation', () => organizationsApi.create({ org_name: 'Legacy' })],
    ['legacy setup', () => setupApi.completeSetup()],
    ['metadata creation', () => metadataApi.createProductCategory({ category_name: 'Legacy' })],
    ['utility messaging', () => utilsApi.sendWhatsApp('9999999999', 'Legacy')],
    ['feature flag update', () => updateFeatureFlag('offline_mode', true)],
    ['generic CRUD mutation', () => createCrudApi({ basePath: '/legacy' }).create({})],
  ])('%s rejects without an HTTP mutation', async (_label, action) => {
    await expect(action()).rejects.toMatchObject(unavailable);
    expect(apiHelpers.post).not.toHaveBeenCalled();
    expect(apiHelpers.put).not.toHaveBeenCalled();
    expect(apiHelpers.patch).not.toHaveBeenCalled();
    expect(apiHelpers.delete).not.toHaveBeenCalled();
  });

  it('keeps explicitly safe calculation and upload-parse transports', () => {
    taxEntriesApi.calculate({ taxable_amount: '100.00', gst_rate: '18' });
    purchasesApi.parseInvoice(new FormData());

    expect(apiHelpers.post).toHaveBeenNthCalledWith(1, '/tax-entries/calculate', {
      taxable_amount: '100.00', gst_rate: '18',
    });
    expect(apiHelpers.post).toHaveBeenNthCalledWith(
      2, '/purchase-upload/parse-invoice-safe', expect.any(FormData),
    );
  });
});
