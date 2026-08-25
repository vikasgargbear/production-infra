import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import SupplierAdvance from './SupplierAdvance';
import { canonicalSupplierAdvancesApi } from '../../../services/api/modules/finance/canonicalSupplierAdvances.api';

jest.mock('../../../services/api/modules/finance/canonicalSupplierAdvances.api', () => ({
  canonicalSupplierAdvancesApi: { getContext: jest.fn(), getPosted: jest.fn() },
  executeApprovedSupplierAdvance: jest.fn(), prepareSupplierAdvance: jest.fn(),
  reconcileSupplierAdvance: jest.fn(),
}));
jest.mock('../../../services/api/canonicalOperatorActions', () => ({
  approveCanonicalAction: jest.fn(), canonicalExecutionCompleted: jest.fn(),
  getCanonicalCommandReview: jest.fn(), getCanonicalCommandStatus: jest.fn(),
}));

const ids = {
  supplier: 'd3200000-0000-7000-8000-000000000002',
  party: 'd3200000-0000-7000-8000-000000000003',
  branch: 'd3000000-0000-7000-8000-000000000004',
  bank: 'd3000000-0000-7000-8000-000000000005',
  settlement: 'd3000000-0000-7000-8000-000000000006',
  order: 'd3000000-0000-7000-8000-000000000007',
  line: 'd3000000-0000-7000-8000-000000000008',
  product: 'd3000000-0000-7000-8000-000000000009',
};

beforeEach(() => {
  jest.clearAllMocks();
  (canonicalSupplierAdvancesApi.getContext as jest.Mock).mockResolvedValue({ data: {
    ready: true, blocking_reasons: [], payment_date: '2026-08-25',
    withholding_treatment: 'not_applicable_verified',
    branches: [{ branch_id: ids.branch, branch_code: 'BR', branch_name: 'Branch' }],
    bank_accounts: [{ bank_account_id: ids.bank, settlement_account_id: ids.settlement,
      bank_name: 'Bank', account_holder_name: 'Org', ifsc: 'BANK0001', currency_code: 'INR' }],
    suppliers: [{ supplier_account_id: ids.supplier, party_id: ids.party,
      supplier_code: 'SUP', supplier_name: 'Supplier', lines: [{
        purchase_order_id: ids.order, branch_id: ids.branch,
        purchase_order_number: 'PO-1', order_date: '2026-08-20',
        purchase_order_line_id: ids.line, line_number: 1, product_id: ids.product,
        product_code: 'SKU-1', product_name: 'Product', uom_code: 'EA',
        ordered_quantity: '5', net_value_amount: '200.10', prior_active_gross: '32.09',
        remaining_advance_amount: '168.01', withholding_nature_code: 'purchase_of_goods',
      }] }],
  } });
});

test('exposes the complete mandatory PO-line flow and keeps prepare disabled until valid', async () => {
  render(<SupplierAdvance />);
  await waitFor(() => expect((screen.getByLabelText('Supplier') as HTMLSelectElement).options.length).toBe(2));
  const prepare = screen.getByRole('button', { name: 'Prepare immutable preview' });
  expect((prepare as HTMLButtonElement).disabled).toBe(true);
  fireEvent.change(screen.getByLabelText('Supplier'), { target: { value: ids.supplier } });
  fireEvent.change(screen.getByLabelText('Approved PO product line'), { target: { value: ids.line } });
  fireEvent.change(screen.getByLabelText('Gross advance amount'), { target: { value: '168.01' } });
  fireEvent.change(screen.getByLabelText('Bank / UPI reference'), { target: { value: 'UPI-SA-1' } });
  expect(screen.getByText('₹200.10 / ₹32.09')).not.toBeNull();
  expect(screen.getByText('₹168.01')).not.toBeNull();
  expect((prepare as HTMLButtonElement).disabled).toBe(false);
  expect(screen.getByText(/backend-verified not applicable/i)).not.toBeNull();
});
