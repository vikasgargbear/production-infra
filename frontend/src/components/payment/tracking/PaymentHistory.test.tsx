import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import PaymentHistory from './PaymentHistory';
import { paymentsApi } from '../../../services/api';

jest.mock('../../../services/api', () => ({ paymentsApi: {
  getCanonicalHistory: jest.fn(), getCanonicalDetail: jest.fn(),
} }));

jest.mock('../../global', () => ({
  ModuleHeader: ({ title }: any) => <h1>{title}</h1>,
  InlineFilterPanel: ({ onFilterChange, onSearchChange }: any) => <div>
    <button onClick={() => onFilterChange({ direction: 'made', date_from: '2026-08-01' })}>Supplier filter</button>
    <button onClick={() => { onSearchChange('SUP'); onFilterChange({ search: 'SUP' }); }}>Search SUP</button>
  </div>,
  DataTable: ({ data, columns }: any) => <div>{data.map((row: any) => <div key={row.payment_id}>
    {columns.map((column: any) => <span key={column.key}>{column.render ? column.render(row[column.key], row) : row[column.key]}</span>)}
  </div>)}</div>,
  Pagination: ({ totalItems }: any) => <div>Authoritative total {totalItems}</div>,
  StatusBadge: ({ label }: any) => <span>{label}</span>,
}));

const history = {
  payment_id: 'd3000000-0000-7000-8000-000000000001',
  command_request_id: 'd3000000-0000-7000-8000-000000000002',
  payment_number: 'SP-EXACT', payment_date: '2026-08-25',
  branch_id: 'd3000000-0000-7000-8000-000000000003',
  party_id: 'd3000000-0000-7000-8000-000000000004', party_name: 'Exact Supplier',
  direction: 'made' as const, payment_method: 'upi' as const, external_reference: 'UPI-1',
  amount: '9007199254740993.01', allocated_amount: '9007199254740993.01',
  allocation_count: 1,
  journal_entry_id: 'd3000000-0000-7000-8000-000000000005', journal_number: 'JV-1',
  journal_debit_total: '9007199254740993.01', journal_credit_total: '9007199254740993.01',
  allocation_reconciled: true as const, journal_balanced: true as const,
  open_item_residuals_reconciled: true as const, status: 'posted' as const,
};

beforeEach(() => {
  jest.clearAllMocks();
  (paymentsApi.getCanonicalHistory as jest.Mock).mockResolvedValue({
    data: { items: [history], page: 1, page_size: 25, total: 41 },
  });
  (paymentsApi.getCanonicalDetail as jest.Mock).mockResolvedValue({ data: {
    ...history,
    allocations: [{ allocation_id: 'a', open_item_id: 'o', source_document_id: 'i',
      source_document_number: 'SUP-1', source_document_type: 'supplier_invoice',
      allocation_date: '2026-08-25', amount: history.amount,
      principal_amount: history.amount, effective_allocated_amount: history.amount,
      residual_amount: '0.00' }],
    journal_lines: [{ journal_line_id: 'j1', line_number: 1, account_id: 'bank',
      debit: history.amount, credit: '0.00' }, { journal_line_id: 'j2', line_number: 2,
      account_id: 'payable', debit: '0.00', credit: history.amount }],
  } });
});

test('renders exact money and authoritative total, then loads UUID detail', async () => {
  render(<PaymentHistory />);
  expect(await screen.findByText('-₹9,00,71,99,25,47,40,993.01')).not.toBeNull();
  expect(screen.getByText('Authoritative total 41')).not.toBeNull();
  expect(screen.getByText('Payment Made')).not.toBeNull();
  const trigger = screen.getByRole('button', { name: 'View payment SP-EXACT' });
  trigger.focus();
  fireEvent.click(trigger);
  await waitFor(() => expect(paymentsApi.getCanonicalDetail).toHaveBeenCalledWith(history.payment_id));
  expect(await screen.findByRole('dialog')).not.toBeNull();
  expect(screen.getByText('SUP-1')).not.toBeNull();
  expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Close payment details' }));
  fireEvent.keyDown(document, { key: 'Escape' });
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(document.activeElement).toBe(trigger);
});

test('sends backend direction/date/search filters rather than filtering page rows', async () => {
  render(<PaymentHistory />);
  await screen.findByText('Authoritative total 41');
  fireEvent.click(screen.getByText('Supplier filter'));
  await waitFor(() => expect(paymentsApi.getCanonicalHistory).toHaveBeenLastCalledWith({
    direction: 'made', date_from: '2026-08-01', page: 1, page_size: 25,
  }));
  fireEvent.click(screen.getByText('Search SUP'));
  await waitFor(() => expect(paymentsApi.getCanonicalHistory).toHaveBeenLastCalledWith(expect.objectContaining({
    search: 'SUP', page: 1, page_size: 25,
  })));
});
