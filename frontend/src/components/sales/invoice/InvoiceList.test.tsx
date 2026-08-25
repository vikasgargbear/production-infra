import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import InvoiceList from './InvoiceList';
import { canonicalDocumentHistoryApi } from '../../../services/api';

jest.mock('../../../services/api', () => ({
  canonicalDocumentHistoryApi: { get: jest.fn() },
}));

jest.mock('../../global', () => ({
  ModuleHeader: () => <div />,
  Pagination: () => <div />,
  InlineFilterPanel: ({ searchQuery, onSearchChange }: any) => (
    <input
      aria-label="history search"
      value={searchQuery}
      onChange={event => onSearchChange?.(event.target.value)}
    />
  ),
}));

jest.mock('./invoicelist/components/InvoiceBulkActions', () => ({
  InvoiceBulkActions: () => <div />,
}));

jest.mock('./invoicelist/components/InvoiceTable', () => ({
  InvoiceTable: ({ invoices }: any) => (
    <div>{invoices.map((invoice: any) => invoice.invoice_number).join(',')}</div>
  ),
}));

const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
};

const response = (number: string) => ({
  total: 1, page: 1, page_size: 25,
  items: [{
    document_kind: 'sales_invoice',
    document_id: `11111111-1111-7111-8111-${number === 'NEW' ? '111111111111' : '222222222222'}`,
    branch_id: '11111111-1111-7111-8111-333333333333', document_number: number,
    document_date: '2026-08-24', due_date: null, status: 'posted',
    party_account_id: '33333333-3333-7333-8333-333333333333', party_name: 'Demo Customer',
    source_document_type: null, source_document_id: null, source_document_number: null, line_count: 1,
    total_quantity: '1.000000', minimum_unit_rate: '100.0000', maximum_unit_rate: '100.0000',
    taxable_amount: '100.00', total_tax: '0.00', total_amount: '100.00',
    paid_amount: '0.00', outstanding_amount: '100.00', payment_status: 'pending',
    created_at: '2026-08-24T00:00:00Z', updated_at: '2026-08-24T00:00:00Z',
  }],
});

test('cancels pending debounce work and ignores an older in-flight response', async () => {
  jest.useFakeTimers();
  const oldRequest = deferred<any>();
  const newRequest = deferred<any>();
  (canonicalDocumentHistoryApi.get as jest.Mock)
    .mockResolvedValueOnce({ items: [], total: 0, page: 1, page_size: 25 })
    .mockReturnValueOnce(oldRequest.promise)
    .mockReturnValueOnce(newRequest.promise);

  render(<InvoiceList />);
  await act(async () => undefined);

  fireEvent.change(screen.getByLabelText('history search'), { target: { value: 'old' } });
  await act(async () => { jest.advanceTimersByTime(500); });
  fireEvent.change(screen.getByLabelText('history search'), { target: { value: 'new' } });
  await act(async () => { jest.advanceTimersByTime(500); });

  await act(async () => { newRequest.resolve(response('NEW')); });
  expect(screen.getByText('NEW')).toBeTruthy();

  await act(async () => { oldRequest.resolve(response('OLD')); });
  expect(screen.getByText('NEW')).toBeTruthy();
  expect(screen.queryByText('OLD')).toBeNull();
  expect(canonicalDocumentHistoryApi.get).toHaveBeenLastCalledWith(expect.objectContaining({ search: 'new' }));

  jest.useRealTimers();
});
