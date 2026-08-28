import {
  prepareCanonicalAction,
  type CanonicalCommandPreview,
} from '../../../services/api/canonicalOperatorActions';
import {
  buildPurchaseReturnPreparePayload,
  buildSalesReturnPreparePayload,
} from './canonicalReturnCommand';

type ReturnRecord = Record<string, any>;

export interface AwaitingIndependentApproval {
  preview: CanonicalCommandPreview;
  state: 'awaiting_independent_approval';
  message: string;
}
function waiting(preview: CanonicalCommandPreview): AwaitingIndependentApproval {
  return {
    preview,
    state: 'awaiting_independent_approval',
    message: `Prepared command ${preview.command_request_id} is immutable and awaiting approval by a distinct authorized membership. The requester cannot self-approve it.`,
  };
}

export async function prepareCanonicalSalesReturn(
  data: ReturnRecord,
  idempotencyKey: string,
): Promise<AwaitingIndependentApproval> {
  const response = await prepareCanonicalAction(
    'sales.return.prepare',
    buildSalesReturnPreparePayload(data, idempotencyKey),
  );
  return waiting(response.data);
}

export async function prepareCanonicalPurchaseReturn(
  data: ReturnRecord,
  idempotencyKey: string,
): Promise<AwaitingIndependentApproval> {
  const response = await prepareCanonicalAction(
    'procurement.purchase_return.prepare',
    buildPurchaseReturnPreparePayload(data, idempotencyKey),
  );
  return waiting(response.data);
}
