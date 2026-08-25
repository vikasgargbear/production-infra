import {
  approveAndExecuteCanonicalAction,
  prepareCanonicalAction,
} from '../../../services/api/canonicalOperatorActions';
import type { CanonicalReceiptContext } from '../../../services/api/modules/purchase/canonicalGoodsReceipts.api';
import { initialReceiptDraft } from './canonicalReceiptCommand';
import {
  postCanonicalGoodsReceipt,
  prepareCanonicalGoodsReceipt,
} from './canonicalReceiptLifecycle';


jest.mock('../../../services/api/canonicalOperatorActions', () => ({
  prepareCanonicalAction: jest.fn(),
  approveAndExecuteCanonicalAction: jest.fn(),
}));

const context: CanonicalReceiptContext = {
  purchase_order_id: '10000000-0000-7000-8000-000000000001',
  purchase_order_number: 'CODEX-E2E-PO-0001',
  branch_id: '10000000-0000-7000-8000-000000000002',
  supplier_account_id: '10000000-0000-7000-8000-000000000003',
  supplier_name: 'Canonical Supplier',
  organization_timezone: 'Asia/Kolkata',
  status: 'approved',
  lines: [{
    purchase_order_line_id: '10000000-0000-7000-8000-000000000004',
    line_number: 1,
    product_id: '10000000-0000-7000-8000-000000000005',
    product_name: 'Canonical Product',
    sku: 'CODEX-E2E-SKU',
    ordered_uom_code: 'PACK',
    base_uom_code: 'EA',
    uom_conversion_factor: '1.000000',
    ordered_billed_quantity: '1.000000',
    ordered_free_quantity: '0.000000',
    remaining_billed_quantity: '1.000000',
    remaining_free_quantity: '0.000000',
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
      multiplier: '1.000000',
    }],
  }],
};

function draft() {
  const value = initialReceiptDraft(
    context,
    'CODEX-E2E-PUR-RET-20260825:receipt:retry-0001',
  );
  value.receivedAt = '2026-08-24T12:00:00Z';
  value.lines[0].included = true;
  value.lines[0].batches[0].manufacturerBatchNumber = 'CODEX-E2E-BATCH-RETRY-0001';
  value.lines[0].batches[0].expiresOn = '2027-08-25';
  value.lines[0].batches[0].mrp = '125.00';
  value.lines[0].batches[0].mrpUomConversionId = context.lines[0].mrp_conversions[0].id;
  value.lines[0].batches[0].receivedQuantity = '1.000000';
  value.lines[0].batches[0].acceptedQuantity = '1.000000';
  value.lines[0].batches[0].rejectedQuantity = '0';
  value.lines[0].batches[0].freeQuantity = '0';
  value.lines[0].batches[0].qcStatus = 'accepted';
  value.lines[0].batches[0].toLocationId = context.lines[0].eligible_locations[0].id;
  return value;
}

describe('canonical goods-receipt prepare lifecycle', () => {
  beforeEach(() => jest.clearAllMocks());

  it.each([409, 422, 503])(
    'propagates HTTP %s prepare failure without approve, execute, or fallback',
    async status => {
      const failure = Object.assign(new Error(`prepare ${status}`), {
        response: { status, data: { detail: { message: `prepare ${status}` } } },
      });
      (prepareCanonicalAction as jest.Mock).mockRejectedValueOnce(failure);

      await expect(prepareCanonicalGoodsReceipt(context, draft())).rejects.toBe(failure);

      expect(prepareCanonicalAction).toHaveBeenCalledTimes(1);
      expect(prepareCanonicalAction).toHaveBeenCalledWith(
        'procurement.goods_receipt.prepare',
        expect.objectContaining({
          idempotency_key: 'CODEX-E2E-PUR-RET-20260825:receipt:retry-0001',
        }),
      );
      expect(approveAndExecuteCanonicalAction).not.toHaveBeenCalled();
    },
  );

  it('reuses the exact prepare idempotency key and payload on duplicate retry', async () => {
    (prepareCanonicalAction as jest.Mock).mockResolvedValue({
      data: {
        command_request_id: '10000000-0000-7000-8000-000000000008',
        preview_hash: `sha256:${'a'.repeat(64)}`,
        branch_id: context.branch_id,
        resolved_references: [{ resource_type: 'purchase_order', id: context.purchase_order_id }],
        financial_impact: [], tax_impact: [],
        inventory_impact: [{
          product_id: context.lines[0].product_id,
          batch_id: '10000000-0000-7000-8000-000000000009',
          location_id: context.lines[0].eligible_locations[0].id,
          base_accepted_quantity: '1.000000', base_free_quantity: '0.000000',
          extended_cost: '100.00',
        }],
      },
    });
    const retryDraft = draft();

    await prepareCanonicalGoodsReceipt(context, retryDraft);
    await prepareCanonicalGoodsReceipt(context, retryDraft);

    const firstPayload = (prepareCanonicalAction as jest.Mock).mock.calls[0][1];
    const secondPayload = (prepareCanonicalAction as jest.Mock).mock.calls[1][1];
    expect(secondPayload).toEqual(firstPayload);
    expect(secondPayload.idempotency_key).toBe(
      'CODEX-E2E-PUR-RET-20260825:receipt:retry-0001',
    );
    expect(approveAndExecuteCanonicalAction).not.toHaveBeenCalled();
  });

  it('rejects missing authoritative impact values instead of rendering silent zeroes', async () => {
    (prepareCanonicalAction as jest.Mock).mockResolvedValue({ data: {
      command_request_id: '10000000-0000-7000-8000-000000000008',
      preview_hash: `sha256:${'a'.repeat(64)}`,
      branch_id: context.branch_id,
      resolved_references: [{ id: context.purchase_order_id }],
      financial_impact: [], tax_impact: [],
      inventory_impact: [{
        product_id: context.lines[0].product_id,
        batch_id: '10000000-0000-7000-8000-000000000009',
        location_id: context.lines[0].eligible_locations[0].id,
        base_accepted_quantity: undefined,
        base_free_quantity: '0.000000', extended_cost: '100.00',
      }],
    } });

    await expect(prepareCanonicalGoodsReceipt(context, draft()))
      .rejects.toThrow(/accepted quantity.*exact decimal/i);
    expect(approveAndExecuteCanonicalAction).not.toHaveBeenCalled();
  });

  it('reuses the caller-owned approval and execution lifecycle identity', async () => {
    const preview = {
      command_request_id: '10000000-0000-7000-8000-000000000008',
      preview_hash: `sha256:${'a'.repeat(64)}`,
    } as any;
    (approveAndExecuteCanonicalAction as jest.Mock).mockResolvedValue({
      approved: { data: { status: 'approved' } },
      executed: { data: { status: 'executed' } },
    });

    await postCanonicalGoodsReceipt(preview, 'stable-grn-lifecycle-0001');
    await postCanonicalGoodsReceipt(preview, 'stable-grn-lifecycle-0001');

    expect(approveAndExecuteCanonicalAction).toHaveBeenNthCalledWith(
      1,
      'procurement.goods_receipt.prepare',
      preview,
      'stable-grn-lifecycle-0001',
    );
    expect(approveAndExecuteCanonicalAction).toHaveBeenNthCalledWith(
      2,
      'procurement.goods_receipt.prepare',
      preview,
      'stable-grn-lifecycle-0001',
    );
  });
});
