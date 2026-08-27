import { apiHelpers } from '../../../services/api/apiClient';
import {
  approveCanonicalAction,
  executeApprovedCanonicalAction,
  getCanonicalCommandReview,
  type CanonicalCommandExecution,
  type CanonicalCommandPreview,
  type CanonicalCommandReview,
  type CanonicalOperationKey,
  prepareCanonicalAction,
} from '../../../services/api/canonicalOperatorActions';
import { isCanonicalUuid } from '../../../utils/canonicalUuid';

export type CommercialReversalKind = 'sales_return' | 'purchase_return' | 'adjustment_note';

export const REVERSAL_OPERATIONS: Record<CommercialReversalKind, CanonicalOperationKey> = {
  sales_return: 'sales.return.reversal.prepare',
  purchase_return: 'procurement.purchase_return.reversal.prepare',
  adjustment_note: 'finance.adjustment_note.reversal.prepare',
};

export type CommercialReversalInput = {
  kind: CommercialReversalKind;
  originalResourceId: string;
  expectedRowVersion: string;
  reversalDate: string;
  reason: string;
  amendmentEvidenceAttachmentId?: string;
  idempotencyKey: string;
};

export type CommercialReversalReadback = {
  command_request_id: string;
  operation: string;
  reversal_adjustment_note_id: string;
  reversal_note_status: 'posted';
  original_adjustment_note_id: string;
  original_note_status: 'reversed';
  original_return_status: 'reversed' | null;
  reversal_journal_id: string;
  reversal_journal_status: 'posted';
  original_journal_id: string;
  original_journal_status: 'reversed';
  journal_debit_total: string;
  journal_credit_total: string;
  reversal_tax_document_id: string | null;
  original_tax_document_id: string | null;
  reversal_inventory_document_id: string | null;
  original_inventory_document_id: string | null;
  reversed_allocation_count: number;
  stock_entries: Array<{
    ledger_entry_id: string;
    reverses_entry_id: string;
    product_id: string;
    batch_id: string;
    location_id: string;
    quantity_delta: string;
    value_delta: string;
  }>;
};

export type CommercialReversalSource = {
  reversal_kind: CommercialReversalKind;
  original_resource_id: string;
  expected_row_version: number;
  branch_id: string;
  original_adjustment_note_id: string;
  original_note_date: string;
  reported: boolean;
  amendment_evidence_required: boolean;
  inventory_document_id: string | null;
};

const ROW_VERSION = /^[1-9][0-9]*$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const IDEMPOTENCY = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/;

export function buildCommercialReversalPayload(input: CommercialReversalInput): Record<string, unknown> {
  if (!isCanonicalUuid(input.originalResourceId)) throw new Error('Select one exact posted source UUID.');
  if (!ROW_VERSION.test(input.expectedRowVersion)) throw new Error('Enter the exact positive source row version.');
  const expectedRowVersion = Number(input.expectedRowVersion);
  if (!Number.isSafeInteger(expectedRowVersion)) throw new Error('Source row version exceeds the exact browser integer boundary.');
  if (!DATE.test(input.reversalDate)) throw new Error('Select an India-local reversal date.');
  if (input.reason.trim().length < 8) throw new Error('Enter a specific auditable reversal reason.');
  if (!IDEMPOTENCY.test(input.idempotencyKey)) throw new Error('Reversal prepare identity is invalid.');
  if (input.amendmentEvidenceAttachmentId && !isCanonicalUuid(input.amendmentEvidenceAttachmentId)) {
    throw new Error('Amendment evidence must be an exact verified attachment UUID.');
  }
  return {
    idempotency_key: input.idempotencyKey,
    original_resource_id: input.originalResourceId,
    expected_row_version: expectedRowVersion,
    reversal_date: input.reversalDate,
    reason: input.reason.trim(),
    ...(input.amendmentEvidenceAttachmentId
      ? { amendment_evidence_attachment_id: input.amendmentEvidenceAttachmentId }
      : {}),
  };
}

export async function loadCommercialReversalSource(
  kind: CommercialReversalKind,
  originalResourceId: string,
): Promise<CommercialReversalSource> {
  if (!isCanonicalUuid(originalResourceId)) throw new Error('Select one exact posted source UUID.');
  const response = await apiHelpers.get<CommercialReversalSource>(
    '/web/actions/commercial-reversal/source',
    { params: { reversal_kind: kind, original_resource_id: originalResourceId } },
  );
  const source = response.data;
  if (
    source.reversal_kind !== kind
    || source.original_resource_id !== originalResourceId
    || !Number.isSafeInteger(source.expected_row_version)
    || source.expected_row_version <= 0
    || !isCanonicalUuid(source.original_adjustment_note_id)
    || !isCanonicalUuid(source.branch_id)
  ) throw new Error('Canonical source resolution returned incomplete or mismatched facts.');
  return source;
}

export async function prepareCommercialReversal(input: CommercialReversalInput): Promise<CanonicalCommandPreview> {
  return (await prepareCanonicalAction(
    REVERSAL_OPERATIONS[input.kind],
    buildCommercialReversalPayload(input),
  )).data;
}

export async function reviewCommercialReversal(commandId: string): Promise<CanonicalCommandReview> {
  const review = (await getCanonicalCommandReview(commandId)).data;
  if (!Object.values(REVERSAL_OPERATIONS).includes(review.capability_code)) {
    throw new Error('Command is not a supported commercial reversal.');
  }
  return review;
}

export async function approveCommercialReversal(
  review: CanonicalCommandReview,
  lifecycleId: string,
): Promise<void> {
  await approveCanonicalAction(review.capability_code, review, lifecycleId);
}

export async function executeCommercialReversal(
  review: CanonicalCommandReview,
  lifecycleId: string,
): Promise<CanonicalCommandExecution> {
  return (await executeApprovedCanonicalAction(
    review.capability_code,
    review,
    lifecycleId,
  )).data;
}

export async function readCommercialReversal(commandId: string): Promise<CommercialReversalReadback> {
  if (!isCanonicalUuid(commandId)) throw new Error('Readback requires an exact command UUID.');
  const response = await apiHelpers.get<CommercialReversalReadback>(
    `/web/actions/commercial-reversal/commands/${commandId}/readback`,
    { preserveExactDecimals: true },
  );
  const readback = response.data;
  if (
    readback.command_request_id !== commandId
    || readback.reversal_note_status !== 'posted'
    || readback.original_note_status !== 'reversed'
    || readback.reversal_journal_status !== 'posted'
    || readback.original_journal_status !== 'reversed'
    || readback.journal_debit_total !== readback.journal_credit_total
  ) {
    throw new Error('Commercial reversal did not reconcile to exact balanced canonical evidence.');
  }
  if (readback.original_inventory_document_id && readback.stock_entries.length === 0) {
    throw new Error('Return reversal is missing exact stock-ledger lineage.');
  }
  return readback;
}
