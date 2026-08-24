import type { InvoiceFilters } from '../types/invoicelist.types';
import {
    buildSalesHistoryRequestParams,
    resolveSalesHistoryDateRange,
} from './salesHistoryQuery';

const filters: InvoiceFilters = {
    searchQuery: '  DEMO  ',
    dateFilter: 'last7days',
    dateFrom: '2026-08-17',
    dateTo: '2026-08-24',
    statusFilter: 'pending',
};

test('keeps all supported invoice filters during pagination and refresh', () => {
    expect(buildSalesHistoryRequestParams('invoice', filters, 3, 25)).toEqual({
        limit: 25,
        offset: 50,
        search: 'DEMO',
        payment_status: 'pending',
        date_from: '2026-08-17',
        date_to: '2026-08-24',
    });
});

test('only sends supported parameters for orders and challans', () => {
    expect(buildSalesHistoryRequestParams('sales_order', filters, 2, 25)).toEqual({
        limit: 25,
        skip: 25,
        search: 'DEMO',
    });
    expect(buildSalesHistoryRequestParams('challan', filters, 2, 25)).toEqual({
        limit: 25,
        skip: 25,
    });
});

test('resolves presets in local calendar time', () => {
    const now = new Date(2026, 7, 24, 23, 45);
    expect(resolveSalesHistoryDateRange('last7days', now)).toEqual({
        dateFrom: '2026-08-17',
        dateTo: '2026-08-24',
    });
    expect(resolveSalesHistoryDateRange('lastMonth', now)).toEqual({
        dateFrom: '2026-07-01',
        dateTo: '2026-07-31',
    });
});
