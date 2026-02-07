/**
 * GSTR2B Report - Input Tax Credit (Purchase Invoices)
 */

import React, { useState, useEffect } from 'react';
import { Loader2, AlertCircle } from 'lucide-react';
import { DataTable } from '../../global';
import type { DateRange } from '../types';
import { formatCurrency } from '../utils';
import { gstApi, apiClient } from '../../../services/api';

interface GSTR2BReportProps {
    dateRange: DateRange;
    refreshTrigger: number;
    onRefresh?: () => void;
}

const GSTR2BReport: React.FC<GSTR2BReportProps> = ({ dateRange, refreshTrigger }) => {
    const [data, setData] = useState<any>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [currentPage, setCurrentPage] = useState(1);
    const [pageSize] = useState(25);
    const [totalInvoices, setTotalInvoices] = useState(0);

    useEffect(() => {
        const loadData = async () => {
            setLoading(true);
            setError(null);

            try {
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

                    setData({
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
                    });

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

            {/* Supplier Invoices Table */}
            <div className="bg-white rounded-lg border">
                <div className="p-4 border-b">
                    <h3 className="text-lg font-semibold">Supplier Invoices</h3>
                    <p className="text-sm text-gray-600">Input Tax Credit from purchases</p>
                </div>
                <DataTable
                    data={data?.b2b || []}
                    keyField="gst_number"
                    columns={[
                        { key: 'gst_number', header: 'Supplier GSTIN' },
                        { key: 'name', header: 'Supplier Name' },
                        { key: 'taxableValue', header: 'Taxable Value', render: (v) => formatCurrency(v) },
                        { key: 'cgst', header: 'CGST', render: (v) => formatCurrency(v) },
                        { key: 'sgst', header: 'SGST', render: (v) => formatCurrency(v) },
                        { key: 'igst', header: 'IGST', render: (v) => formatCurrency(v) }
                    ]}
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
        </div>
    );
};

export default GSTR2BReport;
