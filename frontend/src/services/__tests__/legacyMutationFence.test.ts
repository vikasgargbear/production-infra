import { apiHelpers } from '../api/apiClient';
import { challansApi } from '../api/modules/sales/challans.api';
import { ordersApi } from '../api/modules/sales/orders.api';
import { returnsApi } from '../api/modules/sales/returns.api';
import { purchasesApi } from '../api/modules/purchase/purchases.api';
import { grnApi } from '../api/modules/purchase/grn.api';
import { supplierInvoicesApi } from '../api/modules/purchase/supplierInvoices.api';
import { batchesApi } from '../api/modules/inventory/batches.api';
import { conversionsApi } from '../api/modules/inventory/conversions.api';
import { taxEntriesApi } from '../api/modules/compliance/taxEntries.api';
import { complianceApi } from '../api/modules/compliance/compliance.api';
import { employeesApi } from '../api/modules/master/employees.api';
import { departmentsApi } from '../api/modules/org/departments.api';
import { documentsApi } from '../api/modules/system/documents.api';
import { collectionCenterApi } from '../api/modules/analytics/collectionCenter.api';
import settingsApi from '../api/modules/settings/settings.api';

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
    ['sales return', () => returnsApi.createSaleReturn({})],
    ['purchase return', () => returnsApi.createPurchaseReturn({})],
    ['purchase order', () => purchasesApi.create({} as any)],
    ['goods receipt', () => grnApi.create({} as any)],
    ['supplier invoice', () => supplierInvoicesApi.create({} as any)],
    ['inventory batch', () => batchesApi.create({} as any)],
    ['unit conversion', () => conversionsApi.create({} as any)],
    ['tax entry', () => taxEntriesApi.create({})],
    ['drug license', () => complianceApi.updateDrugLicense({})],
    ['employee', () => employeesApi.create({})],
    ['department', () => departmentsApi.create({ department_name: 'Legacy' })],
    ['document-number reservation', () => documentsApi.reserveNumber('INV')],
    ['collection payment recording', () => collectionCenterApi.markCollected(1, 100)],
    ['stock settings update', () => settingsApi.updateStock({ allow_negative_stock: false })],
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
