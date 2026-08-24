/**
 * GSTR1 Report - Outward Supplies
 *
 * Shows B2B and B2C invoices with credit/debit note adjustments
 */

import React, { useState, useEffect, useRef } from 'react';
import { Loader2, AlertCircle } from 'lucide-react';
import { DataTable } from '../../global';
import type { DateRange } from '../types';
import { gstApi } from '../../../services/api';
import { formatExactCurrency, normalizeAuthoritativeDecimal } from '../../../utils/exactDecimal';

interface GSTR1ReportProps {
    dateRange?: DateRange;
    refreshTrigger?: number;
    onRefresh?: () => void;
    showTaxBreakdown?: boolean;
    onDataReady?: (data: any) => void;
    onExport?: () => void;
}

const localISODate = (value: Date): string => [
    value.getFullYear(),
    String(value.getMonth() + 1).padStart(2, '0'),
    String(value.getDate()).padStart(2, '0'),
].join('-');

const currentMonthRange = (): DateRange => {
    const today = new Date();
    return {
        from: localISODate(new Date(today.getFullYear(), today.getMonth(), 1)),
        to: localISODate(today),
    };
};

type ExactB2BRow = {
    gst_number: string;
    name: string;
    invoices: number;
    taxableValue: string;
    cgst: string;
    sgst: string;
    igst: string;
    cess: string;
    totalTax: string;
};

type ExactB2CBucket = Omit<ExactB2BRow, 'gst_number' | 'name' | 'invoices'> & { count: number };

type ExactGSTR1Data = {
    b2b: ExactB2BRow[];
    b2c: { small: ExactB2CBucket; large: ExactB2CBucket };
    notes: Array<Record<string, unknown> & { direction: 'credit' | 'debit' }>;
    summary: {
        totalInvoices: number;
        totalTaxableValue: string;
        totalTax: string;
        netAdjustment: string;
    };
};

const exactMoney = (value: unknown, label: string) => normalizeAuthoritativeDecimal(value, label, {
    scale: 2, maximumWholeDigits: 20, allowNegative: true,
});

