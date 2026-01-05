/**
 * GSTR3B Report - Summary Return
 * 
 * Output Tax - Input Credit = Net Payable
 */

import React, { useState, useEffect } from 'react';
import { Loader2, AlertCircle, TrendingUp, TrendingDown, IndianRupee } from 'lucide-react';
import type { DateRange } from '../types';
import { formatCurrency, calculateNetPayable } from '../utils';
import { invoicesApi, purchasesApi } from '../../../services/api';
import offlineStorage from '../../../services/offlineStorage';

interface GSTR3BReportProps {
    dateRange: DateRange;
    refreshTrigger: number;
    onRefresh?: () => void;
}

const GSTR3BReport: React.FC<GSTR3BReportProps> = ({ dateRange, refreshTrigger }) => {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [outputTax, setOutputTax] = useState({ cgst: 0, sgst: 0, igst: 0, total: 0 });
    const [inputCredit, setInputCredit] = useState({ cgst: 0, sgst: 0, igst: 0, total: 0 });
    const [netPayable, setNetPayable] = useState(0);

    useEffect(() => {
        const loadData = async () => {
            setLoading(true);
            setError(null);

            try {
                // Load invoices for output tax
                const invoiceRes = await invoicesApi.search({
                    dateFrom: dateRange.from,
                    dateTo: dateRange.to,
                    limit: 5000
                });
                const invoiceData = invoiceRes?.data || invoiceRes;
                const invoices = Array.isArray(invoiceData) ? invoiceData : invoiceData?.invoices || [];

                let outCgst = 0, outSgst = 0, outIgst = 0;
                invoices.forEach((inv: any) => {
                    outCgst += inv.cgst_amount || 0;
                    outSgst += inv.sgst_amount || 0;
                    outIgst += inv.igst_amount || 0;
                });
                const outTotal = outCgst + outSgst + outIgst;
                setOutputTax({ cgst: outCgst, sgst: outSgst, igst: outIgst, total: outTotal });

                // Load purchases for input credit
                const purchaseRes = await purchasesApi.getOrders({
                    dateFrom: dateRange.from,
                    dateTo: dateRange.to,
                    limit: 5000
                });
                const purchaseData = purchaseRes?.data || purchaseRes;
                const purchases = Array.isArray(purchaseData) ? purchaseData : purchaseData?.purchases || purchaseData?.orders || [];

                let inCgst = 0, inSgst = 0, inIgst = 0;
                purchases.forEach((p: any) => {
                    inCgst += p.cgst_amount || 0;
                    inSgst += p.sgst_amount || 0;
                    inIgst += p.igst_amount || 0;
                });
                const inTotal = inCgst + inSgst + inIgst;
                setInputCredit({ cgst: inCgst, sgst: inSgst, igst: inIgst, total: inTotal });

                setNetPayable(calculateNetPayable(outTotal, inTotal));

                await offlineStorage.storeOffline(`gstr3b_${dateRange.from}_${dateRange.to}`, {
                    outputTax: { cgst: outCgst, sgst: outSgst, igst: outIgst, total: outTotal },
                    inputCredit: { cgst: inCgst, sgst: inSgst, igst: inIgst, total: inTotal }
                }, { critical: true });

            } catch (err) {
                console.error('GSTR3B load error:', err);
                setError('Failed to load GSTR-3B data');
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
                <span className="ml-2">Loading GSTR-3B data...</span>
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
            {/* Net Payable Banner */}
            <div className={`p-6 rounded-lg ${netPayable >= 0 ? 'bg-red-50 border-red-200' : 'bg-green-50 border-green-200'} border`}>
                <div className="flex items-center justify-between">
                    <div>
                        <div className="text-sm text-gray-600">{netPayable >= 0 ? 'Net GST Payable' : 'GST Refund Claimable'}</div>
                        <div className={`text-3xl font-bold ${netPayable >= 0 ? 'text-red-600' : 'text-green-600'}`}>
                            {formatCurrency(Math.abs(netPayable))}
                        </div>
                    </div>
                    <IndianRupee className={`h-12 w-12 ${netPayable >= 0 ? 'text-red-400' : 'text-green-400'}`} />
                </div>
            </div>

            {/* Output Tax */}
            <div className="bg-white rounded-lg border p-6">
                <div className="flex items-center mb-4">
                    <TrendingUp className="h-5 w-5 text-red-600 mr-2" />
                    <h3 className="text-lg font-semibold">Output Tax (Sales)</h3>
                </div>
                <div className="grid grid-cols-4 gap-4">
                    <div>
                        <div className="text-sm text-gray-600">CGST</div>
                        <div className="text-xl font-bold">{formatCurrency(outputTax.cgst)}</div>
                    </div>
                    <div>
                        <div className="text-sm text-gray-600">SGST</div>
                        <div className="text-xl font-bold">{formatCurrency(outputTax.sgst)}</div>
                    </div>
                    <div>
                        <div className="text-sm text-gray-600">IGST</div>
                        <div className="text-xl font-bold">{formatCurrency(outputTax.igst)}</div>
                    </div>
                    <div className="bg-red-50 p-2 rounded">
                        <div className="text-sm text-gray-600">Total Output</div>
                        <div className="text-xl font-bold text-red-600">{formatCurrency(outputTax.total)}</div>
                    </div>
                </div>
            </div>

            {/* Input Credit */}
            <div className="bg-white rounded-lg border p-6">
                <div className="flex items-center mb-4">
                    <TrendingDown className="h-5 w-5 text-green-600 mr-2" />
                    <h3 className="text-lg font-semibold">Input Credit (Purchases)</h3>
                </div>
                <div className="grid grid-cols-4 gap-4">
                    <div>
                        <div className="text-sm text-gray-600">CGST</div>
                        <div className="text-xl font-bold">{formatCurrency(inputCredit.cgst)}</div>
                    </div>
                    <div>
                        <div className="text-sm text-gray-600">SGST</div>
                        <div className="text-xl font-bold">{formatCurrency(inputCredit.sgst)}</div>
                    </div>
                    <div>
                        <div className="text-sm text-gray-600">IGST</div>
                        <div className="text-xl font-bold">{formatCurrency(inputCredit.igst)}</div>
                    </div>
                    <div className="bg-green-50 p-2 rounded">
                        <div className="text-sm text-gray-600">Total Input</div>
                        <div className="text-xl font-bold text-green-600">{formatCurrency(inputCredit.total)}</div>
                    </div>
                </div>
            </div>

            {/* Calculation Summary */}
            <div className="bg-gray-50 rounded-lg border p-6">
                <h4 className="font-semibold mb-4">Calculation Summary</h4>
                <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                        <span>Output Tax (A)</span>
                        <span className="font-medium">{formatCurrency(outputTax.total)}</span>
                    </div>
                    <div className="flex justify-between">
                        <span>Input Credit (B)</span>
                        <span className="font-medium text-green-600">- {formatCurrency(inputCredit.total)}</span>
                    </div>
                    <div className="border-t pt-2 flex justify-between font-bold">
                        <span>Net Payable (A - B)</span>
                        <span className={netPayable >= 0 ? 'text-red-600' : 'text-green-600'}>
                            {formatCurrency(netPayable)}
                        </span>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default GSTR3BReport;
