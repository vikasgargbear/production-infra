import type { CanonicalCommandPreview } from '../../../services/api/canonicalOperatorActions';
import { isCanonicalUuid } from '../../../utils/canonicalUuid';

export type SupplierAdvanceMethod = 'bank_transfer' | 'upi';

export interface SupplierAdvanceLine {
  purchase_order_id: string;
  branch_id: string;
  purchase_order_number: string;
  order_date: string;
  purchase_order_line_id: string;
  line_number: number;
  product_id: string;
  product_code: string;
  product_name: string;
  uom_code: string;
  ordered_quantity: string;
  net_value_amount: string;
  prior_active_gross: string;
  remaining_advance_amount: string;
  withholding_nature_code: 'purchase_of_goods';
}

export interface SupplierAdvanceParty {
  supplier_account_id: string;
  party_id: string;
  supplier_code: string;
  supplier_name: string;
  lines: SupplierAdvanceLine[];
}

export interface SupplierAdvanceBank {
  bank_account_id: string;
  settlement_account_id: string;
  bank_name: string;
  account_holder_name: string;
  ifsc: string;
  currency_code: 'INR';
}

export interface SupplierAdvanceContext {
  ready: boolean;
  blocking_reasons: string[];
  payment_date: string;
  withholding_treatment: 'not_applicable_verified';
  branches: Array<{ branch_id: string; branch_code: string; branch_name: string }>;
  bank_accounts: SupplierAdvanceBank[];
  suppliers: SupplierAdvanceParty[];
}

export interface SupplierAdvancePreparePayload extends Record<string, unknown> {
  idempotency_key: string;
  branch_id: string;
  payment_date: string;
  supplier_account_id: string;
  purchase_order_id: string;
  settlement_account_id: string;
  bank_account_id: string;
  payment_method: SupplierAdvanceMethod;
  gross_amount: string;
  allocations: Array<{ purchase_order_line_id: string; gross_amount: string }>;
  external_reference: string;
}

const MONEY = /^(?:0|[1-9]\d{0,19})(?:\.(\d{1,2}))?$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const KEY = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/;

export function advanceMoneyToMinor(value: string): bigint {
  const text = value.trim();
  if (!MONEY.test(text)) throw new Error('Advance amount must be a decimal string with at most two places.');
  const [whole, fraction = ''] = text.split('.');
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
}

export function advanceMinorToMoney(value: bigint): string {
  if (value < 0n) throw new Error('Advance amount cannot be negative.');
  return `${value / 100n}.${String(value % 100n).padStart(2, '0')}`;
}

