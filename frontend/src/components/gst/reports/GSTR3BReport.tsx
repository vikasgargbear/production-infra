/**
 * GSTR3B Report - Summary Return
 *
 * Output Tax - Input Credit = Net Payable
 * Merged: absorbs GST Payable Report (per-component payable breakdown)
 */

import React, { useState, useEffect, useRef } from 'react';
import { Loader2, AlertCircle, TrendingUp, TrendingDown, IndianRupee, Download, ChevronDown, ChevronUp } from 'lucide-react';
import type { DateRange } from '../types';
import { gstApi } from '../../../services/api';
import { compareExactDecimals, formatExactCurrency, normalizeAuthoritativeDecimal } from '../../../utils/exactDecimal';

interface GSTR3BReportProps {
    dateRange?: DateRange;
    refreshTrigger?: number;
    onRefresh?: () => void;
    showTaxBreakdown?: boolean;
    onDataReady?: (data: any) => void;
    onExport?: () => void;
}

const localISODate = (value: Date): string => [
    value.getFullYear(),
    String(value.getMonth() + 1).padStart(2, '0'),
    String(value.getDate()).padStart(2, '0'),
].join('-');

const currentMonthRange = (): DateRange => {
    const today = new Date();
    return {
        from: localISODate(new Date(today.getFullYear(), today.getMonth(), 1)),
        to: localISODate(today),
    };
};

type TaxSummary = {
    cgst: string;
    sgst: string;
    igst: string;
    cess: string;
    total: string;
};

const EMPTY_TAX: TaxSummary = { cgst: '0.00', sgst: '0.00', igst: '0.00', cess: '0.00', total: '0.00' };

const exactTax = (value: any, label: string): TaxSummary => {
    const money = (field: keyof TaxSummary) => normalizeAuthoritativeDecimal(value?.[field], `${label} ${field}`, {
        scale: 2, maximumWholeDigits: 20, allowNegative: false,
    });
    return { cgst: money('cgst'), sgst: money('sgst'), igst: money('igst'), cess: money('cess'), total: money('total') };
};

