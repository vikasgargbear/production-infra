import { apiHelpers } from '../../apiClient';
import { prepareCanonicalAction } from '../../canonicalOperatorActions';
import {
  canonicalAdjustmentNotesApi,
  prepareAdjustmentNote,
  reconcileAdjustmentNote,
  type AdjustmentNotePreparePayload,
} from './canonicalAdjustmentNotes.api';

jest.mock('../../apiClient', () => ({ apiHelpers: { get: jest.fn() } }));
jest.mock('../../canonicalOperatorActions', () => ({
  prepareCanonicalAction: jest.fn(),
  executeApprovedCanonicalAction: jest.fn(),
  canonicalExecutionCompleted: jest.fn(),
}));

const ids = {
  branch: '10000000-0000-7000-8000-000000000001',
  document: '10000000-0000-7000-8000-000000000002',
  line: '10000000-0000-7000-8000-000000000003',
  note: '10000000-0000-7000-8000-000000000004',
};
const payload: AdjustmentNotePreparePayload = {
  idempotency_key: 'adjustment:attempt-1', branch_id: ids.branch,
  note_date: '2026-08-25', side: 'sales', direction: 'credit',
  original_document_id: ids.document, gst_tax_treatment: 'commercial_only',
  reason_code: 'billing_error', reason: 'Correction', rounding_policy: 'none',
  document_discount: { document_discount_kind: 'none', document_discount_basis: 'taxable_value', document_discount_value: '0' },
  lines: [{
    original_line_id: ids.line, billed_quantity: '1', free_quantity: '0',
    free_supply_tax_treatment: 'excluded_from_taxable_value', quoted_unit_rate: '168',
    price_basis: 'tax_exclusive', document_discount_eligible: true,
    line_discount: { line_discount_kind: 'none', line_discount_basis: 'taxable_value', line_discount_value: '0' },
  }],
};

it('uses the canonical context and posted-note routes only', async () => {
  (apiHelpers.get as jest.Mock).mockResolvedValue({ data: {} });
  await canonicalAdjustmentNotesApi.getContext('sales', ids.document, '2026-08-25');
  await canonicalAdjustmentNotesApi.getPosted(ids.note);
  expect(apiHelpers.get).toHaveBeenNthCalledWith(1, '/canonical/adjustment-notes/context', {
    params: { side: 'sales', document_id: ids.document, note_date: '2026-08-25' },
  });
  expect(apiHelpers.get).toHaveBeenNthCalledWith(2, `/canonical/adjustment-notes/${ids.note}`);
});

it('rejects preview source or financial-effect drift before approval', async () => {
  (prepareCanonicalAction as jest.Mock).mockResolvedValue({ data: {
    command_request_id: ids.note, preview_hash: `sha256:${'a'.repeat(64)}`,
    branch_id: ids.branch, resolved_references: [{ id: ids.document }],
    financial_impact: [{ effect: 'payable_debit', currency_code: 'INR', amount: '168.00' }],
  } });
  await expect(prepareAdjustmentNote(payload)).rejects.toThrow(/does not match/i);
});

it('requires exact posted source lines and a balanced journal', async () => {
  (apiHelpers.get as jest.Mock).mockResolvedValue({ data: {
    id: ids.note, note_number: 'CN-1', note_date: '2026-08-25', side: 'sales', direction: 'credit',
    status: 'posted', original_document_id: ids.document, party_id: ids.branch,
    counterparty_payable_amount: '168.00', accounting_event_id: ids.branch,
    journal_entry_id: ids.branch, journal_debit_total: '168.00', journal_credit_total: '167.99',
    allocated_amount: '168.00', residual_open_item_amount: '0.00',
    lines: [{ id: ids.branch, original_line_id: ids.line, line_total: '168.00' }],
  } });
  await expect(reconcileAdjustmentNote(ids.note, payload)).rejects.toThrow(/did not reconcile/i);
});
