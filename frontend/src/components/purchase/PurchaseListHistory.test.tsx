import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import PurchaseListHistory from './PurchaseListHistory';
import { canonicalDocumentHistoryApi } from '../../services/api';

jest.mock('../../services/api', () => ({
  canonicalDocumentHistoryApi: { get: jest.fn() },
  requireCanonicalHistoryAmount: (value: string) => value,
}));

jest.mock('../global', () => ({
  Button: ({ children, ...props }: any) => <button {...props}>{children}</button>,
  StatusBadge: () => <span />,
  DataTable: ({ columns, data }: any) => <div>{data.map((row: any) => (
    <span key={row.id}>
      {row.po_number}
      {columns.find((column: any) => column.key === 'actions')?.render(undefined, row)}
    </span>
  ))}</div>,
  Pagination: () => <div />,
  ModuleHeader: () => <div />,
  InlineFilterPanel: ({ searchQuery, onSearchChange }: any) => (
    <input aria-label="purchase history search" value={searchQuery}
      onChange={event => onSearchChange?.(event.target.value)} />
  ),
}));

const deferred = <T,>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => { resolve = done; });
  return { promise, resolve };
};

const response = (number: string) => ({
  total: 1, page: 1, page_size: 25, business_date: '2026-08-25',
  items: [{
    document_kind: 'supplier_invoice',
    document_id: `11111111-1111-7111-8111-${number === 'NEW' ? '111111111111' : '222222222222'}`,
    branch_id: '11111111-1111-7111-8111-333333333333', document_number: number,
    document_date: '2026-08-24', due_date: null, status: 'posted',
    party_account_id: '33333333-3333-7333-8333-333333333333', party_name: 'Demo Supplier',
    source_document_type: null, source_document_id: null, source_document_number: null, line_count: 1,
    total_quantity: '1.000000', minimum_unit_rate: '100.0000', maximum_unit_rate: '100.0000',
    taxable_amount: '100.00', total_tax: '0.00', total_amount: '100.00',
    paid_amount: '0.00', outstanding_amount: '100.00', payment_status: 'pending',
    created_at: '2026-08-24T00:00:00Z', updated_at: '2026-08-24T00:00:00Z',
  }],
});

test('debounces deterministically and ignores an older purchase search response', async () => {
  jest.useFakeTimers();
  const oldRequest = deferred<any>();
  const newRequest = deferred<any>();
  (canonicalDocumentHistoryApi.get as jest.Mock)
    .mockResolvedValueOnce({ items: [], total: 0, page: 1, page_size: 25, business_date: '2026-08-25' })
    .mockReturnValueOnce(oldRequest.promise)
    .mockReturnValueOnce(newRequest.promise);

  render(<PurchaseListHistory />);
  await act(async () => undefined);

  fireEvent.change(screen.getByLabelText('purchase history search'), { target: { value: 'old' } });
  await act(async () => { jest.advanceTimersByTime(500); });
  fireEvent.change(screen.getByLabelText('purchase history search'), { target: { value: 'new' } });
  await act(async () => { oldRequest.resolve(response('OLD')); });
  expect(screen.queryByText('OLD')).toBeNull();
  await act(async () => { jest.advanceTimersByTime(500); });

  await act(async () => { newRequest.resolve(response('NEW')); });
  expect(screen.getByText('NEW')).toBeTruthy();
  expect(canonicalDocumentHistoryApi.get).toHaveBeenLastCalledWith(expect.objectContaining({ search: 'new' }));
  jest.useRealTimers();
});

test('offers receipt navigation for the exact approved canonical purchase order', async () => {
  const purchaseOrderId = '11111111-1111-7111-8111-444444444444';
  const onRecordReceipt = jest.fn();
  (canonicalDocumentHistoryApi.get as jest.Mock)
    .mockResolvedValueOnce({
      items: [], total: 0, page: 1, page_size: 25, business_date: '2026-08-25',
    })
    .mockResolvedValueOnce({
      total: 1, page: 1, page_size: 25, business_date: '2026-08-25',
      items: [{
        ...response('PO-NEW').items[0],
        document_kind: 'purchase_order',
        document_id: purchaseOrderId,
        status: 'approved',
        paid_amount: null,
        outstanding_amount: null,
        payment_status: null,
      }],
    });

  render(<PurchaseListHistory onRecordReceipt={onRecordReceipt} />);
  await act(async () => undefined);
  fireEvent.click(screen.getByRole('button', { name: 'Purchase Orders' }));
  await act(async () => undefined);

  const receipt = screen.getByRole('button', {
    name: `Record canonical receipt for purchase order ${purchaseOrderId}`,
  });
  fireEvent.click(receipt);
  expect(onRecordReceipt).toHaveBeenCalledWith(purchaseOrderId);
});
