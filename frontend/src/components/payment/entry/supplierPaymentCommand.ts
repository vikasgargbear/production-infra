import type { CanonicalCommandPreview } from '../../../services/api/canonicalOperatorActions';
import { isCanonicalUuid } from '../../../utils/canonicalUuid';
import { requireCanonicalPostingDate } from '../../../utils/canonicalPostingDate';

export type SupplierPaymentMethod = 'bank_transfer' | 'upi';

export interface SupplierPaymentOpenItem {
  open_item_id: string;
  supplier_invoice_id: string;
  branch_id: string;
  document_number: string;
  document_date: string;
  due_date: string;
  principal_amount: string;
  allocated_amount: string;
  outstanding_amount: string;
}

export interface SupplierPaymentParty {
  supplier_account_id: string;
  party_id: string;
  supplier_code: string;
  supplier_name: string;
  open_items: SupplierPaymentOpenItem[];
}

export interface SupplierPaymentBankAccount {
  bank_account_id: string;
  settlement_account_id: string;
  bank_name: string;
  account_holder_name: string;
  ifsc: string;
  currency_code: 'INR';
}

export interface SupplierPaymentContext {
  ready: boolean;
  blocking_reasons: string[];
  payment_date: string;
  branches: Array<{ branch_id: string; branch_code: string; branch_name: string }>;
  bank_accounts: SupplierPaymentBankAccount[];
  suppliers: SupplierPaymentParty[];
}

export interface SupplierPaymentDraft {
  supplier_account_id: string;
  branch_id: string;
  bank_account_id: string;
  settlement_account_id: string;
  payment_date: string;
  payment_method: SupplierPaymentMethod;
  external_reference: string;
  allocations: Array<{ open_item_id: string; amount: string }>;
}

export interface SupplierPaymentPreparePayload extends Record<string, unknown> {
  idempotency_key: string;
  supplier_account_id: string;
  branch_id: string;
  bank_account_id: string;
  settlement_account_id: string;
  payment_date: string;
  payment_method: SupplierPaymentMethod;
  external_reference: string;
  gross_amount: string;
  allocations: Array<{ open_item_id: string; amount: string }>;
}

const MONEY = /^(?:0|[1-9]\d*)(?:\.(\d{1,2}))?$/;

/** Exact INR paise parser. BigInt prevents IEEE-754 drift at every boundary. */
export function supplierMoneyToMinor(value: string): bigint {
  const text = value.trim();
  if (!MONEY.test(text)) {
    throw new Error('Amount must be a non-negative decimal string with at most two decimal places.');
  }
  const [whole, fraction = ''] = text.split('.');
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'));
}

export function supplierMinorToMoney(value: bigint): string {
  if (value < 0n) throw new Error('Amount cannot be negative.');
  return `${value / 100n}.${String(value % 100n).padStart(2, '0')}`;
}

export function allocateSupplierFifo(
  amount: string,
  openItems: SupplierPaymentOpenItem[],
  branchId: string,
): Array<{ open_item_id: string; amount: string }> {
  let remaining = supplierMoneyToMinor(amount);
  if (remaining <= 0n) return [];
  const ordered = openItems
    .filter(item => item.branch_id === branchId)
    .sort((left, right) => left.document_date.localeCompare(right.document_date)
      || left.open_item_id.localeCompare(right.open_item_id));
  const allocations: Array<{ open_item_id: string; amount: string }> = [];
  for (const item of ordered) {
    if (remaining === 0n) break;
    const outstanding = supplierMoneyToMinor(item.outstanding_amount);
    const applied = remaining < outstanding ? remaining : outstanding;
    if (applied <= 0n) continue;
    allocations.push({ open_item_id: item.open_item_id, amount: supplierMinorToMoney(applied) });
    remaining -= applied;
  }
  if (remaining > 0n) throw new Error('Payment amount exceeds the selected branch’s authoritative supplier balance.');
  return allocations;
}

