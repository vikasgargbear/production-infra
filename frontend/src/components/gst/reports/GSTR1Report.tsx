/**
 * GSTR1 Report - Outward Supplies
 *
 * Shows B2B and B2C invoices with credit/debit note adjustments
 */

import React, { useState, useEffect } from 'react';
import { Loader2, AlertCircle } from 'lucide-react';
import { DataTable } from '../../global';
import type { DateRange, GSTR1Data } from '../types';
import {
    transformInvoicesToGSTR1,
    applyNoteAdjustments,
    formatCurrency
} from '../utils';
import { gstApi, invoicesApi } from '../../../services/api';

interface GSTR1ReportProps {
    dateRange: DateRange;
    refreshTrigger: number;
    onRefresh?: () => void;
}

const GSTR1Report: React.FC<GSTR1ReportProps> = ({ dateRange, refreshTrigger }) => {
    const [data, setData] = useState<GSTR1Data | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [creditDebitNotes, setCreditDebitNotes] = useState<any[]>([]);

    // Load invoice data
    const loadInvoices = async (): Promise<any[]> => {
        const response = await invoicesApi.getAll({
            from_date: dateRange.from,
            to_date: dateRange.to,
            limit: 5000
        });
        const responseData = response?.data || response;
        return Array.isArray(responseData) ? responseData : responseData?.invoices || [];
    };

    // Load credit/debit notes
    const loadCreditDebitNotes = async (): Promise<any[]> => {
        try {
            const response = await gstApi.reports.creditDebitNotes({
                from_date: dateRange.from,
                to_date: dateRange.to,
                note_type: 'all'
            });
            const responseData = response?.data || response;
            return responseData?.notes || [];
        } catch {
            return [];
        }
    };

    // Load data
    useEffect(() => {
        const loadData = async () => {
            setLoading(true);
            setError(null);

            try {
                const [invoices, notes] = await Promise.all([
                    loadInvoices(),
                    loadCreditDebitNotes()
                ]);

                setCreditDebitNotes(notes);

                // Invoices already contain customer_gst_number and customer_name
                // from the backend join - no separate customer API calls needed
                const baseData = transformInvoicesToGSTR1(invoices);
                const adjustedSummary = applyNoteAdjustments(baseData.summary, notes);

                setData({
                    ...baseData,
                    summary: adjustedSummary
                });
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
                    <div className="text-2xl font-bold">{formatCurrency(data?.summary.totalTaxableValue || 0)}</div>
                </div>
                <div className="bg-white p-4 rounded-lg border">
                    <div className="text-sm text-gray-600">Total GST</div>
                    <div className="text-2xl font-bold">{formatCurrency(data?.summary.totalTax || 0)}</div>
                </div>
                <div className="bg-white p-4 rounded-lg border">
                    <div className="text-sm text-gray-600">Net Adjustment</div>
                    <div className="text-2xl font-bold">{formatCurrency(data?.summary.netAdjustment || 0)}</div>
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
                    columns={[
                        { key: 'gst_number', header: 'GSTIN' },
                        { key: 'name', header: 'Party Name' },
                        { key: 'invoices', header: 'Invoices' },
                        { key: 'taxableValue', header: 'Taxable Value', render: (v) => formatCurrency(v) },
                        { key: 'cgst', header: 'CGST', render: (v) => formatCurrency(v) },
                        { key: 'sgst', header: 'SGST', render: (v) => formatCurrency(v) },
                        { key: 'igst', header: 'IGST', render: (v) => formatCurrency(v) }
                    ]}
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
                            <span>{formatCurrency(data?.b2c.small.taxableValue || 0)}</span>
                        </div>
                        <div className="flex justify-between">
                            <span>Total GST:</span>
                            <span>{formatCurrency((data?.b2c.small.cgst || 0) + (data?.b2c.small.sgst || 0) + (data?.b2c.small.igst || 0))}</span>
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
                            <span>{formatCurrency(data?.b2c.large.taxableValue || 0)}</span>
                        </div>
                        <div className="flex justify-between">
                            <span>Total GST:</span>
                            <span>{formatCurrency((data?.b2c.large.cgst || 0) + (data?.b2c.large.sgst || 0) + (data?.b2c.large.igst || 0))}</span>
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
                            <span>{creditDebitNotes.filter(n => n.note_type === 'credit').length}</span>
                        </div>
                        <div className="flex justify-between">
                            <span>Debit Notes:</span>
                            <span>{creditDebitNotes.filter(n => n.note_type === 'debit').length}</span>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default GSTR1Report;
