import { apiHelpers } from '../../apiClient';
import { paymentsApi } from './payments.api';

jest.mock('../../apiClient', () => ({ apiHelpers: { get: jest.fn() } }));

const item = (amount: unknown = '9007199254740993.01'): any => ({
  payment_id: 'd3000000-0000-7000-8000-000000000001',
  command_request_id: 'd3000000-0000-7000-8000-000000000002',
  payment_number: 'RCPT-1', payment_date: '2026-08-25',
  branch_id: 'd3000000-0000-7000-8000-000000000003',
  party_id: 'd3000000-0000-7000-8000-000000000004', party_name: 'Customer',
  direction: 'received', payment_method: 'upi', external_reference: 'UPI-1',
  amount, allocated_amount: amount, allocation_count: 1,
  journal_entry_id: 'd3000000-0000-7000-8000-000000000005', journal_number: 'JV-1',
  journal_debit_total: amount, journal_credit_total: amount,
  allocation_reconciled: true, journal_balanced: true,
  open_item_residuals_reconciled: true, status: 'posted',
});

beforeEach(() => jest.clearAllMocks());

test('sends canonical filter schema and preserves authoritative total and >2^53 money', async () => {
  (apiHelpers.get as jest.Mock).mockResolvedValue({
    data: { items: [item()], page: 2, page_size: 25, total: 31 },
  });
  const response = await paymentsApi.getCanonicalHistory({
    direction: 'made', date_from: '2026-08-01', date_to: '2026-08-25',
    search: 'Supplier', page: 2, page_size: 25,
  });
  expect(apiHelpers.get).toHaveBeenCalledWith('/canonical/payment-history', {
    params: {
      direction: 'made', date_from: '2026-08-01', date_to: '2026-08-25',
      search: 'Supplier', page: 2, page_size: 25,
    },
    preserveExactDecimals: true,
  });
  expect(response.data.total).toBe(31);
  expect(response.data.items[0].amount).toBe('9007199254740993.01');
});

test('rejects a numeric amount at the canonical response boundary', async () => {
  (apiHelpers.get as jest.Mock).mockResolvedValue({
    data: { items: [item(9007199254740994)], page: 1, page_size: 25, total: 1 },
  });
  await expect(paymentsApi.getCanonicalHistory()).rejects.toThrow('exact decimal string');
});

test('normalizes exact detail allocation, residual, and journal strings', async () => {
  (apiHelpers.get as jest.Mock).mockResolvedValue({ data: {
    ...item('168.00'),
    allocations: [{
      allocation_id: 'd3000000-0000-7000-8000-000000000006',
      open_item_id: 'd3000000-0000-7000-8000-000000000007',
      source_document_id: 'd3000000-0000-7000-8000-000000000008',
      source_document_number: 'SI-1', source_document_type: 'sales_invoice',
      allocation_date: '2026-08-25', amount: '168.00', principal_amount: '200.00',
      effective_allocated_amount: '168.00', residual_amount: '32.00',
    }],
    journal_lines: [{
      journal_line_id: 'd3000000-0000-7000-8000-000000000009', line_number: 1,
      account_id: 'd3000000-0000-7000-8000-000000000010', party_id: null,
      debit: '168.00', credit: '0.00',
    }],
  } });
  const response = await paymentsApi.getCanonicalDetail(item().payment_id);
  expect(apiHelpers.get).toHaveBeenCalledWith(
    `/canonical/payment-history/${item().payment_id}`,
    { preserveExactDecimals: true },
  );
  expect(response.data.allocations[0].residual_amount).toBe('32.00');
  expect(response.data.journal_lines[0].debit).toBe('168.00');
});

test('authoritative payment modules never coerce money through Number APIs', () => {
  const source = require('fs').readFileSync(__filename.replace('.test.ts', '.ts'), 'utf8');
  expect(source).not.toMatch(/\bNumber\s*\(/);
  expect(source).not.toMatch(/parseFloat\s*\(/);
  expect(source).not.toMatch(/\.toFixed\s*\(/);
});
