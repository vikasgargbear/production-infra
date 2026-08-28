import type { CanonicalCommandPreview } from '../../../services/api/canonicalOperatorActions';
import type { PostedSupplierPayment } from '../../../services/api/modules/finance/canonicalSupplierPayments.api';
import { isCanonicalUuid } from '../../../utils/canonicalUuid';

/** Execute at most once; after retaining the UUID every retry is read-only. */
export async function reconcileCanonicalSupplierPayment(
  preview: CanonicalCommandPreview,
  lifecycleId: string,
  previouslyExecutedPaymentId: string | null,
  execute: (preview: CanonicalCommandPreview, lifecycleId: string) => Promise<string>,
  readback: (paymentId: string) => Promise<PostedSupplierPayment>,
  retainExecutedPaymentId: (paymentId: string) => void,
): Promise<PostedSupplierPayment> {
  let paymentId = previouslyExecutedPaymentId;
  if (!paymentId) {
    paymentId = await execute(preview, lifecycleId);
    if (!isCanonicalUuid(paymentId)) {
      throw new Error('Canonical execution returned no valid supplier-payment identity.');
    }
    retainExecutedPaymentId(paymentId);
  }
  const detail = await readback(paymentId);
  if (detail.payment_id !== paymentId || detail.status !== 'posted') {
    throw new Error('Supplier-payment readback does not match the executed canonical resource.');
  }
  return detail;
}