export function buildSupplierPaymentPreparePayload(
  draft: SupplierPaymentDraft,
  context: SupplierPaymentContext,
  idempotencyKey: string,
): SupplierPaymentPreparePayload {
  if (!context.ready) {
    throw new Error(context.blocking_reasons[0] || 'Canonical supplier-payment posting is unavailable.');
  }
  if (!isCanonicalUuid(draft.supplier_account_id)) throw new Error('Select a canonical supplier account.');
  if (!isCanonicalUuid(draft.branch_id)) throw new Error('Select a canonical branch.');
  if (!isCanonicalUuid(draft.bank_account_id) || !isCanonicalUuid(draft.settlement_account_id)) {
    throw new Error('Select a canonical INR bank settlement account.');
  }
  requireCanonicalPostingDate(draft.payment_date, context.payment_date, 'Payment date');
  if (!['bank_transfer', 'upi'].includes(draft.payment_method)) {
    throw new Error('Supplier payment supports only bank transfer or UPI.');
  }
  const reference = draft.external_reference.trim();
  if (!reference || reference.length > 256) {
    throw new Error('A bank or UPI reference of at most 256 characters is required.');
  }
  if (!idempotencyKey.trim()) throw new Error('A stable supplier-payment attempt identity is required.');

  const supplier = context.suppliers.find(row => row.supplier_account_id === draft.supplier_account_id);
  if (!supplier) throw new Error('Selected supplier is not present in the authoritative payment context.');
  const branch = context.branches.find(row => row.branch_id === draft.branch_id);
  if (!branch) throw new Error('Selected branch is not visible in the authoritative payment context.');
  const bank = context.bank_accounts.find(row => row.bank_account_id === draft.bank_account_id);
  if (!bank || bank.settlement_account_id !== draft.settlement_account_id || bank.currency_code !== 'INR') {
    throw new Error('Bank and settlement ledger do not match the authoritative INR account pair.');
  }

  const byId = new Map(supplier.open_items.map(item => [item.open_item_id, item]));
  const seen = new Set<string>();
  let total = 0n;
  const allocations = draft.allocations.map(allocation => {
    const source = byId.get(allocation.open_item_id);
    if (!source || !isCanonicalUuid(source.open_item_id) || !isCanonicalUuid(source.supplier_invoice_id)) {
      throw new Error('Every allocation must reference an authoritative supplier-invoice payable.');
    }
    if (source.branch_id !== draft.branch_id) {
      throw new Error(`${source.document_number} belongs to a different branch.`);
    }
    requireCanonicalPostingDate(
      draft.payment_date,
      context.payment_date,
      `Payment date for ${source.document_number}`,
      source.document_date,
    );
    if (seen.has(source.open_item_id)) throw new Error('Each payable open item can be allocated only once.');
    seen.add(source.open_item_id);
    const amount = supplierMoneyToMinor(allocation.amount);
    const outstanding = supplierMoneyToMinor(source.outstanding_amount);
    if (amount <= 0n || amount > outstanding) {
      throw new Error(`Allocation for ${source.document_number} exceeds its authoritative outstanding amount.`);
    }
    total += amount;
    return { open_item_id: source.open_item_id, amount: supplierMinorToMoney(amount) };
  });
  if (!allocations.length || total <= 0n) {
    throw new Error('Allocate a positive amount to at least one supplier invoice.');
  }
  return {
    idempotency_key: idempotencyKey,
    supplier_account_id: supplier.supplier_account_id,
    branch_id: branch.branch_id,
    bank_account_id: bank.bank_account_id,
    settlement_account_id: bank.settlement_account_id,
    payment_date: draft.payment_date,
    payment_method: draft.payment_method,
    external_reference: reference,
    gross_amount: supplierMinorToMoney(total),
    allocations,
  };
}

export function validateSupplierPaymentPreview(
  preview: CanonicalCommandPreview,
  payload: SupplierPaymentPreparePayload,
): CanonicalCommandPreview {
  const document = preview as Record<string, unknown>;
  if (document.operation !== 'finance.payment.post'
    || document.capability_code !== 'finance.supplier_payment.prepare'
    || document.branch_id !== payload.branch_id
    || document.target_resource_type !== 'payment'
    || !isCanonicalUuid(String(document.target_resource_id || ''))) {
    throw new Error('Supplier-payment preview identity does not match the reviewed command.');
  }
  if (!Array.isArray(document.inventory_impact) || document.inventory_impact.length
    || !Array.isArray(document.tax_impact) || document.tax_impact.length) {
    throw new Error('Supplier-payment preview contains an unexpected inventory or tax effect.');
  }
  const impacts = Array.isArray(document.financial_impact) ? document.financial_impact : [];
  if (impacts.length !== 1) throw new Error('Supplier-payment preview lacks one exact financial impact.');
  const impact = impacts[0] as Record<string, unknown>;
  if (supplierMoneyToMinor(String(impact.gross_liability_settlement || '')) !== supplierMoneyToMinor(payload.gross_amount)
    || supplierMoneyToMinor(String(impact.cash_disbursed_amount || '')) !== supplierMoneyToMinor(payload.gross_amount)
    || supplierMoneyToMinor(String(impact.withheld_amount || '')) !== 0n
    || impact.settlement_account_id !== payload.settlement_account_id) {
    throw new Error('Supplier-payment preview financial totals differ from the draft.');
  }
  const rows = Array.isArray(impact.allocations) ? impact.allocations as Array<Record<string, unknown>> : [];
  const expected = new Map(payload.allocations.map(row => [row.open_item_id, supplierMoneyToMinor(row.amount)]));
  if (rows.length !== expected.size || rows.some(row => (
    !expected.has(String(row.open_item_id || ''))
    || expected.get(String(row.open_item_id || '')) !== supplierMoneyToMinor(String(row.allocated_amount || ''))
  ))) {
    throw new Error('Supplier-payment preview allocations differ from the draft.');
  }
  return preview;
}
