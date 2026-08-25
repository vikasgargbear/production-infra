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
  partyAccount: 'd3000000-0000-7000-8000-000000000009',
  taxCodeVersion: 'd3000000-0000-7000-8000-000000000010',
};

const context = (overrides: Partial<AdjustmentNoteContext> = {}): AdjustmentNoteContext => ({
  side: 'sales', direction: 'credit', document_effect: 'decrease', original_document_id: ids.document,
  original_document_number: 'SI-1', original_document_date: '2026-08-20',
  branch_id: ids.branch, party_id: ids.party, party_account_id: ids.partyAccount,
  party_name: 'Customer', original_open_item_id: ids.open,
  original_open_item_principal: '336.00', original_open_item_outstanding: '168.00',
  currency_code: 'INR', supply_type: 'intra_state',
  zero_rated_payment_mode: 'not_applicable', tax_charge_mechanism: 'normal',
  rounding_policy: 'nearest_rupee',
  document_discount: { kind: 'percent', basis: 'price_value', value: '5.000000' },
  lines: [{
    original_line_id: ids.line, line_number: 1, product_id: ids.product,
    product_name: 'Product', sku: 'P-1', uom_code: 'EA', uom_conversion_factor: '1.000000',
    original_billed_quantity: '2', original_free_quantity: '1',
    net_decreased_billed_quantity: '0', net_decreased_free_quantity: '0',
    remaining_billed_quantity: '2', remaining_free_quantity: '1',
    quoted_unit_rate: '150.0000', price_basis: 'tax_exclusive',
    line_discount: { kind: 'amount', basis: 'taxable_value', value: '10.000000' },
    document_discount_eligible: false,
    free_supply_tax_treatment: 'excluded_from_taxable_value',
    tax_charge_mechanism: 'normal', tax_classification_code_snapshot: '481910',
    tax_code_version_id: ids.taxCodeVersion, taxability_snapshot: 'taxable',
    cgst_rate: '6.000000', sgst_rate: '6.000000', igst_rate: '0.000000', cess_rate: '0.000000',
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
      quoted_unit_rate: '150', document_discount_eligible: false,
      line_discount: {
        line_discount_kind: 'amount', line_discount_basis: 'taxable_value',
        line_discount_value: '10',
      },
    })],
    rounding_policy: 'nearest_rupee',
    document_discount: {
      document_discount_kind: 'percent', document_discount_basis: 'price_value',
      document_discount_value: '5',
    },
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
  expect(() => buildAdjustmentNotePayload(context(), {
    ...base, quantities: { [ids.line]: { billed: '1', free: '' } },
  }, 'erp-web-adjustment-note-prepare:attempt-blank')).toThrow(/explicit billed and free/i);
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
  expect(() => buildAdjustmentNotePayload(statutory, {
    ...draft, recipientEvidenceId: ids.evidence,
    recipientConfirmedAt: '2026-08-25T10:00:00',
  }, 'erp-web-adjustment-note-prepare:attempt-6')).toThrow(/explicit offset/i);
});

it('fails closed when canonical discount or tax facts are internally inconsistent', () => {
  const draft = {
    noteDate: '2026-08-25', ruleId: ids.rule, reason: 'Correction',
    quantities: { [ids.line]: { billed: '1', free: '0' } },
  };
  expect(() => buildAdjustmentNotePayload(context({
    document_discount: { kind: 'none', basis: 'taxable_value', value: '1' },
  }), draft, 'erp-web-adjustment-note-prepare:bad-discount')).toThrow(/kind none/i);
  expect(() => buildAdjustmentNotePayload(context({
    lines: [{ ...context().lines[0], igst_rate: '12.000000' }],
  }), draft, 'erp-web-adjustment-note-prepare:bad-tax')).toThrow(/supply type/i);
});
