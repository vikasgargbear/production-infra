/**
 * GSTR2B Report - Input Tax Credit (Purchase Invoices)
 *
 * Merged: absorbs Input Credit Report (ITC detail view)
 */

import React, { useState, useEffect } from 'react';
import { Loader2, AlertCircle, TrendingDown } from 'lucide-react';
import { DataTable } from '../../global';
import type { DateRange } from '../types';
import { formatCurrency } from '../utils';
import { gstApi, apiClient, purchasesApi } from '../../../services/api';

interface GSTR2BReportProps {
    dateRange: DateRange;
    refreshTrigger: number;
    onRefresh?: () => void;
    showTaxBreakdown?: boolean;
    onDataReady?: (data: any) => void;
    onExport?: () => void;
}

type ViewMode = 'summary' | 'detail';

const GSTR2BReport: React.FC<GSTR2BReportProps> = ({ dateRange, refreshTrigger, showTaxBreakdown = false, onDataReady }) => {
    const [data, setData] = useState<any>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [currentPage, setCurrentPage] = useState(1);
    const [pageSize] = useState(25);
    const [totalInvoices, setTotalInvoices] = useState(0);
    const [viewMode, setViewMode] = useState<ViewMode>('summary');
    const [detailData, setDetailData] = useState<any[]>([]);
    const [detailTotals, setDetailTotals] = useState({ purchases: 0, taxable: 0, total: 0 });

    useEffect(() => {
        const loadData = async () => {
            setLoading(true);
            setError(null);

            try {
                // Load summary data
                const response = await gstApi.reports.gstr2a({
                    from_date: dateRange.from,
                    to_date: dateRange.to
                });
                const responseData = response?.data || response;

                if (responseData) {
                    const totalCount = responseData.summary?.totalInvoices || responseData.invoices?.length || 0;
                    setTotalInvoices(totalCount);

                    const invoices = responseData.invoices || [];
                    const firstPage = invoices.slice(0, pageSize);

                    const result = {
                        b2b: firstPage.map((inv: any) => ({
                            gst_number: inv.supplier_gst_number || inv.gst_number || '',
                            name: inv.supplier_name || 'Unknown Supplier',
                            invoices: 1,
                            taxableValue: inv.taxable_amount || 0,
                            cgst: inv.cgst_amount || 0,
                            sgst: inv.sgst_amount || 0,
                            igst: inv.igst_amount || 0
                        })),
                        summary: responseData.summary || {
                            totalInvoices: totalCount,
                            totalTaxableValue: 0,
                            totalCGST: 0,
                            totalSGST: 0,
                            totalIGST: 0,
                            totalTax: 0
                        }
                    };

                    setData(result);
                    onDataReady?.(result);
                }

                // Load detailed ITC data (for detail view)
                try {
                    const purchaseRes = await purchasesApi.getAll({
                        from_date: dateRange.from,
                        to_date: dateRange.to,
                        limit: 5000
                    });
                    const purchases = Array.isArray(purchaseRes) ? purchaseRes : purchaseRes?.data?.purchases || purchaseRes?.data || [];

                    const items = purchases.map((p: any, idx: number) => ({
                        id: idx + 1,
                        invoice_number: p.invoice_number || p.purchase_no || `PUR-${idx + 1}`,
                        invoice_date: p.invoice_date || p.purchase_date || '-',
                        supplier_name: p.supplier_name || 'Unknown Supplier',
                        supplier_gst_number: p.supplier_gst_number || p.gst_number || '-',
                        taxable_amount: p.taxable_amount || 0,
                        cgst: p.cgst_amount || 0,
                        sgst: p.sgst_amount || 0,
                        igst: p.igst_amount || 0,
                        total_itc: (p.cgst_amount || 0) + (p.sgst_amount || 0) + (p.igst_amount || 0)
                    }));

                    setDetailData(items);
                    setDetailTotals({
                        purchases: items.length,
                        taxable: items.reduce((s: number, i: any) => s + i.taxable_amount, 0),
                        total: items.reduce((s: number, i: any) => s + i.total_itc, 0)
                    });
                } catch {
                    // Detail data optional
                }
            } catch (err) {
                setError('Failed to load GSTR-2B data');
            } finally {
                setLoading(false);
            }
        };

        loadData();
    }, [dateRange.from, dateRange.to, refreshTrigger]);

    const loadPage = async (page: number) => {
        try {
            const skip = (page - 1) * pageSize;
            const response = await apiClient.get('/supplier-invoices/', {
                params: { from_date: dateRange.from, to_date: dateRange.to, limit: pageSize, skip }
            });

            const invoices = response.data || [];
            setData((prev: any) => ({
                ...prev,
                b2b: invoices.map((inv: any) => ({
                    gst_number: inv.supplier_gst_number || '',
                    name: inv.supplier_name || 'Unknown',
                    invoices: 1,
                    taxableValue: inv.taxable_amount || 0,
                    cgst: inv.cgst_amount || 0,
                    sgst: inv.sgst_amount || 0,
                    igst: inv.igst_amount || 0
                }))
            }));
            setCurrentPage(page);
        } catch (err) {
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <Loader2 className="w-8 h-8 animate-spin text-purple-600" />
                <span className="ml-2">Loading GSTR-2B data...</span>
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

    // Summary view columns
    const summaryColumns = [
        { key: 'gst_number', header: 'Supplier GSTIN' },
        { key: 'name', header: 'Supplier Name' },
        { key: 'taxableValue', header: 'Taxable Value', render: (v: number) => formatCurrency(v) },
        ...(showTaxBreakdown ? [
            { key: 'cgst', header: 'CGST', render: (v: number) => formatCurrency(v) },
            { key: 'sgst', header: 'SGST', render: (v: number) => formatCurrency(v) },
            { key: 'igst', header: 'IGST', render: (v: number) => formatCurrency(v) }
        ] : []),
        { key: 'totalTax', header: 'Total Tax', render: (_v: number, row: any) => formatCurrency((row.cgst || 0) + (row.sgst || 0) + (row.igst || 0)) }
    ];

    // Detail view columns
    const detailColumns = [
        { key: 'invoice_number', header: 'Invoice No' },
        { key: 'invoice_date', header: 'Date' },
        { key: 'supplier_name', header: 'Supplier' },
        { key: 'supplier_gst_number', header: 'GSTIN' },
        { key: 'taxable_amount', header: 'Taxable', render: (v: number) => formatCurrency(v) },
        ...(showTaxBreakdown ? [
            { key: 'cgst', header: 'CGST', render: (v: number) => formatCurrency(v) },
            { key: 'sgst', header: 'SGST', render: (v: number) => formatCurrency(v) },
            { key: 'igst', header: 'IGST', render: (v: number) => formatCurrency(v) }
        ] : []),
        { key: 'total_itc', header: 'Total ITC', render: (v: number) => formatCurrency(v) }
    ];

    return (
        <div className="space-y-6">
            {/* Summary */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="bg-white p-4 rounded-lg border">
                    <div className="text-sm text-gray-600">Total Invoices</div>
                    <div className="text-2xl font-bold">{totalInvoices}</div>
                </div>
                <div className="bg-white p-4 rounded-lg border">
                    <div className="text-sm text-gray-600">Taxable Value</div>
                    <div className="text-2xl font-bold">{formatCurrency(data?.summary?.totalTaxableValue || 0)}</div>
                </div>
                <div className="bg-white p-4 rounded-lg border">
                    <div className="text-sm text-gray-600">Input Credit Available</div>
                    <div className="text-2xl font-bold text-green-600">{formatCurrency(data?.summary?.totalTax || 0)}</div>
                </div>
                <div className="bg-white p-4 rounded-lg border">
                    <div className="text-sm text-gray-600">IGST Credit</div>
                    <div className="text-2xl font-bold">{formatCurrency(data?.summary?.totalIGST || 0)}</div>
                </div>
            </div>

            {/* View Toggle */}
            <div className="flex items-center space-x-2">
                <button
                    onClick={() => setViewMode('summary')}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                        viewMode === 'summary'
                            ? 'bg-purple-100 text-purple-700 border border-purple-300'
                            : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
                    }`}
                >
                    Supplier Summary
                </button>
                <button
                    onClick={() => setViewMode('detail')}
                    className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                        viewMode === 'detail'
                            ? 'bg-purple-100 text-purple-700 border border-purple-300'
                            : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
                    }`}
                >
                    Invoice Detail (ITC)
                </button>
            </div>

            {viewMode === 'summary' ? (
                <>
                    {/* Supplier Invoices Table */}
                    <div className="bg-white rounded-lg border">
                        <div className="p-4 border-b">
                            <h3 className="text-lg font-semibold">Supplier Invoices</h3>
                            <p className="text-sm text-gray-600">Input Tax Credit from purchases</p>
                        </div>
                        <DataTable
                            data={data?.b2b || []}
                            keyField="gst_number"
                            columns={summaryColumns}
                        />

                        {/* Pagination */}
                        {totalInvoices > pageSize && (
                            <div className="p-4 border-t flex items-center justify-between">
                                <span className="text-sm text-gray-600">
                                    Page {currentPage} of {Math.ceil(totalInvoices / pageSize)}
                                </span>
                                <div className="space-x-2">
                                    <button
                                        onClick={() => loadPage(currentPage - 1)}
                                        disabled={currentPage === 1}
                                        className="px-3 py-1 border rounded disabled:opacity-50"
                                    >
                                        Previous
                                    </button>
                                    <button
                                        onClick={() => loadPage(currentPage + 1)}
                                        disabled={currentPage >= Math.ceil(totalInvoices / pageSize)}
                                        className="px-3 py-1 border rounded disabled:opacity-50"
                                    >
                                        Next
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                </>
            ) : (
                <>
                    {/* ITC Detail Banner */}
                    <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                        <div className="flex items-center justify-between">
                            <div>
                                <div className="text-sm text-gray-600">Total Input Tax Credit Available</div>
                                <div className="text-3xl font-bold text-green-600">{formatCurrency(detailTotals.total)}</div>
                            </div>
                            <TrendingDown className="h-12 w-12 text-green-300" />
                        </div>
                    </div>

                    {/* Detail Table */}
                    <div className="bg-white rounded-lg border">
                        <div className="p-4 border-b flex items-center">
                            <TrendingDown className="h-5 w-5 text-green-600 mr-2" />
                            <h3 className="text-lg font-semibold">Purchase Invoices - Input Tax Credit</h3>
                        </div>
                        <DataTable
                            data={detailData}
                            keyField="id"
                            columns={detailColumns}
                        />
                    </div>
                </>
            )}
        </div>
    );
};

export default GSTR2BReport;
