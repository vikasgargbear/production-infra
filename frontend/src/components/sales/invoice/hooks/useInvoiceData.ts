import { useState, useEffect } from 'react';
import { invoicesApi } from '../../../../services/api';
import type { Invoice } from '../types/invoiceTypes';


interface Pagination {
    total: number;
    page: number;
    per_page: number;
    total_pages: number;
}

interface UseInvoiceDataReturn {
    invoices: Invoice[];
    loading: boolean;
    error: string | null;
    pagination: Pagination;
    fetchInvoices: (page?: number, filters?: any) => Promise<void>;
    refreshing: boolean;
    refreshSuccess: boolean;
    handleRefresh: () => Promise<void>;
}

export function useInvoiceData(): UseInvoiceDataReturn {
    const [invoices, setInvoices] = useState<Invoice[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [pagination, setPagination] = useState<Pagination>({
        total: 0,
        page: 1,
        per_page: 25,
        total_pages: 0
    });
    const [refreshing, setRefreshing] = useState(false);
    const [refreshSuccess, setRefreshSuccess] = useState(false);

    const fetchInvoices = async (page = 1, filters: any = {}) => {
        setLoading(true);
        setError(null);

        try {
            const searchParams: any = {
                limit: pagination.per_page,
                offset: (page - 1) * pagination.per_page,
                ...filters
            };

            if (filters.search && filters.search.trim()) {
                searchParams.search = filters.search.trim();
            }

            const response = await invoicesApi.getAll(searchParams);
            const responseData = response?.data || response;

            if (responseData?.invoices || responseData?.success) {
                const invoicesData = responseData.invoices || responseData.data?.invoices || [];

                const transformedInvoices = invoicesData.map((invoice: any) => ({
                    id: invoice.invoice_id?.toString() || invoice.invoice_number,
                    invoice_id: invoice.invoice_id,
                    invoice_number: invoice.invoice_number,
                    customer_name: invoice.customer_name,
                    invoice_date: invoice.invoice_date,
                    final_amount: invoice.final_amount,
                    invoice_status: invoice.invoice_status,
                    payment_status: invoice.payment_status,
                    order_number: invoice.order_number,
                    order_date: invoice.order_date,
                    items: 0
                }));

                setInvoices(transformedInvoices);
                const total = responseData.total || responseData.data?.total || 0;
                setPagination({
                    total: total,
                    page: page,
                    per_page: pagination.per_page,
                    total_pages: Math.ceil(total / pagination.per_page)
                });
            } else {
                setError(responseData?.error?.message || 'Failed to fetch invoices');
            }
        } catch (error) {
            setError('Failed to fetch invoices. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    const handleRefresh = async () => {
        setRefreshing(true);
        setRefreshSuccess(false);

        try {
            await fetchInvoices(pagination.page);
            setRefreshSuccess(true);
            setTimeout(() => setRefreshSuccess(false), 2000);
        } catch (error) {
            console.error('Failed to refresh invoices:', error);
        } finally {
            setRefreshing(false);
        }
    };

    // Load invoices on mount
    useEffect(() => {
        fetchInvoices();
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    return {
        invoices,
        loading,
        error,
        pagination,
        fetchInvoices,
        refreshing,
        refreshSuccess,
        handleRefresh
    };
}
