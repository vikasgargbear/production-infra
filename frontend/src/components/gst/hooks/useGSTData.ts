/**
 * useGSTData - Shared hook for GST data fetching
 * 
 * Provides cached invoice and purchase data for GST reports
 */

import { useState, useCallback } from 'react';
import type { DateRange } from '../types';
import { invoicesApi, purchasesApi, gstApi } from '../../../services/api';

interface GSTDataResult {
    invoices: any[];
    purchases: any[];
    creditDebitNotes: any[];
    loading: boolean;
    error: string | null;
    loadInvoices: () => Promise<any[]>;
    loadPurchases: () => Promise<any[]>;
    loadCreditDebitNotes: () => Promise<any[]>;
    refresh: () => Promise<void>;
}

export function useGSTData(dateRange: DateRange): GSTDataResult {
    const [invoices, setInvoices] = useState<any[]>([]);
    const [purchases, setPurchases] = useState<any[]>([]);
    const [creditDebitNotes, setCreditDebitNotes] = useState<any[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const loadInvoices = useCallback(async () => {
        try {
            const response = await invoicesApi.search({
                dateFrom: dateRange.from,
                dateTo: dateRange.to,
                limit: 5000
            });
            const responseData = response?.data || response;
            const data = Array.isArray(responseData) ? responseData : responseData?.invoices || [];
            setInvoices(data);
            return data;
        } catch (err) {
            console.error('Failed to load invoices:', err);
            setError('Failed to load invoice data');
            return [];
        }
    }, [dateRange.from, dateRange.to]);

    const loadPurchases = useCallback(async () => {
        try {
            const response = await purchasesApi.getOrders({
                dateFrom: dateRange.from,
                dateTo: dateRange.to,
                limit: 5000
            });
            const responseData = response?.data || response;
            const data = Array.isArray(responseData) ? responseData : responseData?.purchases || responseData?.orders || [];
            setPurchases(data);
            return data;
        } catch (err) {
            console.error('Failed to load purchases:', err);
            setError('Failed to load purchase data');
            return [];
        }
    }, [dateRange.from, dateRange.to]);

    const loadCreditDebitNotes = useCallback(async () => {
        try {
            const response = await gstApi.reports.creditDebitNotes({
                from_date: dateRange.from,
                to_date: dateRange.to,
                note_type: 'all'
            });
            const responseData = response?.data || response;
            const data = responseData?.notes || [];
            setCreditDebitNotes(data);
            return data;
        } catch (err) {
            console.error('Failed to load credit/debit notes:', err);
            return [];
        }
    }, [dateRange.from, dateRange.to]);

    const refresh = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            await Promise.all([loadInvoices(), loadPurchases(), loadCreditDebitNotes()]);
        } finally {
            setLoading(false);
        }
    }, [loadInvoices, loadPurchases, loadCreditDebitNotes]);

    return {
        invoices,
        purchases,
        creditDebitNotes,
        loading,
        error,
        loadInvoices,
        loadPurchases,
        loadCreditDebitNotes,
        refresh
    };
}

export default useGSTData;

