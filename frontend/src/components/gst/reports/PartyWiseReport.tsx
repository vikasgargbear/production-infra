/**
 * Party-wise GST Report - Customer/Supplier breakdown
 */

import React, { useState, useEffect } from 'react';
import { Loader2, AlertCircle, Users } from 'lucide-react';
import { DataTable } from '../../global';
import type { DateRange } from '../types';
import { formatCurrency } from '../utils';
import { invoiceAPI } from '../../../services/api';
import offlineStorage from '../../../services/offlineStorage';

interface PartyWiseReportProps {
    dateRange: DateRange;
    refreshTrigger: number;
    onRefresh?: () => void;
}

interface PartyData {
    party_name: string;
    gstin: string;
    invoice_count: number;
    total_taxable_value: number;
    total_cgst: number;
    total_sgst: number;
    total_igst: number;
    total_tax: number;
}

const PartyWiseReport: React.FC<PartyWiseReportProps> = ({ dateRange, refreshTrigger }) => {
    const [data, setData] = useState<PartyData[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [totals, setTotals] = useState({ parties: 0, invoices: 0, taxable: 0, tax: 0 });

    useEffect(() => {
        const loadData = async () => {
            setLoading(true);
            setError(null);

            try {
                const response = await invoiceAPI.search({
                    dateFrom: dateRange.from,
                    dateTo: dateRange.to,
                    limit: 5000
                });
                const invoices = Array.isArray(response) ? response : response?.invoices || [];

                const partyGroups: Record<string, PartyData> = {};

                invoices.forEach((inv: any) => {
                    const partyName = inv.customer_name || 'Unknown Party';

                    if (!partyGroups[partyName]) {
                        partyGroups[partyName] = {
                            party_name: partyName,
                            gstin: inv.customer_gstin || '',
                            invoice_count: 0,
                            total_taxable_value: 0,
                            total_cgst: 0,
                            total_sgst: 0,
                            total_igst: 0,
                            total_tax: 0
                        };
                    }

                    const p = partyGroups[partyName];
                    p.invoice_count += 1;
                    p.total_taxable_value += inv.subtotal_amount || 0;
                    p.total_cgst += inv.cgst_amount || 0;
                    p.total_sgst += inv.sgst_amount || 0;
                    p.total_igst += inv.igst_amount || 0;
                    p.total_tax += (inv.cgst_amount || 0) + (inv.sgst_amount || 0) + (inv.igst_amount || 0);
                });

                const partyArray = Object.values(partyGroups).sort((a, b) => b.total_taxable_value - a.total_taxable_value);
                setData(partyArray);

                setTotals({
                    parties: partyArray.length,
                    invoices: invoices.length,
                    taxable: partyArray.reduce((s, p) => s + p.total_taxable_value, 0),
                    tax: partyArray.reduce((s, p) => s + p.total_tax, 0)
                });

                await offlineStorage.storeOffline(`party_${dateRange.from}_${dateRange.to}`, partyArray, { critical: true });

            } catch (err) {
                console.error('Party-wise load error:', err);
                setError('Failed to load party-wise data');
            } finally {
                setLoading(false);
            }
        };

        loadData();
    }, [dateRange.from, dateRange.to, refreshTrigger]);

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <Loader2 className="w-8 h-8 animate-spin text-teal-600" />
                <span className="ml-2">Loading party-wise data...</span>
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
                    <div className="text-sm text-gray-600">Total Parties</div>
                    <div className="text-2xl font-bold">{totals.parties}</div>
                </div>
                <div className="bg-white p-4 rounded-lg border">
                    <div className="text-sm text-gray-600">Total Invoices</div>
                    <div className="text-2xl font-bold">{totals.invoices}</div>
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

            {/* Party Table */}
            <div className="bg-white rounded-lg border">
                <div className="p-4 border-b flex items-center">
                    <Users className="h-5 w-5 text-teal-600 mr-2" />
                    <h3 className="text-lg font-semibold">Party-wise GST Summary</h3>
                </div>
                <DataTable
                    data={data}
                    columns={[
                        { key: 'party_name', label: 'Party Name' },
                        { key: 'gstin', label: 'GSTIN', render: (v) => v || '-' },
                        { key: 'invoice_count', label: 'Invoices' },
                        { key: 'total_taxable_value', label: 'Taxable Value', render: (v) => formatCurrency(v) },
                        { key: 'total_cgst', label: 'CGST', render: (v) => formatCurrency(v) },
                        { key: 'total_sgst', label: 'SGST', render: (v) => formatCurrency(v) },
                        { key: 'total_igst', label: 'IGST', render: (v) => formatCurrency(v) },
                        { key: 'total_tax', label: 'Total Tax', render: (v) => formatCurrency(v) }
                    ]}
                />
            </div>
        </div>
    );
};

export default PartyWiseReport;
