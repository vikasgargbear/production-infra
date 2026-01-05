/**
 * Input Credit Report - Detailed ITC Analysis
 */

import React, { useState, useEffect } from 'react';
import { Loader2, AlertCircle, TrendingDown } from 'lucide-react';
import { DataTable } from '../../global';
import type { DateRange } from '../types';
import { formatCurrency } from '../utils';
import { purchasesAPI } from '../../../services/api';
import offlineStorage from '../../../services/offlineStorage';

interface InputCreditReportProps {
    dateRange: DateRange;
    refreshTrigger: number;
    onRefresh?: () => void;
}

interface PurchaseItem {
    id: number;
    invoice_no: string;
    invoice_date: string;
    supplier_name: string;
    supplier_gst_number: string;
    taxable_amount: number;
    cgst: number;
    sgst: number;
    igst: number;
    total_itc: number;
}

const InputCreditReport: React.FC<InputCreditReportProps> = ({ dateRange, refreshTrigger }) => {
    const [data, setData] = useState<PurchaseItem[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [totals, setTotals] = useState({ purchases: 0, taxable: 0, cgst: 0, sgst: 0, igst: 0, total: 0 });

    useEffect(() => {
        const loadData = async () => {
            setLoading(true);
            setError(null);

            try {
                const response = await purchasesAPI.search({
                    dateFrom: dateRange.from,
                    dateTo: dateRange.to,
                    limit: 5000
                });
                const purchases = Array.isArray(response) ? response : response?.data?.purchases || response?.data || [];

                const items: PurchaseItem[] = purchases.map((p: any, idx: number) => ({
                    id: idx + 1,
                    invoice_no: p.invoice_no || p.purchase_no || `PUR-${idx + 1}`,
                    invoice_date: p.invoice_date || p.purchase_date || '-',
                    supplier_name: p.supplier_name || 'Unknown Supplier',
                    supplier_gst_number: p.supplier_gst_number || p.gst_number || '-',
                    taxable_amount: p.taxable_amount || 0,
                    cgst: p.cgst_amount || 0,
                    sgst: p.sgst_amount || 0,
                    igst: p.igst_amount || 0,
                    total_itc: (p.cgst_amount || 0) + (p.sgst_amount || 0) + (p.igst_amount || 0)
                }));

                setData(items);

                setTotals({
                    purchases: items.length,
                    taxable: items.reduce((s, i) => s + i.taxable_amount, 0),
                    cgst: items.reduce((s, i) => s + i.cgst, 0),
                    sgst: items.reduce((s, i) => s + i.sgst, 0),
                    igst: items.reduce((s, i) => s + i.igst, 0),
                    total: items.reduce((s, i) => s + i.total_itc, 0)
                });

                await offlineStorage.storeOffline(`itc_${dateRange.from}_${dateRange.to}`, items, { critical: true });

            } catch (err) {
                console.error('ITC load error:', err);
                setError('Failed to load input credit data');
            } finally {
                setLoading(false);
            }
        };

        loadData();
    }, [dateRange.from, dateRange.to, refreshTrigger]);

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <Loader2 className="w-8 h-8 animate-spin text-green-600" />
                <span className="ml-2">Loading input credit data...</span>
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
            {/* Total ITC Banner */}
            <div className="bg-green-50 border border-green-200 rounded-lg p-6">
                <div className="flex items-center justify-between">
                    <div>
                        <div className="text-sm text-gray-600">Total Input Tax Credit Available</div>
                        <div className="text-4xl font-bold text-green-600">{formatCurrency(totals.total)}</div>
                    </div>
                    <TrendingDown className="h-16 w-16 text-green-300" />
                </div>
            </div>

            {/* Summary Cards */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                <div className="bg-white p-4 rounded-lg border">
                    <div className="text-sm text-gray-600">Purchase Invoices</div>
                    <div className="text-xl font-bold">{totals.purchases}</div>
                </div>
                <div className="bg-white p-4 rounded-lg border">
                    <div className="text-sm text-gray-600">Taxable Value</div>
                    <div className="text-xl font-bold">{formatCurrency(totals.taxable)}</div>
                </div>
                <div className="bg-white p-4 rounded-lg border">
                    <div className="text-sm text-gray-600">CGST Credit</div>
                    <div className="text-xl font-bold text-blue-600">{formatCurrency(totals.cgst)}</div>
                </div>
                <div className="bg-white p-4 rounded-lg border">
                    <div className="text-sm text-gray-600">SGST Credit</div>
                    <div className="text-xl font-bold text-purple-600">{formatCurrency(totals.sgst)}</div>
                </div>
                <div className="bg-white p-4 rounded-lg border">
                    <div className="text-sm text-gray-600">IGST Credit</div>
                    <div className="text-xl font-bold text-orange-600">{formatCurrency(totals.igst)}</div>
                </div>
            </div>

            {/* Purchase Invoices Table */}
            <div className="bg-white rounded-lg border">
                <div className="p-4 border-b flex items-center">
                    <TrendingDown className="h-5 w-5 text-green-600 mr-2" />
                    <h3 className="text-lg font-semibold">Purchase Invoices - Input Tax Credit</h3>
                </div>
                <DataTable
                    data={data}
                    columns={[
                        { key: 'invoice_no', label: 'Invoice No' },
                        { key: 'invoice_date', label: 'Date' },
                        { key: 'supplier_name', label: 'Supplier' },
                        { key: 'supplier_gst_number', label: 'GSTIN' },
                        { key: 'taxable_amount', label: 'Taxable', render: (v) => formatCurrency(v) },
                        { key: 'cgst', label: 'CGST', render: (v) => formatCurrency(v) },
                        { key: 'sgst', label: 'SGST', render: (v) => formatCurrency(v) },
                        { key: 'igst', label: 'IGST', render: (v) => formatCurrency(v) },
                        { key: 'total_itc', label: 'Total ITC', render: (v) => formatCurrency(v) }
                    ]}
                />
            </div>

            {/* ITC Eligibility Note */}
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                <h4 className="font-semibold mb-2">ITC Eligibility Notes</h4>
                <ul className="text-sm text-yellow-800 space-y-1">
                    <li>• Only invoices from registered suppliers are eligible</li>
                    <li>• Supplier must have filed their GSTR-1</li>
                    <li>• Invoice must be reflected in GSTR-2B</li>
                    <li>• Payment must be made within 180 days</li>
                </ul>
            </div>
        </div>
    );
};

export default InputCreditReport;
