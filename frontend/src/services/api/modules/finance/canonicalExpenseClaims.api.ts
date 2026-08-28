import type { AxiosResponse } from 'axios';

import {
  canonicalExecutionCompleted,
  executeApprovedCanonicalAction,
  prepareCanonicalAction,
  type CanonicalCommandExecution,
  type CanonicalCommandPreview,
} from '../../canonicalOperatorActions';
import { apiHelpers } from '../../apiClient';
import { isCanonicalUuid } from '../../../../utils/canonicalUuid';
import {
  addExactDecimals,
  compareExactDecimals,
  normalizeAuthoritativeDecimal,
  normalizeExactDecimal,
} from '../../../../utils/exactDecimal';

export interface ExpenseClaimAccount {
  account_id: string;
  account_code: string;
  account_name: string;
  account_type: 'expense' | 'liability';
  currency_code: 'INR';
}

export interface ExpenseClaimReceipt {
  receipt_attachment_id: string;
  original_filename: string;
  media_type: string;
  byte_size: number;
  document_date: string;
  status: 'verified' | 'retained';
  verified_at: string;
  retention_until: string;
  sha256: string;
}

export interface ExpenseClaimContext {
  organization_id: string;
  branch_id: string;
  branch_code: string;
  branch_name: string;
  claimant_membership_id: string;
  claimant_display_name: string;
  business_date: string;
  currency_code: 'INR';
  tax_treatment: 'non_creditable_gross_expense';
  expense_accounts: ExpenseClaimAccount[];
  reimbursement_accounts: ExpenseClaimAccount[];
  receipts: ExpenseClaimReceipt[];
  unsupported_modes: string[];
}

export interface VerifiedExpenseReceiptUpload {
  organization_id: string;
  branch_id: string;
  attachment_id: string;
  evidence_kind: 'expense_receipt';
  original_filename: string;
  media_type: 'application/pdf';
  byte_size: number;
  sha256: string;
  document_date: string;
  retention_until: string;
  legal_hold: boolean;
  status: 'verified' | 'retained';
  verified_at: string;
  idempotency_replayed: boolean;
}

export interface ExpenseClaimPreparePayload {
  idempotency_key: string;
  branch_id: string;
  claim_date: string;
  period_start: string;
  period_end: string;
  purpose: string;
  reimbursement_account_id: string;
  tax_treatment: 'non_creditable_gross_expense';
  lines: Array<{
    expense_date: string;
    expense_account_id: string;
    description: string;
    merchant_name: string;
    receipt_attachment_id: string;
    claimed_amount: string;
  }>;
}

export interface PostedExpenseClaimLine {
  expense_claim_line_id: string;
  line_number: number;
  expense_date: string;
  expense_account_id: string;
  description: string;
  merchant_name: string;
  receipt_attachment_id: string;
  receipt_evidence_kind: 'expense_receipt';
  receipt_status: 'verified' | 'retained';
  receipt_document_date: string;
  receipt_verified_at: string;
  receipt_retention_until: string;
  receipt_sha256: string;
  claimed_amount: string;
  approved_amount: string;
}

export interface PostedExpenseClaim {
  command_request_id: string;
  expense_claim_id: string;
  claim_number: string;
  status: 'posted';
  branch_id: string;
  claimant_membership_id: string;
  claim_date: string;
  period_start: string;
  period_end: string;
  currency_code: 'INR';
  claimed_amount: string;
  approved_amount: string;
  approved_by_membership_id: string;
  posted_by_membership_id: string;
  journal_entry_id: string;
  journal_status: 'posted';
  journal_debit_total: string;
  journal_credit_total: string;
  accounting_event_id: string;
  lines: PostedExpenseClaimLine[];
}

const MONEY = { scale: 2, maximumWholeDigits: 20 } as const;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const SHA256 = /^[0-9a-f]{64}$/i;
const MAX_RECEIPT_BYTES = 10 * 1024 * 1024;

const requireUuid = (value: unknown, label: string): string => {
  const text = String(value || '');
  if (!isCanonicalUuid(text)) throw new Error(`${label} is not a canonical UUID.`);
  return text;
};

const requireDate = (value: unknown, label: string): string => {
  const text = String(value || '');
  if (!DATE.test(text)) throw new Error(`${label} is not an ISO business date.`);
  return text;
};

