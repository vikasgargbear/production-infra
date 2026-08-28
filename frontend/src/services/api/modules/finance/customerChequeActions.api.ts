import type { CanonicalCommandPreview } from '../../canonicalOperatorActions';
import {
  approveCanonicalAction,
  canonicalExecutionCompleted,
  executeApprovedCanonicalAction,
  getCanonicalCommandReview,
  prepareCanonicalAction,
  type CanonicalCommandReview,
} from '../../canonicalOperatorActions';
import { isCanonicalUuid } from '../../../../utils/canonicalUuid';
import { moneyToCents } from '../../../../components/payment/entry/customerReceiptCommand';
import { paymentAllocationApi } from './paymentAllocation.api';

export type CustomerChequeAction = 'clearance' | 'bounce';

export interface CustomerChequeReceiptSource {
  payment_id: string;
  branch_id: string;
  row_version: number;
  payment_method: 'cheque';
  status: 'posted';
  evidence_attachment_id: string;
}

export interface CustomerChequeActionDraft {
  branch_id: string;
  original_payment_id: string;
  original_payment_row_version: number;
  action_date: string;
  evidence_attachment_id: string;
  bank_account_id?: string;
  clearance_reference?: string;
  reason_code?: 'funds_insufficient' | 'signature_mismatch' | 'account_closed' | 'payment_stopped' | 'instrument_invalid' | 'other';
}

export async function prepareCustomerChequeAction(
  action: CustomerChequeAction,
  draft: CustomerChequeActionDraft,
  idempotencyKey: string,
): Promise<CanonicalCommandPreview> {
  if (!isCanonicalUuid(draft.branch_id) || !isCanonicalUuid(draft.original_payment_id)
    || !Number.isSafeInteger(draft.original_payment_row_version)
    || draft.original_payment_row_version <= 0
    || !/^\d{4}-\d{2}-\d{2}$/.test(draft.action_date)
    || !isCanonicalUuid(draft.evidence_attachment_id)) {
    throw new Error('Cheque action requires exact receipt row version, date, branch, and verified evidence.');
  }
  const operation = action === 'clearance'
    ? 'finance.customer_cheque_clearance.prepare' as const
    : 'finance.customer_cheque_bounce.prepare' as const;
  const payload: Record<string, unknown> = {
    idempotency_key: idempotencyKey,
    branch_id: draft.branch_id,
    original_payment_id: draft.original_payment_id,
    original_payment_row_version: String(draft.original_payment_row_version),
    [`${action === 'clearance' ? 'clearance' : 'bounce'}_date`]: draft.action_date,
    evidence_attachment_id: draft.evidence_attachment_id,
  };
  if (action === 'clearance') {
    if (!isCanonicalUuid(draft.bank_account_id) || !draft.clearance_reference?.trim()) {
      throw new Error('Cheque clearance requires a canonical bank and exact clearance reference.');
    }
    payload.bank_account_id = draft.bank_account_id;
    payload.clearance_reference = draft.clearance_reference.trim();
  } else {
    if (!draft.reason_code) throw new Error('Cheque bounce requires a reviewed reason code.');
    payload.reason_code = draft.reason_code;
  }
  const response = await prepareCanonicalAction(operation, payload);
  const preview = response.data;
  if (preview.operation !== `finance.customer_cheque_${action}.post`
    || preview.branch_id !== draft.branch_id
    || preview.target_resource_type !== 'payment'
    || !isCanonicalUuid(preview.target_resource_id)) {
    throw new Error('Authoritative cheque-action preview differs from the selected receipt.');
  }
  return preview;
}

