import type { CanonicalCommandPreview } from '../../canonicalOperatorActions';
import {
  approveAndExecuteCanonicalAction,
  canonicalExecutionCompleted,
  prepareCanonicalAction,
} from '../../canonicalOperatorActions';
import { isCanonicalUuid } from '../../../../utils/canonicalUuid';
import { paymentAllocationApi } from './paymentAllocation.api';
import type { CanonicalCustomerReceiptPreparePayload } from '../../../../components/payment/entry/customerReceiptCommand';
import { moneyToCents } from '../../../../components/payment/entry/customerReceiptCommand';

export async function prepareCustomerReceipt(payload: CanonicalCustomerReceiptPreparePayload) {
  const prepared = await prepareCanonicalAction(
    'finance.customer_receipt.prepare', payload as unknown as Record<string, unknown>,
  );
  const preview = prepared.data;
  const impacts = Array.isArray(preview.financial_impact) ? preview.financial_impact : [];
  const impact = impacts.length === 1 && impacts[0] && typeof impacts[0] === 'object'
    ? impacts[0] as Record<string, any>
    : null;
  const previewAllocations = impact && Array.isArray(impact.allocations) ? impact.allocations : [];
  const expectedAllocations = new Map(payload.allocations.map(row => [row.open_item_id, moneyToCents(row.amount)]));
  const actualAllocations = new Map(previewAllocations.map((row: any) => [
    String(row?.open_item_id || ''), moneyToCents(row?.allocated_amount),
  ]));
  const allocationsMatch = expectedAllocations.size === actualAllocations.size
    && [...expectedAllocations].every(([openItemId, amount]) => actualAllocations.get(openItemId) === amount);
  if (String(preview.branch_id || '') !== payload.branch_id
    || !impact
    || moneyToCents(impact.receipt_amount) !== moneyToCents(payload.amount)
    || String(impact.settlement_account_id || '') !== payload.settlement_account_id
    || !allocationsMatch) {
    throw new Error('Authoritative receipt preview does not match the requested amount, branch, settlement account, or allocations. Nothing was approved.');
  }
  return prepared;
}

export async function approveCustomerReceipt(
  preview: CanonicalCommandPreview,
  lifecycleId: string,
): Promise<{ payment_id: string }> {
  const { executed } = await approveAndExecuteCanonicalAction('finance.customer_receipt.prepare', preview, lifecycleId);
  const paymentId = String(executed.data.resource_id || '');
  if (!canonicalExecutionCompleted(executed.data) || !isCanonicalUuid(paymentId)) {
    throw new Error('Canonical receipt execution did not return a completed payment identity. Confirm server status before retrying.');
  }
  return { payment_id: paymentId };
}

export async function reconcileCustomerReceipt(
  paymentId: string,
  payload: CanonicalCustomerReceiptPreparePayload,
  invoiceByOpenItem: Map<string, { invoice_id: string; due: string | number }>,
): Promise<{ payment_id: string; payment_number: string }> {
  if (!isCanonicalUuid(paymentId)) throw new Error('Cannot reconcile an invalid payment identity.');
  const receiptResponse = await paymentAllocationApi.getCustomerReceiptReadback(paymentId);
  const receipt = receiptResponse.data && typeof receiptResponse.data === 'object'
    ? receiptResponse.data as Record<string, any>
    : {};
  const receiptAllocations = Array.isArray(receipt.allocations) ? receipt.allocations : [];
  const expectedAllocations = new Map(payload.allocations.map(row => [row.open_item_id, moneyToCents(row.amount)]));
  const postedAllocations = new Map(receiptAllocations.map((row: any) => [
    String(row?.open_item_id || ''), moneyToCents(row?.amount),
  ]));
  const allocationExact = expectedAllocations.size === postedAllocations.size
    && [...expectedAllocations].every(([openItemId, cents]) => postedAllocations.get(openItemId) === cents);
  if (String(receipt.payment_id) !== paymentId
    || receipt.status !== 'posted'
    || receipt.allocation_reconciled !== true
    || receipt.journal_balanced !== true
    || moneyToCents(receipt.amount) !== moneyToCents(payload.amount)
    || !allocationExact) {
    throw new Error('Receipt executed, but authoritative payment, allocation, or journal readback did not reconcile. Do not retry blindly.');
  }

  let paymentNumber = '';
  for (const allocation of payload.allocations) {
    const source = invoiceByOpenItem.get(allocation.open_item_id);
    if (!source) throw new Error('Receipt executed, but its source invoice readback identity was lost. Do not retry blindly.');
    const response = await paymentAllocationApi.getInvoicePayments(source.invoice_id);
    const envelope = response.data && typeof response.data === 'object' ? response.data : {};
    const payments = Array.isArray(envelope.payments) ? envelope.payments : [];
    const posted = payments.find((row: any) => String(row?.payment_id) === paymentId);
    const invoice = envelope.invoice && typeof envelope.invoice === 'object' ? envelope.invoice : {};
    const expectedDue = moneyToCents(source.due) - moneyToCents(allocation.amount);
    if (!posted
      || moneyToCents(posted.allocated_amount) !== moneyToCents(allocation.amount)
      || moneyToCents(invoice.due_amount) !== expectedDue) {
      throw new Error('Receipt executed, but authoritative allocation readback did not reconcile. Do not retry blindly.');
    }
    paymentNumber = String(posted.payment_number || paymentNumber);
  }
  return { payment_id: paymentId, payment_number: String(receipt.payment_number || paymentNumber) };
}