export function decodeExpenseClaimContext(value: unknown): ExpenseClaimContext {
  if (!value || typeof value !== 'object') throw new Error('Expense context is unavailable.');
  const row = value as ExpenseClaimContext;
  requireUuid(row.organization_id, 'Expense organization');
  requireUuid(row.branch_id, 'Expense branch');
  requireUuid(row.claimant_membership_id, 'Expense claimant');
  requireDate(row.business_date, 'Expense business date');
  if (row.currency_code !== 'INR' || row.tax_treatment !== 'non_creditable_gross_expense') {
    throw new Error('Only canonical INR gross-expense claims without GST credit or withholding are supported.');
  }
  if (!row.claimant_display_name?.trim()) throw new Error('Expense claimant identity is unavailable.');
  if (!Array.isArray(row.expense_accounts) || !Array.isArray(row.reimbursement_accounts)
      || !Array.isArray(row.receipts) || !Array.isArray(row.unsupported_modes)) {
    throw new Error('Expense account or receipt eligibility is incomplete.');
  }
  const accounts = [...row.expense_accounts, ...row.reimbursement_accounts];
  accounts.forEach((account, index) => {
    requireUuid(account.account_id, `Expense account ${index + 1}`);
    if (!account.account_code?.trim() || !account.account_name?.trim()
        || account.currency_code !== 'INR'
        || !['expense', 'liability'].includes(account.account_type)) {
      throw new Error(`Expense account ${index + 1} is incomplete.`);
    }
  });
  if (row.expense_accounts.some(account => account.account_type !== 'expense')
      || row.reimbursement_accounts.some(account => account.account_type !== 'liability')) {
    throw new Error('Expense account roles are ambiguous.');
  }
  const receiptIds = new Set<string>();
  row.receipts.forEach((receipt, index) => {
    const receiptId = requireUuid(receipt.receipt_attachment_id, `Receipt ${index + 1}`);
    requireDate(receipt.document_date, `Receipt ${index + 1} document date`);
    requireDate(receipt.retention_until, `Receipt ${index + 1} retention date`);
    if (receiptIds.has(receiptId) || !['verified', 'retained'].includes(receipt.status)
        || !Number.isSafeInteger(receipt.byte_size) || receipt.byte_size <= 0
        || !SHA256.test(receipt.sha256) || !receipt.original_filename?.trim()) {
      throw new Error(`Receipt ${index + 1} evidence is incomplete or duplicated.`);
    }
    receiptIds.add(receiptId);
  });
  return row;
}

export function decodeVerifiedExpenseReceipt(value: unknown): VerifiedExpenseReceiptUpload {
  if (!value || typeof value !== 'object') throw new Error('Verified receipt response is unavailable.');
  const row = value as VerifiedExpenseReceiptUpload;
  requireUuid(row.organization_id, 'Receipt organization');
  requireUuid(row.branch_id, 'Receipt branch');
  requireUuid(row.attachment_id, 'Receipt attachment');
  requireDate(row.document_date, 'Receipt document date');
  requireDate(row.retention_until, 'Receipt retention date');
  if (row.evidence_kind !== 'expense_receipt' || row.media_type !== 'application/pdf'
      || !['verified', 'retained'].includes(row.status) || !row.verified_at
      || !Number.isSafeInteger(row.byte_size) || row.byte_size <= 0
      || row.byte_size > MAX_RECEIPT_BYTES || !SHA256.test(row.sha256)
      || !row.original_filename?.toLowerCase().endsWith('.pdf')) {
    throw new Error('Receipt upload did not return verified canonical PDF integrity metadata.');
  }
  return row;
}

