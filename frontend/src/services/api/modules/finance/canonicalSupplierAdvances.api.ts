import type { AxiosResponse } from 'axios';

import { apiHelpers } from '../../apiClient';
import {
  canonicalExecutionCompleted,
  executeApprovedCanonicalAction,
  prepareCanonicalAction,
  type CanonicalCommandPreview,
} from '../../canonicalOperatorActions';
import { isCanonicalUuid } from '../../../../utils/canonicalUuid';
import {
  advanceMoneyToMinor,
  validateSupplierAdvancePreview,
  type SupplierAdvanceContext,
  type SupplierAdvancePreparePayload,
} from '../../../../components/payment/entry/supplierAdvanceCommand';

export interface PostedSupplierAdvance {
  payment_id: string;
  payment_number: string;
  payment_date: string;
  branch_id: string;
  supplier_account_id: string;
  supplier_name: string;
  party_id: string;
  bank_account_id: string;
  settlement_account_id: string;
  supplier_prepayment_account_id: string;
  payment_method: 'bank_transfer' | 'upi';
  external_reference: string;
  cash_disbursed_amount: string;
  gross_advance_amount: string;
  withheld_amount: string;
  status: 'posted';
  accounting_event_id: string;
  journal_entry_id: string;
  journal_number: string;
  journal_debit_total: string;
  journal_credit_total: string;
  allocations: Array<{
    allocation_id: string;
    purchase_order_id: string;
    purchase_order_number: string;
    purchase_order_line_id: string;
    line_number: number;
    product_id: string;
    product_code: string;
    product_name: string;
    prepayment_open_item_id: string;
    cash_disbursed_amount: string;
    withheld_amount: string;
    gross_advance_amount: string;
    prepayment_principal_amount: string;
    withholding_id: string | null;
    allocation_date: string;
    status: 'posted';
  }>;
  journal_lines: Array<{
    journal_line_id: string;
    line_number: number;
    account_id: string;
    party_id: string | null;
    debit: string;
    credit: string;
  }>;
  allocation_reconciled: true;
  journal_balanced: true;
  prepayment_reconciled: true;
  withholding_reconciled: true;
}

export const canonicalSupplierAdvancesApi = {
  getContext: (paymentDate?: string): Promise<AxiosResponse<SupplierAdvanceContext>> => (
    paymentDate
      ? apiHelpers.get('/canonical/supplier-advances/context', { params: { payment_date: paymentDate } })
      : apiHelpers.get('/canonical/supplier-advances/context')
  ),
  getPosted: (paymentId: string): Promise<AxiosResponse<PostedSupplierAdvance>> => {
    if (!isCanonicalUuid(paymentId)) throw new Error('Supplier-advance readback requires a canonical payment identity.');
    return apiHelpers.get(`/canonical/supplier-advances/${paymentId}`);
  },
};

export async function prepareSupplierAdvance(payload: SupplierAdvancePreparePayload) {
  // The bank account is command input; its settlement ledger is authoritative
  // read context used for preview/readback verification. Never send that
  // derived ledger back through the strict canonical command schema.
  const { settlement_account_id: _expectedSettlementAccountId, ...request } = payload;
  const response = await prepareCanonicalAction('finance.supplier_advance.prepare', request);
  validateSupplierAdvancePreview(response.data, payload);
  return response;
}

export async function executeApprovedSupplierAdvance(
  preview: CanonicalCommandPreview,
  lifecycleId: string,
): Promise<string> {
  const executed = await executeApprovedCanonicalAction(
    'finance.supplier_advance.prepare', preview, lifecycleId,
  );
  const paymentId = String(executed.data.resource_id || '');
  if (!canonicalExecutionCompleted(executed.data) || !isCanonicalUuid(paymentId)) {
    throw new Error('Supplier-advance execution returned no completed payment identity. Use status recovery before retrying.');
  }
  return paymentId;
}

export async function reconcileSupplierAdvance(
  paymentId: string,
  payload?: SupplierAdvancePreparePayload,
): Promise<PostedSupplierAdvance> {
  const posted = (await canonicalSupplierAdvancesApi.getPosted(paymentId)).data;
  const allocation = posted.allocations[0];
  const exactPayload = !payload || (
    posted.supplier_account_id === payload.supplier_account_id
    && posted.branch_id === payload.branch_id
    && posted.bank_account_id === payload.bank_account_id
    && posted.settlement_account_id === payload.settlement_account_id
    && posted.external_reference === payload.external_reference.toUpperCase()
    && allocation?.purchase_order_id === payload.purchase_order_id
    && allocation?.purchase_order_line_id === payload.allocations[0].purchase_order_line_id
    && advanceMoneyToMinor(posted.gross_advance_amount) === advanceMoneyToMinor(payload.gross_amount)
  );
  if (posted.payment_id !== paymentId || posted.status !== 'posted'
    || posted.allocations.length !== 1 || !posted.allocation_reconciled
    || !posted.journal_balanced || !posted.prepayment_reconciled
    || !posted.withholding_reconciled || !exactPayload
    || advanceMoneyToMinor(posted.cash_disbursed_amount) + advanceMoneyToMinor(posted.withheld_amount)
      !== advanceMoneyToMinor(posted.gross_advance_amount)
    || advanceMoneyToMinor(allocation.prepayment_principal_amount)
      !== advanceMoneyToMinor(posted.gross_advance_amount)) {
    throw new Error('Supplier advance executed, but authoritative PO allocation, withholding, prepayment, or journal readback did not reconcile. Do not execute again.');
  }
  return posted;
}
