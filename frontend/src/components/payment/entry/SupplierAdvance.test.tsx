import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import SupplierAdvance from './SupplierAdvance';
import { canonicalSupplierAdvancesApi } from '../../../services/api/modules/finance/canonicalSupplierAdvances.api';
import {
  approveCanonicalAction,
  getCanonicalCommandReview,
} from '../../../services/api/canonicalOperatorActions';

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
  expect(screen.getByLabelText('Supplier').getAttribute('aria-label')).toBe('Supplier');
  expect(screen.getByLabelText('Approved purchase order').getAttribute('aria-label')).toBe('Approved purchase order');
  expect(screen.getByLabelText('Approved PO product line').getAttribute('aria-label')).toBe('Approved PO product line');
  expect(screen.getByLabelText('Bank and settlement ledger').getAttribute('aria-label')).toBe('Bank and settlement ledger');
  expect(screen.getByLabelText('Method').getAttribute('aria-label')).toBe('Method');
  expect(screen.getByLabelText('Bank / UPI reference').getAttribute('aria-label')).toBe('Bank / UPI reference');
  expect(screen.getByLabelText('Gross advance amount').getAttribute('aria-label')).toBe('Gross advance amount');
  const prepare = screen.getByRole('button', { name: 'Prepare immutable preview' });
  expect((prepare as HTMLButtonElement).disabled).toBe(true);
  fireEvent.change(screen.getByLabelText('Supplier'), { target: { value: ids.supplier } });
  fireEvent.change(screen.getByLabelText('Approved purchase order'), { target: { value: ids.order } });
  expect((screen.getByLabelText('Approved PO product line') as HTMLSelectElement).value).toBe(ids.line);
  fireEvent.change(screen.getByLabelText('Bank and settlement ledger'), { target: { value: ids.bank } });
  fireEvent.change(screen.getByLabelText('Method'), { target: { value: 'upi' } });
  fireEvent.change(screen.getByLabelText('Gross advance amount'), { target: { value: '168.01' } });
  fireEvent.change(screen.getByLabelText('Bank / UPI reference'), { target: { value: 'UPI-SA-1' } });
  expect(screen.getByText('₹200.10 / ₹32.09')).not.toBeNull();
  expect(screen.getByText('₹168.01')).not.toBeNull();
  expect((prepare as HTMLButtonElement).disabled).toBe(false);
  expect(screen.getByText(/backend-verified not applicable/i)).not.toBeNull();
  expect(screen.getByText(/required: select supplier, approved purchase order/i)).not.toBeNull();
});

const approvalReview = (commandId: string, previewHash: string, status: string) => ({
  command_request_id: commandId,
  preview_hash: previewHash,
  capability_code: 'finance.supplier_advance.prepare',
  command_type: 'finance.supplier_advance.post',
  requested_by_membership_id: 'd3000000-0000-7000-8000-000000000011',
  target_resource_type: 'payment',
  target_resource_id: 'd3000000-0000-7000-8000-000000000012',
  preview_canonical_json: '{"operation":"finance.supplier_advance.post"}',
  approval_policy: 'separate_approver',
  required_approval_count: 1,
  status,
});

const openApprovalReview = async (commandId: string) => {
  render(<SupplierAdvance />);
  await waitFor(() => expect((screen.getByLabelText('Supplier') as HTMLSelectElement).options.length).toBe(2));
  fireEvent.click(screen.getByRole('button', { name: '2. Independent approval' }));
  fireEvent.change(screen.getByLabelText('Command ID'), { target: { value: commandId } });
  fireEvent.click(screen.getByRole('button', { name: 'Load immutable review' }));
  await screen.findByText('finance.supplier_advance.post · prepared');
  fireEvent.click(screen.getByRole('checkbox', { name: /independently reviewed the exact PO lineage/i }));
  fireEvent.click(screen.getByRole('button', { name: 'Approve exact preview' }));
};

test('shows approval only after authoritative review readback confirms the exact preview', async () => {
  const commandId = 'd3000000-0000-7000-8000-000000000010';
  const previewHash = `sha256:${'a'.repeat(64)}`;
  (getCanonicalCommandReview as jest.Mock)
    .mockResolvedValueOnce({ data: approvalReview(commandId, previewHash, 'prepared') })
    .mockResolvedValueOnce({ data: approvalReview(commandId, previewHash, 'approved') });
  (approveCanonicalAction as jest.Mock).mockResolvedValue({ data: { status: 'accepted' } });

  await openApprovalReview(commandId);

  await screen.findByText('finance.supplier_advance.post · approved');
  expect(approveCanonicalAction).toHaveBeenCalledTimes(1);
  expect(getCanonicalCommandReview).toHaveBeenLastCalledWith(commandId);
});

test.each([
  ['command UUID', { command_request_id: 'd3000000-0000-7000-8000-000000000099' }],
  ['preview hash', { preview_hash: `sha256:${'c'.repeat(64)}` }],
  ['capability', { capability_code: 'finance.supplier_payment.prepare' }],
  ['approved status', { status: 'prepared' }],
])('fails closed when authoritative readback changes the %s', async (_label, drift) => {
  const commandId = 'd3000000-0000-7000-8000-000000000020';
  const previewHash = `sha256:${'b'.repeat(64)}`;
  (getCanonicalCommandReview as jest.Mock)
    .mockResolvedValueOnce({ data: approvalReview(commandId, previewHash, 'prepared') })
    .mockResolvedValueOnce({
      data: { ...approvalReview(commandId, previewHash, 'approved'), ...drift },
    });
  (approveCanonicalAction as jest.Mock).mockResolvedValue({ data: { status: 'accepted' } });

  await openApprovalReview(commandId);

  expect((await screen.findByRole('alert')).textContent).toMatch(/did not confirm the exact approved preview/i);
  expect(screen.queryByText('finance.supplier_advance.post · approved')).toBeNull();
});
