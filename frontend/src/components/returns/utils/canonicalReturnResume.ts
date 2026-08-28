import { isCanonicalUuid } from '../../../utils/canonicalUuid';
import type { CanonicalCommandExecution } from '../../../services/api/canonicalOperatorActions';
import {
  canonicalReturnsApi,
  type CanonicalReturnCommandDetail,
} from '../../../services/api/modules/returns/canonicalReturns.api';

const PREVIEW_HASH = /^sha256:[0-9a-f]{64}$/i;
const IDEMPOTENCY_KEY = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/;

export type CanonicalReturnReadback = Record<string, unknown>;

export interface ExecutedReturnResult {
  execution: CanonicalCommandExecution;
  readback?: CanonicalReturnReadback;
  readbackError?: Error;
}

function validateExecution(
  command: CanonicalReturnCommandDetail,
  execution: CanonicalCommandExecution,
): asserts execution is CanonicalCommandExecution & { resource_id: string } {
  if (
    execution.command_request_id !== command.command_request_id
    || execution.preview_hash !== command.preview_hash
    || execution.status !== 'succeeded'
    || !execution.resource_id
    || !isCanonicalUuid(execution.resource_id)
  ) {
    throw new Error('Canonical return execution did not persist an exact resource identity.');
  }
}

export async function retryCanonicalReturnReadback(
  returnKind: 'sales' | 'purchase',
  resourceId: string,
): Promise<CanonicalReturnReadback> {
  if (!isCanonicalUuid(resourceId)) {
    throw new Error('Canonical return readback requires the persisted resource UUID.');
  }
  const response = returnKind === 'sales'
    ? await canonicalReturnsApi.getSalesReadback(resourceId)
    : await canonicalReturnsApi.getPurchaseReadback(resourceId);
  const readback = response.data as CanonicalReturnReadback;
  if (readback.return_id !== resourceId || readback.status !== 'posted') {
    throw new Error('Canonical return readback does not match the persisted resource identity.');
  }
  return readback;
}

/**
 * Execute once, persist the server-returned resource identity in caller state,
 * then perform a GET-only readback. A failed readback never re-executes.
 */
export async function executeApprovedCanonicalReturn(
  command: CanonicalReturnCommandDetail,
  durableIdempotencyKey: string,
  persistExecution: (execution: CanonicalCommandExecution & { resource_id: string }) => void,
): Promise<ExecutedReturnResult> {
  if (command.status !== 'approved' || command.resource_id) {
    throw new Error('Only an approved, not-yet-executed return command can be posted.');
  }
  if (!isCanonicalUuid(command.command_request_id) || !PREVIEW_HASH.test(command.preview_hash)) {
    throw new Error('The approved return command identity or preview hash is invalid.');
  }
  if (!IDEMPOTENCY_KEY.test(durableIdempotencyKey)) {
    throw new Error('Return execution requires a durable idempotency key.');
  }
  const response = await canonicalReturnsApi.executeAsRequester(
    command.command_request_id,
    command.preview_hash,
    durableIdempotencyKey,
  );
  validateExecution(command, response.data);
  persistExecution(response.data);
  try {
    const readback = await retryCanonicalReturnReadback(
      command.return_kind,
      response.data.resource_id,
    );
    return { execution: response.data, readback };
  } catch (error) {
    return {
      execution: response.data,
      readbackError: error instanceof Error ? error : new Error('Posted return readback failed.'),
    };
  }
}
