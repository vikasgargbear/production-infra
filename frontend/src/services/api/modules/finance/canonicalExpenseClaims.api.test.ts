import { apiHelpers } from '../../apiClient';
import {
  buildExpenseClaimPayload, canonicalExpenseClaimsApi, decodePostedExpenseClaim,
  prepareExpenseClaim, type ExpenseClaimContext,
} from './canonicalExpenseClaims.api';

jest.mock('../../apiClient', () => ({ apiHelpers: { get: jest.fn(), post: jest.fn() } }));

const ids = {
  org: '10000000-0000-7000-8000-000000000001',
  branch: '10000000-0000-7000-8000-000000000002',
  member: '10000000-0000-7000-8000-000000000003',
  expense: '10000000-0000-7000-8000-000000000004',
  reimbursement: '10000000-0000-7000-8000-000000000005',
  receipt: '10000000-0000-7000-8000-000000000006',
  command: '10000000-0000-7000-8000-000000000007',
  claim: '10000000-0000-7000-8000-000000000008',
  line: '10000000-0000-7000-8000-000000000009',
  journal: '10000000-0000-7000-8000-00000000000a',
  event: '10000000-0000-7000-8000-00000000000b',
  reviewer: '10000000-0000-7000-8000-00000000000c',
};
const previewHash = `sha256:${'a'.repeat(64)}`;

const context: ExpenseClaimContext = {
  organization_id: ids.org, branch_id: ids.branch, branch_code: 'MAIN', branch_name: 'Main',
  claimant_membership_id: ids.member, claimant_display_name: 'Canonical Claimant',
  business_date: '2026-08-25', currency_code: 'INR', tax_treatment: 'non_creditable_gross_expense',
  expense_accounts: [{ account_id: ids.expense, account_code: 'TRAVEL', account_name: 'Travel', account_type: 'expense', currency_code: 'INR' }],
  reimbursement_accounts: [{ account_id: ids.reimbursement, account_code: 'MEMBER', account_name: 'Member payable', account_type: 'liability', currency_code: 'INR' }],
  receipts: [{ receipt_attachment_id: ids.receipt, original_filename: 'receipt.pdf', media_type: 'application/pdf', byte_size: 512, document_date: '2026-08-24', status: 'verified', verified_at: '2026-08-25T00:00:00Z', retention_until: '2034-08-25', sha256: 'b'.repeat(64) }],
  unsupported_modes: ['partial_approval', 'gst_input_tax_credit', 'withholding', 'foreign_currency'],
};

const payload = () => buildExpenseClaimPayload(context, {
  idempotency_key: 'erp-web-expense-claim-prepare:test-001',
  period_start: '2026-08-24', period_end: '2026-08-25', purpose: 'Customer site travel',
  reimbursement_account_id: ids.reimbursement,
  lines: [{ expense_date: '2026-08-24', expense_account_id: ids.expense,
    description: 'Taxi to customer site', merchant_name: 'Verified Taxi',
    receipt_attachment_id: ids.receipt, claimed_amount: '168' }],
});