const GSTR1Report: React.FC<GSTR1ReportProps> = ({
    dateRange = currentMonthRange(),
    refreshTrigger = 0,
    showTaxBreakdown = false,
    onDataReady,
}) => {
    const onDataReadyRef = useRef(onDataReady);
    onDataReadyRef.current = onDataReady;
    const [data, setData] = useState<ExactGSTR1Data | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [creditDebitNotes, setCreditDebitNotes] = useState<any[]>([]);

    // Load data
    useEffect(() => {
        const loadData = async () => {
            setLoading(true);
            setError(null);

            try {
                const response = await gstApi.reports.gstr1({
                    date_from: dateRange.from,
                    date_to: dateRange.to,
                });
                const payload = response?.data || response;
                const result: ExactGSTR1Data = {
                    b2b: (payload?.b2b || []).map((row: any) => ({
                        ...row,
                        taxableValue: exactMoney(row.taxableValue, 'GSTR-1 B2B taxable value'),
                        cgst: exactMoney(row.cgst, 'GSTR-1 B2B CGST'),
                        sgst: exactMoney(row.sgst, 'GSTR-1 B2B SGST'),
                        igst: exactMoney(row.igst, 'GSTR-1 B2B IGST'),
                        cess: exactMoney(row.cess, 'GSTR-1 B2B cess'),
                        totalTax: exactMoney(row.totalTax, 'GSTR-1 B2B total tax'),
                    })),
                    b2c: {
                        small: payload?.b2c?.small,
                        large: payload?.b2c?.large,
                    },
                    notes: payload?.notes || [],
                    summary: {
                        totalInvoices: payload?.summary?.totalInvoices,
                        totalTaxableValue: exactMoney(payload?.summary?.totalTaxableValue, 'GSTR-1 taxable value'),
                        totalTax: exactMoney(payload?.summary?.totalTax, 'GSTR-1 total tax'),
                        netAdjustment: exactMoney(payload?.summary?.netAdjustment, 'GSTR-1 net adjustment'),
                    },
                };
                for (const [label, bucket] of Object.entries(result.b2c)) {
                    if (!bucket || !Number.isSafeInteger(bucket.count)) throw new Error(`GSTR-1 ${label} count is invalid`);
                    for (const field of ['taxableValue', 'cgst', 'sgst', 'igst', 'cess', 'totalTax'] as const) {
                        bucket[field] = exactMoney(bucket[field], `GSTR-1 ${label} ${field}`);
                    }
                }
                if (!Number.isSafeInteger(result.summary.totalInvoices)) throw new Error('GSTR-1 invoice count is invalid');
                setCreditDebitNotes(result.notes);
                setData(result);
                onDataReadyRef.current?.(result);
            } catch (err) {
                setError('Failed to load GSTR1 data');
            } finally {
                setLoading(false);
            }
        };

        loadData();
    }, [dateRange.from, dateRange.to, refreshTrigger]);

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
                <span className="ml-2">Loading GSTR-1 data...</span>
            </div>
        );
    }

    if (error && !data) {
        return (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <AlertCircle className="h-5 w-5 text-red-600 inline mr-2" />
                <span className="text-red-800">{error}</span>
            </div>
        );
    }

    // Build columns based on tax breakdown toggle
    const b2bColumns = [
        { key: 'gst_number', header: 'GSTIN' },
        { key: 'name', header: 'Party Name' },
        { key: 'invoices', header: 'Invoices' },
        { key: 'taxableValue', header: 'Taxable Value', render: (v: string) => formatExactCurrency(v, 'GSTR-1 taxable value') },
        ...(showTaxBreakdown ? [
            { key: 'cgst', header: 'CGST', render: (v: string) => formatExactCurrency(v, 'GSTR-1 CGST') },
            { key: 'sgst', header: 'SGST', render: (v: string) => formatExactCurrency(v, 'GSTR-1 SGST') },
            { key: 'igst', header: 'IGST', render: (v: string) => formatExactCurrency(v, 'GSTR-1 IGST') }
        ] : []),
        { key: 'totalTax', header: 'Total Tax', render: (v: string) => formatExactCurrency(v, 'GSTR-1 total tax') }
    ];

    return (
        <div className="space-y-6">
            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="bg-white p-4 rounded-lg border">
                    <div className="text-sm text-gray-600">Total Invoices</div>
                    <div className="text-2xl font-bold">{data?.summary.totalInvoices || 0}</div>
                </div>
                <div className="bg-white p-4 rounded-lg border">
                    <div className="text-sm text-gray-600">Taxable Value</div>
                    <div className="text-2xl font-bold">{formatExactCurrency(data?.summary.totalTaxableValue || '0.00', 'GSTR-1 taxable value')}</div>
                </div>
                <div className="bg-white p-4 rounded-lg border">
                    <div className="text-sm text-gray-600">Total GST</div>
                    <div className="text-2xl font-bold">{formatExactCurrency(data?.summary.totalTax || '0.00', 'GSTR-1 total tax')}</div>
                </div>
                <div className="bg-white p-4 rounded-lg border">
                    <div className="text-sm text-gray-600">Net Adjustment</div>
                    <div className="text-2xl font-bold">{formatExactCurrency(data?.summary.netAdjustment || '0.00', 'GSTR-1 net adjustment')}</div>
                </div>
            </div>

            {/* B2B Table */}
            <div className="bg-white rounded-lg border">
                <div className="p-4 border-b">
                    <h3 className="text-lg font-semibold">B2B Invoices</h3>
                    <p className="text-sm text-gray-600">Invoices with GSTIN</p>
                </div>
                <DataTable
                    data={data?.b2b || []}
                    keyField="gst_number"
                    columns={b2bColumns}
                />
            </div>

            {/* B2C Summary */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-white rounded-lg border p-4">
                    <h4 className="font-semibold mb-2">B2C Small (&lt; ₹2.5L)</h4>
                    <div className="space-y-1 text-sm">
                        <div className="flex justify-between">
                            <span>Count:</span>
                            <span>{data?.b2c.small.count || 0}</span>
                        </div>
                        <div className="flex justify-between">
                            <span>Taxable:</span>
                            <span>{formatExactCurrency(data?.b2c.small.taxableValue || '0.00', 'GSTR-1 B2C small taxable')}</span>
                        </div>
                        <div className="flex justify-between">
                            <span>Total GST:</span>
                            <span>{formatExactCurrency(data?.b2c.small.totalTax || '0.00', 'GSTR-1 B2C small tax')}</span>
                        </div>
                    </div>
                </div>
                <div className="bg-white rounded-lg border p-4">
                    <h4 className="font-semibold mb-2">B2C Large (≥ ₹2.5L)</h4>
                    <div className="space-y-1 text-sm">
                        <div className="flex justify-between">
                            <span>Count:</span>
                            <span>{data?.b2c.large.count || 0}</span>
                        </div>
                        <div className="flex justify-between">
                            <span>Taxable:</span>
                            <span>{formatExactCurrency(data?.b2c.large.taxableValue || '0.00', 'GSTR-1 B2C large taxable')}</span>
                        </div>
                        <div className="flex justify-between">
                            <span>Total GST:</span>
                            <span>{formatExactCurrency(data?.b2c.large.totalTax || '0.00', 'GSTR-1 B2C large tax')}</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Credit/Debit Notes */}
            {creditDebitNotes.length > 0 && (
                <div className="bg-white rounded-lg border p-4">
                    <h4 className="font-semibold mb-2">Credit/Debit Notes ({creditDebitNotes.length})</h4>
                    <div className="text-sm space-y-1">
                        <div className="flex justify-between">
                            <span>Credit Notes:</span>
                            <span>{creditDebitNotes.filter(n => n.direction === 'credit').length}</span>
                        </div>
                        <div className="flex justify-between">
                            <span>Debit Notes:</span>
                            <span>{creditDebitNotes.filter(n => n.direction === 'debit').length}</span>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default GSTR1Report;
