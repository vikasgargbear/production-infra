import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

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

  expect(screen.getByTestId('supplier-payment-mobile-allocations')).not.toBeNull();
  const allocation = screen.getByTestId(`allocate-supplier-invoice-mobile-${ids.invoice}`);
  expect(screen.getAllByLabelText(/Allocation for INV-1/)).toHaveLength(2);
  fireEvent.change(allocation, { target: { value: '100.01' } });
  expect((allocation as HTMLInputElement).value).toBe('100.01');
  expect(screen.getByText('Allocated ₹100.01')).not.toBeNull();
  expect((screen.getByRole('button', { name: 'Review immutable preview' }) as HTMLButtonElement).disabled).toBe(false);
});
