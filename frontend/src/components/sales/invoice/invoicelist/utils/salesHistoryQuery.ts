import type {
    InvoiceFilters,
    SalesHistoryDocumentType,
} from '../types/invoicelist.types';

import type { CanonicalDocumentHistoryParams } from '../../../../../services/api/modules/history/canonicalDocumentHistory.api';

export type SalesHistoryRequestParams = CanonicalDocumentHistoryParams;

/**
 * Keep each list request inside the canonical contract exposed for that
 * document type. Invoices support all filters, orders support search, and the
 * current challan read model supports pagination only.
 */
export const buildSalesHistoryRequestParams = (
    documentType: SalesHistoryDocumentType,
    filters: InvoiceFilters,
    page: number,
    perPage: number,
): SalesHistoryRequestParams => {
    const params: SalesHistoryRequestParams = {
        document_kind: documentType === 'invoice' ? 'sales_invoice'
            : documentType === 'challan' ? 'sales_dispatch' : 'sales_order',
        page,
        page_size: perPage,
    };
    const search = filters.searchQuery.trim();

    if (search) params.search = search;
    if (filters.statusFilter !== 'all') params.status = filters.statusFilter;
    if (filters.dateFrom) params.date_from = filters.dateFrom;
    if (filters.dateTo) params.date_to = filters.dateTo;

    return params;
};

const localDate = (value: Date): string => {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

export const resolveSalesHistoryDateRange = (
    preset: string,
    now: Date = new Date(),
): Pick<InvoiceFilters, 'dateFrom' | 'dateTo'> => {
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    let from: Date | undefined;
    let to: Date | undefined;

    switch (preset) {
        case 'today':
            from = today;
            to = today;
            break;
        case 'yesterday':
            from = new Date(today);
            from.setDate(from.getDate() - 1);
            to = from;
            break;
        case 'last7days':
            from = new Date(today);
            from.setDate(from.getDate() - 7);
            to = today;
            break;
        case 'last30days':
            from = new Date(today);
            from.setDate(from.getDate() - 30);
            to = today;
            break;
        case 'thisMonth':
            from = new Date(today.getFullYear(), today.getMonth(), 1);
            to = today;
            break;
        case 'lastMonth':
            from = new Date(today.getFullYear(), today.getMonth() - 1, 1);
            to = new Date(today.getFullYear(), today.getMonth(), 0);
            break;
        case 'thisQuarter':
            from = new Date(today.getFullYear(), Math.floor(today.getMonth() / 3) * 3, 1);
            to = today;
            break;
        default:
            return { dateFrom: '', dateTo: '' };
    }

    return { dateFrom: localDate(from), dateTo: localDate(to) };
};
