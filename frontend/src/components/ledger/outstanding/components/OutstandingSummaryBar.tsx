/**
 * OutstandingSummaryBar Component
 * Clean dark tiles matching Collection Center design
 */

import React from 'react';
import { formatExactCurrency } from '../../../../utils/exactDecimal';
import type { OutstandingSummaryCardsProps } from '../types/outstanding.types';

export const OutstandingSummaryBar = React.memo<OutstandingSummaryCardsProps>(({
    summary,
    totalAdvances,
    netPosition,
    partyType
}) => {
    return (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
            <div className="bg-slate-800 rounded-lg px-4 py-3">
                <span className="text-xs text-gray-400 block mb-1">Total Outstanding</span>
                <span className="text-lg font-bold text-white">
                    {formatExactCurrency(summary.total_receivable, 'Total outstanding')}
                </span>
                <span className="text-xs text-gray-500 block mt-1">
                    {summary.party_count} Parties
                </span>
            </div>
            <div className="bg-slate-800 rounded-lg px-4 py-3">
                <span className="text-xs text-gray-400 block mb-1">Overdue</span>
                <span className="text-lg font-bold text-red-400">
                    {formatExactCurrency(summary.total_overdue, 'Total overdue')}
                </span>
                <span className="text-xs text-gray-500 block mt-1">
                    {summary.overdue_party_count} Parties
                </span>
            </div>
            <div className="bg-slate-800 rounded-lg px-4 py-3">
                <span className="text-xs text-gray-400 block mb-1">Current</span>
                <span className="text-lg font-bold text-green-400">
                    {formatExactCurrency(summary.aging_summary.current.amount, 'Current outstanding')}
                </span>
                <span className="text-xs text-gray-500 block mt-1">
                    {summary.aging_summary.current.count} Invoices
                </span>
            </div>
            <div className="bg-slate-800 rounded-lg px-4 py-3">
                <span className="text-xs text-gray-400 block mb-1">1-30 Days</span>
                <span className="text-lg font-bold text-yellow-400">
                    {formatExactCurrency(summary.aging_summary['1-30'].amount, '1-30 day outstanding')}
                </span>
                <span className="text-xs text-gray-500 block mt-1">
                    {summary.aging_summary['1-30'].count} Invoices
                </span>
            </div>
            <div className="bg-slate-800 rounded-lg px-4 py-3">
                <span className="text-xs text-gray-400 block mb-1">90+ Days</span>
                <span className="text-lg font-bold text-red-500">
                    {formatExactCurrency(summary.aging_summary.over_90.amount, '90+ day outstanding')}
                </span>
                <span className="text-xs text-gray-500 block mt-1">
                    {summary.aging_summary.over_90.count} Invoices
                </span>
            </div>
        </div>
    );
});

OutstandingSummaryBar.displayName = 'OutstandingSummaryBar';
