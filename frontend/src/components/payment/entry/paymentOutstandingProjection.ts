import { centsToMoney, moneyToCents } from './customerReceiptCommand';

export interface PaymentOutstandingInvoice {
  invoice_id: string;
  open_item_id?: string;
  branch_id?: string;
  invoice_number: string;
  invoice_date: string;
  total_amount: string;
  paid_amount: string;
  amount_due: string;
  remaining_due: string;
  total_allocated: string;
  payment_status: string;
}

const canonicalUuid = (value: unknown, field: string): string => {
  const text = String(value ?? '').trim();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(text)) {
    throw new Error(`Outstanding invoice projection has invalid ${field}.`);
  }
  return text;
};

const money = (value: unknown, field: string): string => {
  if (typeof value !== 'string') throw new Error(`Outstanding invoice projection has invalid ${field}.`);
  const text = value.trim();
  if (!/^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(text)) {
    throw new Error(`Outstanding invoice projection has invalid ${field}.`);
  }
  try {
    return centsToMoney(moneyToCents(text));
  } catch {
    throw new Error(`Outstanding invoice projection has invalid ${field}.`);
  }
};

export function projectPaymentOutstandingInvoices(payload: unknown): PaymentOutstandingInvoice[] {
  const envelope = payload && typeof payload === 'object'
    ? payload as Record<string, unknown>
    : {};
  if (!Array.isArray(envelope.invoices)
    || !Number.isInteger(envelope.invoice_count)
    || envelope.invoice_count !== envelope.invoices.length) {
    throw new Error('Outstanding invoice projection is incomplete.');
  }
  const source = envelope.invoices;
  const invoiceIds = new Set<string>();
  const openItemIds = new Set<string>();

  return source.map((raw): PaymentOutstandingInvoice => {
      const invoice = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
      const invoiceId = canonicalUuid(invoice.invoice_id, 'invoice_id');
      const openItemId = canonicalUuid(invoice.open_item_id, 'open_item_id');
      const branchId = canonicalUuid(invoice.branch_id, 'branch_id');
      if (invoiceIds.has(invoiceId) || openItemIds.has(openItemId)) {
        throw new Error('Outstanding invoice projection contains duplicate identities.');
      }
      invoiceIds.add(invoiceId);
      openItemIds.add(openItemId);
      const invoiceDate = String(invoice.invoice_date ?? '');
      const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(invoiceDate);
      if (!dateMatch) throw new Error('Outstanding invoice projection has invalid invoice_date.');
      const parsedDate = new Date(Date.UTC(Number(dateMatch[1]), Number(dateMatch[2]) - 1, Number(dateMatch[3])));
      if (parsedDate.toISOString().slice(0, 10) !== invoiceDate) throw new Error('Outstanding invoice projection has invalid invoice_date.');
      const amountDue = money(invoice.due, 'due');
      const totalAmount = money(invoice.total_amount, 'total_amount');
      const allocated = money(invoice.allocated, 'allocated');
      if (moneyToCents(amountDue) <= 0n
        || moneyToCents(amountDue) + moneyToCents(allocated) !== moneyToCents(totalAmount)) {
        throw new Error('Outstanding invoice projection money does not reconcile.');
      }
      const invoiceNumber = String(invoice.invoice_number || '').trim();
      const paymentStatus = String(invoice.payment_status || '').trim();
      if (!invoiceNumber || !paymentStatus) throw new Error('Outstanding invoice projection is missing document identity or status.');
      return {
        invoice_id: invoiceId,
        open_item_id: openItemId,
        branch_id: branchId,
        invoice_number: invoiceNumber,
        invoice_date: invoiceDate,
        total_amount: totalAmount,
        paid_amount: allocated,
        amount_due: amountDue,
        remaining_due: amountDue,
        total_allocated: allocated,
        payment_status: paymentStatus
      };
    })
    .sort((left, right) => (
      left.invoice_date.localeCompare(right.invoice_date)
    ));
}