export async function loadCustomerChequeReceiptSource(
  paymentId: string,
): Promise<CustomerChequeReceiptSource> {
  if (!isCanonicalUuid(paymentId)) throw new Error('Enter one exact posted cheque receipt UUID.');
  const response = await paymentAllocationApi.getCustomerReceiptReadback(paymentId);
  const receipt = response.data && typeof response.data === 'object'
    ? response.data as Record<string, any>
    : {};
  const terminalActions = Array.isArray(receipt.terminal_actions) ? receipt.terminal_actions : [];
  const rowVersion = Number(receipt.row_version);
  if (String(receipt.payment_id || '') !== paymentId
    || receipt.payment_method !== 'cheque'
    || receipt.status !== 'posted'
    || !isCanonicalUuid(String(receipt.branch_id || ''))
    || !isCanonicalUuid(String(receipt.evidence_attachment_id || ''))
    || !Number.isSafeInteger(rowVersion)
    || rowVersion <= 0
    || terminalActions.length !== 0) {
    throw new Error('The exact receipt is not an uncleared canonical cheque with an authoritative row version.');
  }
  return {
    payment_id: paymentId,
    branch_id: String(receipt.branch_id),
    row_version: rowVersion,
    payment_method: 'cheque',
    status: 'posted',
    evidence_attachment_id: String(receipt.evidence_attachment_id || ''),
  };
}

export async function reviewCustomerChequeAction(
  commandRequestId: string,
): Promise<CanonicalCommandReview> {
  const review = (await getCanonicalCommandReview(commandRequestId)).data;
  if (![
    'finance.customer_cheque_clearance.prepare',
    'finance.customer_cheque_bounce.prepare',
  ].includes(review.capability_code)) {
    throw new Error('The exact command is not a customer cheque terminal action.');
  }
  if (review.approval_policy !== 'separate_approver') {
    throw new Error('Cheque terminal actions require a distinct reviewer.');
  }
  return review;
}

export async function approveCustomerChequeAction(
  review: CanonicalCommandReview,
  lifecycleId: string,
): Promise<void> {
  if (![
    'finance.customer_cheque_clearance.prepare',
    'finance.customer_cheque_bounce.prepare',
  ].includes(review.capability_code)
    || review.approval_policy !== 'separate_approver'
    || review.status !== 'pending_approval') {
    throw new Error('Load the exact pending cheque command before independent approval.');
  }
  await approveCanonicalAction(review.capability_code, review, lifecycleId);
}

export async function executeCustomerChequeAction(
  action: CustomerChequeAction,
  review: CanonicalCommandReview,
  lifecycleId: string,
): Promise<string> {
  const operation = action === 'clearance'
    ? 'finance.customer_cheque_clearance.prepare' as const
    : 'finance.customer_cheque_bounce.prepare' as const;
  if (review.capability_code !== operation || review.status !== 'approved') {
    throw new Error('Load the exact independently approved cheque action before execution.');
  }
  const executed = await executeApprovedCanonicalAction(operation, review, lifecycleId);
  const paymentId = String(executed.data.resource_id || '');
  if (!canonicalExecutionCompleted(executed.data) || !isCanonicalUuid(paymentId)) {
    throw new Error('Cheque action did not return one completed compensating payment identity.');
  }
  const response = await paymentAllocationApi.getCustomerChequeActionReadback(paymentId);
  const receipt = response.data && typeof response.data === 'object'
    ? response.data as Record<string, any>
    : {};
  const terminalActions = Array.isArray(receipt.terminal_actions) ? receipt.terminal_actions : [];
  const terminal = terminalActions.length === 1 ? terminalActions[0] : null;
  if (receipt.payment_method !== 'cheque'
    || receipt.status !== 'posted'
    || receipt.allocation_reconciled !== true
    || receipt.journal_balanced !== true
    || !terminal
    || String(terminal.action_payment_id || '') !== paymentId
    || String(terminal.action || '') !== `cheque_${action}`
    || moneyToCents(terminal.journal_debit_total) !== moneyToCents(receipt.amount)
    || moneyToCents(terminal.journal_credit_total) !== moneyToCents(receipt.amount)) {
    throw new Error('Cheque action executed, but its exact receipt, allocation, or journal readback did not reconcile. Do not retry blindly.');
  }
  return paymentId;
}
