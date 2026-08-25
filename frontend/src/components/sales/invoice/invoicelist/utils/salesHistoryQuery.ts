import type {
    InvoiceFilters,
    SalesHistoryDocumentType,
} from '../types/invoicelist.types';

import type { CanonicalDocumentHistoryParams } from '../../../../../services/api/modules/history/canonicalDocumentHistory.api';
import { historyPresetRange } from '../../../../../utils/calendarDate';

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

export const resolveSalesHistoryDateRange = (
    preset: string,
    businessDate: string,
): Pick<InvoiceFilters, 'dateFrom' | 'dateTo'> => {
    const range = historyPresetRange(businessDate, preset);
    return range ? { dateFrom: range.from, dateTo: range.to } : { dateFrom: '', dateTo: '' };
};
