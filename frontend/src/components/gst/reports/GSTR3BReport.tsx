/**
 * GSTR3B Report - Summary Return
 *
 * Output Tax - Input Credit = Net Payable
 * Merged: absorbs GST Payable Report (per-component payable breakdown)
 */

import React, { useState, useEffect } from 'react';
import { Loader2, AlertCircle, TrendingUp, TrendingDown, IndianRupee, Download, ChevronDown, ChevronUp } from 'lucide-react';
import type { DateRange } from '../types';
import { formatCurrency, calculateNetPayable } from '../utils';
import { invoicesApi, supplierInvoicesApi } from '../../../services/api';

interface GSTR3BReportProps {
    dateRange?: DateRange;
    refreshTrigger?: number;
    onRefresh?: () => void;
    showTaxBreakdown?: boolean;
    onDataReady?: (data: any) => void;
    onExport?: () => void;
}

const currentMonthRange = (): DateRange => {
    const today = new Date();
    return {
        from: new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10),
        to: today.toISOString().slice(0, 10),
    };
};

type TaxSummary = {
    cgst: number;
    sgst: number;
    igst: number;
    cess: number;
    total: number;
};

const amount = (value: unknown): number => {
    const parsed = Number(value ?? 0);
    return Number.isFinite(parsed) ? parsed : 0;
};

export const summarizeCanonicalTax = (documents: any[]): TaxSummary => {
    const reportable = documents.filter(
        (document) => String(document.status || '').toLowerCase() === 'posted'
    );
    const totals = reportable.reduce((summary, document) => ({
        cgst: summary.cgst + amount(document.cgst_amount),
        sgst: summary.sgst + amount(document.sgst_amount),
        igst: summary.igst + amount(document.igst_amount),
        cess: summary.cess + amount(document.cess_amount),
    }), { cgst: 0, sgst: 0, igst: 0, cess: 0 });

    return {
        ...totals,
        total: totals.cgst + totals.sgst + totals.igst + totals.cess,
    };
};

