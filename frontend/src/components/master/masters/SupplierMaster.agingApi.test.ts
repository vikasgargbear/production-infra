import { suppliersApi } from '../../../services/api';
import { loadCanonicalSuppliers } from './SupplierMaster';

jest.mock('jspdf', () => ({ jsPDF: jest.fn() }));
jest.mock('jspdf-autotable', () => ({ autoTable: jest.fn() }));
jest.mock('../../../services/api', () => ({
  suppliersApi: { getAll: jest.fn(), update: jest.fn() },
}));

const mockedSuppliersApi = suppliersApi as jest.Mocked<typeof suppliersApi>;

beforeEach(() => jest.clearAllMocks());

test('uses bounded supplier rows with the payable already projected by the canonical read', async () => {
  mockedSuppliersApi.getAll.mockResolvedValue({
    data: [{
      supplier_id: 'supplier-a', supplier_name: 'A',
      current_outstanding: '9007199254740993.01',
    }],
  } as any);

  const response = await loadCanonicalSuppliers();

  expect(mockedSuppliersApi.getAll).toHaveBeenCalledWith(
    { limit: 100, search: '' }, { signal: undefined },
  );
  expect(response.data).toEqual([
    expect.objectContaining({
      supplier_id: 'supplier-a', current_outstanding: '9007199254740993.01',
      outstanding_available: true,
    }),
  ]);
});