export function buildExpenseClaimPayload(
  context: ExpenseClaimContext,
  input: Omit<ExpenseClaimPreparePayload, 'branch_id' | 'claim_date' | 'tax_treatment'>,
): ExpenseClaimPreparePayload {
  const decoded = decodeExpenseClaimContext(context);
  if (!input.purpose.trim()) throw new Error('Enter the specific business purpose.');
  requireDate(input.period_start, 'Claim period start');
  requireDate(input.period_end, 'Claim period end');
  if (input.period_end < input.period_start) throw new Error('Claim period end cannot precede its start.');
  if (decoded.business_date < input.period_end) throw new Error('Claim period cannot end after the server business date.');
  const reimbursement = decoded.reimbursement_accounts.find(
    account => account.account_id === input.reimbursement_account_id,
  );
  if (!reimbursement) throw new Error('Select an eligible reimbursement liability account.');
  if (input.lines.length === 0) throw new Error('Add at least one evidenced expense line.');
  const accountIds = new Set(decoded.expense_accounts.map(account => account.account_id));
  const receipts = new Map(decoded.receipts.map(receipt => [receipt.receipt_attachment_id, receipt]));
  const selectedReceipts = new Set<string>();
  const lines = input.lines.map((line, index) => {
    if (!accountIds.has(line.expense_account_id)) throw new Error(`Line ${index + 1} requires an eligible expense account.`);
    const receipt = receipts.get(line.receipt_attachment_id);
    if (!receipt || selectedReceipts.has(line.receipt_attachment_id)) {
      throw new Error(`Line ${index + 1} requires a unique eligible verified receipt.`);
    }
    if (line.expense_date !== receipt.document_date) throw new Error(`Line ${index + 1} date must match its verified receipt.`);
    if (line.expense_date < input.period_start || line.expense_date > input.period_end) {
      throw new Error(`Line ${index + 1} date must fall inside the claim period.`);
    }
    if (!line.description.trim() || !line.merchant_name.trim()) {
      throw new Error(`Line ${index + 1} requires description and merchant.`);
    }
    const claimedAmount = normalizeExactDecimal(line.claimed_amount, `Line ${index + 1} amount`, MONEY);
    if (compareExactDecimals(claimedAmount, '0.00', `Line ${index + 1} amount`, MONEY) <= 0) {
      throw new Error(`Line ${index + 1} amount must be positive.`);
    }
    selectedReceipts.add(line.receipt_attachment_id);
    return { ...line, claimed_amount: claimedAmount };
  });
  return {
    ...input,
    purpose: input.purpose.trim(),
    branch_id: decoded.branch_id,
    claim_date: decoded.business_date,
    reimbursement_account_id: reimbursement.account_id,
    tax_treatment: decoded.tax_treatment,
    lines,
  };
}

export function decodePostedExpenseClaim(value: unknown): PostedExpenseClaim {
  if (!value || typeof value !== 'object') throw new Error('Posted expense readback is unavailable.');
  const row = value as PostedExpenseClaim;
  [row.command_request_id, row.expense_claim_id, row.branch_id, row.claimant_membership_id,
    row.approved_by_membership_id, row.posted_by_membership_id, row.journal_entry_id,
    row.accounting_event_id].forEach((id, index) => requireUuid(id, `Posted expense identity ${index + 1}`));
  if (row.status !== 'posted' || row.journal_status !== 'posted' || row.currency_code !== 'INR'
      || !row.claim_number?.trim() || !Array.isArray(row.lines) || row.lines.length === 0) {
    throw new Error('Posted expense header is incomplete.');
  }
  const claimed = normalizeAuthoritativeDecimal(row.claimed_amount, 'Claimed amount', MONEY);
  const approved = normalizeAuthoritativeDecimal(row.approved_amount, 'Approved amount', MONEY);
  const debit = normalizeAuthoritativeDecimal(row.journal_debit_total, 'Journal debit', MONEY);
  const credit = normalizeAuthoritativeDecimal(row.journal_credit_total, 'Journal credit', MONEY);
  const receiptIds = new Set<string>();
  row.lines.forEach((line, index) => {
    requireUuid(line.expense_claim_line_id, `Posted expense line ${index + 1}`);
    requireUuid(line.expense_account_id, `Posted expense account ${index + 1}`);
    const receiptId = requireUuid(line.receipt_attachment_id, `Posted receipt ${index + 1}`);
    if (receiptIds.has(receiptId) || line.receipt_evidence_kind !== 'expense_receipt'
        || !['verified', 'retained'].includes(line.receipt_status) || !SHA256.test(line.receipt_sha256)) {
      throw new Error(`Posted expense receipt ${index + 1} is incomplete or duplicated.`);
    }
    normalizeAuthoritativeDecimal(line.claimed_amount, `Posted line ${index + 1} claimed`, MONEY);
    normalizeAuthoritativeDecimal(line.approved_amount, `Posted line ${index + 1} approved`, MONEY);
    receiptIds.add(receiptId);
  });
  const lineClaimed = addExactDecimals(row.lines.map(line => line.claimed_amount), 'Posted claimed lines', MONEY);
  const lineApproved = addExactDecimals(row.lines.map(line => line.approved_amount), 'Posted approved lines', MONEY);
  if (claimed !== lineClaimed || approved !== lineApproved || claimed !== approved
      || approved !== debit || debit !== credit) {
    throw new Error('Posted expense amounts or balanced journal do not reconcile. Do not execute again.');
  }
  return row;
}

