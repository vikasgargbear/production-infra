import { isCanonicalUuid } from '../../../utils/canonicalUuid';
import { exactDecimalString, exactDecimalUnits } from '../../../utils/exactDecimal';
import { requireCanonicalPostingDate } from '../../../utils/canonicalPostingDate';

export type CanonicalReceiptMethod = 'cash' | 'cheque' | 'bank_transfer' | 'card' | 'upi';

export interface ReceiptOutstandingInvoice {
  invoice_id: string;
  open_item_id?: string;
  branch_id?: string;
  invoice_number: string;
  invoice_date: string;
  amount_due: number | string;
}

export interface ReceiptAllocation {
  invoice_id: string;
  invoice_number: string;
  amount: string;
}

export interface CustomerReceiptDraft {
  customer_account_id: string;
  payment_date: string;
  business_date: string;
  payment_mode: string;
  amount: string;
  reference_number: string;
  bank_account_id: string;
  settlement_account_id: string;
  branch_id?: string;
  evidence_attachment_id?: string;
  sales_order_id?: string;
  receipt_purpose?: 'invoice_settlement' | 'customer_advance';
  instrument_number?: string;
  instrument_date?: string;
  drawee_bank_name?: string;
  account_payee_confirmed?: boolean;
  allocation_method: string;
  allocations: ReceiptAllocation[];
}

export interface CanonicalCustomerReceiptPreparePayload {
  idempotency_key: string;
  branch_id: string;
  payment_date: string;
  customer_account_id: string;
  bank_account_id?: string;
  payment_method: CanonicalReceiptMethod;
  receipt_purpose: 'invoice_settlement' | 'customer_advance';
  sales_order_id?: string;
  evidence_attachment_id: string;
  instrument_number?: string;
  instrument_date?: string;
  drawee_bank_name?: string;
  account_payee_confirmed?: boolean;
  amount: string;
  allocations: Array<{ open_item_id: string; amount: string }>;
  external_reference: string;
}

const MONEY_PATTERN = /^(?:0|[1-9]\d*)(?:\.(\d{1,2}))?$/;

export function moneyToCents(value: string | number): bigint {
  const text = String(value).trim();
  const match = MONEY_PATTERN.exec(text);
  if (!match) throw new Error('Amount must be a non-negative value with at most two decimal places.');
  return exactDecimalUnits(value, 'Amount', { scale: 2, maximumWholeDigits: 18 });
}

export function centsToMoney(cents: bigint): string {
  if (cents < 0n) throw new Error('Invalid money value.');
  return exactDecimalString(cents, 2);
}

export function canonicalReceiptMethod(paymentMode: string): CanonicalReceiptMethod | null {
  if (['cash', 'cheque', 'bank_transfer', 'card', 'upi'].includes(paymentMode)) {
    return paymentMode as CanonicalReceiptMethod;
  }
  return null;
}

export function receiptEscapeAction(currentStep: number, postedPaymentId: string): 'back' | 'block' | 'close' {
  if (currentStep !== 2) return 'close';
  return postedPaymentId ? 'block' : 'back';
}

export function allocateReceiptByMethod(
  amount: string,
  invoices: ReceiptOutstandingInvoice[],
  method: 'fifo' | 'lifo' | 'highest',
): ReceiptAllocation[] {
  let remaining = moneyToCents(amount);
  if (remaining <= 0n) return [];
  const ordered = [...invoices].sort((left, right) => {
    if (method === 'highest') {
      const leftDue = moneyToCents(left.amount_due);
      const rightDue = moneyToCents(right.amount_due);
      return (rightDue > leftDue ? 1 : rightDue < leftDue ? -1 : 0)
        || left.invoice_id.localeCompare(right.invoice_id);
    }
    const dateOrder = left.invoice_date.localeCompare(right.invoice_date)
      || left.invoice_id.localeCompare(right.invoice_id);
    return method === 'lifo' ? -dateOrder : dateOrder;
  });
  const allocations: ReceiptAllocation[] = [];
  for (const invoice of ordered) {
    if (remaining === 0n) break;
    const due = moneyToCents(invoice.amount_due);
    const applied = remaining < due ? remaining : due;
    if (applied <= 0n) continue;
    allocations.push({
      invoice_id: invoice.invoice_id,
      invoice_number: invoice.invoice_number,
      amount: centsToMoney(applied),
    });
    remaining -= applied;
  }
  return allocations;
}

