import {
  prepareCanonicalAction,
} from '../../../services/api/canonicalOperatorActions';
import type { CanonicalCommandPreview } from '../../../services/api/canonicalOperatorActions';
import type { CanonicalReceiptContext } from '../../../services/api/modules/purchase/canonicalGoodsReceipts.api';
import {
  buildCanonicalReceiptPayload,
} from './canonicalReceiptCommand';
import type { CanonicalReceiptDraft } from './canonicalReceiptCommand';


/** Prepare only. Approval/execution remains an explicit, separate UI action. */
export function prepareCanonicalGoodsReceipt(
  context: CanonicalReceiptContext,
  draft: CanonicalReceiptDraft,
): Promise<{ data: CanonicalCommandPreview }> {
  const payload = buildCanonicalReceiptPayload(context, draft);
  return prepareCanonicalAction('procurement.goods_receipt.prepare', payload);
}
