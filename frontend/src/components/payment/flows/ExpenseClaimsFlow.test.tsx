import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import ExpenseClaimsFlow from './ExpenseClaimsFlow';
import { branchesApi } from '../../../services/api';
import {
  canonicalExpenseClaimsApi,
  prepareExpenseClaim,
} from '../../../services/api/modules/finance/canonicalExpenseClaims.api';

jest.mock('../../global', () => ({
  ModuleHeader: ({ title }: { title: string }) => <header>{title}</header>,
}));
jest.mock('../../../services/api', () => ({
  branchesApi: { getAll: jest.fn() },
}));
jest.mock('../../../services/api/modules/finance/canonicalExpenseClaims.api', () => ({
  canonicalExpenseClaimsApi: { context: jest.fn(), readback: jest.fn(), uploadReceipt: jest.fn() },
  buildExpenseClaimPayload: jest.requireActual('../../../services/api/modules/finance/canonicalExpenseClaims.api').buildExpenseClaimPayload,
  prepareExpenseClaim: jest.fn(),
  executeApprovedExpenseClaim: jest.fn(),
}));
jest.mock('../../../utils/clientUuid', () => ({
  clientUuid: jest.fn()
    .mockReturnValueOnce('10000000-0000-7000-8000-000000000010')
    .mockReturnValueOnce('10000000-0000-7000-8000-000000000011')
    .mockReturnValueOnce('10000000-0000-7000-8000-000000000012')
    .mockReturnValue('10000000-0000-7000-8000-000000000013'),
}));

const ids = {
  org: '10000000-0000-7000-8000-000000000001', branch: '10000000-0000-7000-8000-000000000002',
  member: '10000000-0000-7000-8000-000000000003', expense: '10000000-0000-7000-8000-000000000004',
  reimbursement: '10000000-0000-7000-8000-000000000005', receipt: '10000000-0000-7000-8000-000000000006',
  command: '10000000-0000-7000-8000-000000000007',
};

beforeEach(() => {
  jest.clearAllMocks();
  (branchesApi.getAll as jest.Mock).mockResolvedValue({ data: { branches: [
    { branch_id: ids.branch, branch_code: 'MAIN', branch_name: 'Main', is_active: true },
  ] } });
  (canonicalExpenseClaimsApi.context as jest.Mock).mockResolvedValue({ data: {
    organization_id: ids.org, branch_id: ids.branch, branch_code: 'MAIN', branch_name: 'Main',
    claimant_membership_id: ids.member, claimant_display_name: 'Canonical Claimant',
    business_date: '2026-08-25', currency_code: 'INR', tax_treatment: 'non_creditable_gross_expense',
    expense_accounts: [{ account_id: ids.expense, account_code: 'TRAVEL', account_name: 'Travel', account_type: 'expense', currency_code: 'INR' }],
    reimbursement_accounts: [{ account_id: ids.reimbursement, account_code: 'MEMBER', account_name: 'Member payable', account_type: 'liability', currency_code: 'INR' }],
    receipts: [{ receipt_attachment_id: ids.receipt, original_filename: 'receipt.pdf', media_type: 'application/pdf', byte_size: 512, document_date: '2026-08-25', status: 'verified', verified_at: '2026-08-25T00:00:00Z', retention_until: '2034-08-25', sha256: 'b'.repeat(64) }],
    unsupported_modes: ['gst_input_tax_credit', 'withholding'],
  } });
  (prepareExpenseClaim as jest.Mock).mockResolvedValue({ data: {
    command_request_id: ids.command, preview_hash: `sha256:${'a'.repeat(64)}`,
  } });
  (canonicalExpenseClaimsApi.uploadReceipt as jest.Mock).mockResolvedValue({ data: {
    organization_id: ids.org, branch_id: ids.branch, attachment_id: ids.receipt,
    evidence_kind: 'expense_receipt', original_filename: 'receipt.pdf', media_type: 'application/pdf',
    byte_size: 38, sha256: 'b'.repeat(64), document_date: '2026-08-25',
    retention_until: '2034-08-25', legal_hold: false, status: 'verified',
    verified_at: '2026-08-25T00:00:00Z', idempotency_replayed: false,
  } });
});

it('keeps the immutable prepare boundary visible and disabled before context selection', async () => {
  render(<ExpenseClaimsFlow onClose={jest.fn()} />);

  const prepare = screen.getByRole('button', { name: 'Prepare immutable preview' });
  expect((prepare as HTMLButtonElement).disabled).toBe(true);
  await waitFor(() => expect((screen.getByLabelText('Branch') as HTMLSelectElement).options.length).toBe(2));
  expect((screen.getByRole('button', { name: 'Prepare immutable preview' }) as HTMLButtonElement).disabled).toBe(true);
});

