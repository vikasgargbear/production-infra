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
    getAgingReport: jest.fn(),
  },
}));

const mockedCustomersApi = customersApi as jest.Mocked<typeof customersApi>;
const mockedLedgerApi = ledgerApi as jest.Mocked<typeof ledgerApi>;

beforeEach(() => jest.clearAllMocks());

test('joins customer rows to the canonical customer aging endpoint', async () => {
  mockedCustomersApi.getAll.mockResolvedValue({
    data: [{ customer_id: 'customer-a', customer_name: 'A' }],
  } as any);
  mockedLedgerApi.getAgingReport.mockResolvedValue({
    data: { aging_data: [{ customer_id: 'customer-a', total_outstanding: 1563.99 }] },
  } as any);

  const response = await loadCustomersWithCanonicalAging();

  expect(mockedLedgerApi.getAgingReport).toHaveBeenCalledWith({ party_type: 'customer' });
  expect(response.data).toEqual([
    expect.objectContaining({ customer_id: 'customer-a', current_outstanding: 1563.99 }),
  ]);
});

test('does not turn an aging API failure into a zero balance', async () => {
  mockedCustomersApi.getAll.mockResolvedValue({
    data: [{ customer_id: 'customer-a', customer_name: 'A' }],
  } as any);
  mockedLedgerApi.getAgingReport.mockRejectedValue(new Error('unavailable'));

  const response = await loadCustomersWithCanonicalAging();

  expect(response.data).toEqual([
    expect.objectContaining({ current_outstanding: null, outstanding_available: false }),
  ]);
});
