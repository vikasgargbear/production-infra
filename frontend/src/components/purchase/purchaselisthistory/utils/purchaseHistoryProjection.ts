export type PurchaseDocumentType = 'supplier_invoice' | 'purchase_order' | 'grn';

export interface PurchaseHistoryFilters {
  searchQuery: string;
  dateFilter: string;
  statusFilter: string;
  dateFrom: string;
  dateTo: string;
}

const isoDate = (date: Date) => [
  date.getFullYear(),
  String(date.getMonth() + 1).padStart(2, '0'),
  String(date.getDate()).padStart(2, '0'),
].join('-');

export function resolvePurchaseHistoryDates(
  preset: string,
  explicitFrom = '',
  explicitTo = '',
  now = new Date(),
): { from_date?: string; to_date?: string } {
  if (explicitFrom || explicitTo) {
    return {
      from_date: explicitFrom || undefined,
      to_date: explicitTo || undefined,
    };
  }
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const start = new Date(today);
  const end = new Date(today);
  switch (preset) {
    case 'today': break;
    case 'yesterday': start.setDate(start.getDate() - 1); end.setDate(end.getDate() - 1); break;
    case 'last7days': start.setDate(start.getDate() - 6); break;
    case 'last30days': start.setDate(start.getDate() - 29); break;
    case 'thisMonth': start.setDate(1); break;
    case 'lastMonth':
      start.setMonth(start.getMonth() - 1, 1);
      end.setDate(0);
      break;
    case 'thisQuarter': start.setMonth(Math.floor(start.getMonth() / 3) * 3, 1); break;
    default: return {};
  }
  return { from_date: isoDate(start), to_date: isoDate(end) };
}

export function buildPurchaseHistoryParams(
  filters: PurchaseHistoryFilters,
  documentType: PurchaseDocumentType,
): Record<string, string | undefined> {
  const status = filters.statusFilter === 'all' ? undefined : filters.statusFilter;
  return {
    search: filters.searchQuery.trim() || undefined,
    ...(documentType === 'supplier_invoice'
      ? { status }
      : { status }),
    ...Object.fromEntries(Object.entries(resolvePurchaseHistoryDates(filters.dateFilter, filters.dateFrom, filters.dateTo))
      .map(([key, value]) => [key === 'from_date' ? 'date_from' : 'date_to', value])),
  };
}

const csvCell = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`;

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