const GSTR3BReport: React.FC<GSTR3BReportProps> = ({
    dateRange = currentMonthRange(),
    refreshTrigger = 0,
    showTaxBreakdown = false,
    onDataReady,
    onExport,
}) => {
    const onDataReadyRef = useRef(onDataReady);
    onDataReadyRef.current = onDataReady;
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [outputTax, setOutputTax] = useState<TaxSummary>(EMPTY_TAX);
    const [inputCredit, setInputCredit] = useState<TaxSummary>(EMPTY_TAX);
    const [payable, setPayable] = useState<TaxSummary>(EMPTY_TAX);
    const [netPayable, setNetPayable] = useState('0.00');
    const [showPayableBreakdown, setShowPayableBreakdown] = useState(false);

    useEffect(() => {
        const loadData = async () => {
            setLoading(true);
            setError(null);

            try {
                const response = await gstApi.reports.gstr3b({
                    date_from: dateRange.from,
                    date_to: dateRange.to,
                });
                const payload = response?.data || response;
                const output = exactTax(payload?.outputTax, 'GSTR-3B output tax');
                setOutputTax(output);
                const input = exactTax(payload?.inputCredit, 'GSTR-3B input credit');
                setInputCredit(input);
                const exactPayable = exactTax(payload?.payable, 'GSTR-3B payable');
                setPayable(exactPayable);
                const net = normalizeAuthoritativeDecimal(payload?.netPayable, 'GSTR-3B net payable', {
                    scale: 2, maximumWholeDigits: 20, allowNegative: true,
                });
                setNetPayable(net);

                onDataReadyRef.current?.({
                    outputTax: output,
                    inputCredit: input,
                    payable: exactPayable,
                    netPayable: net
                });

            } catch (err) {
                onDataReadyRef.current?.(null);
                setError(err instanceof Error ? err.message : 'Canonical GSTR-3B data is unavailable.');
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

    const netIsPayable = compareExactDecimals(netPayable, '0.00', 'GSTR-3B net payable', {
        scale: 2, maximumWholeDigits: 20, allowNegative: true,
    }) >= 0;
    const displayNet = netPayable.startsWith('-') ? netPayable.slice(1) : netPayable;
    const fmt = (value: string, label: string) => formatExactCurrency(value, label);

    return (
        <div className="space-y-6">
            {/* Net Payable Banner */}
            <div className={`p-6 rounded-lg ${netIsPayable ? 'bg-red-50 border-red-200' : 'bg-green-50 border-green-200'} border`}>
                <div className="flex items-center justify-between">
                    <div>
                        <div className="text-sm text-gray-600">{netIsPayable ? 'Net GST Payable' : 'GST Refund Claimable'}</div>
                        <div className={`text-3xl font-bold ${netIsPayable ? 'text-red-600' : 'text-green-600'}`}>
                            {fmt(displayNet, 'GSTR-3B net payable')}
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
                        <IndianRupee className={`h-12 w-12 ${netIsPayable ? 'text-red-400' : 'text-green-400'}`} />
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
                        <div className="text-2xl font-bold text-red-600">{fmt(outputTax.total, 'GSTR-3B output total')}</div>
                    </div>
                    <div className="bg-white rounded-lg border p-4">
                        <div className="flex items-center mb-2">
                            <TrendingDown className="h-4 w-4 text-green-500 mr-2" />
                            <span className="text-sm font-medium text-gray-700">Total Input Credit</span>
                        </div>
                        <div className="text-2xl font-bold text-green-600">{fmt(inputCredit.total, 'GSTR-3B input total')}</div>
                    </div>
                    <div className="bg-gray-50 rounded-lg border p-4">
                        <div className="text-sm font-medium text-gray-700 mb-2">Calculation</div>
                        <div className="space-y-1 text-sm">
                            <div className="flex justify-between">
                                <span>Output Tax</span>
                                <span>{fmt(outputTax.total, 'GSTR-3B output total')}</span>
                            </div>
                            <div className="flex justify-between text-green-600">
                                <span>Less: Input Credit</span>
                                <span>- {fmt(inputCredit.total, 'GSTR-3B input total')}</span>
                            </div>
                            <div className="border-t pt-1 flex justify-between font-bold">
                                <span>Net Payable</span>
                                <span className={netIsPayable ? 'text-red-600' : 'text-green-600'}>
                                    {fmt(displayNet, 'GSTR-3B net payable')}
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
                                <div className="text-xl font-bold">{fmt(outputTax.cgst, 'GSTR-3B output CGST')}</div>
                            </div>
                            <div>
                                <div className="text-sm text-gray-600">SGST</div>
                                <div className="text-xl font-bold">{fmt(outputTax.sgst, 'GSTR-3B output SGST')}</div>
                            </div>
                            <div>
                                <div className="text-sm text-gray-600">IGST</div>
                                <div className="text-xl font-bold">{fmt(outputTax.igst, 'GSTR-3B output IGST')}</div>
                            </div>
                            <div>
                                <div className="text-sm text-gray-600">Cess</div>
                                <div className="text-xl font-bold">{fmt(outputTax.cess, 'GSTR-3B output cess')}</div>
                            </div>
                            <div className="bg-red-50 p-2 rounded">
                                <div className="text-sm text-gray-600">Total Output</div>
                                <div className="text-xl font-bold text-red-600">{fmt(outputTax.total, 'GSTR-3B output total')}</div>
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
                                <div className="text-xl font-bold">{fmt(inputCredit.cgst, 'GSTR-3B input CGST')}</div>
                            </div>
                            <div>
                                <div className="text-sm text-gray-600">SGST</div>
                                <div className="text-xl font-bold">{fmt(inputCredit.sgst, 'GSTR-3B input SGST')}</div>
                            </div>
                            <div>
                                <div className="text-sm text-gray-600">IGST</div>
                                <div className="text-xl font-bold">{fmt(inputCredit.igst, 'GSTR-3B input IGST')}</div>
                            </div>
                            <div>
                                <div className="text-sm text-gray-600">Cess</div>
                                <div className="text-xl font-bold">{fmt(inputCredit.cess, 'GSTR-3B input cess')}</div>
                            </div>
                            <div className="bg-green-50 p-2 rounded">
                                <div className="text-sm text-gray-600">Total Input</div>
                                <div className="text-xl font-bold text-green-600">{fmt(inputCredit.total, 'GSTR-3B input total')}</div>
                            </div>
                        </div>
                    </div>

                    {/* Calculation Summary */}
                    <div className="bg-gray-50 rounded-lg border p-6">
                        <h4 className="font-semibold mb-4">Calculation Summary</h4>
                        <div className="space-y-2 text-sm">
                            <div className="flex justify-between">
                                <span>Output Tax (A)</span>
                                <span className="font-medium">{fmt(outputTax.total, 'GSTR-3B output total')}</span>
                            </div>
                            <div className="flex justify-between">
                                <span>Input Credit (B)</span>
                                <span className="font-medium text-green-600">- {fmt(inputCredit.total, 'GSTR-3B input total')}</span>
                            </div>
                            <div className="border-t pt-2 flex justify-between font-bold">
                                <span>Net Payable (A - B)</span>
                                <span className={netIsPayable ? 'text-red-600' : 'text-green-600'}>
                                    {fmt(displayNet, 'GSTR-3B net payable')}
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
                                        <span>{fmt(outputTax.cgst, 'GSTR-3B output CGST')}</span>
                                    </div>
                                    <div className="flex justify-between text-green-600">
                                        <span>Input Credit:</span>
                                        <span>- {fmt(inputCredit.cgst, 'GSTR-3B input CGST')}</span>
                                    </div>
                                    <div className="border-t pt-2 flex justify-between font-bold">
                                        <span>Payable:</span>
                                        <span className="text-red-600">{fmt(payable.cgst, 'GSTR-3B CGST payable')}</span>
                                    </div>
                                </div>
                            </div>
                            <div className="bg-gray-50 rounded-lg p-4">
                                <h4 className="font-semibold text-sm text-purple-600 mb-3">SGST</h4>
                                <div className="space-y-2 text-sm">
                                    <div className="flex justify-between">
                                        <span>Output:</span>
                                        <span>{fmt(outputTax.sgst, 'GSTR-3B output SGST')}</span>
                                    </div>
                                    <div className="flex justify-between text-green-600">
                                        <span>Input Credit:</span>
                                        <span>- {fmt(inputCredit.sgst, 'GSTR-3B input SGST')}</span>
                                    </div>
                                    <div className="border-t pt-2 flex justify-between font-bold">
                                        <span>Payable:</span>
                                        <span className="text-red-600">{fmt(payable.sgst, 'GSTR-3B SGST payable')}</span>
                                    </div>
                                </div>
                            </div>
                            <div className="bg-gray-50 rounded-lg p-4">
                                <h4 className="font-semibold text-sm text-orange-600 mb-3">IGST</h4>
                                <div className="space-y-2 text-sm">
                                    <div className="flex justify-between">
                                        <span>Output:</span>
                                        <span>{fmt(outputTax.igst, 'GSTR-3B output IGST')}</span>
                                    </div>
                                    <div className="flex justify-between text-green-600">
                                        <span>Input Credit:</span>
                                        <span>- {fmt(inputCredit.igst, 'GSTR-3B input IGST')}</span>
                                    </div>
                                    <div className="border-t pt-2 flex justify-between font-bold">
                                        <span>Payable:</span>
                                        <span className="text-red-600">{fmt(payable.igst, 'GSTR-3B IGST payable')}</span>
                                    </div>
                                </div>
                            </div>
                            <div className="bg-gray-50 rounded-lg p-4">
                                <h4 className="font-semibold text-sm text-amber-700 mb-3">Cess</h4>
                                <div className="space-y-2 text-sm">
                                    <div className="flex justify-between">
                                        <span>Output:</span>
                                        <span>{fmt(outputTax.cess, 'GSTR-3B output cess')}</span>
                                    </div>
                                    <div className="flex justify-between text-green-600">
                                        <span>Input Credit:</span>
                                        <span>- {fmt(inputCredit.cess, 'GSTR-3B input cess')}</span>
                                    </div>
                                    <div className="border-t pt-2 flex justify-between font-bold">
                                        <span>Payable:</span>
                                        <span className="text-red-600">{fmt(payable.cess, 'GSTR-3B cess payable')}</span>
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
