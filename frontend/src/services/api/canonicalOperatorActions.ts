import type { AxiosResponse } from 'axios';

import { clientUuid } from '../../utils/clientUuid';
import { isCanonicalUuid } from '../../utils/canonicalUuid';
import { apiHelpers } from './apiClient';

export type CanonicalOperationKey =
  | 'sales.order.prepare'
  | 'sales.dispatch.prepare'
  | 'sales.invoice.prepare'
  | 'sales.return.prepare'
  | 'procurement.purchase_order.prepare'
  | 'procurement.goods_receipt.prepare'
  | 'procurement.supplier_invoice.prepare'
  | 'procurement.purchase_return.prepare'
  | 'finance.customer_receipt.prepare'
  | 'finance.supplier_payment.prepare'
  | 'finance.supplier_advance.prepare'
  | 'inventory.adjustment.prepare'
  | 'inventory.transfer.prepare';

export interface CanonicalCommandPreview {
  command_request_id: string;
  preview_hash: string;
  [key: string]: unknown;
}

export interface CanonicalCommandExecution {
  status: string;
  resource_id?: string;
  [key: string]: unknown;
}

export interface CanonicalCommandResult {
  prepared: AxiosResponse<CanonicalCommandPreview>;
  approved: AxiosResponse<Record<string, unknown>>;
  executed: AxiosResponse<CanonicalCommandExecution>;
}

export interface CanonicalApprovedExecution {
  approved: AxiosResponse<Record<string, unknown>>;
  executed: AxiosResponse<CanonicalCommandExecution>;
}

const PREVIEW_HASH_PATTERN = /^sha256:[0-9a-f]{64}$/i;

function requirePreview(value: unknown): CanonicalCommandPreview {
  if (!value || typeof value !== 'object') {
    throw new Error('Canonical command prepare returned no preview. Nothing was approved or executed.');
  }
  const preview = value as Partial<CanonicalCommandPreview>;
  if (!preview.command_request_id || !isCanonicalUuid(preview.command_request_id)) {
    throw new Error('Canonical command prepare returned an invalid command identity. Nothing was approved or executed.');
  }
  if (!preview.preview_hash || !PREVIEW_HASH_PATTERN.test(preview.preview_hash)) {
    throw new Error('Canonical command prepare returned an invalid preview hash. Nothing was approved or executed.');
  }
  return preview as CanonicalCommandPreview;
}

function requireExecution(value: unknown): CanonicalCommandExecution {
  if (!value || typeof value !== 'object') {
    throw new Error('Canonical command execute returned no result. Confirm server status before retrying.');
  }
  const execution = value as Partial<CanonicalCommandExecution>;
  if (!execution.status || typeof execution.status !== 'string') {
    throw new Error('Canonical command execute returned an invalid status. Confirm server status before retrying.');
  }
  if (execution.resource_id && !isCanonicalUuid(execution.resource_id)) {
    throw new Error('Canonical command execute returned an invalid resource identity. Confirm server status before retrying.');
  }
  return execution as CanonicalCommandExecution;
}

/**
 * Execute the reviewed browser command protocol used by the MCP transport too.
 * The caller owns the action-time confirmation UI and calls this only after the
 * actor confirms the immutable preview.
 */
export async function executeCanonicalAction(
  operationKey: CanonicalOperationKey,
  payload: Record<string, unknown>,
): Promise<CanonicalCommandResult> {
  const prepared = await prepareCanonicalAction(operationKey, payload);
  const { approved, executed } = await approveAndExecuteCanonicalAction(
    operationKey,
    prepared.data,
  );
  return { prepared, approved, executed };
}

export async function prepareCanonicalAction(
  operationKey: CanonicalOperationKey,
  payload: Record<string, unknown>,
): Promise<AxiosResponse<CanonicalCommandPreview>> {
  const prepared = await apiHelpers.post<CanonicalCommandPreview>(
    `/web/actions/${operationKey}/prepare`,
    payload,
  );
  requirePreview(prepared.data);
  return prepared;
}

export async function approveAndExecuteCanonicalAction(
  operationKey: CanonicalOperationKey,
  preparedPreview: CanonicalCommandPreview,
  lifecycleId: string = clientUuid(),
): Promise<CanonicalApprovedExecution> {
  const preview = requirePreview(preparedPreview);
  const idempotencyNamespace = operationKey.replace(/\.prepare$/, '').replace(/\./g, '-');

  const approved = await apiHelpers.post<Record<string, unknown>>(
    `/web/actions/commands/${preview.command_request_id}/approve`,
    {
      preview_hash: preview.preview_hash,
      approval_intent: 'approve',
      idempotency_key: `erp-web-${idempotencyNamespace}-approve:${lifecycleId}`,
    },
  );
  const executed = await apiHelpers.post<CanonicalCommandExecution>(
    `/web/actions/commands/${preview.command_request_id}/execute`,
    {
      preview_hash: preview.preview_hash,
      idempotency_key: `erp-web-${idempotencyNamespace}-execute:${lifecycleId}`,
    },
  );
  requireExecution(executed.data);
  return { approved, executed };
}

export function canonicalExecutionCompleted(execution: CanonicalCommandExecution): boolean {
  return ['executed', 'succeeded'].includes(execution.status);
}
