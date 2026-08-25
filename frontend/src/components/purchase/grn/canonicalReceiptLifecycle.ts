import {
  approveAndExecuteCanonicalAction,
  prepareCanonicalAction,
} from '../../../services/api/canonicalOperatorActions';
import type {
  CanonicalApprovedExecution,
  CanonicalCommandPreview,
} from '../../../services/api/canonicalOperatorActions';
import type { CanonicalReceiptContext } from '../../../services/api/modules/purchase/canonicalGoodsReceipts.api';
import {
  buildCanonicalReceiptPayload,
} from './canonicalReceiptCommand';
import type { CanonicalReceiptDraft } from './canonicalReceiptCommand';
import { exactDecimalUnits } from '../../../utils/exactDecimal';
import { isCanonicalUuid } from '../../../utils/canonicalUuid';

const exactQuantity = (value: unknown, label: string): bigint => exactDecimalUnits(
  value, label, { scale: 6, maximumWholeDigits: 14 },
);
const exactMoney = (value: unknown, label: string): bigint => exactDecimalUnits(
  value, label, { scale: 2, maximumWholeDigits: 20 },
);

export function validateCanonicalReceiptPreview(
  preview: CanonicalCommandPreview,
  context: CanonicalReceiptContext,
  expectedImpactCount: number,
): CanonicalCommandPreview {
  const impacts = Array.isArray(preview.inventory_impact) ? preview.inventory_impact : [];
  const references = Array.isArray(preview.resolved_references) ? preview.resolved_references : [];
  if (String(preview.branch_id || '') !== context.branch_id
    || !references.some((row: any) => String(row?.id || '') === context.purchase_order_id)
    || impacts.length !== expectedImpactCount
    || (Array.isArray(preview.financial_impact) && preview.financial_impact.length !== 0)
    || (Array.isArray(preview.tax_impact) && preview.tax_impact.length !== 0)) {
    throw new Error('Goods-receipt preview does not match the selected PO, branch, physical batches, or inventory-only boundary. Nothing was approved.');
  }
  impacts.forEach((raw, index) => {
    const impact = raw as Record<string, unknown>;
    const accepted = exactQuantity(impact.base_accepted_quantity, `Receipt impact ${index + 1} accepted quantity`);
    const free = exactQuantity(impact.base_free_quantity, `Receipt impact ${index + 1} free quantity`);
    exactMoney(impact.extended_cost, `Receipt impact ${index + 1} inventory value`);
    if ((!isCanonicalUuid(String(impact.product_id || ''))
      || !isCanonicalUuid(String(impact.batch_id || ''))
      || !isCanonicalUuid(String(impact.location_id || '')))
      || accepted + free <= 0n) {
      throw new Error(`Receipt impact ${index + 1} is missing canonical stock identity or positive quantity.`);
    }
  });
  return preview;
}


/** Prepare only. Approval/execution remains an explicit, separate UI action. */
export function prepareCanonicalGoodsReceipt(
  context: CanonicalReceiptContext,
  draft: CanonicalReceiptDraft,
): Promise<{ data: CanonicalCommandPreview }> {
  const payload = buildCanonicalReceiptPayload(context, draft);
  const expectedImpactCount = (payload.lines as Array<{ batches: unknown[] }>).reduce(
    (count, line) => count + line.batches.length, 0,
  );
  return prepareCanonicalAction('procurement.goods_receipt.prepare', payload).then(response => {
    validateCanonicalReceiptPreview(response.data, context, expectedImpactCount);
    return response;
  });
}

export function postCanonicalGoodsReceipt(
  preview: CanonicalCommandPreview,
  lifecycleId: string,
): Promise<CanonicalApprovedExecution> {
  return approveAndExecuteCanonicalAction(
    'procurement.goods_receipt.prepare',
    preview,
    lifecycleId,
  );
}
