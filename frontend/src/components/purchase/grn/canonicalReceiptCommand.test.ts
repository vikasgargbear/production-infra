import {
  buildCanonicalReceiptPayload,
  canRecordCanonicalReceipt,
  initialReceiptDraft,
} from './canonicalReceiptCommand';
import type { CanonicalReceiptContext } from '../../../services/api/modules/purchase/canonicalGoodsReceipts.api';


const NOW = new Date('2026-08-25T12:00:00.000Z');
const context: CanonicalReceiptContext = {
  purchase_order_id: '10000000-0000-7000-8000-000000000001',
  purchase_order_number: 'CODEX-E2E-PO-0001',
  branch_id: '10000000-0000-7000-8000-000000000002',
  supplier_account_id: '10000000-0000-7000-8000-000000000003',
  supplier_name: 'Canonical Supplier',
  status: 'approved',
  lines: [{
    purchase_order_line_id: '10000000-0000-7000-8000-000000000004',
    line_number: 1,
    product_id: '10000000-0000-7000-8000-000000000005',
    product_name: 'Canonical Product',
    sku: 'CODEX-E2E-SKU',
    ordered_uom_code: 'PACK',
    base_uom_code: 'EA',
    uom_conversion_factor: '10.000000',
    ordered_billed_quantity: '10.000000',
    ordered_free_quantity: '2.000000',
    remaining_billed_quantity: '10.000000',
    remaining_free_quantity: '2.000000',
    eligible_locations: [{
      id: '10000000-0000-7000-8000-000000000006',
      code: 'QUARANTINE',
      name: 'Quarantine',
      location_type: 'quarantine',
    }],
    mrp_conversions: [{
      id: '10000000-0000-7000-8000-000000000007',
      from_uom_code: 'PACK',
      to_uom_code: 'EA',
      multiplier: '10.000000',
    }],
  }],
};

function validDraft() {
  const draft = initialReceiptDraft(
    context,
    'CODEX-E2E-PUR-RET-20260825:receipt:0001',
    NOW,
  );
  draft.lines[0].manufacturerBatchNumber = 'CODEX-E2E-BATCH-0001';
  draft.lines[0].manufacturedOn = '2026-07-01';
  draft.lines[0].expiresOn = '2027-07-01';
  draft.lines[0].mrp = '125.00';
  draft.supplierChallanNumber = 'CODEX-E2E-CH-0001';
  draft.supplierChallanDate = '2026-08-25';
  return draft;
}

describe('canonical goods-receipt command contract', () => {
  it.each(['approved', 'partially_received'])(
    'offers the CTA for receivable canonical PO status %s',
    status => expect(canRecordCanonicalReceipt(status)).toBe(true),
  );

  it.each(['draft', 'pending', 'submitted', 'confirmed', 'received', 'cancelled', 'partial'])(
    'hides the CTA for non-receivable or legacy status %s',
    status => expect(canRecordCanonicalReceipt(status)).toBe(false),
  );

  it('preserves billed/free quantities, batch, location and MRP evidence', () => {
    const payload = buildCanonicalReceiptPayload(context, validDraft(), NOW) as any;
    expect(payload).toMatchObject({
      purchase_order_id: context.purchase_order_id,
      branch_id: context.branch_id,
      supplier_account_id: context.supplier_account_id,
      supplier_challan_number: 'CODEX-E2E-CH-0001',
      supplier_challan_date: '2026-08-25',
      lines: [{
        purchase_order_line_id: context.lines[0].purchase_order_line_id,
        batches: [{
          manufacturer_batch_number: 'CODEX-E2E-BATCH-0001',
          received_quantity: '10.000000',
          accepted_quantity: '10.000000',
          rejected_quantity: '0',
          free_quantity: '2.000000',
          mrp_uom_conversion_id: context.lines[0].mrp_conversions[0].id,
          to_location_id: context.lines[0].eligible_locations[0].id,
          qc_status: 'accepted',
        }],
      }],
    });
  });

  it.each([
    ['missing batch', (draft: any) => { draft.lines[0].manufacturerBatchNumber = ''; }, /batch number is required/i],
    ['expired', (draft: any) => { draft.lines[0].expiresOn = '2026-08-25'; }, /expiry must be after/i],
    ['over billed', (draft: any) => { draft.lines[0].acceptedQuantity = '11'; draft.lines[0].receivedQuantity = '11'; }, /exceeds.*billed/i],
    ['over free', (draft: any) => { draft.lines[0].freeQuantity = '3'; }, /exceeds.*free/i],
    ['quantity mismatch', (draft: any) => { draft.lines[0].rejectedQuantity = '1'; }, /accepted plus rejected/i],
    ['partial no notes', (draft: any) => { draft.lines[0].qcStatus = 'partial'; draft.lines[0].acceptedQuantity = '9'; draft.lines[0].rejectedQuantity = '1'; }, /partial QC.*notes/i],
    ['future receipt', (draft: any) => { draft.receivedAt = '2026-08-26T12:00:00.000Z'; }, /cannot be in the future/i],
    ['challan pair', (draft: any) => { draft.supplierChallanDate = ''; }, /provided together/i],
  ])('fails closed for %s', (_name, mutate, expected) => {
    const draft = validDraft();
    mutate(draft);
    expect(() => buildCanonicalReceiptPayload(context, draft, NOW)).toThrow(expected);
  });
});
