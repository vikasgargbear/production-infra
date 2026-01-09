/**
 * OutstandingSummaryBar Component
 * Summary metrics and aging distribution visualization
 * Optimized with React.memo
 */

import React from 'react';
import { TrendingUp } from 'lucide-react';
import { formatCurrency } from '../../../utils/formatters';
import type { OutstandingSummaryCardsProps } from '../types/outstanding.types';

export const OutstandingSummaryBar = React.memo<OutstandingSummaryCardsProps>(({
    summary,
    totalAdvances,
    netPosition,
    partyType
}) => {
    return (
        <div className="bg-white border border-gray-200 rounded-lg shadow-sm mb-6 p-4">
            <div className="flex items-center justify-between">
                <div className="flex items-center space-x-8">
                    <div>
                        <span className="text-xs text-gray-500 uppercase tracking-wider">Net Position</span>
                        <div className={`text-xl font-semibold ${netPosition >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {formatCurrency(Math.abs(netPosition))}
                            <span className="text-xs ml-1">
                                {netPosition >= 0 ? '(Advance)' : '(To Receive)'}
                            </span>
                        </div>
                    </div>
                    <div className="h-10 w-px bg-gray-200"></div>
                    <div>
                        <span className="text-xs text-gray-500 uppercase tracking-wider">Total Outstanding</span>
                        <div className="text-xl font-semibold text-red-600">{formatCurrency(summary.total_receivable)}</div>
                    </div>
                    <div className="h-10 w-px bg-gray-200"></div>
                    <div>
                        <span className="text-xs text-gray-500 uppercase tracking-wider">Total Unallocated</span>
                        <div className="text-xl font-semibold text-green-600">{formatCurrency(totalAdvances)}</div>
                    </div>
                    <div className="h-10 w-px bg-gray-200"></div>
                    <div>
                        <span className="text-xs text-gray-500 uppercase tracking-wider">Parties</span>
                        <div className="text-xl font-semibold text-gray-900">{summary.party_count}</div>
                    </div>
                </div>

                {/* Aging Distribution */}
                <div className="border-t pt-4">
                    <div className="text-xs text-gray-500 uppercase tracking-wider mb-2">Aging Distribution</div>
                    <div className="bg-gray-100 rounded-lg p-2">
                        <div className="flex h-8 rounded overflow-hidden">
                            {summary.total_receivable > 0 && (
                                <>
                                    {summary.aging_summary.current.amount > 0 && (
                                        <div
                                            className="bg-green-500 hover:bg-green-600 transition-colors"
                                            style={{ width: `${(summary.aging_summary.current.amount / summary.total_receivable) * 100}%` }}
                                            title={`Current: ${formatCurrency(summary.aging_summary.current.amount)}`}
                                        />
                                    )}
                                    {summary.aging_summary['1-30'].amount > 0 && (
                                        <div
                                            className="bg-yellow-500 hover:bg-yellow-600 transition-colors"
                                            style={{ width: `${(summary.aging_summary['1-30'].amount / summary.total_receivable) * 100}%` }}
                                            title={`1-30 days: ${formatCurrency(summary.aging_summary['1-30'].amount)}`}
                                        />
                                    )}
                                    {summary.aging_summary['31-60'].amount > 0 && (
                                        <div
                                            className="bg-orange-500 hover:bg-orange-600 transition-colors"
                                            style={{ width: `${(summary.aging_summary['31-60'].amount / summary.total_receivable) * 100}%` }}
                                            title={`31-60 days: ${formatCurrency(summary.aging_summary['31-60'].amount)}`}
                                        />
                                    )}
                                    {summary.aging_summary['61-90'].amount > 0 && (
                                        <div
                                            className="bg-red-500 hover:bg-red-600 transition-colors"
                                            style={{ width: `${(summary.aging_summary['61-90'].amount / summary.total_receivable) * 100}%` }}
                                            title={`61-90 days: ${formatCurrency(summary.aging_summary['61-90'].amount)}`}
                                        />
                                    )}
                                    {summary.aging_summary.over_90.amount > 0 && (
                                        <div
                                            className="bg-red-800 hover:bg-red-900 transition-colors"
                                            style={{ width: `${(summary.aging_summary.over_90.amount / summary.total_receivable) * 100}%` }}
                                            title={`90+ days: ${formatCurrency(summary.aging_summary.over_90.amount)}`}
                                        />
                                    )}
                                </>
                            )}
                            {summary.total_receivable === 0 && (
                                <div className="w-full bg-gray-300 flex items-center justify-center text-gray-500 text-sm">
                                    No outstanding amounts
                                </div>
                            )}
                        </div>

                        {/* Legend */}
                        <div className="flex flex-wrap gap-3 mt-3 text-xs">
                            <div className="flex items-center gap-1">
                                <div className="w-3 h-3 bg-green-500 rounded"></div>
                                <span className="text-gray-600">Current</span>
                            </div>
                            <div className="flex items-center gap-1">
                                <div className="w-3 h-3 bg-yellow-500 rounded"></div>
                                <span className="text-gray-600">1-30 days</span>
                            </div>
                            <div className="flex items-center gap-1">
                                <div className="w-3 h-3 bg-orange-500 rounded"></div>
                                <span className="text-gray-600">31-60 days</span>
                            </div>
                            <div className="flex items-center gap-1">
                                <div className="w-3 h-3 bg-red-500 rounded"></div>
                                <span className="text-gray-600">61-90 days</span>
                            </div>
                            <div className="flex items-center gap-1">
                                <div className="w-3 h-3 bg-red-800 rounded"></div>
                                <span className="text-gray-600">90+ days</span>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
});

OutstandingSummaryBar.displayName = 'OutstandingSummaryBar';