const GSTR3BReport: React.FC<GSTR3BReportProps> = ({
    dateRange = currentMonthRange(),
    refreshTrigger = 0,
    showTaxBreakdown = false,
    onDataReady,
    onExport,
}) => {
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [outputTax, setOutputTax] = useState<TaxSummary>({ cgst: 0, sgst: 0, igst: 0, cess: 0, total: 0 });
    const [inputCredit, setInputCredit] = useState<TaxSummary>({ cgst: 0, sgst: 0, igst: 0, cess: 0, total: 0 });
    const [netPayable, setNetPayable] = useState(0);
    const [showPayableBreakdown, setShowPayableBreakdown] = useState(false);

    useEffect(() => {
        const loadData = async () => {
            setLoading(true);
            setError(null);

            try {
                const invoiceRes = await invoicesApi.search({
                    date_from: dateRange.from,
                    date_to: dateRange.to,
                    limit: 500
                });
                const invoiceData = invoiceRes?.data || invoiceRes;
                const invoices = Array.isArray(invoiceData) ? invoiceData : invoiceData?.invoices || [];

                const output = summarizeCanonicalTax(invoices);
                setOutputTax(output);

                const purchaseRes = await supplierInvoicesApi.getAll({
                    from_date: dateRange.from,
                    to_date: dateRange.to,
                    limit: 500
                });
                const purchaseData = purchaseRes?.data || purchaseRes;
                const supplierInvoices = Array.isArray(purchaseData) ? purchaseData : purchaseData?.invoices || [];
                const input = summarizeCanonicalTax(supplierInvoices);
                setInputCredit(input);

                const net = calculateNetPayable(output.total, input.total);
                setNetPayable(net);

                onDataReady?.({
                    outputTax: output,
                    inputCredit: input,
                    netPayable: net
                });

            } catch (err) {
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

    const cgstPayable = Math.max(0, outputTax.cgst - inputCredit.cgst);
    const sgstPayable = Math.max(0, outputTax.sgst - inputCredit.sgst);
    const igstPayable = Math.max(0, outputTax.igst - inputCredit.igst);
    const cessPayable = Math.max(0, outputTax.cess - inputCredit.cess);

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
                    <div className="flex items-center space-x-2">
                        {onExport && (
                            <button
                                onClick={onExport}
                                className="inline-flex items-center px-3 py-1.5 rounded-md text-sm bg-white border border-gray-200 text-gray-600 hover:bg-gray-50"
                            >
                                <Download className="h-4 w-4 mr-1" />
                                Export
                            </button>
                        )}
                        <IndianRupee className={`h-12 w-12 ${netPayable >= 0 ? 'text-red-400' : 'text-green-400'}`} />
                    </div>
                </div>
            </div>

            {/* Compact Summary (default) or Detailed Breakdown */}
            {!showTaxBreakdown ? (
                /* Compact: just totals */
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="bg-white rounded-lg border p-4">
                        <div className="flex items-center mb-2">
                            <TrendingUp className="h-4 w-4 text-red-500 mr-2" />
                            <span className="text-sm font-medium text-gray-700">Total Output Tax</span>
                        </div>
                        <div className="text-2xl font-bold text-red-600">{formatCurrency(outputTax.total)}</div>
                    </div>
                    <div className="bg-white rounded-lg border p-4">
                        <div className="flex items-center mb-2">
                            <TrendingDown className="h-4 w-4 text-green-500 mr-2" />
                            <span className="text-sm font-medium text-gray-700">Total Input Credit</span>
                        </div>
                        <div className="text-2xl font-bold text-green-600">{formatCurrency(inputCredit.total)}</div>
                    </div>
                    <div className="bg-gray-50 rounded-lg border p-4">
                        <div className="text-sm font-medium text-gray-700 mb-2">Calculation</div>
                        <div className="space-y-1 text-sm">
                            <div className="flex justify-between">
                                <span>Output Tax</span>
                                <span>{formatCurrency(outputTax.total)}</span>
                            </div>
                            <div className="flex justify-between text-green-600">
                                <span>Less: Input Credit</span>
                                <span>- {formatCurrency(inputCredit.total)}</span>
                            </div>
                            <div className="border-t pt-1 flex justify-between font-bold">
                                <span>Net Payable</span>
                                <span className={netPayable >= 0 ? 'text-red-600' : 'text-green-600'}>
                                    {formatCurrency(netPayable)}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>
            ) : (
                /* Detailed: CGST/SGST/IGST breakdown */
                <>
                    {/* Output Tax */}
                    <div className="bg-white rounded-lg border p-6">
                        <div className="flex items-center mb-4">
                            <TrendingUp className="h-5 w-5 text-red-600 mr-2" />
                            <h3 className="text-lg font-semibold">Output Tax (Sales)</h3>
                        </div>
                        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
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
                            <div>
                                <div className="text-sm text-gray-600">Cess</div>
                                <div className="text-xl font-bold">{formatCurrency(outputTax.cess)}</div>
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
                        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
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
                            <div>
                                <div className="text-sm text-gray-600">Cess</div>
                                <div className="text-xl font-bold">{formatCurrency(inputCredit.cess)}</div>
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
                </>
            )}

            {/* Payable Breakdown (absorbed from GSTPayableReport) */}
            <div className="bg-white rounded-lg border">
                <button
                    onClick={() => setShowPayableBreakdown(!showPayableBreakdown)}
                    className="w-full p-4 flex items-center justify-between hover:bg-gray-50 transition-colors"
                >
                    <div className="flex items-center">
                        <IndianRupee className="h-5 w-5 text-blue-600 mr-2" />
                        <span className="font-semibold">Per-Component Payable Breakdown</span>
                    </div>
                    {showPayableBreakdown ? (
                        <ChevronUp className="h-5 w-5 text-gray-400" />
                    ) : (
                        <ChevronDown className="h-5 w-5 text-gray-400" />
                    )}
                </button>
                {showPayableBreakdown && (
                    <div className="p-4 border-t">
                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
                            <div className="bg-gray-50 rounded-lg p-4">
                                <h4 className="font-semibold text-sm text-blue-600 mb-3">CGST</h4>
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
                            <div className="bg-gray-50 rounded-lg p-4">
                                <h4 className="font-semibold text-sm text-purple-600 mb-3">SGST</h4>
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
                            <div className="bg-gray-50 rounded-lg p-4">
                                <h4 className="font-semibold text-sm text-orange-600 mb-3">IGST</h4>
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
                            <div className="bg-gray-50 rounded-lg p-4">
                                <h4 className="font-semibold text-sm text-amber-700 mb-3">Cess</h4>
                                <div className="space-y-2 text-sm">
                                    <div className="flex justify-between">
                                        <span>Output:</span>
                                        <span>{formatCurrency(outputTax.cess)}</span>
                                    </div>
                                    <div className="flex justify-between text-green-600">
                                        <span>Input Credit:</span>
                                        <span>- {formatCurrency(inputCredit.cess)}</span>
                                    </div>
                                    <div className="border-t pt-2 flex justify-between font-bold">
                                        <span>Payable:</span>
                                        <span className="text-red-600">{formatCurrency(cessPayable)}</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default GSTR3BReport;
