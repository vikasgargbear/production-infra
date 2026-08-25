import { apiHelpers } from '../../apiClient';
import {
  normalizeAuthoritativeDecimal,
  type ExactDecimalString,
} from '../../../../utils/exactDecimal';

export type CanonicalDocumentKind =
  | 'sales_invoice' | 'sales_order' | 'sales_dispatch'
  | 'supplier_invoice' | 'purchase_order' | 'goods_receipt'
  | 'sales_return' | 'purchase_return';

export interface CanonicalDocumentHistoryParams {
  document_kind?: CanonicalDocumentKind;
  document_group?: 'returns';
  search?: string;
  status?: string;
  date_from?: string;
  date_to?: string;
  page?: number;
  page_size?: number;
}

export interface CanonicalDocumentHistoryItem {
  document_kind: CanonicalDocumentKind;
  document_id: string;
  branch_id: string;
  document_number: string;
  document_date: string;
  due_date: string | null;
  status: string;
  party_account_id: string;
  party_name: string;
  source_document_type: string | null;
  source_document_id: string | null;
  source_document_number: string | null;
  line_count: number;
  total_quantity: ExactDecimalString;
  minimum_unit_rate: ExactDecimalString | null;
  maximum_unit_rate: ExactDecimalString | null;
  taxable_amount: ExactDecimalString | null;
  total_tax: ExactDecimalString | null;
  total_amount: ExactDecimalString | null;
  paid_amount: ExactDecimalString | null;
  outstanding_amount: ExactDecimalString | null;
  payment_status: 'paid' | 'partial' | 'pending' | 'overdue' | 'cancelled' | null;
  created_at: string;
  updated_at: string;
}

export interface CanonicalDocumentHistoryResponse {
  items: CanonicalDocumentHistoryItem[];
  business_date: string;
  page: number;
  page_size: number;
  total: number;
}

