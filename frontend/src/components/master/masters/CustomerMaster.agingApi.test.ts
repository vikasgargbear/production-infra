import { customersApi, ledgerApi } from '../../../services/api';
import { loadCustomersWithCanonicalAging } from './CustomerMaster';

jest.mock('jspdf', () => ({ jsPDF: jest.fn() }));
jest.mock('jspdf-autotable', () => ({ autoTable: jest.fn() }));
jest.mock('../../../services/api', () => ({
  customersApi: {
    getAll: jest.fn(),
    update: jest.fn(),
  },
  ledgerApi: {
    getCanonicalPartyAging: jest.fn(),
  },
}));

const mockedCustomersApi = customersApi as jest.Mocked<typeof customersApi>;
const mockedLedgerApi = ledgerApi as jest.Mocked<typeof ledgerApi>;

beforeEach(() => jest.clearAllMocks());

test('joins customer rows to the canonical customer aging endpoint', async () => {
  mockedCustomersApi.getAll.mockResolvedValue({
    data: [{ customer_id: 'customer-a', customer_name: 'A' }],
  } as any);
  mockedLedgerApi.getCanonicalPartyAging.mockResolvedValue({
    data: { parties: [{ party_account_id: 'customer-a', total_outstanding: '9007199254740993.01' }] },
  } as any);

  const response = await loadCustomersWithCanonicalAging();

  expect(mockedLedgerApi.getCanonicalPartyAging).toHaveBeenCalledWith({ party_type: 'customer' });
  expect(response.data).toEqual([
    expect.objectContaining({ customer_id: 'customer-a', current_outstanding: '9007199254740993.01' }),
  ]);
});

test('does not turn an aging API failure into a zero balance', async () => {
  mockedCustomersApi.getAll.mockResolvedValue({
    data: [{ customer_id: 'customer-a', customer_name: 'A' }],
  } as any);
  mockedLedgerApi.getCanonicalPartyAging.mockRejectedValue(new Error('unavailable'));

  const response = await loadCustomersWithCanonicalAging();

  expect(response.data).toEqual([
    expect.objectContaining({ current_outstanding: null, outstanding_available: false }),
  ]);
});