describe('canonical expense claim browser boundary', () => {
  beforeEach(() => jest.clearAllMocks());

  it('builds only the server-advertised INR gross-expense payload', () => {
    expect(payload()).toEqual(expect.objectContaining({
      branch_id: ids.branch, claim_date: '2026-08-25', tax_treatment: 'non_creditable_gross_expense',
      reimbursement_account_id: ids.reimbursement,
      lines: [expect.objectContaining({ claimed_amount: '168.00', receipt_attachment_id: ids.receipt })],
    }));
  });

  it.each([
    ['duplicate receipt', () => buildExpenseClaimPayload(context, {
      ...payload(), lines: [payload().lines[0], payload().lines[0]],
    }), /unique eligible verified receipt/i],
    ['unadvertised account', () => buildExpenseClaimPayload(context, {
      ...payload(), lines: [{ ...payload().lines[0], expense_account_id: ids.claim }],
    }), /eligible expense account/i],
    ['receipt date mismatch', () => buildExpenseClaimPayload(context, {
      ...payload(), lines: [{ ...payload().lines[0], expense_date: '2026-08-25' }],
    }), /date must match/i],
    ['fractional precision', () => buildExpenseClaimPayload(context, {
      ...payload(), lines: [{ ...payload().lines[0], claimed_amount: '168.001' }],
    }), /precision/i],
  ])('fails closed for %s', (_label, run, error) => expect(run).toThrow(error));

  it('verifies source identities and exact preview impact before showing prepared', async () => {
    (apiHelpers.post as jest.Mock).mockResolvedValueOnce({ data: {
      command_request_id: ids.command, preview_hash: previewHash, branch_id: ids.branch,
      resolved_references: [
        { id: ids.expense, role: 'expense' }, { id: ids.reimbursement, role: 'member_reimbursement_liability' },
        { id: ids.receipt, resource_type: 'expense_receipt' },
      ],
      financial_impact: [{ debit_account_id: ids.expense, amount: '168.00' }, { credit_account_id: ids.reimbursement, amount: '168.00' }],
      tax_impact: [{ treatment: 'non_creditable_gross_expense', gst_input_tax_claimed: '0.00', withholding_amount: '0.00' }],
    } });
    await expect(prepareExpenseClaim(payload())).resolves.toEqual(expect.objectContaining({ data: expect.objectContaining({ command_request_id: ids.command }) }));
    expect(apiHelpers.post).toHaveBeenCalledWith(
      '/web/actions/finance.expense_claim.prepare/prepare',
      payload(),
      { preserveExactDecimals: true },
    );
  });

  it('rejects a preview that omits receipt authority', async () => {
    (apiHelpers.post as jest.Mock).mockResolvedValueOnce({ data: {
      command_request_id: ids.command, preview_hash: previewHash, branch_id: ids.branch,
      resolved_references: [{ id: ids.expense }, { id: ids.reimbursement }],
      financial_impact: [{ amount: '168.00' }, { amount: '168.00' }],
      tax_impact: [{ treatment: 'non_creditable_gross_expense', gst_input_tax_claimed: '0.00', withholding_amount: '0.00' }],
    } });
    await expect(prepareExpenseClaim(payload())).rejects.toThrow(/does not match.*evidence/i);
  });

  it('uploads PDF bytes only through authenticated multipart API and verifies metadata', async () => {
    const file = new File(['%PDF-1.7\n%%EOF\n'], 'receipt.pdf', { type: 'application/pdf' });
    const uploaded = {
      organization_id: ids.org, branch_id: ids.branch, attachment_id: ids.receipt,
      evidence_kind: 'expense_receipt', original_filename: 'receipt.pdf', media_type: 'application/pdf',
      byte_size: file.size, sha256: 'b'.repeat(64), document_date: '2026-08-24',
      retention_until: '2034-08-25', legal_hold: false, status: 'verified',
      verified_at: '2026-08-25T00:00:00Z', idempotency_replayed: false,
    } as const;
    (apiHelpers.post as jest.Mock).mockResolvedValueOnce({ data: uploaded });

    await expect(canonicalExpenseClaimsApi.uploadReceipt(
      ids.branch, '2026-08-24', file,
    )).resolves.toEqual({ data: uploaded });
    const [path, form] = (apiHelpers.post as jest.Mock).mock.calls[0];
    expect(path).toBe('/web/evidence/expense-receipts');
    expect(form).toBeInstanceOf(FormData);
    expect(form.get('branch_id')).toBe(ids.branch);
    expect(form.get('document_date')).toBe('2026-08-24');
    expect((form.get('file') as File).name).toBe('receipt.pdf');
    expect((apiHelpers.post as jest.Mock).mock.calls[0]).toHaveLength(2);
  });

  it('reconciles exact posted line, receipt and balanced journal totals', async () => {
    const readback = {
      command_request_id: ids.command, expense_claim_id: ids.claim, claim_number: 'EXP-2026-000001',
      status: 'posted', branch_id: ids.branch, claimant_membership_id: ids.member,
      claim_date: '2026-08-25', period_start: '2026-08-24', period_end: '2026-08-25', currency_code: 'INR',
      claimed_amount: '168.00', approved_amount: '168.00', approved_by_membership_id: ids.reviewer,
      posted_by_membership_id: ids.member, journal_entry_id: ids.journal, journal_status: 'posted',
      journal_debit_total: '168.00', journal_credit_total: '168.00', accounting_event_id: ids.event,
      lines: [{ expense_claim_line_id: ids.line, line_number: 1, expense_date: '2026-08-24',
        expense_account_id: ids.expense, description: 'Taxi', merchant_name: 'Verified Taxi',
        receipt_attachment_id: ids.receipt, receipt_evidence_kind: 'expense_receipt', receipt_status: 'verified',
        receipt_document_date: '2026-08-24', receipt_verified_at: '2026-08-25T00:00:00Z',
        receipt_retention_until: '2034-08-25', receipt_sha256: 'b'.repeat(64),
        claimed_amount: '168.00', approved_amount: '168.00' }],
    } as const;
    expect(decodePostedExpenseClaim(readback).expense_claim_id).toBe(ids.claim);
    (apiHelpers.get as jest.Mock).mockResolvedValueOnce({ data: readback });
    await expect(canonicalExpenseClaimsApi.readback(ids.command)).resolves.toEqual({ data: readback });
    expect(apiHelpers.get).toHaveBeenCalledWith(
      `/web/actions/expense-claims/commands/${ids.command}/readback`,
      { preserveExactDecimals: true },
    );
  });

  it('rejects inconsistent journal readback instead of reporting success', () => {
    const invalid = {
      command_request_id: ids.command, expense_claim_id: ids.claim, claim_number: 'EXP-1', status: 'posted',
      branch_id: ids.branch, claimant_membership_id: ids.member, claim_date: '2026-08-25',
      period_start: '2026-08-25', period_end: '2026-08-25', currency_code: 'INR', claimed_amount: '168.00',
      approved_amount: '168.00', approved_by_membership_id: ids.reviewer, posted_by_membership_id: ids.member,
      journal_entry_id: ids.journal, journal_status: 'posted', journal_debit_total: '168.00',
      journal_credit_total: '167.99', accounting_event_id: ids.event,
      lines: [{ expense_claim_line_id: ids.line, line_number: 1, expense_date: '2026-08-25',
        expense_account_id: ids.expense, description: 'Taxi', merchant_name: 'Taxi', receipt_attachment_id: ids.receipt,
        receipt_evidence_kind: 'expense_receipt', receipt_status: 'verified', receipt_document_date: '2026-08-25',
        receipt_verified_at: '2026-08-25T00:00:00Z', receipt_retention_until: '2034-08-25',
        receipt_sha256: 'b'.repeat(64), claimed_amount: '168.00', approved_amount: '168.00' }],
    };
    expect(() => decodePostedExpenseClaim(invalid)).toThrow(/do not execute again/i);
  });
});