export const requireCanonicalHistoryAmount = (
  value: ExactDecimalString | null,
  label: string,
): ExactDecimalString => {
  if (value === null) throw new Error(`${label} is unavailable from the canonical history contract.`);
  return value;
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const KINDS = new Set<CanonicalDocumentKind>([
  'sales_invoice', 'sales_order', 'sales_dispatch', 'supplier_invoice',
  'purchase_order', 'goods_receipt', 'sales_return', 'purchase_return',
]);

const object = (value: unknown, label: string): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object.`);
  return value as Record<string, unknown>;
};
const string = (value: unknown, label: string): string => {
  if (typeof value !== 'string') throw new Error(`${label} must be a string.`);
  return value;
};
const nonEmptyString = (value: unknown, label: string): string => {
  const result = string(value, label).trim();
  if (!result) throw new Error(`${label} must not be empty.`);
  return result;
};
const uuid = (value: unknown, label: string): string => {
  const result = string(value, label);
  if (!UUID.test(result)) throw new Error(`${label} must be a canonical UUID.`);
  return result;
};
const integer = (value: unknown, label: string, minimum = 0): number => {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < minimum) throw new Error(`${label} must be an integer.`);
  return value;
};
const nullableString = (value: unknown, label: string): string | null => value === null ? null : string(value, label);
const nullableUuid = (value: unknown, label: string): string | null => value === null ? null : uuid(value, label);
const exactMoney = (value: unknown, label: string) => normalizeAuthoritativeDecimal(value, label, {
  scale: 2, maximumWholeDigits: 18, allowNegative: true,
});
const nullableExactMoney = (value: unknown, label: string) => value === null ? null : exactMoney(value, label);
const exactQuantity = (value: unknown, label: string) => normalizeAuthoritativeDecimal(value, label, {
  scale: 6, maximumWholeDigits: 14, allowNegative: true,
});
const exactRate = (value: unknown, label: string) => value === null ? null : normalizeAuthoritativeDecimal(value, label, {
  scale: 4, maximumWholeDigits: 16, allowNegative: true,
});

export function normalizeCanonicalDocumentHistory(value: unknown): CanonicalDocumentHistoryResponse {
  const response = object(value, 'Document history response');
  if (!Array.isArray(response.items)) throw new Error('Document history items must be an array.');
  const items = response.items.map((raw, index): CanonicalDocumentHistoryItem => {
    const row = object(raw, `Document history item ${index + 1}`);
    const kind = string(row.document_kind, 'Document kind') as CanonicalDocumentKind;
    if (!KINDS.has(kind)) throw new Error('Document history kind is unsupported.');
    const documentDate = string(row.document_date, 'Document date');
    if (!DATE.test(documentDate)) throw new Error('Document date must be YYYY-MM-DD.');
    const dueDate = nullableString(row.due_date, 'Due date');
    if (dueDate !== null && !DATE.test(dueDate)) throw new Error('Due date must be YYYY-MM-DD.');
    const paymentStatus = nullableString(row.payment_status, 'Payment status') as CanonicalDocumentHistoryItem['payment_status'];
    if (paymentStatus !== null && !['paid', 'partial', 'pending', 'overdue', 'cancelled'].includes(paymentStatus)) {
      throw new Error('Payment status is unsupported.');
    }
    const item: CanonicalDocumentHistoryItem = {
      document_kind: kind,
      document_id: uuid(row.document_id, 'Document id'),
      branch_id: uuid(row.branch_id, 'Branch id'),
      document_number: nonEmptyString(row.document_number, 'Document number'),
      document_date: documentDate,
      due_date: dueDate,
      status: nonEmptyString(row.status, 'Document status'),
      party_account_id: uuid(row.party_account_id, 'Party account id'),
      party_name: nonEmptyString(row.party_name, 'Party name'),
      source_document_type: nullableString(row.source_document_type, 'Source document type'),
      source_document_id: nullableUuid(row.source_document_id, 'Source document id'),
      source_document_number: nullableString(row.source_document_number, 'Source document number'),
      line_count: integer(row.line_count, 'Line count'),
      total_quantity: exactQuantity(row.total_quantity, 'Total quantity'),
      minimum_unit_rate: exactRate(row.minimum_unit_rate, 'Minimum unit rate'),
      maximum_unit_rate: exactRate(row.maximum_unit_rate, 'Maximum unit rate'),
      taxable_amount: nullableExactMoney(row.taxable_amount, 'Taxable amount'),
      total_tax: nullableExactMoney(row.total_tax, 'Total tax'),
      total_amount: nullableExactMoney(row.total_amount, 'Total amount'),
      paid_amount: nullableExactMoney(row.paid_amount, 'Paid amount'),
      outstanding_amount: nullableExactMoney(row.outstanding_amount, 'Outstanding amount'),
      payment_status: paymentStatus,
      created_at: string(row.created_at, 'Created timestamp'),
      updated_at: string(row.updated_at, 'Updated timestamp'),
    };
    const settlesOpenItem = kind === 'sales_invoice' || kind === 'supplier_invoice';
    const provenance = [item.source_document_type, item.source_document_id, item.source_document_number];
    if (provenance.some(value => value === null) && provenance.some(value => value !== null)) {
      throw new Error(`${kind} provenance must be complete or absent.`);
    }
    if (settlesOpenItem) {
      if (item.total_amount === null || item.paid_amount === null
        || item.outstanding_amount === null || item.payment_status === null) {
        throw new Error(`${kind} settlement amounts are incomplete.`);
      }
    } else if (item.paid_amount !== null || item.outstanding_amount !== null || item.payment_status !== null) {
      throw new Error(`${kind} must not expose settlement semantics.`);
    }
    if (kind === 'sales_dispatch') {
      if (item.taxable_amount !== null || item.total_tax !== null || item.total_amount !== null) {
        throw new Error('Sales dispatch must not invent monetary values.');
      }
    } else if (item.total_amount === null) {
      throw new Error(`${kind} total amount is unavailable.`);
    }
    if (kind === 'goods_receipt' && (item.taxable_amount !== null || item.total_tax !== null)) {
      throw new Error('Goods receipt must not invent tax values.');
    }
    return item;
  });
  const page = integer(response.page, 'Page', 1);
  const pageSize = integer(response.page_size, 'Page size', 1);
  const total = integer(response.total, 'Total');
  if (items.length > pageSize || total < items.length) throw new Error('Document history pagination is inconsistent.');
  const businessDate = string(response.business_date, 'Business date');
  if (!DATE.test(businessDate)) throw new Error('Business date must be YYYY-MM-DD.');
  return { items, business_date: businessDate, page, page_size: pageSize, total };
}

export const canonicalDocumentHistoryApi = {
  async get(params: CanonicalDocumentHistoryParams): Promise<CanonicalDocumentHistoryResponse> {
    if ((params.document_kind === undefined) === (params.document_group === undefined)) {
      throw new Error('Select exactly one canonical document history kind or group.');
    }
    const response = await apiHelpers.get('/canonical/document-history', { params });
    return normalizeCanonicalDocumentHistory(response.data);
  },
};
