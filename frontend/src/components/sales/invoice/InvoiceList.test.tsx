import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import InvoiceList from './InvoiceList';
import { invoicesApi } from '../../../services/api';

jest.mock('../../../services/api', () => ({
  invoicesApi: { getAll: jest.fn() },
  challansApi: { getAll: jest.fn() },
  ordersApi: { getAll: jest.fn() },
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
  data: {
    total: 1,
    invoices: [{
      invoice_id: `11111111-1111-7111-8111-${number === 'NEW' ? '111111111111' : '222222222222'}`,
      invoice_number: number,
      invoice_date: '2026-08-24',
      customer_id: '33333333-3333-7333-8333-333333333333',
      customer_name: 'Demo Customer',
      total_amount: 100,
      payment_status: 'pending',
    }],
  },
});

test('cancels pending debounce work and ignores an older in-flight response', async () => {
  jest.useFakeTimers();
  const oldRequest = deferred<any>();
  const newRequest = deferred<any>();
  (invoicesApi.getAll as jest.Mock)
    .mockResolvedValueOnce({ data: { invoices: [], total: 0 } })
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
  expect(invoicesApi.getAll).toHaveBeenLastCalledWith(expect.objectContaining({ search: 'new' }));

  jest.useRealTimers();
});
