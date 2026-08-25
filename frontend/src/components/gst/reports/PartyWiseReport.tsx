/** Party-wise outward GST projection sourced only from canonical GSTR-1. */

import React, { useEffect, useRef, useState } from 'react';
import { AlertCircle, Loader2, Users } from 'lucide-react';
import { DataTable } from '../../global';
import type { DateRange } from '../types';
import { gstApi } from '../../../services/api';
import {
    addExactDecimals,
    formatExactCurrency,
    normalizeAuthoritativeDecimal,
} from '../../../utils/exactDecimal';

interface PartyWiseReportProps {
    dateRange: DateRange;
    refreshTrigger: number;
    onRefresh?: () => void;
    showTaxBreakdown?: boolean;
    onDataReady?: (data: unknown) => void;
    onExport?: () => void;
}

type PartyData = {
    row_key: string;
    party_name: string;
    gst_number: string;
    invoice_count: number;
    total_taxable_value: string;
    total_cgst: string;
    total_sgst: string;
    total_igst: string;
    total_tax: string;
};

const MONEY = { scale: 2, maximumWholeDigits: 20, allowNegative: true } as const;

const requiredText = (value: unknown, label: string): string => {
    if (typeof value !== 'string' || !value.trim()) {
        throw new Error(`Party-wise GST is missing canonical ${label}.`);
    }
    return value.trim();
};

const requiredCount = (value: unknown): number => {
    if (!Number.isSafeInteger(value) || Number(value) < 0) {
        throw new Error('Party-wise GST has an invalid canonical invoice count.');
    }
    return Number(value);
};

export const normalizeCanonicalPartyRows = (payload: unknown): PartyData[] => {
    if (!payload || typeof payload !== 'object') throw new Error('Canonical GSTR-1 response is unavailable.');
    const rows = (payload as { b2b?: unknown }).b2b;
    if (!Array.isArray(rows)) throw new Error('Canonical GSTR-1 B2B rows are unavailable.');

    return rows.map((candidate, index) => {
        if (!candidate || typeof candidate !== 'object') throw new Error(`Party-wise GST row ${index + 1} is invalid.`);
        const row = candidate as Record<string, unknown>;
        const gstNumber = requiredText(row.gst_number, `row ${index + 1} GSTIN`);
        const partyName = requiredText(row.name, `row ${index + 1} party name`);
        const money = (field: string) => normalizeAuthoritativeDecimal(
            row[field], `Party-wise GST row ${index + 1} ${field}`, MONEY,
        );
        return {
            row_key: `${gstNumber}:${partyName}`,
            gst_number: gstNumber,
            party_name: partyName,
            invoice_count: requiredCount(row.invoices),
            total_taxable_value: money('taxableValue'),
            total_cgst: money('cgst'),
            total_sgst: money('sgst'),
            total_igst: money('igst'),
            total_tax: money('totalTax'),
        };
    });
};

const sumMoney = (rows: PartyData[], field: keyof PartyData, label: string) => addExactDecimals(
    rows.map(row => row[field]), label, MONEY,
);

const PartyWiseReport: React.FC<PartyWiseReportProps> = ({
    dateRange,
    refreshTrigger,
    showTaxBreakdown = false,
    onDataReady,
}) => {
    const onDataReadyRef = useRef(onDataReady);
    onDataReadyRef.current = onDataReady;
    const [data, setData] = useState<PartyData[] | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const loadData = async () => {
            setLoading(true);
            setError(null);
            setData(null);
            try {
                const response = await gstApi.reports.gstr1({
                    date_from: dateRange.from,
                    date_to: dateRange.to,
                });
                const normalized = normalizeCanonicalPartyRows(response?.data || response);
                setData(normalized);
                onDataReadyRef.current?.(normalized);
            } catch (caught) {
                onDataReadyRef.current?.(null);
                setError(caught instanceof Error ? caught.message : 'Party-wise GST data is unavailable.');
            } finally {
                setLoading(false);
            }
        };
        loadData();
    }, [dateRange.from, dateRange.to, refreshTrigger]);

    if (loading) return (
        <div className="flex h-64 items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-teal-600" />
            <span className="ml-2">Loading party-wise GST data...</span>
        </div>
    );

    if (error || !data) return (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4">
            <AlertCircle className="mr-2 inline h-5 w-5 text-red-600" />
            <span className="text-red-800">{error || 'Party-wise GST data is unavailable.'}</span>
        </div>
    );

    const invoiceCount = data.reduce((sum, row) => sum + row.invoice_count, 0);
    const taxable = sumMoney(data, 'total_taxable_value', 'Party-wise taxable total');
    const tax = sumMoney(data, 'total_tax', 'Party-wise tax total');
    const currency = (value: unknown, label: string) => formatExactCurrency(value, label);
    const columns = [
        { key: 'party_name', header: 'Party Name' },
        { key: 'gst_number', header: 'GSTIN' },
        { key: 'invoice_count', header: 'Invoices' },
        { key: 'total_taxable_value', header: 'Taxable Value', render: (value: string) => currency(value, 'Party taxable value') },
        ...(showTaxBreakdown ? [
            { key: 'total_cgst', header: 'CGST', render: (value: string) => currency(value, 'Party CGST') },
            { key: 'total_sgst', header: 'SGST', render: (value: string) => currency(value, 'Party SGST') },
            { key: 'total_igst', header: 'IGST', render: (value: string) => currency(value, 'Party IGST') },
        ] : []),
        { key: 'total_tax', header: 'Total Tax', render: (value: string) => currency(value, 'Party total tax') },
    ];

    return (
        <div className="space-y-6">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
                <div className="rounded-lg border bg-white p-4"><div className="text-sm text-gray-600">Registered Parties</div><div className="text-2xl font-bold">{data.length}</div></div>
                <div className="rounded-lg border bg-white p-4"><div className="text-sm text-gray-600">B2B Invoices</div><div className="text-2xl font-bold">{invoiceCount}</div></div>
                <div className="rounded-lg border bg-white p-4"><div className="text-sm text-gray-600">Taxable Value</div><div className="text-2xl font-bold">{currency(taxable, 'Party-wise taxable total')}</div></div>
                <div className="rounded-lg border bg-white p-4"><div className="text-sm text-gray-600">Total Tax</div><div className="text-2xl font-bold">{currency(tax, 'Party-wise tax total')}</div></div>
            </div>
            <div className="rounded-lg border bg-white">
                <div className="flex items-center border-b p-4">
                    <Users className="mr-2 h-5 w-5 text-teal-600" />
                    <h3 className="text-lg font-semibold">Registered party outward GST</h3>
                </div>
                <DataTable data={data} keyField="row_key" columns={columns} />
            </div>
        </div>
    );
};

export default PartyWiseReport;
