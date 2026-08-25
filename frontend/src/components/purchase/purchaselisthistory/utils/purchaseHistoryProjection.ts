import { historyPresetRange } from '../../../../utils/calendarDate';

export type PurchaseDocumentType = 'supplier_invoice' | 'purchase_order' | 'grn';

export interface PurchaseHistoryFilters {
  searchQuery: string;
  dateFilter: string;
  statusFilter: string;
  dateFrom: string;
  dateTo: string;
}

export function resolvePurchaseHistoryDates(
  preset: string,
  explicitFrom = '',
  explicitTo = '',
  businessDate: string,
): { from_date?: string; to_date?: string } {
  if (explicitFrom || explicitTo) {
    return {
      from_date: explicitFrom || undefined,
      to_date: explicitTo || undefined,
    };
  }
  const range = historyPresetRange(businessDate, preset);
  return range ? { from_date: range.from, to_date: range.to } : {};
}

export function buildPurchaseHistoryParams(
  filters: PurchaseHistoryFilters,
  documentType: PurchaseDocumentType,
  businessDate: string,
): Record<string, string | undefined> {
  const status = filters.statusFilter === 'all' ? undefined : filters.statusFilter;
  return {
    search: filters.searchQuery.trim() || undefined,
    ...(documentType === 'supplier_invoice'
      ? { status }
      : { status }),
    ...Object.fromEntries(Object.entries(resolvePurchaseHistoryDates(
      filters.dateFilter, filters.dateFrom, filters.dateTo, businessDate,
    ))
      .map(([key, value]) => [key === 'from_date' ? 'date_from' : 'date_to', value])),
  };
}

const csvCell = (value: unknown) => {
  let text = String(value ?? '');
  if (/^\s*[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
};

export function purchaseHistoryCsv(
  rows: Array<{
    po_number: string; supplier_name: string; po_date: string;
    total_amount: string | null; paid_amount: string | null; pending_amount: string | null;
    payment_status?: string | null; status?: string;
  }>,
  numberLabel: string,
): string {
  const header = [numberLabel, 'Supplier', 'Date', 'Amount', 'Paid', 'Pending', 'Status'];
  return [header, ...rows.map(row => [
    row.po_number, row.supplier_name, row.po_date, row.total_amount,
    row.paid_amount, row.pending_amount, row.payment_status || row.status,
  ])].map(row => row.map(csvCell).join(',')).join('\n');
}
