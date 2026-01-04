/**
 * GST Payable Report - Tax Liability Calculation
 */

import React, { useState, useEffect } from 'react';
import { Loader2, AlertCircle, IndianRupee, TrendingUp, TrendingDown } from 'lucide-react';
import type { DateRange } from '../types';
import { formatCurrency, calculateNetPayable } from '../utils';
import { invoiceAPI, purchasesAPI } from '../../../services/api';
import offlineStorage from '../../../services/offlineStorage';

interface GSTPayableReportProps {
    dateRange: DateRange;
    refreshTrigger: number;
    onRefresh?: () => void;
}

const GSTPayableReport: React.FC<GSTPayableReportProps> = ({ dateRange, refreshTrigger }) => {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [outputTax, setOutputTax] = useState({ cgst: 0, sgst: 0, igst: 0, total: 0 });
    const [inputCredit, setInputCredit] = useState({ cgst: 0, sgst: 0, igst: 0, total: 0 });

    useEffect(() => {
        const loadData = async () => {
            setLoading(true);
            setError(null);

            try {
                // Load invoices
                const invoiceRes = await invoiceAPI.search({
                    dateFrom: dateRange.from,
                    dateTo: dateRange.to,
                    limit: 5000
                });
                const invoices = Array.isArray(invoiceRes) ? invoiceRes : invoiceRes?.invoices || [];

                let outCgst = 0, outSgst = 0, outIgst = 0;
                invoices.forEach((inv: any) => {
                    outCgst += inv.cgst_amount || 0;
                    outSgst += inv.sgst_amount || 0;
                    outIgst += inv.igst_amount || 0;
                });
                setOutputTax({ cgst: outCgst, sgst: outSgst, igst: outIgst, total: outCgst + outSgst + outIgst });

                // Load purchases
                const purchaseRes = await purchasesAPI.search({
                    dateFrom: dateRange.from,
                    dateTo: dateRange.to,
                    limit: 5000
                });
                const purchases = Array.isArray(purchaseRes) ? purchaseRes : purchaseRes?.data?.purchases || [];

                let inCgst = 0, inSgst = 0, inIgst = 0;
                purchases.forEach((p: any) => {
                    inCgst += p.cgst_amount || 0;
                    inSgst += p.sgst_amount || 0;
                    inIgst += p.igst_amount || 0;
                });
                setInputCredit({ cgst: inCgst, sgst: inSgst, igst: inIgst, total: inCgst + inSgst + inIgst });

            } catch (err) {
                console.error('GST Payable load error:', err);
                setError('Failed to load GST payable data');
            } finally {
                setLoading(false);
            }
        };

        loadData();
    }, [dateRange.from, dateRange.to, refreshTrigger]);

    if (loading) {
        return (
            <div className="flex items-center justify-center h-64">
                <Loader2 className="w-8 h-8 animate-spin text-red-600" />
                <span className="ml-2">Calculating GST payable...</span>
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

    const cgstPayable = Math.max(0, outputTax.cgst - inputCredit.cgst);
    const sgstPayable = Math.max(0, outputTax.sgst - inputCredit.sgst);
    const igstPayable = Math.max(0, outputTax.igst - inputCredit.igst);
    const totalPayable = calculateNetPayable(outputTax.total, inputCredit.total);

    return (
        <div className="space-y-6">
            {/* Total Payable Banner */}
            <div className={`p-6 rounded-lg ${totalPayable >= 0 ? 'bg-red-50 border-red-200' : 'bg-green-50 border-green-200'} border`}>
                <div className="flex items-center justify-between">
                    <div>
                        <div className="text-sm text-gray-600">{totalPayable >= 0 ? 'Total GST Payable' : 'Refund Claimable'}</div>
                        <div className={`text-4xl font-bold ${totalPayable >= 0 ? 'text-red-600' : 'text-green-600'}`}>
                            {formatCurrency(Math.abs(totalPayable))}
                        </div>
                    </div>
                    <IndianRupee className={`h-16 w-16 ${totalPayable >= 0 ? 'text-red-300' : 'text-green-300'}`} />
                </div>
            </div>

            {/* Breakdown by Tax Type */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* CGST */}
                <div className="bg-white rounded-lg border p-4">
                    <h4 className="font-semibold text-lg mb-4 text-blue-600">CGST</h4>
                    <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                            <span>Output:</span>
                            <span>{formatCurrency(outputTax.cgst)}</span>
                        </div>
                        <div className="flex justify-between text-green-600">
                            <span>Input Credit:</span>
                            <span>- {formatCurrency(inputCredit.cgst)}</span>
                        </div>
                        <div className="border-t pt-2 flex justify-between font-bold">
                            <span>Payable:</span>
                            <span className="text-red-600">{formatCurrency(cgstPayable)}</span>
                        </div>
                    </div>
                </div>

                {/* SGST */}
                <div className="bg-white rounded-lg border p-4">
                    <h4 className="font-semibold text-lg mb-4 text-purple-600">SGST</h4>
                    <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                            <span>Output:</span>
                            <span>{formatCurrency(outputTax.sgst)}</span>
                        </div>
                        <div className="flex justify-between text-green-600">
                            <span>Input Credit:</span>
                            <span>- {formatCurrency(inputCredit.sgst)}</span>
                        </div>
                        <div className="border-t pt-2 flex justify-between font-bold">
                            <span>Payable:</span>
                            <span className="text-red-600">{formatCurrency(sgstPayable)}</span>
                        </div>
                    </div>
                </div>

                {/* IGST */}
                <div className="bg-white rounded-lg border p-4">
                    <h4 className="font-semibold text-lg mb-4 text-orange-600">IGST</h4>
                    <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                            <span>Output:</span>
                            <span>{formatCurrency(outputTax.igst)}</span>
                        </div>
                        <div className="flex justify-between text-green-600">
                            <span>Input Credit:</span>
                            <span>- {formatCurrency(inputCredit.igst)}</span>
                        </div>
                        <div className="border-t pt-2 flex justify-between font-bold">
                            <span>Payable:</span>
                            <span className="text-red-600">{formatCurrency(igstPayable)}</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Payment Instructions */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h4 className="font-semibold mb-2">Payment Information</h4>
                <ul className="text-sm text-blue-800 space-y-1">
                    <li>• Pay via GST Portal: https://gst.gov.in</li>
                    <li>• Due Date: 20th of following month</li>
                    <li>• Late fee applies after due date</li>
                </ul>
            </div>
        </div>
    );
};

export default GSTPayableReport;
