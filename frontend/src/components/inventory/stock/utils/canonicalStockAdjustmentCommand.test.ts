import { apiHelpers } from '../../../../services/api/apiClient';
import {
  approveCycleCountReview,
  buildCycleCountPayload,
  executeApprovedCycleCount,
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
    stockBalanceRowVersion: 7,
  }],
};

const validReadback = {
  command_request_id: ids.command,
  inventory_document_id: ids.document,
  document_number: 'SC-2026-000001',
  branch_id: ids.branch,
  status: 'posted',
  journal_entry_id: ids.membership,
  journal_status: 'posted',
  journal_debit_total: '1.00',
  journal_credit_total: '1.00',
  variance_effect: 'gain',
  total_variance_base_quantity: '0.000010',
  total_variance_value: '1.00',
  accounting_event_id: ids.command,
  lines: [{
    inventory_document_line_id: ids.evidence,
    product_id: ids.product,
    batch_id: ids.batch,
    location_id: ids.location,
    ledger_entry_id: ids.uom,
    system_base_quantity: '12.345670',
    counted_base_quantity: '12.345680',
    variance_base_quantity: '0.000010',
    unit_cost: '100000.0000',
    variance_value: '1.00',
    ledger_quantity_delta: '0.000010',
    ledger_value_delta: '1.00',
    current_on_hand_quantity: '12.345680',
  }],
} as const;