export function buildCustomerReceiptPreparePayload(
  draft: CustomerReceiptDraft,
  outstandingInvoices: ReceiptOutstandingInvoice[],
  idempotencyKey: string,
): CanonicalCustomerReceiptPreparePayload {
  const method = canonicalReceiptMethod(draft.payment_mode);
  if (!method) {
    throw new Error('Select a supported canonical receipt method.');
  }
  const amountCents = moneyToCents(draft.amount);
  if (amountCents <= 0n) throw new Error('Receipt amount must be greater than zero.');
  if (!isCanonicalUuid(draft.customer_account_id)) throw new Error('Select a canonical customer account.');
  const usesBank = !['cash', 'cheque'].includes(method);
  if (usesBank && !isCanonicalUuid(draft.bank_account_id)) {
    throw new Error('Select a canonical bank settlement account.');
  }
  if (!usesBank && draft.bank_account_id) throw new Error('Cash and uncleared cheque receipts cannot select a bank account.');
  if (!isCanonicalUuid(draft.evidence_attachment_id)) throw new Error('Select verified immutable receipt evidence.');
  const reference = draft.reference_number.trim();
  if (!reference) throw new Error('A bank, UPI, or gateway reference is required.');
  requireCanonicalPostingDate(draft.payment_date, draft.business_date, 'Payment date');

  const purpose = draft.receipt_purpose ?? 'invoice_settlement';
  const isAdvance = purpose === 'customer_advance';
  if (isAdvance) {
    if (!isCanonicalUuid(draft.sales_order_id) || !isCanonicalUuid(draft.branch_id)) {
      throw new Error('Select an approved canonical goods order for the customer advance.');
    }
    if (draft.allocations.length) throw new Error('Customer advances must have zero invoice allocations.');
  }
  if (method === 'cheque' && (!String(draft.instrument_number ?? '').trim()
    || !/^\d{4}-\d{2}-\d{2}$/.test(String(draft.instrument_date ?? ''))
    || !String(draft.drawee_bank_name ?? '').trim() || !draft.account_payee_confirmed)) {
    throw new Error('Cheque requires account-payee instrument and verified evidence details.');
  }
  const byInvoice = new Map(outstandingInvoices.map(invoice => [invoice.invoice_id, invoice]));
  const seenOpenItems = new Set<string>();
  const branches = new Set<string>();
  let allocatedCents = 0n;
  const allocations = isAdvance ? [] : draft.allocations.map(allocation => {
    const invoice = byInvoice.get(allocation.invoice_id);
    if (!invoice || !isCanonicalUuid(invoice.open_item_id) || !isCanonicalUuid(invoice.branch_id)) {
      throw new Error(`Invoice ${allocation.invoice_number || allocation.invoice_id} lacks canonical allocation evidence.`);
    }
    requireCanonicalPostingDate(
      draft.payment_date,
      draft.business_date,
      `Payment date for ${invoice.invoice_number}`,
      invoice.invoice_date,
    );
    if (seenOpenItems.has(invoice.open_item_id!)) throw new Error('Each open item can be allocated only once.');
    seenOpenItems.add(invoice.open_item_id!);
    branches.add(invoice.branch_id!);
    const cents = moneyToCents(allocation.amount);
    if (cents <= 0n || cents > moneyToCents(invoice.amount_due)) {
      throw new Error(`Allocation for ${invoice.invoice_number} exceeds its authoritative outstanding amount.`);
    }
    allocatedCents += cents;
    return { open_item_id: invoice.open_item_id!, amount: centsToMoney(cents) };
  });
  if (!isAdvance && (allocations.length === 0 || allocatedCents !== amountCents)) {
    throw new Error('Invoice allocations must exactly equal the receipt amount.');
  }
  if (!isAdvance && branches.size !== 1) throw new Error('A receipt can allocate invoices from exactly one branch.');

  return {
    idempotency_key: idempotencyKey,
    branch_id: isAdvance ? draft.branch_id! : [...branches][0],
    payment_date: draft.payment_date,
    customer_account_id: draft.customer_account_id,
    ...(usesBank ? { bank_account_id: draft.bank_account_id } : {}),
    payment_method: method,
    receipt_purpose: purpose,
    ...(isAdvance ? { sales_order_id: draft.sales_order_id } : {}),
    evidence_attachment_id: draft.evidence_attachment_id!,
    ...(method === 'cheque' ? {
      instrument_number: String(draft.instrument_number).trim(),
      instrument_date: draft.instrument_date,
      drawee_bank_name: String(draft.drawee_bank_name).trim(),
      account_payee_confirmed: true,
    } : {}),
    amount: centsToMoney(amountCents),
    allocations,
    external_reference: reference,
  };
}
