import { apiHelpers } from '../../../../services/api/apiClient';
import {
  approveCycleCountReview,
  buildCycleCountGainPayload,
  executeApprovedCycleCount,
  indiaLocalDate,
  loadAndVerifyCycleCountReadback,
  loadCycleCountEligibility,
  loadCycleCountReview,
} from './canonicalStockAdjustmentCommand';

jest.mock('../../../../services/api/apiClient', () => ({
  apiHelpers: { get: jest.fn(), post: jest.fn() },
}));

const ids = {
  branch: '018f1e5a-0000-7000-8000-000000000001',
  location: '018f1e5a-0000-7000-8000-000000000002',
  membership: '018f1e5a-0000-7000-8000-000000000003',
  evidence: '018f1e5a-0000-7000-8000-000000000004',
  product: '018f1e5a-0000-7000-8000-000000000005',
  batch: '018f1e5a-0000-7000-8000-000000000006',
  uom: '018f1e5a-0000-7000-8000-000000000007',
  command: '018f1e5a-0000-7000-8000-000000000008',
  document: '018f1e5a-0000-7000-8000-000000000009',
};

const instant = new Date('2026-08-24T20:00:00.000Z');
const validInput = {
  idempotencyKey: 'erp-web-inventory-adjustment-prepare:018f1e5a-0000-7000-8000-000000000010',
  adjustmentDate: '2026-08-25',
  countedAt: instant.toISOString(),
  countedByMembershipId: ids.membership,
  evidenceAttachmentId: ids.evidence,
  items: [{
    productId: ids.product,
    batchId: ids.batch,
    branchId: ids.branch,
    locationId: ids.location,
    uomConversionId: ids.uom,
    uomMultiplier: '10.000000',
    countedQuantity: '1.234568',
    systemBaseQuantity: '12.345670',
  }],
};

describe('canonical cycle-count gain command', () => {
  it('uses India-local dates instead of the browser UTC date', () => {
    expect(indiaLocalDate(instant)).toBe('2026-08-25');
  });

  it('preserves exact six-decimal counts and canonical identities', () => {
    expect(buildCycleCountGainPayload(validInput)).toEqual({
      idempotency_key: validInput.idempotencyKey,
      branch_id: ids.branch,
      adjustment_date: '2026-08-25',
      counted_at: instant.toISOString(),
      counted_by_membership_id: ids.membership,
      location_id: ids.location,
      reason_code: 'cycle_count',
      evidence_attachment_id: ids.evidence,
      lines: [{
        product_id: ids.product,
        uom_conversion_id: ids.uom,
        batch_counts: [{ batch_id: ids.batch, counted_quantity: '1.234568' }],
      }],
    });
  });

  it.each(['1.2345678', '-1', 'NaN', '', '0'])('fails closed for invalid or non-gain count %s', countedQuantity => {
    expect(() => buildCycleCountGainPayload({
      ...validInput,
      items: [{ ...validInput.items[0], countedQuantity }],
    })).toThrow();
  });

  it('rejects a decrease and an exact no-op after UOM conversion', () => {
    for (const countedQuantity of ['1.234566', '1.234567']) {
      expect(() => buildCycleCountGainPayload({
        ...validInput,
        items: [{ ...validInput.items[0], countedQuantity }],
      })).toThrow('positive cycle-count gain');
    }
  });

  it('rejects mixed locations and duplicate batches', () => {
    const duplicate = { ...validInput.items[0] };
    expect(() => buildCycleCountGainPayload({ ...validInput, items: [validInput.items[0], duplicate] }))
      .toThrow('Each batch may appear only once');
    expect(() => buildCycleCountGainPayload({
      ...validInput,
      items: [validInput.items[0], { ...duplicate, batchId: ids.command, locationId: ids.command }],
    })).toThrow('one branch and saleable location');
  });

  it('accepts only server-proven eligibility', async () => {
    (apiHelpers.get as jest.Mock).mockResolvedValueOnce({ data: {
      branch_id: ids.branch,
      location_id: ids.location,
      counted_by_membership_id: ids.membership,
      product_id: ids.product,
      batch_id: ids.batch,
      system_base_quantity: '12.000000',
      uom_conversions: [{
        uom_conversion_id: ids.uom,
        from_uom_code: 'PK',
        to_uom_code: 'EA',
        multiplier: '10.000000',
      }],
      evidence: [{
        evidence_attachment_id: ids.evidence,
        status: 'verified',
        document_date: '2026-08-25',
        verified_at: instant.toISOString(),
        retention_until: '2027-08-25',
      }],
    } });
    await expect(loadCycleCountEligibility({
      branchId: ids.branch,
      locationId: ids.location,
      batchId: ids.batch,
      adjustmentDate: '2026-08-25',
    })).resolves.toMatchObject({ counted_by_membership_id: ids.membership });
  });

  it('requires exact stock and journal readback after execution', async () => {
    (apiHelpers.get as jest.Mock).mockResolvedValueOnce({ data: {
      command_request_id: ids.command,
      inventory_document_id: ids.document,
      status: 'posted',
      journal_status: 'posted',
      total_gain_base_quantity: '0.000010',
      total_gain_value: '1.00',
      lines: [{
        product_id: ids.product,
        batch_id: ids.batch,
        gain_base_quantity: '0.000010',
        ledger_quantity_delta: '0.000010',
        gain_value: '1.00',
        ledger_value_delta: '1.00',
        counted_base_quantity: '12.345680',
        current_on_hand_quantity: '12.345680',
      }],
    } });
    await expect(loadAndVerifyCycleCountReadback(
      { command_request_id: ids.command, preview_hash: `sha256:${'a'.repeat(64)}` },
      { status: 'succeeded', resource_id: ids.document },
    )).resolves.toMatchObject({ inventory_document_id: ids.document });
  });

  it('keeps independent approval and requester execution as separate stable calls', async () => {
    const preview = { command_request_id: ids.command, preview_hash: `sha256:${'b'.repeat(64)}` };
    (apiHelpers.get as jest.Mock).mockResolvedValueOnce({ data: preview });
    await expect(loadCycleCountReview(ids.command)).resolves.toEqual(preview);

    (apiHelpers.post as jest.Mock)
      .mockResolvedValueOnce({ data: { status: 'approved' } })
      .mockResolvedValueOnce({ data: { status: 'succeeded', resource_id: ids.document } });
    await approveCycleCountReview(preview);
    await expect(executeApprovedCycleCount(preview))
      .resolves.toMatchObject({ status: 'succeeded', resource_id: ids.document });

    expect(apiHelpers.post).toHaveBeenNthCalledWith(1,
      `/web/actions/commands/${ids.command}/approve`,
      expect.objectContaining({
        idempotency_key: `erp-web-inventory-adjustment-approve:${ids.command}`,
      }));
    expect(apiHelpers.post).toHaveBeenNthCalledWith(2,
      `/web/actions/commands/${ids.command}/execute`,
      expect.objectContaining({
        idempotency_key: `erp-web-inventory-adjustment-execute:${ids.command}`,
      }));
  });
});
