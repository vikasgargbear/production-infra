import { normalizeAuthoritativeDecimal } from '../../../../../utils/exactDecimal';

type JsonRecord = Record<string, unknown>;
const object = (value: unknown, label: string): JsonRecord => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object.`);
  return value as JsonRecord;
};
const text = (value: unknown, label: string) => {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} is required.`);
  return value;
};
const integer = (value: unknown, label: string) => {
  if (!Number.isSafeInteger(value) || Number(value) < 0) throw new Error(`${label} must be a non-negative integer.`);
  return Number(value);
};
const money = (value: unknown, label: string) => normalizeAuthoritativeDecimal(value, label, { scale: 2, maximumWholeDigits: 20, allowNegative: true });

export interface HistoricalInvoiceArchiveItem {
  record_key: string; invoice_number: string; invoice_date: string; customer_name: string;
  line_count: number; taxable_amount: string; tax_amount: string; total_amount: string;
}
export interface HistoricalInvoiceArchive { items: HistoricalInvoiceArchiveItem[]; total: number; offset: number; limit: number }

export const projectHistoricalInvoiceArchive = (value: unknown): HistoricalInvoiceArchive => {
  const root = object(value, 'Imported invoice archive');
  if (!Array.isArray(root.items)) throw new Error('Imported invoice items must be an array.');
  return {
    items: root.items.map((item, index) => {
      const row = object(item, `Imported invoice ${index + 1}`);
      const invoiceDate = text(row.invoice_date, 'Imported invoice date');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(invoiceDate)) throw new Error('Imported invoice date must be YYYY-MM-DD.');
      return {
        record_key: text(row.record_key, 'Imported invoice identity'),
        invoice_number: text(row.invoice_number, 'Imported invoice number'),
        invoice_date: invoiceDate,
        customer_name: text(row.customer_name, 'Imported invoice customer'),
        line_count: integer(row.line_count, 'Imported invoice line count'),
        taxable_amount: money(row.taxable_amount, 'Imported invoice taxable amount'),
        tax_amount: money(row.tax_amount, 'Imported invoice tax'),
        total_amount: money(row.total_amount, 'Imported invoice total'),
      };
    }),
    total: integer(root.total, 'Imported invoice total count'),
    offset: integer(root.offset, 'Imported invoice offset'),
    limit: integer(root.limit, 'Imported invoice limit'),
  };
};
