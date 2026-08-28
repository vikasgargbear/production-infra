import {
  canonicalExecutionCompleted,
  type CanonicalCommandExecution,
  type CanonicalCommandPreview,
} from '../../../../services/api/canonicalOperatorActions';
import type { CanonicalPostedSupplierInvoice } from '../../../../services/api/modules/purchase/canonicalSupplierInvoices.api';
import { isCanonicalUuid } from '../../../../utils/canonicalUuid';

export interface SupplierInvoiceLifecycleResult {
  resourceId: string;
  detail: CanonicalPostedSupplierInvoice;
}
/**
 * Execute at most once, then make every retry a read-only reconciliation.
 * Callers retain the returned resourceId before rendering the readback so a
 * transient detail failure can never execute the financial command twice.
 */
export async function reconcileCanonicalSupplierInvoice(
  prepared: CanonicalCommandPreview,
  lifecycleId: string,
  previouslyExecutedResourceId: string | null,
  execute: (
    preview: CanonicalCommandPreview,
    lifecycleId: string,
  ) => Promise<CanonicalCommandExecution>,
  readDetail: (resourceId: string) => Promise<CanonicalPostedSupplierInvoice>,
  retainExecutedResourceId: (resourceId: string) => void,
): Promise<SupplierInvoiceLifecycleResult> {
  let resourceId = previouslyExecutedResourceId;
  if (!resourceId) {
    const execution = await execute(prepared, lifecycleId);
    if (!canonicalExecutionCompleted(execution)) {
      throw new Error(`Canonical command ended in ${execution.status}; nothing is shown as posted.`);
    }
    if (!execution.resource_id || !isCanonicalUuid(execution.resource_id)) {
      throw new Error('Canonical execution returned no valid supplier-invoice identity. Reconcile server status before retrying.');
    }
    resourceId = execution.resource_id;
    retainExecutedResourceId(resourceId);
  }
  const detail = await readDetail(resourceId);
  if (detail.supplier_invoice_id !== resourceId || detail.status !== 'posted') {
    throw new Error('Supplier-invoice readback does not match the executed canonical resource.');
  }
  return { resourceId, detail };
}
