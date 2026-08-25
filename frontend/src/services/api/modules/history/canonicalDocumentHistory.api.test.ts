import { apiHelpers } from '../../apiClient';
import { canonicalDocumentHistoryApi, normalizeCanonicalDocumentHistory } from './canonicalDocumentHistory.api';

jest.mock('../../apiClient', () => ({ apiHelpers: { get: jest.fn() } }));
const get = apiHelpers.get as jest.Mock;

const row = {
  document_kind: 'sales_invoice',
  document_id: 'd3000000-0000-7000-8000-000000000001',
  branch_id: 'd3000000-0000-7000-8000-000000000002',
  document_number: 'SI-EXACT-1', document_date: '2026-08-25', due_date: null,
  status: 'posted', party_account_id: 'd3000000-0000-7000-8000-000000000003', party_name: 'Exact Customer',
  source_document_type: null, source_document_id: null, source_document_number: null, line_count: 1,
  total_quantity: '0.123456', minimum_unit_rate: '9007199254740993.0000', maximum_unit_rate: '9007199254740993.0000',
  taxable_amount: '9007199254740993.10', total_tax: '0.20', total_amount: '9007199254740993.30',
  paid_amount: '0.10', outstanding_amount: '9007199254740993.20', payment_status: 'partial',
  created_at: '2026-08-25T00:00:00Z', updated_at: '2026-08-25T00:00:00Z',
};
const business_date = '2026-08-25';

beforeEach(() => get.mockReset());

it('preserves exact six-place quantities and money beyond Number safe range', () => {
  const value = normalizeCanonicalDocumentHistory({ items: [row], business_date, page: 1, page_size: 25, total: 1 });
  expect(value.items[0].total_amount).toBe('9007199254740993.30');
  expect(value.items[0].total_quantity).toBe('0.123456');
});

it.each(['total_amount', 'taxable_amount', 'total_tax', 'paid_amount', 'outstanding_amount'])
('rejects numeric JSON for authoritative %s', field => {
  expect(() => normalizeCanonicalDocumentHistory({
    items: [{ ...row, [field]: 0.3 }], business_date, page: 1, page_size: 25, total: 1,
  })).toThrow(/exact decimal string/i);
});

it('rejects overprecision and inconsistent pagination', () => {
  expect(() => normalizeCanonicalDocumentHistory({
    items: [{ ...row, total_quantity: '1.0000001' }], business_date, page: 1, page_size: 25, total: 1,
  })).toThrow(/precision/i);
  expect(() => normalizeCanonicalDocumentHistory({ items: [row], business_date, page: 1, page_size: 25, total: 0 }))
    .toThrow(/pagination/i);
  expect(() => normalizeCanonicalDocumentHistory({
    items: [{ ...row, source_document_type: 'sales_dispatch',
      source_document_id: 'd3000000-0000-7000-8000-000000000004' }],
    business_date, page: 1, page_size: 25, total: 1,
  })).toThrow(/provenance/i);
});

it.each([
  ['document_number', '   '],
  ['party_name', ''],
  ['status', '  '],
])('rejects blank canonical identity field %s', (field, value) => {
  expect(() => normalizeCanonicalDocumentHistory({
    items: [{ ...row, [field]: value }], business_date, page: 1, page_size: 25, total: 1,
  })).toThrow(/must not be empty/i);
});

it('keeps non-settlement and dispatch monetary semantics explicit', () => {
  const dispatch = {
    ...row,
    document_kind: 'sales_dispatch',
    taxable_amount: null,
    total_tax: null,
    total_amount: null,
    paid_amount: null,
    outstanding_amount: null,
    payment_status: null,
  };
  expect(normalizeCanonicalDocumentHistory({ items: [dispatch], business_date, page: 1, page_size: 25, total: 1 })
    .items[0].total_amount).toBeNull();
  expect(() => normalizeCanonicalDocumentHistory({
    items: [{ ...dispatch, total_amount: '168.00' }], business_date, page: 1, page_size: 25, total: 1,
  })).toThrow(/must not invent/i);
  expect(() => normalizeCanonicalDocumentHistory({
    items: [{ ...dispatch, outstanding_amount: '168.00' }], business_date, page: 1, page_size: 25, total: 1,
  })).toThrow(/settlement semantics/i);
});

it('sends all server-side filters and returns the strict response', async () => {
  get.mockResolvedValue({ data: { items: [row], business_date, page: 2, page_size: 1, total: 3 } });
  await canonicalDocumentHistoryApi.get({
    document_kind: 'sales_invoice', search: 'Exact', status: 'posted',
    date_from: '2026-08-01', date_to: '2026-08-31', page: 2, page_size: 1,
  });
  expect(get).toHaveBeenCalledWith('/canonical/document-history', { params: {
    document_kind: 'sales_invoice', search: 'Exact', status: 'posted',
    date_from: '2026-08-01', date_to: '2026-08-31', page: 2, page_size: 1,
  } });
});

it('requires one bounded kind or the returns-only group', async () => {
  await expect(canonicalDocumentHistoryApi.get({ page: 1 })).rejects.toThrow(/exactly one/i);
  await expect(canonicalDocumentHistoryApi.get({
    document_kind: 'sales_return', document_group: 'returns',
  })).rejects.toThrow(/exactly one/i);
});