it('uses canonical claimant, account and receipt context to reach immutable prepare', async () => {
  render(<ExpenseClaimsFlow onClose={jest.fn()} />);

  await waitFor(() => expect((screen.getByLabelText('Branch') as HTMLSelectElement).options.length).toBe(2));
  expect((screen.getByLabelText('Branch') as HTMLSelectElement).value).toBe('');
  fireEvent.change(screen.getByLabelText('Branch'), { target: { value: ids.branch } });
  expect(await screen.findByDisplayValue('Canonical Claimant')).not.toBeNull();
  expect((screen.getByLabelText('Reimbursement liability') as HTMLSelectElement).value).toBe('');
  fireEvent.change(screen.getByLabelText('Period start'), { target: { value: '2026-08-25' } });
  fireEvent.change(screen.getByLabelText('Period end'), { target: { value: '2026-08-25' } });
  fireEvent.change(screen.getByLabelText('Reimbursement liability'), { target: { value: ids.reimbursement } });
  fireEvent.change(screen.getByLabelText('Verified unused receipt'), { target: { value: ids.receipt } });
  fireEvent.change(screen.getByLabelText('Expense account'), { target: { value: ids.expense } });
  fireEvent.change(screen.getByLabelText('Merchant'), { target: { value: 'Verified Taxi' } });
  fireEvent.change(screen.getByLabelText('Description'), { target: { value: 'Customer site taxi' } });
  fireEvent.change(screen.getByLabelText('Gross INR amount'), { target: { value: '168.00' } });
  fireEvent.change(screen.getByLabelText('Business purpose'), { target: { value: 'Customer visit' } });
  fireEvent.click(screen.getByRole('button', { name: 'Prepare immutable preview' }));

  await waitFor(() => expect(prepareExpenseClaim).toHaveBeenCalledWith(expect.objectContaining({
    branch_id: ids.branch, claim_date: '2026-08-25', reimbursement_account_id: ids.reimbursement,
    tax_treatment: 'non_creditable_gross_expense',
    lines: [expect.objectContaining({ receipt_attachment_id: ids.receipt, claimed_amount: '168.00' })],
  })));
  expect(await screen.findByText('Prepared — independent approval required')).not.toBeNull();
  expect(screen.queryByText('Current User')).toBeNull();
  expect(screen.queryByText(/Unavailable/)).toBeNull();
});

it('treats a blank amount as invalid rather than inventing zero', async () => {
  render(<ExpenseClaimsFlow onClose={jest.fn()} />);
  expect(screen.getByText('Required: select a branch, exact claim period, reimbursement liability, verified unused receipt, expense account, merchant, description, amount, and business purpose.')).not.toBeNull();
  await waitFor(() => expect((screen.getByLabelText('Branch') as HTMLSelectElement).options.length).toBe(2));
  fireEvent.change(screen.getByLabelText('Branch'), { target: { value: ids.branch } });
  expect(await screen.findByText('Exact total: Invalid amount')).not.toBeNull();
  expect((screen.getByRole('button', { name: 'Prepare immutable preview' }) as HTMLButtonElement).disabled).toBe(true);
  expect(prepareExpenseClaim).not.toHaveBeenCalled();
});

it('uploads a PDF through the canonical server boundary and selects verified readback', async () => {
  render(<ExpenseClaimsFlow onClose={jest.fn()} />);
  await waitFor(() => expect((screen.getByLabelText('Branch') as HTMLSelectElement).options.length).toBe(2));
  fireEvent.change(screen.getByLabelText('Branch'), { target: { value: ids.branch } });
  expect(await screen.findByDisplayValue('Canonical Claimant')).not.toBeNull();

  fireEvent.change(screen.getByLabelText('Receipt date'), { target: { value: '2026-08-25' } });
  const pdf = new File([new Uint8Array([37, 80, 68, 70, 45, 49, 46, 55])], 'receipt.pdf', {
    type: 'application/pdf',
  });
  fireEvent.change(screen.getByLabelText('Receipt PDF'), { target: { files: [pdf] } });
  fireEvent.click(screen.getByRole('button', { name: 'Upload and verify receipt' }));

  await waitFor(() => expect(canonicalExpenseClaimsApi.uploadReceipt).toHaveBeenCalledWith(
    ids.branch, '2026-08-25', pdf,
  ));
  const result = await screen.findByTestId('expense-receipt-upload-result');
  expect(result.getAttribute('role')).toBe('status');
  expect(result.getAttribute('aria-label')).toBe('Expense receipt upload result');
  expect(result.textContent).toContain('Receipt verified and selected.');
  expect((screen.getByLabelText('Verified unused receipt') as HTMLSelectElement).value).toBe(ids.receipt);
});

it('exposes a failed receipt upload at the same deterministic contract without selecting it', async () => {
  (canonicalExpenseClaimsApi.uploadReceipt as jest.Mock).mockRejectedValueOnce({
    response: { data: { detail: 'Canonical evidence storage is not enabled.' } },
  });
  render(<ExpenseClaimsFlow onClose={jest.fn()} />);
  await waitFor(() => expect((screen.getByLabelText('Branch') as HTMLSelectElement).options.length).toBe(2));
  fireEvent.change(screen.getByLabelText('Branch'), { target: { value: ids.branch } });
  expect(await screen.findByDisplayValue('Canonical Claimant')).not.toBeNull();

  fireEvent.change(screen.getByLabelText('Receipt date'), { target: { value: '2026-08-25' } });
  const pdf = new File([new Uint8Array([37, 80, 68, 70, 45, 49, 46, 55])], 'receipt.pdf', {
    type: 'application/pdf',
  });
  fireEvent.change(screen.getByLabelText('Receipt PDF'), { target: { files: [pdf] } });
  fireEvent.click(screen.getByRole('button', { name: 'Upload and verify receipt' }));

  const result = await screen.findByTestId('expense-receipt-upload-result');
  await waitFor(() => expect(result.textContent).toContain(
    'Receipt upload failed. Canonical evidence storage is not enabled.',
  ));
  expect(result.getAttribute('role')).toBe('alert');
  expect(result.getAttribute('aria-label')).toBe('Expense receipt upload result');
  expect((screen.getByLabelText('Verified unused receipt') as HTMLSelectElement).value).toBe('');
  expect((screen.getByRole('button', { name: 'Prepare immutable preview' }) as HTMLButtonElement).disabled).toBe(true);
});
