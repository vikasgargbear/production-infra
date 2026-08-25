import { isCanonicalUuid } from '../../../utils/canonicalUuid';
import type {
  AdjustmentNoteContext,
  AdjustmentNotePreparePayload,
  GstAdjustmentTreatment,
} from '../../../services/api/modules/finance/canonicalAdjustmentNotes.api';

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const DECIMAL = /^(?:0|[1-9][0-9]{0,13})(?:\.[0-9]{1,6})?$/;
const KEY = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/;

const decimal = (value: string, label: string): string => {
  const text = value.trim();
  if (!DECIMAL.test(text)) throw new Error(`${label} must be a nonnegative decimal with at most six places.`);
  const [whole, fraction = ''] = text.split('.');
  const normalizedFraction = fraction.replace(/0+$/, '');
  return normalizedFraction ? `${whole}.${normalizedFraction}` : whole;
};

const positive = (value: string): boolean => {
  const [whole, fraction = ''] = value.split('.');
  return BigInt(whole) * 1_000_000n + BigInt(fraction.padEnd(6, '0')) > 0n;
};

const lte = (left: string, right: string): boolean => {
  const units = (value: string) => {
    const [whole, fraction = ''] = value.split('.');
    return BigInt(whole) * 1_000_000n + BigInt(fraction.padEnd(6, '0'));
  };
  return units(left) <= units(right);
};

export interface AdjustmentDraft {
  noteDate: string;
  ruleId: string;
  reason: string;
  quantities: Record<string, { billed: string; free: string }>;
  recipientEvidenceId?: string;
  recipientConfirmedAt?: string;
  portalLineId?: string;
}

export function buildAdjustmentNotePayload(
  context: AdjustmentNoteContext,
  draft: AdjustmentDraft,
  idempotencyKey: string,
): AdjustmentNotePreparePayload {
  if (!KEY.test(idempotencyKey)) throw new Error('Adjustment prepare requires a durable idempotency key.');
  if (!DATE.test(draft.noteDate) || draft.noteDate < context.original_document_date) {
    throw new Error('Adjustment date must be a valid date on or after the original document date.');
  }
  if (!draft.reason.trim()) throw new Error('Enter the business reason retained on the adjustment note.');
  const rule = context.rule_choices.find(row => row.id === draft.ruleId);
  if (!rule) throw new Error('Select an effective reviewed adjustment rule.');
  const lines = context.lines.flatMap(line => {
    const entered = draft.quantities[line.original_line_id];
    if (!entered) return [];
    if (!entered.billed.trim() || !entered.free.trim()) {
      throw new Error(`${line.product_name} requires explicit billed and free quantities; enter 0 when there is no adjustment.`);
    }
    const billed = decimal(entered.billed, `${line.product_name} billed quantity`);
    const free = decimal(entered.free, `${line.product_name} free quantity`);
    if (!positive(billed) && !positive(free)) return [];
    if (!lte(billed, decimal(line.remaining_billed_quantity, 'Remaining billed quantity'))
      || !lte(free, decimal(line.remaining_free_quantity, 'Remaining free quantity'))) {
      throw new Error(`${line.product_name} exceeds the authoritative adjustable quantity.`);
    }
    return [{
      original_line_id: line.original_line_id,
      billed_quantity: billed,
      free_quantity: free,
      free_supply_tax_treatment: line.free_supply_tax_treatment,
      quoted_unit_rate: decimal(line.quoted_unit_rate, 'Quoted unit rate'),
      price_basis: line.price_basis,
      line_discount: {
        line_discount_kind: 'none' as const,
        line_discount_basis: 'taxable_value' as const,
        line_discount_value: '0' as const,
      },
      document_discount_eligible: true as const,
    }];
  });
  if (!lines.length) throw new Error('Enter a positive billed or free quantity on at least one source line.');

  const payload: AdjustmentNotePreparePayload = {
    idempotency_key: idempotencyKey,
    branch_id: context.branch_id,
    note_date: draft.noteDate,
    side: context.side,
    direction: context.direction,
    original_document_id: context.original_document_id,
    gst_tax_treatment: rule.gst_tax_treatment as GstAdjustmentTreatment,
    reason_code: rule.reason_code,
    reason: draft.reason.trim(),
    rounding_policy: 'none',
    document_discount: {
      document_discount_kind: 'none',
      document_discount_basis: 'taxable_value',
      document_discount_value: '0',
    },
    lines,
  };
  if (rule.gst_tax_treatment === 'statutory' && context.side === 'sales') {
    if (!isCanonicalUuid(draft.recipientEvidenceId || '')) {
      throw new Error('A canonical recipient ITC-reversal evidence attachment is required for a statutory sales credit.');
    }
    if (!draft.recipientConfirmedAt
      || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/.test(draft.recipientConfirmedAt)
      || Number.isNaN(Date.parse(draft.recipientConfirmedAt))) {
      throw new Error('Recipient ITC-reversal confirmation time must be RFC 3339 with an explicit offset.');
    }
    payload.recipient_itc_reversal_evidence_attachment_id = draft.recipientEvidenceId;
    payload.recipient_itc_reversal_confirmed_at = draft.recipientConfirmedAt;
  }
  if (rule.gst_tax_treatment === 'statutory' && context.side === 'purchase') {
    if (!isCanonicalUuid(draft.portalLineId || '')) {
      throw new Error('A canonical GSTR-2B supplier credit-note line is required for a statutory supplier debit.');
    }
    payload.counterparty_portal_document_line_id = draft.portalLineId;
  }
  return payload;
}
