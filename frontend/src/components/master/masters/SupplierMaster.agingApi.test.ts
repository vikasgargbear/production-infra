import { ledgerApi, suppliersApi } from '../../../services/api';
import { loadCanonicalSuppliers } from './SupplierMaster';

jest.mock('jspdf', () => ({ jsPDF: jest.fn() }));
jest.mock('jspdf-autotable', () => ({ autoTable: jest.fn() }));
jest.mock('../../../services/api', () => ({
  suppliersApi: { getAll: jest.fn(), update: jest.fn() },
  ledgerApi: { getCanonicalPartyAging: jest.fn() },
}));

const mockedSuppliersApi = suppliersApi as jest.Mocked<typeof suppliersApi>;
const mockedLedgerApi = ledgerApi as jest.Mocked<typeof ledgerApi>;

beforeEach(() => jest.clearAllMocks());

test('joins supplier rows to canonical supplier aging', async () => {
  mockedSuppliersApi.getAll.mockResolvedValue({
    data: [{ supplier_id: 'supplier-a', supplier_name: 'A' }],
  } as any);
  mockedLedgerApi.getCanonicalPartyAging.mockResolvedValue({
    data: { parties: [{ party_account_id: 'supplier-a', total_outstanding: '9007199254740993.01' }] },
  } as any);

  const response = await loadCanonicalSuppliers();

  expect(mockedLedgerApi.getCanonicalPartyAging).toHaveBeenCalledWith({ party_type: 'supplier' });
  expect(response.data).toEqual([
    expect.objectContaining({ supplier_id: 'supplier-a', current_outstanding: '9007199254740993.01' }),
  ]);
});

test('does not turn an aging failure into a zero payable', async () => {
  mockedSuppliersApi.getAll.mockResolvedValue({
    data: [{ supplier_id: 'supplier-a', supplier_name: 'A' }],
  } as any);
  mockedLedgerApi.getCanonicalPartyAging.mockRejectedValue(new Error('unavailable'));

  const response = await loadCanonicalSuppliers();

  expect(response.data).toEqual([
    expect.objectContaining({ current_outstanding: null, outstanding_available: false }),
  ]);
});
