import type { CanonicalCommandPreview } from '../../../services/api/canonicalOperatorActions';
import type { PostedSupplierAdvance } from '../../../services/api/modules/finance/canonicalSupplierAdvances.api';
import { isCanonicalUuid } from '../../../utils/canonicalUuid';

/** Execute once; once the UUID is retained every recovery attempt is read-only. */
export async function reconcileCanonicalSupplierAdvance(
  preview: CanonicalCommandPreview,
  lifecycleId: string,
  previouslyExecutedPaymentId: string | null,
  execute: (preview: CanonicalCommandPreview, lifecycleId: string) => Promise<string>,
  readback: (paymentId: string) => Promise<PostedSupplierAdvance>,
  retainExecutedPaymentId: (paymentId: string) => void,
): Promise<PostedSupplierAdvance> {
  let paymentId = previouslyExecutedPaymentId;
  if (!paymentId) {
    paymentId = await execute(preview, lifecycleId);
    if (!isCanonicalUuid(paymentId)) {
      throw new Error('Canonical execution returned no valid supplier-advance identity.');
    }
    retainExecutedPaymentId(paymentId);
  }
  const detail = await readback(paymentId);
  if (detail.payment_id !== paymentId || detail.status !== 'posted') {
    throw new Error('Supplier-advance readback does not match the executed canonical resource.');
  }
  return detail;
}
