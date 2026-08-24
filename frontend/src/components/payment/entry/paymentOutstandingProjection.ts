export interface PaymentOutstandingInvoice {
  invoice_id: string;
  open_item_id?: string;
  invoice_number: string;
  invoice_date: string;
  total_amount: number;
  paid_amount: number;
  amount_due: number;
  remaining_due: number;
  total_allocated: number;
  payment_status: string;
}

const money = (value: unknown): number => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

export function projectPaymentOutstandingInvoices(payload: unknown): PaymentOutstandingInvoice[] {
  const envelope = payload && typeof payload === 'object'
    ? payload as Record<string, unknown>
    : {};
  const source = Array.isArray(envelope.invoices) ? envelope.invoices : [];

  return source
    .map((raw): PaymentOutstandingInvoice | null => {
      const invoice = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
      const invoiceId = String(invoice.invoice_id ?? invoice.id ?? '').trim();
      const amountDue = money(invoice.due ?? invoice.due_amount ?? invoice.pending_amount);
      if (!invoiceId || amountDue <= 0.01) return null;
      const totalAmount = money(invoice.total_amount ?? invoice.final_amount ?? invoice.principal_amount);
      const allocated = money(invoice.allocated ?? invoice.allocated_amount ?? invoice.paid_amount);
      return {
        invoice_id: invoiceId,
        open_item_id: invoice.open_item_id ? String(invoice.open_item_id) : undefined,
        invoice_number: String(invoice.invoice_number ?? invoice.document_number ?? invoiceId),
        invoice_date: String(invoice.invoice_date ?? invoice.document_date ?? ''),
        total_amount: totalAmount,
        paid_amount: allocated,
        amount_due: amountDue,
        remaining_due: amountDue,
        total_allocated: allocated,
        payment_status: String(invoice.payment_status ?? 'pending')
      };
    })
    .filter((invoice): invoice is PaymentOutstandingInvoice => invoice !== null)
    .sort((left, right) => (
      new Date(left.invoice_date).getTime() - new Date(right.invoice_date).getTime()
    ));
}
