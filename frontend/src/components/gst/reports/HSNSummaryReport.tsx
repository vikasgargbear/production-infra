/**
 * HSN Summary Report - Product/HSN-wise GST
 */

import React, { useState, useEffect } from 'react';
import { Loader2, AlertCircle, Package } from 'lucide-react';
import { DataTable } from '../../global';
import type { DateRange } from '../types';
import { formatCurrency } from '../utils';
import { invoicesApi, gstApi } from '../../../services/api';
import offlineStorage from '../../../services/offlineStorage';

interface HSNSummaryReportProps {
    dateRange: DateRange;
    refreshTrigger: number;
    onRefresh?: () => void;
}

interface HSNItem {
    hsn_code: string;
    description: string;
    quantity: number;
    taxable_value: number;
    tax_rate: number;
    tax_amount: number;
}

const HSNSummaryReport: React.FC<HSNSummaryReportProps> = ({ dateRange, refreshTrigger }) => {
    const [data, setData] = useState<HSNItem[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [totals, setTotals] = useState({ quantity: 0, taxable: 0, tax: 0 });

    useEffect(() => {
        const loadData = async () => {
            setLoading(true);
            setError(null);

            try {
                // Try API first
                try {
                    const response = await gstApi.reports.hsnSummary({
                        from_date: dateRange.from,
                        to_date: dateRange.to
                    });
                    const responseData = response?.data || response;

                    if (responseData?.hsn_summary) {
                        setData(responseData.hsn_summary);
                        return;
                    }
                } catch {
                    // Fall back to computing from invoices
                }

                // Compute from invoices
                const invoiceRes = await invoicesApi.search({
                    dateFrom: dateRange.from,
                    dateTo: dateRange.to,
                    limit: 5000
                });
                const invoiceData = invoiceRes?.data || invoiceRes;
                const invoices = Array.isArray(invoiceData) ? invoiceData : invoiceData?.invoices || [];

                const hsnGroups: Record<string, HSNItem> = {};

                invoices.forEach((inv: any) => {
                    const items = inv.items || [];
                    items.forEach((item: any) => {
                        const hsn = item.hsn_code || item.hsn || item.product_hsn || 'N/A';
                        const qty = item.quantity || 0;
                        const unit_price = item.unit_price || item.unit_price || 0;
                        const taxableValue = qty * unit_price;
                        const taxRate = item.tax_percent || item.gst_percent || 18;
                        const taxAmount = (taxableValue * taxRate) / 100;

                        if (!hsnGroups[hsn]) {
                            hsnGroups[hsn] = {
                                hsn_code: hsn,
                                description: item.product_name || 'Product',
                                quantity: 0,
                                taxable_value: 0,
                                tax_rate: taxRate,
                                tax_amount: 0
                            };
                        }

                        hsnGroups[hsn].quantity += qty;
                        hsnGroups[hsn].taxable_value += taxableValue;
                        hsnGroups[hsn].tax_amount += taxAmount;
                    });
                });

                const hsnArray = Object.values(hsnGroups).sort((a, b) => b.taxable_value - a.taxable_value);
                setData(hsnArray);

                const totalQty = hsnArray.reduce((s, h) => s + h.quantity, 0);
                const totalTaxable = hsnArray.reduce((s, h) => s + h.taxable_value, 0);
                const totalTax = hsnArray.reduce((s, h) => s + h.tax_amount, 0);
                setTotals({ quantity: totalQty, taxable: totalTaxable, tax: totalTax });

                await offlineStorage.storeOffline(`hsn_${dateRange.from}_${dateRange.to}`, hsnArray, { critical: true });

            } catch (err) {
                console.error('HSN load error:', err);
                setError('Failed to load HSN summary');
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
                    columns={[
                        { key: 'hsn_code', header: 'HSN Code' },
                        { key: 'description', header: 'Description' },
                        { key: 'quantity', header: 'Quantity', render: (v) => v.toLocaleString() },
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