export function buildSupplierAdvancePreparePayload(
  context: SupplierAdvanceContext,
  draft: {
    supplierAccountId: string;
    purchaseOrderLineId: string;
    bankAccountId: string;
    paymentDate: string;
    paymentMethod: SupplierAdvanceMethod;
    grossAmount: string;
    externalReference: string;
  },
  idempotencyKey: string,
): SupplierAdvancePreparePayload {
  if (!context.ready) throw new Error(context.blocking_reasons[0] || 'Canonical supplier advance is unavailable.');
  if (!KEY.test(idempotencyKey)) throw new Error('Supplier advance requires a durable attempt identity.');
  if (!DATE.test(context.payment_date) || !DATE.test(draft.paymentDate) || draft.paymentDate > context.payment_date) {
    throw new Error('Advance date must be valid and cannot exceed the authoritative organization date.');
  }
  if (!['bank_transfer', 'upi'].includes(draft.paymentMethod)) {
    throw new Error('Supplier advance supports only bank transfer or UPI.');
  }
  const supplier = context.suppliers.find(row => row.supplier_account_id === draft.supplierAccountId);
  if (!supplier || !isCanonicalUuid(supplier.supplier_account_id)) {
    throw new Error('Select an authoritative canonical supplier.');
  }
  const line = supplier.lines.find(row => row.purchase_order_line_id === draft.purchaseOrderLineId);
  if (!line || !isCanonicalUuid(line.purchase_order_id) || !isCanonicalUuid(line.purchase_order_line_id)
    || !isCanonicalUuid(line.branch_id)) {
    throw new Error('Select an authoritative approved purchase-order product line.');
  }
  if (!context.branches.some(row => row.branch_id === line.branch_id)) {
    throw new Error('The selected purchase-order branch is outside the authoritative context.');
  }
  if (line.order_date > draft.paymentDate || line.withholding_nature_code !== 'purchase_of_goods') {
    throw new Error('Advance date or purchase-of-goods lineage does not match the selected PO line.');
  }
  const bank = context.bank_accounts.find(row => row.bank_account_id === draft.bankAccountId);
  if (!bank || !isCanonicalUuid(bank.bank_account_id) || !isCanonicalUuid(bank.settlement_account_id)
    || bank.currency_code !== 'INR') {
    throw new Error('Select an authoritative INR bank and settlement ledger.');
  }
  const amount = advanceMoneyToMinor(draft.grossAmount);
  const remaining = advanceMoneyToMinor(line.remaining_advance_amount);
  if (amount <= 0n || amount > remaining) {
    throw new Error('Advance must be positive and cannot exceed the authoritative PO-line remainder.');
  }
  const reference = draft.externalReference.trim();
  if (!reference || reference.length > 256) {
    throw new Error('A bank or UPI reference of at most 256 characters is required.');
  }
  const grossAmount = advanceMinorToMoney(amount);
  return {
    idempotency_key: idempotencyKey,
    branch_id: line.branch_id,
    payment_date: draft.paymentDate,
    supplier_account_id: supplier.supplier_account_id,
    purchase_order_id: line.purchase_order_id,
    settlement_account_id: bank.settlement_account_id,
    bank_account_id: bank.bank_account_id,
    payment_method: draft.paymentMethod,
    gross_amount: grossAmount,
    allocations: [{ purchase_order_line_id: line.purchase_order_line_id, gross_amount: grossAmount }],
    external_reference: reference,
  };
}

export function validateSupplierAdvancePreview(
  preview: CanonicalCommandPreview,
  payload: SupplierAdvancePreparePayload,
): CanonicalCommandPreview {
  const document = preview as Record<string, unknown>;
  if (document.operation !== 'finance.supplier_advance.post'
    || document.capability_code !== 'finance.supplier_advance.prepare'
    || document.branch_id !== payload.branch_id
    || document.target_resource_type !== 'payment'
    || !isCanonicalUuid(String(document.target_resource_id || ''))) {
    throw new Error('Supplier-advance preview identity does not match the prepared command.');
  }
  if (!Array.isArray(document.inventory_impact) || document.inventory_impact.length
    || !Array.isArray(document.tax_impact) || document.tax_impact.length) {
    throw new Error('Supplier-advance preview contains an unexpected inventory or tax effect.');
  }
  const impacts = Array.isArray(document.financial_impact) ? document.financial_impact : [];
  if (impacts.length !== 1) throw new Error('Supplier-advance preview lacks one exact financial impact.');
  const impact = impacts[0] as Record<string, unknown>;
  if (impact.purchase_order_id !== payload.purchase_order_id
    || impact.purchase_order_line_id !== payload.allocations[0].purchase_order_line_id
    || impact.settlement_account_id !== payload.settlement_account_id
    || advanceMoneyToMinor(String(impact.gross_advance_amount || '')) !== advanceMoneyToMinor(payload.gross_amount)
    || advanceMoneyToMinor(String(impact.cash_disbursed_amount || '')) !== advanceMoneyToMinor(payload.gross_amount)
    || advanceMoneyToMinor(String(impact.withheld_amount || '')) !== 0n) {
    throw new Error('Supplier-advance preview amount, PO lineage, settlement, or withholding differs from the draft.');
  }
  return preview;
}
