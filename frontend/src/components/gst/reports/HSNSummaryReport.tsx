/**
 * HSN Summary Report - Product/HSN-wise GST
 */

import React, { useState, useEffect } from 'react';
import { Loader2, AlertCircle, Package } from 'lucide-react';
import { DataTable } from '../../global';
import type { DateRange } from '../types';
import { formatCurrency } from '../utils';
import { gstApi } from '../../../services/api';

interface HSNSummaryReportProps {
    dateRange: DateRange;
    refreshTrigger: number;
    onRefresh?: () => void;
    showTaxBreakdown?: boolean;
    onDataReady?: (data: any) => void;
    onExport?: () => void;
}

interface HSNItem {
    hsn_code: string;
    description: string;
    quantity: number;
    taxable_value: number;
    tax_rate: number;
    tax_amount: number;
}

const canonicalNumber = (value: unknown, field: string): number => {
    if (value === null || value === undefined || value === '') {
        throw new Error(`HSN response is missing ${field}`);
    }
    const parsed = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(parsed)) throw new Error(`HSN response has invalid ${field}`);
    return parsed;
};

export const normalizeHsnSummary = (rows: unknown): HSNItem[] => {
    if (!Array.isArray(rows)) throw new Error('HSN response must contain an array');
    return rows.map((row: Record<string, unknown>, index) => {
        if (!row || typeof row !== 'object') throw new Error(`HSN row ${index + 1} is invalid`);
        if (typeof row.hsn_code !== 'string' || typeof row.description !== 'string') {
            throw new Error(`HSN row ${index + 1} is missing identity fields`);
        }
        return {
            hsn_code: row.hsn_code,
            description: row.description,
            quantity: canonicalNumber(row.quantity, 'quantity'),
            taxable_value: canonicalNumber(row.taxable_value, 'taxable_value'),
            tax_rate: canonicalNumber(row.tax_rate, 'tax_rate'),
            tax_amount: canonicalNumber(row.tax_amount, 'tax_amount'),
        };
    });
};

const hsnTotals = (rows: HSNItem[]) => ({
    quantity: rows.reduce((sum, row) => sum + row.quantity, 0),
    taxable: rows.reduce((sum, row) => sum + row.taxable_value, 0),
    tax: rows.reduce((sum, row) => sum + row.tax_amount, 0),
});

const HSNSummaryReport: React.FC<HSNSummaryReportProps> = ({ dateRange, refreshTrigger, onDataReady }) => {
    const [data, setData] = useState<HSNItem[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [totals, setTotals] = useState({ quantity: 0, taxable: 0, tax: 0 });

    useEffect(() => {
        const loadData = async () => {
            setLoading(true);
            setError(null);

            try {
                const response = await gstApi.reports.hsnSummary({
                    from_date: dateRange.from,
                    to_date: dateRange.to
                });
                const responseData = response?.data || response;
                const normalized = normalizeHsnSummary(responseData?.hsn_summary);
                setData(normalized);
                setTotals(hsnTotals(normalized));
                onDataReady?.(normalized);
            } catch (err) {
                setData([]);
                setTotals({ quantity: 0, taxable: 0, tax: 0 });
                setError(err instanceof Error ? err.message : 'Failed to load HSN summary');
            } finally {
                setLoading(false);
            }
        };

        loadData();
    }, [dateRange.from, dateRange.to, refreshTrigger]);

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <Loader2 className="w-8 h-8 animate-spin text-amber-600" />
                <span className="ml-2">Loading HSN summary...</span>
            </div>
        );
    }

    if (error) {
        return (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <AlertCircle className="h-5 w-5 text-red-600 inline mr-2" />
                <span className="text-red-800">{error}</span>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Summary */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="bg-white p-4 rounded-lg border">
                    <div className="text-sm text-gray-600">HSN Codes</div>
                    <div className="text-2xl font-bold">{data.length}</div>
                </div>
                <div className="bg-white p-4 rounded-lg border">
                    <div className="text-sm text-gray-600">Total Quantity</div>
                    <div className="text-2xl font-bold">{totals.quantity.toLocaleString()}</div>
                </div>
                <div className="bg-white p-4 rounded-lg border">
                    <div className="text-sm text-gray-600">Taxable Value</div>
                    <div className="text-2xl font-bold">{formatCurrency(totals.taxable)}</div>
                </div>
                <div className="bg-white p-4 rounded-lg border">
                    <div className="text-sm text-gray-600">Total Tax</div>
                    <div className="text-2xl font-bold">{formatCurrency(totals.tax)}</div>
                </div>
            </div>

            {/* HSN Table */}
            <div className="bg-white rounded-lg border">
                <div className="p-4 border-b flex items-center">
                    <Package className="h-5 w-5 text-amber-600 mr-2" />
                    <h3 className="text-lg font-semibold">HSN-wise Summary</h3>
                </div>
                <DataTable
                    data={data}
                    keyField="hsn_code"
                    columns={[
                        { key: 'hsn_code', header: 'HSN Code' },
                        { key: 'description', header: 'Description' },
                        { key: 'quantity', header: 'Quantity', render: (v) => Number(v).toLocaleString() },
                        { key: 'taxable_value', header: 'Taxable Value', render: (v) => formatCurrency(v) },
                        { key: 'tax_rate', header: 'Tax Rate', render: (v) => `${v}%` },
                        { key: 'tax_amount', header: 'Tax Amount', render: (v) => formatCurrency(v) }
                    ]}
                />
            </div>
        </div>
    );
};

export default HSNSummaryReport;