describe('canonical signed cycle-count command', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('accepts the server-owned business date independently of the browser UTC date', () => {
    expect(() => buildCycleCountPayload(validInput)).not.toThrow();
  });

  it.each([
    { adjustmentDate: '', countedAt: validInput.countedAt },
    { adjustmentDate: '25-08-2026', countedAt: validInput.countedAt },
    { adjustmentDate: validInput.adjustmentDate, countedAt: 'not-an-instant' },
    { adjustmentDate: validInput.adjustmentDate, countedAt: '2026-08-25T00:00:00+05:30' },
  ])('fails closed for malformed business date or UTC timestamp: %p', override => {
    expect(() => buildCycleCountPayload({ ...validInput, ...override })).toThrow();
  });

  it('preserves exact six-decimal counts and canonical identities', () => {
    expect(buildCycleCountPayload(validInput)).toEqual({
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
        batch_counts: [{ batch_id: ids.batch, counted_quantity: '1.234568', stock_balance_row_version: 7 }],
      }],
    });
  });

  it.each(['1.2345678', '-1', 'NaN', '', ' 1', '01', '1e3'])('fails closed for invalid count %s', countedQuantity => {
    expect(() => buildCycleCountPayload({
      ...validInput,
      items: [{ ...validInput.items[0], countedQuantity }],
    })).toThrow();
  });

  it('rejects quantities above numeric(20,6) without JavaScript number coercion', () => {
    expect(() => buildCycleCountPayload({
      ...validInput,
      items: [{ ...validInput.items[0], countedQuantity: '9007199254740993' }],
    })).toThrow('canonical decimal precision');
    expect(() => buildCycleCountPayload({
      ...validInput,
      items: [{
        ...validInput.items[0],
        countedQuantity: '99999999999999.999999',
        uomMultiplier: '2',
      }],
    })).toThrow('numeric(20,6)');
  });

  it('accepts six fractional places and rejects over-scale values before prepare', () => {
    expect(buildCycleCountPayload({
      ...validInput,
      items: [{
        ...validInput.items[0],
        countedQuantity: '12.345671',
        uomMultiplier: '1.000000',
      }],
    })).toMatchObject({
      lines: [{ batch_counts: [{ counted_quantity: '12.345671' }] }],
    });
    expect(() => buildCycleCountPayload({
      ...validInput,
      items: [{ ...validInput.items[0], countedQuantity: '12.3456711' }],
    })).toThrow('canonical decimal precision');
  });

  it('accepts an ordinary loss and rejects an exact no-op after UOM conversion', () => {
    expect(() => buildCycleCountPayload({
      ...validInput,
      items: [{ ...validInput.items[0], countedQuantity: '1.234566' }],
    })).not.toThrow();
    expect(() => buildCycleCountPayload({
      ...validInput,
      items: [{ ...validInput.items[0], countedQuantity: '1.234567' }],
    })).toThrow('nonzero variance');
  });

  it('rejects mixed gain and loss lines before prepare', () => {
    expect(() => buildCycleCountPayload({
      ...validInput,
      items: [
        validInput.items[0],
        {
          ...validInput.items[0],
          batchId: ids.command,
          countedQuantity: '1.000000',
          systemBaseQuantity: '12.000000',
        },
      ],
    })).toThrow('cannot mix gain and loss');
  });

  it('rejects mixed locations and duplicate batches', () => {
    const duplicate = { ...validInput.items[0] };
    expect(() => buildCycleCountPayload({ ...validInput, items: [validInput.items[0], duplicate] }))
      .toThrow('Each batch may appear only once');
    expect(() => buildCycleCountPayload({
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
      stock_balance_row_version: 7,
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

  it('rejects zero system stock and numeric JSON decimal facts from eligibility', async () => {
    const eligibility = {
      branch_id: ids.branch,
      location_id: ids.location,
      counted_by_membership_id: ids.membership,
      product_id: ids.product,
      batch_id: ids.batch,
      stock_balance_row_version: 7,
      uom_conversions: [{
        uom_conversion_id: ids.uom,
        from_uom_code: 'PK',
        to_uom_code: 'EA',
        multiplier: '1.000000',
      }],
      evidence: [{
        evidence_attachment_id: ids.evidence,
        status: 'verified',
        document_date: '2026-08-25',
        verified_at: instant.toISOString(),
        retention_until: '2027-08-25',
      }],
    };
    (apiHelpers.get as jest.Mock).mockResolvedValueOnce({ data: {
      ...eligibility,
      system_base_quantity: 9007199254740992,
    } });
    await expect(loadCycleCountEligibility({
      branchId: ids.branch,
      locationId: ids.location,
      batchId: ids.batch,
      adjustmentDate: '2026-08-25',
    })).rejects.toThrow('exact decimal string');

    (apiHelpers.get as jest.Mock).mockResolvedValueOnce({ data: {
      ...eligibility,
      system_base_quantity: '0.000000',
    } });
    await expect(loadCycleCountEligibility({
      branchId: ids.branch,
      locationId: ids.location,
      batchId: ids.batch,
      adjustmentDate: '2026-08-25',
    })).rejects.toThrow('System base quantity must be positive');
  });

  it('requires exact stock and journal readback after execution', async () => {
    (apiHelpers.get as jest.Mock).mockResolvedValueOnce({ data: validReadback });
    await expect(loadAndVerifyCycleCountReadback(
      { command_request_id: ids.command, preview_hash: `sha256:${'a'.repeat(64)}` },
      { status: 'succeeded', resource_id: ids.document },
    )).resolves.toMatchObject({ inventory_document_id: ids.document });
  });

  it('accepts exact ordinary-loss readback without treating mutable current stock as authority', async () => {
    const lossReadback = {
      ...validReadback,
      variance_effect: 'loss',
      lines: [{
        ...validReadback.lines[0],
        counted_base_quantity: '12.345660',
        variance_base_quantity: '-0.000010',
        ledger_quantity_delta: '-0.000010',
        ledger_value_delta: '-1.00',
        current_on_hand_quantity: '99.000000',
      }],
    } as const;
    (apiHelpers.get as jest.Mock).mockResolvedValueOnce({ data: lossReadback });
    await expect(loadAndVerifyCycleCountReadback(
      { command_request_id: ids.command, preview_hash: `sha256:${'a'.repeat(64)}` },
      { status: 'succeeded', resource_id: ids.document },
    )).resolves.toMatchObject({ variance_effect: 'loss' });
  });

  it('fails closed when exact line, document, or journal totals drift', async () => {
    (apiHelpers.get as jest.Mock).mockResolvedValueOnce({ data: {
      ...validReadback,
      journal_debit_total: '1.01',
    } });
    await expect(loadAndVerifyCycleCountReadback(
      { command_request_id: ids.command, preview_hash: `sha256:${'a'.repeat(64)}` },
      { status: 'succeeded', resource_id: ids.document },
    )).rejects.toThrow('valuation journal');
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

  it('reuses the exact execute idempotency key and permits only matching replay readback', async () => {
    const preview = { command_request_id: ids.command, preview_hash: `sha256:${'c'.repeat(64)}` };
    (apiHelpers.post as jest.Mock)
      .mockResolvedValueOnce({ data: {
        command_request_id: ids.command,
        status: 'succeeded',
        resource_id: ids.document,
        idempotency_replayed: false,
      } })
      .mockResolvedValueOnce({ data: {
        command_request_id: ids.command,
        status: 'succeeded',
        resource_id: ids.document,
        idempotency_replayed: true,
      } });

    await expect(executeApprovedCycleCount(preview)).resolves.toMatchObject({ idempotency_replayed: false });
    const replay = await executeApprovedCycleCount(preview);
    expect(replay).toMatchObject({ idempotency_replayed: true });

    (apiHelpers.get as jest.Mock)
      .mockResolvedValueOnce({ data: validReadback })
      .mockResolvedValueOnce({ data: validReadback });
    await expect(loadAndVerifyCycleCountReadback(preview, replay)).resolves.toEqual(validReadback);
    await expect(loadAndVerifyCycleCountReadback(preview, replay)).resolves.toEqual(validReadback);

    expect(apiHelpers.post).toHaveBeenCalledTimes(2);
    expect(apiHelpers.post).toHaveBeenNthCalledWith(1,
      `/web/actions/commands/${ids.command}/execute`,
      {
        preview_hash: preview.preview_hash,
        idempotency_key: `erp-web-inventory-adjustment-execute:${ids.command}`,
      });
    expect(apiHelpers.post).toHaveBeenNthCalledWith(2,
      `/web/actions/commands/${ids.command}/execute`,
      {
        preview_hash: preview.preview_hash,
        idempotency_key: `erp-web-inventory-adjustment-execute:${ids.command}`,
      });
    expect(apiHelpers.get).toHaveBeenCalledTimes(2);
    expect(apiHelpers.get).toHaveBeenNthCalledWith(1,
      `/web/actions/inventory-adjustment/commands/${ids.command}/readback`);
    expect(apiHelpers.get).toHaveBeenNthCalledWith(2,
      `/web/actions/inventory-adjustment/commands/${ids.command}/readback`);
  });
});