export const canonicalExpenseClaimsApi = {
  context: async (branchId: string): Promise<AxiosResponse<ExpenseClaimContext>> => {
    requireUuid(branchId, 'Expense branch');
    const response = await apiHelpers.get<ExpenseClaimContext>('/web/actions/expense-claims/context', {
      params: { branch_id: branchId },
    });
    decodeExpenseClaimContext(response.data);
    return response;
  },
  readback: async (commandRequestId: string): Promise<AxiosResponse<PostedExpenseClaim>> => {
    requireUuid(commandRequestId, 'Expense command');
    const response = await apiHelpers.get<PostedExpenseClaim>(
      `/web/actions/expense-claims/commands/${commandRequestId}/readback`,
    );
    decodePostedExpenseClaim(response.data);
    return response;
  },
  uploadReceipt: async (
    branchId: string, documentDate: string, file: File,
  ): Promise<AxiosResponse<VerifiedExpenseReceiptUpload>> => {
    requireUuid(branchId, 'Expense receipt branch');
    requireDate(documentDate, 'Expense receipt date');
    if (!(file instanceof File) || file.type !== 'application/pdf'
        || !file.name.toLowerCase().endsWith('.pdf') || file.size <= 0
        || file.size > MAX_RECEIPT_BYTES) {
      throw new Error('Select one non-empty PDF receipt no larger than 10 MiB.');
    }
    const form = new FormData();
    form.append('branch_id', branchId);
    form.append('document_date', documentDate);
    form.append('file', file, file.name);
    const response = await apiHelpers.post<VerifiedExpenseReceiptUpload>(
      '/web/evidence/expense-receipts', form,
    );
    decodeVerifiedExpenseReceipt(response.data);
    return response;
  },
};

export async function prepareExpenseClaim(payload: ExpenseClaimPreparePayload) {
  const response = await prepareCanonicalAction(
    'finance.expense_claim.prepare', payload as unknown as Record<string, unknown>,
  );
  const preview = response.data;
  const references = Array.isArray(preview.resolved_references)
    ? preview.resolved_references as Array<Record<string, unknown>> : [];
  const requiredIds = new Set([
    payload.reimbursement_account_id,
    ...payload.lines.flatMap(line => [line.expense_account_id, line.receipt_attachment_id]),
  ]);
  references.forEach(reference => requiredIds.delete(String(reference.id || '')));
  const tax = Array.isArray(preview.tax_impact) && preview.tax_impact.length === 1
    ? preview.tax_impact[0] as Record<string, unknown> : null;
  const financial = Array.isArray(preview.financial_impact)
    ? preview.financial_impact as Array<Record<string, unknown>> : [];
  const total = addExactDecimals(payload.lines.map(line => line.claimed_amount), 'Expense preview total', MONEY);
  const debitImpacts = financial.filter(impact => impact.debit_account_id !== undefined);
  const creditImpacts = financial.filter(impact => impact.credit_account_id !== undefined);
  const debitTotal = addExactDecimals(debitImpacts.map((impact, index) => normalizeAuthoritativeDecimal(
    impact.amount, `Expense debit impact ${index + 1}`, MONEY,
  )), 'Expense debit impact total', MONEY);
  const creditTotal = addExactDecimals(creditImpacts.map((impact, index) => normalizeAuthoritativeDecimal(
    impact.amount, `Expense credit impact ${index + 1}`, MONEY,
  )), 'Expense credit impact total', MONEY);
  if (String(preview.branch_id || '') !== payload.branch_id || requiredIds.size > 0
      || tax?.treatment !== payload.tax_treatment || tax?.gst_input_tax_claimed !== '0.00'
      || tax?.withholding_amount !== '0.00'
      || financial.length !== payload.lines.length + 1
      || debitImpacts.length !== payload.lines.length || creditImpacts.length !== 1
      || debitTotal !== total || creditTotal !== total) {
    throw new Error('Immutable expense preview does not match the selected evidence, accounts, tax scope, or total. Nothing was approved.');
  }
  return response;
}

export async function executeApprovedExpenseClaim(
  preview: CanonicalCommandPreview,
  lifecycleId: string,
): Promise<CanonicalCommandExecution> {
  const response = await executeApprovedCanonicalAction(
    'finance.expense_claim.prepare', preview, lifecycleId,
  );
  if (!canonicalExecutionCompleted(response.data)
      || !isCanonicalUuid(String(response.data.resource_id || ''))) {
    throw new Error('Expense execution returned no completed claim identity. Query command status before retrying.');
  }
  return response.data;
}
