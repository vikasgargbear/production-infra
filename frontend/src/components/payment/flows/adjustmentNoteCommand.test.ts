import { buildAdjustmentNotePayload } from './adjustmentNoteCommand';
import type { AdjustmentNoteContext } from '../../../services/api/modules/finance/canonicalAdjustmentNotes.api';

const ids = {
  document: 'd3000000-0000-7000-8000-000000000001',
  branch: 'd3000000-0000-7000-8000-000000000002',
  party: 'd3000000-0000-7000-8000-000000000003',
  open: 'd3000000-0000-7000-8000-000000000004',
  line: 'd3000000-0000-7000-8000-000000000005',
  product: 'd3000000-0000-7000-8000-000000000006',
  rule: 'd3000000-0000-7000-8000-000000000007',
  evidence: 'd3000000-0000-7000-8000-000000000008',
};

const context = (overrides: Partial<AdjustmentNoteContext> = {}): AdjustmentNoteContext => ({
  side: 'sales', direction: 'credit', original_document_id: ids.document,
  original_document_number: 'SI-1', original_document_date: '2026-08-20',
  branch_id: ids.branch, party_id: ids.party, party_name: 'Customer',
  original_open_item_id: ids.open, original_open_item_outstanding: '168.00', currency_code: 'INR',
  lines: [{
    original_line_id: ids.line, line_number: 1, product_id: ids.product,
    product_name: 'Product', sku: 'P-1', uom_code: 'EA',
    original_billed_quantity: '2', original_free_quantity: '1',
    remaining_billed_quantity: '2', remaining_free_quantity: '1',
    quoted_unit_rate: '150.0000', price_basis: 'tax_exclusive',
    free_supply_tax_treatment: 'excluded_from_taxable_value',
  }],
  rule_choices: [{ id: ids.rule, reason_code: 'billing_error', gst_tax_treatment: 'commercial_only', rule_version: '1' }],
  ...overrides,
});

it('builds the bounded standalone customer-credit command from canonical source facts', () => {
  expect(buildAdjustmentNotePayload(context(), {
    noteDate: '2026-08-25', ruleId: ids.rule, reason: 'Rate correction',
    quantities: { [ids.line]: { billed: '1.000000', free: '0' } },
  }, 'erp-web-adjustment-note-prepare:attempt-1')).toEqual(expect.objectContaining({
    side: 'sales', direction: 'credit', original_document_id: ids.document,
    reason_code: 'billing_error', gst_tax_treatment: 'commercial_only',
    lines: [expect.objectContaining({
      original_line_id: ids.line, billed_quantity: '1', free_quantity: '0',
      quoted_unit_rate: '150', line_discount: expect.objectContaining({ line_discount_kind: 'none' }),
    })],
  }));
});

it('rejects zero and over-source adjustments before transport', () => {
  const base = { noteDate: '2026-08-25', ruleId: ids.rule, reason: 'Correction' };
  expect(() => buildAdjustmentNotePayload(context(), {
    ...base, quantities: { [ids.line]: { billed: '0', free: '0' } },
  }, 'erp-web-adjustment-note-prepare:attempt-2')).toThrow(/positive billed or free/i);
  expect(() => buildAdjustmentNotePayload(context(), {
    ...base, quantities: { [ids.line]: { billed: '3', free: '0' } },
  }, 'erp-web-adjustment-note-prepare:attempt-3')).toThrow(/exceeds/i);
});

it('requires statutory evidence and keeps it side-specific', () => {
  const statutory = context({
    rule_choices: [{ id: ids.rule, reason_code: 'sales_return', gst_tax_treatment: 'statutory', rule_version: '1' }],
  });
  const draft = {
    noteDate: '2026-08-25', ruleId: ids.rule, reason: 'Statutory reduction',
    quantities: { [ids.line]: { billed: '1', free: '0' } },
  };
  expect(() => buildAdjustmentNotePayload(statutory, draft,
    'erp-web-adjustment-note-prepare:attempt-4')).toThrow(/ITC-reversal evidence/i);
  expect(buildAdjustmentNotePayload(statutory, {
    ...draft, recipientEvidenceId: ids.evidence,
    recipientConfirmedAt: '2026-08-25T10:00:00+05:30',
  }, 'erp-web-adjustment-note-prepare:attempt-5')).toEqual(expect.objectContaining({
    recipient_itc_reversal_evidence_attachment_id: ids.evidence,
  }));
});
