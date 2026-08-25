import type { AxiosResponse } from 'axios';

import type { CanonicalCommandPreview } from '../../canonicalOperatorActions';
import {
  canonicalExecutionCompleted,
  executeApprovedCanonicalAction,
  prepareCanonicalAction,
} from '../../canonicalOperatorActions';
import { apiHelpers } from '../../apiClient';
import { isCanonicalUuid } from '../../../../utils/canonicalUuid';

export type AdjustmentSide = 'sales' | 'purchase';
export type AdjustmentDirection = 'credit' | 'debit';
export type GstAdjustmentTreatment = 'statutory' | 'commercial_only';

export interface AdjustmentSourceLine {
  original_line_id: string;
  line_number: number;
  product_id: string;
  product_name: string;
  sku: string;
  uom_code: string;
  original_billed_quantity: string;
  original_free_quantity: string;
  remaining_billed_quantity: string;
  remaining_free_quantity: string;
  quoted_unit_rate: string;
  price_basis: 'tax_exclusive' | 'tax_inclusive';
  free_supply_tax_treatment: 'excluded_from_taxable_value' | 'included_at_unit_rate';
}

export interface AdjustmentRuleChoice {
  id: string;
  reason_code: string;
  gst_tax_treatment: GstAdjustmentTreatment;
  rule_version: string;
}

export interface AdjustmentNoteContext {
  side: AdjustmentSide;
  direction: AdjustmentDirection;
  original_document_id: string;
  original_document_number: string;
  original_document_date: string;
  branch_id: string;
  party_id: string;
  party_name: string;
  original_open_item_id: string;
  original_open_item_outstanding: string;
  currency_code: 'INR';
  lines: AdjustmentSourceLine[];
  rule_choices: AdjustmentRuleChoice[];
}

export interface AdjustmentNotePreparePayload {
  idempotency_key: string;
  branch_id: string;
  note_date: string;
  side: AdjustmentSide;
  direction: AdjustmentDirection;
  original_document_id: string;
  gst_tax_treatment: GstAdjustmentTreatment;
  recipient_itc_reversal_evidence_attachment_id?: string;
  recipient_itc_reversal_confirmed_at?: string;
  counterparty_portal_document_line_id?: string;
  reason_code: string;
  reason: string;
  rounding_policy: 'none';
  document_discount: {
    document_discount_kind: 'none';
    document_discount_basis: 'taxable_value';
    document_discount_value: '0';
  };
  lines: Array<{
    original_line_id: string;
    billed_quantity: string;
    free_quantity: string;
    free_supply_tax_treatment: AdjustmentSourceLine['free_supply_tax_treatment'];
    quoted_unit_rate: string;
    price_basis: AdjustmentSourceLine['price_basis'];
    line_discount: {
      line_discount_kind: 'none';
      line_discount_basis: 'taxable_value';
      line_discount_value: '0';
    };
    document_discount_eligible: true;
  }>;
}

export interface PostedAdjustmentNote {
  id: string;
  note_number: string;
  note_date: string;
  side: AdjustmentSide;
  direction: AdjustmentDirection;
  status: 'posted';
  original_document_id: string;
  party_id: string;
  counterparty_payable_amount: string;
  accounting_event_id: string;
  journal_entry_id: string;
  journal_debit_total: string;
  journal_credit_total: string;
  allocated_amount: string;
  residual_open_item_amount: string;
  lines: Array<{ id: string; original_line_id: string; line_total: string }>;
}

export const canonicalAdjustmentNotesApi = {
  getContext: (
    side: AdjustmentSide,
    documentId: string,
    noteDate: string,
  ): Promise<AxiosResponse<AdjustmentNoteContext>> => {
    if (!isCanonicalUuid(documentId)) {
      return Promise.reject(new Error('Adjustment context requires a canonical source-document UUID.'));
    }
    return apiHelpers.get('/canonical/adjustment-notes/context', {
      params: { side, document_id: documentId, note_date: noteDate },
    });
  },
  getPosted: (noteId: string): Promise<AxiosResponse<PostedAdjustmentNote>> => {
    if (!isCanonicalUuid(noteId)) {
      return Promise.reject(new Error('Adjustment readback requires a canonical note UUID.'));
    }
    return apiHelpers.get(`/canonical/adjustment-notes/${noteId}`);
  },
};

export async function prepareAdjustmentNote(payload: AdjustmentNotePreparePayload) {
  const response = await prepareCanonicalAction(
    'finance.adjustment_note.prepare',
    payload as unknown as Record<string, unknown>,
  );
  const preview = response.data;
  const original = (preview.resolved_references as Array<Record<string, unknown>> | undefined)
    ?.some(row => String(row.id || '') === payload.original_document_id);
  const impact = Array.isArray(preview.financial_impact) && preview.financial_impact.length === 1
    ? preview.financial_impact[0] as Record<string, unknown>
    : null;
  const expectedEffect = payload.side === 'sales' ? 'receivable_credit' : 'payable_debit';
  if (String(preview.branch_id || '') !== payload.branch_id || !original
    || !impact || impact.effect !== expectedEffect || impact.currency_code !== 'INR') {
    throw new Error('Immutable adjustment preview does not match the selected source, branch, side, or currency. Nothing was approved.');
  }
  return response;
}

export async function executeApprovedAdjustmentNote(
  preview: CanonicalCommandPreview,
  lifecycleId: string,
): Promise<string> {
  const executed = await executeApprovedCanonicalAction(
    'finance.adjustment_note.prepare', preview, lifecycleId,
  );
  const noteId = String(executed.data.resource_id || '');
  if (!canonicalExecutionCompleted(executed.data) || !isCanonicalUuid(noteId)) {
    throw new Error('Adjustment execution returned no completed note identity. Query command status before retrying.');
  }
  return noteId;
}

export async function reconcileAdjustmentNote(
  noteId: string,
  payload: AdjustmentNotePreparePayload,
): Promise<PostedAdjustmentNote> {
  const posted = (await canonicalAdjustmentNotesApi.getPosted(noteId)).data;
  const sourceLines = new Set(payload.lines.map(row => row.original_line_id));
  if (posted.id !== noteId || posted.status !== 'posted'
    || posted.side !== payload.side || posted.direction !== payload.direction
    || posted.original_document_id !== payload.original_document_id
    || posted.journal_debit_total !== posted.journal_credit_total
    || posted.lines.length !== sourceLines.size
    || posted.lines.some(row => !sourceLines.has(row.original_line_id))) {
    throw new Error('Adjustment posted, but authoritative note, source-line, allocation, or journal readback did not reconcile. Do not execute again.');
  }
  return posted;
}
