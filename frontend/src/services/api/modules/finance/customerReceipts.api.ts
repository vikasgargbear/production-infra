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
import { apiHelpers } from '../../apiClient';

export interface CustomerReceiptContext {
  business_date: string;
  payment_methods: Array<'cash' | 'cheque' | 'bank_transfer' | 'card' | 'upi'>;
  settlement_accounts: Array<{
    bank_account_id: string;
    settlement_account_id: string;
    settlement_account_code: string;
    settlement_account_name: string;
    bank_name: string;
    account_holder_name: string;
    currency_code: 'INR';
  }>;
  evidence: Array<{
    attachment_id: string;
    branch_id: string;
    branch_code: string;
    branch_name: string;
    original_filename: string;
    document_date: string;
    retention_until: string;
    status: 'verified' | 'retained';
    verified_at: string;
    sha256: string;
  }>;
  approved_goods_orders: Array<{
    sales_order_id: string;
    order_number: string;
    order_date: string;
    branch_id: string;
    branch_code: string;
    branch_name: string;
    grand_total: string;
    prior_active_advance: string;
    remaining_advance_amount: string;
  }>;
}

export interface VerifiedCustomerReceiptEvidence {
  organization_id: string;
  branch_id: string;
  attachment_id: string;
  evidence_kind: 'customer_receipt_evidence';
  original_filename: string;
  media_type: 'application/pdf';
  byte_size: number;
  sha256: string;
  document_date: string;
  retention_until: string;
  legal_hold: boolean;
  status: 'verified' | 'retained';
  verified_at: string;
  idempotency_replayed: boolean;
}

export async function getCustomerReceiptContext(customerAccountId?: string) {
  const query = customerAccountId
    ? `?customer_account_id=${encodeURIComponent(customerAccountId)}`
    : '';
  return apiHelpers.get<CustomerReceiptContext>(
    `/canonical/customer-receipts/context${query}`,
    { preserveExactDecimals: true },
  );
}

export async function uploadCustomerReceiptEvidence(
  branchId: string,
  documentDate: string,
  file: File,
) {
  if (!isCanonicalUuid(branchId)) throw new Error('Select an invoice or approved goods order before uploading evidence.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(documentDate)) throw new Error('Select a canonical receipt date.');
  if (!(file instanceof File) || file.type !== 'application/pdf'
      || !file.name.toLowerCase().endsWith('.pdf') || file.size <= 0
      || file.size > 10 * 1024 * 1024) {
    throw new Error('Select one non-empty PDF receipt no larger than 10 MiB.');
  }
  const form = new FormData();
  form.append('branch_id', branchId);
  form.append('document_date', documentDate);
  form.append('file', file, file.name);
  return apiHelpers.post<VerifiedCustomerReceiptEvidence>(
    '/web/evidence/customer-receipts', form,
  );
}

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
): Promise<{ payment_id: string; payment_number: string; row_version: number }> {
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
    || !allocationExact
    || String(receipt.payment_purpose || '') !== (payload.receipt_purpose === 'customer_advance' ? 'customer_advance' : 'commercial_settlement')) {
    throw new Error('Receipt executed, but authoritative payment, allocation, or journal readback did not reconcile. Do not retry blindly.');
  }

  let paymentNumber = '';
  if (payload.receipt_purpose === 'customer_advance') {
    const advance = receipt.advance && typeof receipt.advance === 'object' ? receipt.advance : {};
    if (payload.allocations.length !== 0
      || String(advance.sales_order_id || '') !== String(payload.sales_order_id || '')
      || moneyToCents(advance.principal_amount) !== moneyToCents(payload.amount)) {
      throw new Error('Customer advance executed, but authoritative liability readback did not reconcile. Do not retry blindly.');
    }
  }
  for (const allocation of payload.allocations) {
    const source = invoiceByOpenItem.get(allocation.open_item_id);
    if (!source) throw new Error('Receipt executed, but its source invoice readback identity was lost. Do not retry blindly.');
    const response = await paymentAllocationApi.getInvoicePayments(source.invoice_id);
    const envelope = response.data && typeof response.data === 'object' ? response.data : {};
    const payments = Array.isArray(envelope.payments) ? envelope.payments : [];
    const posted = payments.find((row: any) => String(row?.payment_id) === paymentId);
    const invoice = envelope.invoice && typeof envelope.invoice === 'object' ? envelope.invoice : {};
    if (!posted
      || moneyToCents(posted.allocated_amount) !== moneyToCents(allocation.amount)) {
      throw new Error('Receipt executed, but authoritative allocation readback did not reconcile. Do not retry blindly.');
    }
    paymentNumber = String(posted.payment_number || paymentNumber);
  }
  const rowVersion = Number(receipt.row_version);
  if (!Number.isSafeInteger(rowVersion) || rowVersion <= 0) {
    throw new Error('Receipt readback omitted its exact row version. Do not retry blindly.');
  }
  return { payment_id: paymentId, payment_number: String(receipt.payment_number || paymentNumber), row_version: rowVersion };
}
