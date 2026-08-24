import { isCanonicalUuid } from '../../../utils/canonicalUuid';
import { canonicalReturnsApi } from '../../../services/api/modules/returns/canonicalReturns.api';
import type { CanonicalCommandPreview } from '../../../services/api/canonicalOperatorActions';

const PREVIEW_HASH = /^sha256:[0-9a-f]{64}$/i;
const IDEMPOTENCY_KEY = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/;

/**
 * Resolve a return command by UUID using the server's distinct-membership
 * approval context.  A requester sees a scoped 403/404; no client-side role
 * claim can make the requester an approver.
 */
export async function loadReturnForIndependentApproval(
  commandRequestId: string,
): Promise<CanonicalCommandPreview> {
  if (!isCanonicalUuid(commandRequestId)) {
    throw new Error('A canonical return command UUID is required.');
  }
  const response = await canonicalReturnsApi.getApprovalReview(commandRequestId);
  if (
    response.data.command_request_id !== commandRequestId
    || !PREVIEW_HASH.test(response.data.preview_hash)
  ) {
    throw new Error('The server returned an invalid immutable return preview.');
  }
  return response.data;
}

/**
 * Approve only. Execution remains bound to the original reviewed requester.
 * The caller must show the immutable preview and obtain action-time approval.
 */
export async function approveReturnAsIndependentReviewer(
  preview: CanonicalCommandPreview,
  durableIdempotencyKey: string,
) {
  if (
    !isCanonicalUuid(preview.command_request_id)
    || !PREVIEW_HASH.test(preview.preview_hash)
  ) {
    throw new Error('A valid immutable return preview is required.');
  }
  if (!IDEMPOTENCY_KEY.test(durableIdempotencyKey)) {
    throw new Error('Independent approval requires a durable idempotency key.');
  }
  return canonicalReturnsApi.approveAsIndependentReviewer(
    preview.command_request_id,
    preview.preview_hash,
    durableIdempotencyKey,
  );
}
