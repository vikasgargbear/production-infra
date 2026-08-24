import type { AxiosResponse } from 'axios';

import type { CanonicalCommandPreview } from '../../canonicalOperatorActions';
import {
  approveAndExecuteCanonicalAction,
  canonicalExecutionCompleted,
  prepareCanonicalAction,
} from '../../canonicalOperatorActions';
import { apiHelpers } from '../../apiClient';
import { isCanonicalUuid } from '../../../../utils/canonicalUuid';
import {
  supplierMoneyToMinor,
  validateSupplierPaymentPreview,
  type SupplierPaymentContext,
  type SupplierPaymentPreparePayload,
} from '../../../../components/payment/entry/supplierPaymentCommand';

export interface PostedSupplierPayment {
  payment_id: string;
  payment_number: string;
  payment_date: string;
  branch_id: string;
  supplier_account_id: string;
  supplier_name: string;
  party_id: string;
  bank_account_id: string;
  settlement_account_id: string;
  accounts_payable_account_id: string;
  payment_method: 'bank_transfer' | 'upi';
  external_reference: string;
  amount: string;
  status: 'posted';
  journal_entry_id: string;
  journal_number: string;
  journal_debit_total: string;
  journal_credit_total: string;
  allocations: Array<{
    allocation_id: string;
    open_item_id: string;
    supplier_invoice_id: string;
    supplier_invoice_number: string;
    amount: string;
    principal_amount: string;
    effective_allocated_amount: string;
    residual_amount: string;
    allocation_date: string;
  }>;
  journal_lines: Array<{
    journal_line_id: string;
    line_number: number;
    account_id: string;
    party_id?: string | null;
    debit: string;
    credit: string;
  }>;
  allocation_reconciled: true;
  journal_balanced: true;
  payable_residuals_reconciled: true;
}

export const canonicalSupplierPaymentsApi = {
  getContext: (paymentDate?: string): Promise<AxiosResponse<SupplierPaymentContext>> => (
    paymentDate
      ? apiHelpers.get('/canonical/supplier-payments/context', { params: { payment_date: paymentDate } })
      : apiHelpers.get('/canonical/supplier-payments/context')
  ),
  getPosted: (paymentId: string): Promise<AxiosResponse<PostedSupplierPayment>> =>
    apiHelpers.get(`/canonical/supplier-payments/${paymentId}`),
};

export async function prepareSupplierPayment(payload: SupplierPaymentPreparePayload) {
  const response = await prepareCanonicalAction('finance.supplier_payment.prepare', payload);
  validateSupplierPaymentPreview(response.data, payload);
  return response;
}

export async function executeSupplierPayment(
  preview: CanonicalCommandPreview,
  lifecycleId: string,
): Promise<string> {
  const { executed } = await approveAndExecuteCanonicalAction(
    'finance.supplier_payment.prepare', preview, lifecycleId,
  );
  const paymentId = String(executed.data.resource_id || '');
  if (!canonicalExecutionCompleted(executed.data) || !isCanonicalUuid(paymentId)) {
    throw new Error('Supplier payment execution did not return one completed payment identity. Confirm server state before retrying.');
  }
  return paymentId;
}

export async function reconcileSupplierPayment(
  paymentId: string,
  payload: SupplierPaymentPreparePayload,
): Promise<PostedSupplierPayment> {
  if (!isCanonicalUuid(paymentId)) throw new Error('Cannot reconcile an invalid supplier-payment identity.');
  const posted = (await canonicalSupplierPaymentsApi.getPosted(paymentId)).data;
  const expected = new Map(payload.allocations.map(row => [row.open_item_id, supplierMoneyToMinor(row.amount)]));
  const actual = new Map(posted.allocations.map(row => [row.open_item_id, supplierMoneyToMinor(row.amount)]));
  const exact = expected.size === actual.size
    && [...expected].every(([openItemId, amount]) => actual.get(openItemId) === amount);
  const residuals = posted.allocations.every(row => (
    supplierMoneyToMinor(row.principal_amount) - supplierMoneyToMinor(row.effective_allocated_amount)
      === supplierMoneyToMinor(row.residual_amount)
    && supplierMoneyToMinor(row.residual_amount) >= 0n
  ));
  if (posted.payment_id !== paymentId || posted.status !== 'posted'
    || posted.supplier_account_id !== payload.supplier_account_id
    || posted.branch_id !== payload.branch_id
    || posted.bank_account_id !== payload.bank_account_id
    || posted.settlement_account_id !== payload.settlement_account_id
    || posted.external_reference !== payload.external_reference.toUpperCase()
    || supplierMoneyToMinor(posted.amount) !== supplierMoneyToMinor(payload.gross_amount)
    || !posted.allocation_reconciled || !posted.journal_balanced
    || !posted.payable_residuals_reconciled || !exact || !residuals) {
    throw new Error('Supplier payment executed, but authoritative allocation, payable residual, or journal readback did not reconcile. Do not execute again.');
  }
  return posted;
}
