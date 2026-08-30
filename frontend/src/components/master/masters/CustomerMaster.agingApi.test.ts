import { customersApi } from '../../../services/api';
import { loadCustomersWithCanonicalAging } from './CustomerMaster';

jest.mock('jspdf', () => ({ jsPDF: jest.fn() }));
jest.mock('jspdf-autotable', () => ({ autoTable: jest.fn() }));
jest.mock('../../../services/api', () => ({
  customersApi: {
    getAll: jest.fn(),
    update: jest.fn(),
  },
}));

const mockedCustomersApi = customersApi as jest.Mocked<typeof customersApi>;

beforeEach(() => jest.clearAllMocks());

test('uses bounded customer rows with the outstanding already projected by the canonical read', async () => {
  mockedCustomersApi.getAll.mockResolvedValue({
    data: { customers: [{
        customer_id: 'customer-a', customer_name: 'A',
        current_outstanding: '9007199254740993.01',
      }], total: 460 },
  } as any);

  const response = await loadCustomersWithCanonicalAging();

  expect(mockedCustomersApi.getAll).toHaveBeenCalledWith(
    { limit: 100, search: '' }, { signal: undefined },
  );
  expect(response.data).toEqual({
    customers: [expect.objectContaining({
      customer_id: 'customer-a', current_outstanding: '9007199254740993.01',
      outstanding_available: true,
    })],
    total: 460,
  });
});
