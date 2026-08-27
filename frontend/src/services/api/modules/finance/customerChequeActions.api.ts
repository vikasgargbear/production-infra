import type { CanonicalCommandPreview } from '../../canonicalOperatorActions';
import {
  approveAndExecuteCanonicalAction,
  canonicalExecutionCompleted,
  prepareCanonicalAction,
} from '../../canonicalOperatorActions';
import { isCanonicalUuid } from '../../../../utils/canonicalUuid';
import { moneyToCents } from '../../../../components/payment/entry/customerReceiptCommand';
import { paymentAllocationApi } from './paymentAllocation.api';

export type CustomerChequeAction = 'clearance' | 'bounce';

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

export async function executeCustomerChequeAction(
  action: CustomerChequeAction,
  preview: CanonicalCommandPreview,
  lifecycleId: string,
): Promise<string> {
  const operation = action === 'clearance'
    ? 'finance.customer_cheque_clearance.prepare' as const
    : 'finance.customer_cheque_bounce.prepare' as const;
  const { executed } = await approveAndExecuteCanonicalAction(operation, preview, lifecycleId);
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
