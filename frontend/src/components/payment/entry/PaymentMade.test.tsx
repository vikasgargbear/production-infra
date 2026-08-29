import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';

import PaymentMade from './PaymentMade';
import { canonicalSupplierPaymentsApi } from '../../../services/api/modules/finance/canonicalSupplierPayments.api';

jest.mock('../../../services/api/modules/finance/canonicalSupplierPayments.api', () => ({
  canonicalSupplierPaymentsApi: { getContext: jest.fn(), getPosted: jest.fn() },
  executeSupplierPayment: jest.fn(),
  prepareSupplierPayment: jest.fn(),
  reconcileSupplierPayment: jest.fn(),
}));

const ids = {
  supplier: 'd3200000-0000-7000-8000-000000000002',
  party: 'd3200000-0000-7000-8000-000000000003',
  branch: 'd3000000-0000-7000-8000-000000000004',
  bank: 'd3000000-0000-7000-8000-000000000005',
  settlement: 'd3000000-0000-7000-8000-000000000006',
  item: 'd3000000-0000-7000-8000-000000000007',
  invoice: 'd3000000-0000-7000-8000-000000000008',
  item2: 'd3000000-0000-7000-8000-000000000009',
  invoice2: 'd3000000-0000-7000-8000-000000000010',
};

beforeEach(() => {
  (canonicalSupplierPaymentsApi.getContext as jest.Mock).mockResolvedValue({ data: {
    ready: true, blocking_reasons: [], payment_date: '2026-08-25',
    branches: [{ branch_id: ids.branch, branch_code: 'BR', branch_name: 'Branch' }],
    bank_accounts: [{ bank_account_id: ids.bank, settlement_account_id: ids.settlement, bank_name: 'Bank', account_holder_name: 'Org', ifsc: 'BANK0001', currency_code: 'INR' }],
    suppliers: [{ supplier_account_id: ids.supplier, party_id: ids.party, supplier_code: 'SUP', supplier_name: 'Supplier', open_items: [{
      open_item_id: ids.item, supplier_invoice_id: ids.invoice, branch_id: ids.branch,
      document_number: 'INV-1', document_date: '2026-08-01', due_date: '2026-08-10',
      principal_amount: '100.01', allocated_amount: '0.00', outstanding_amount: '100.01',
    }, {
      open_item_id: ids.item2, supplier_invoice_id: ids.invoice2, branch_id: ids.branch,
      document_number: 'INV-2', document_date: '2026-08-02', due_date: '2026-08-11',
      principal_amount: '50.01', allocated_amount: '0.00', outstanding_amount: '50.01',
    }] }],
  } });
});

test('defaults to FIFO while preserving exact manual per-invoice allocation', async () => {
  render(<PaymentMade />);
  await waitFor(() => expect((screen.getByLabelText('Supplier') as HTMLSelectElement).options.length).toBe(2));
  expect((screen.getByLabelText('Bank and settlement ledger') as HTMLSelectElement).value).toBe('');
  expect((screen.getByLabelText('Method') as HTMLSelectElement).value).toBe('');
  fireEvent.change(screen.getByLabelText('Supplier'), { target: { value: ids.supplier } });
  expect((screen.getByLabelText('Branch') as HTMLSelectElement).value).toBe('');
  fireEvent.change(screen.getByLabelText('Branch'), { target: { value: ids.branch } });
  fireEvent.change(screen.getByLabelText('Bank and settlement ledger'), { target: { value: ids.bank } });
  fireEvent.change(screen.getByLabelText('Method'), { target: { value: 'upi' } });
  fireEvent.change(screen.getByLabelText('Bank / UPI reference'), { target: { value: 'UPI-SP-1' } });

  expect((screen.getByRole('radio', { name: 'Automatic FIFO' }) as HTMLInputElement).checked).toBe(true);
  expect((screen.getByRole('radio', { name: 'Manual per invoice' }) as HTMLInputElement).checked).toBe(false);
  fireEvent.click(screen.getByRole('radio', { name: 'Manual per invoice' }));

  const allocation = screen.getByLabelText(/Allocation for INV-1/);
  expect(screen.getByTestId(`allocate-supplier-invoice-${ids.invoice}`)).toBe(allocation);
  fireEvent.change(allocation, { target: { value: '100.01' } });
  expect((allocation as HTMLInputElement).value).toBe('100.01');
  expect(screen.getByText('Allocated ₹100.01')).not.toBeNull();
  expect((screen.getByRole('button', { name: 'Review immutable preview' }) as HTMLButtonElement).disabled).toBe(false);
});

test('moves through supplier-payment fields with Enter while keeping action controls out of the path', async () => {
  render(<PaymentMade />);
  const supplier = await screen.findByLabelText('Supplier');
  const branch = screen.getByLabelText('Branch');

  supplier.focus();
  fireEvent.keyDown(supplier, { key: 'Enter' });

  expect(branch).toHaveFocus();
});

test('navigates manual supplier allocations by Enter and vertical arrows', async () => {
  render(<PaymentMade />);
  await screen.findByLabelText('Supplier');
  fireEvent.change(screen.getByLabelText('Supplier'), { target: { value: ids.supplier } });
  fireEvent.change(screen.getByLabelText('Branch'), { target: { value: ids.branch } });
  fireEvent.click(screen.getByRole('radio', { name: 'Manual per invoice' }));

  const first = screen.getByLabelText(/Allocation for INV-1/);
  const second = screen.getByLabelText(/Allocation for INV-2/);
  first.focus();
  fireEvent.keyDown(first, { key: 'Enter' });
  expect(second).toHaveFocus();
  fireEvent.keyDown(second, { key: 'ArrowUp' });
  expect(first).toHaveFocus();
});
