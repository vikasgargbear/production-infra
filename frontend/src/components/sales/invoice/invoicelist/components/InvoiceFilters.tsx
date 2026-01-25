/**
 * InvoiceFilters Component
 * Search, date, and status filtering for invoices
 * Optimized with React.memo
 */

import React from 'react';
import { Search, RefreshCw, CheckCircle, Download, Calendar } from 'lucide-react';
import type { InvoiceFiltersProps } from '../types/invoicelist.types';

const STATUS_TABS = [
    { value: 'all', label: 'All', color: 'gray' },
    { value: 'paid', label: 'Paid', color: 'green' },
    { value: 'partial', label: 'Partial', color: 'amber' },
    { value: 'pending', label: 'Pending', color: 'blue' },
    { value: 'overdue', label: 'Overdue', color: 'red' }
] as const;

const DATE_CHIPS = [
    { value: 'all', label: 'All Time' },
    { value: 'today', label: 'Today' },
    { value: 'week', label: 'This Week' },
    { value: 'month', label: 'This Month' }
] as const;

export const InvoiceFilters = React.memo<InvoiceFiltersProps>(({
    searchQuery,
    dateFilter,
    statusFilter,
    showFilters,
    onSearchChange,
    onDateFilterChange,
    onStatusFilterChange,
    onToggleFilters,
    onRefresh,
    refreshing,
    refreshSuccess,
    statusCounts
}) => {
    const getStatusTabClass = (status: string, color: string) => {
        const isActive = statusFilter === status;
        if (isActive) {
            const colorMap: Record<string, string> = {
                gray: 'bg-gray-900 text-white',
                green: 'bg-green-600 text-white',
                amber: 'bg-amber-500 text-white',
                blue: 'bg-blue-600 text-white',
                red: 'bg-red-600 text-white'
            };
            return colorMap[color] || 'bg-gray-900 text-white';
        }
        return 'bg-white text-gray-600 hover:bg-gray-50 border border-gray-200';
    };

    return (
        <div className="space-y-4 mb-6">
            {/* Search and Actions Row */}
            <div className="flex items-center gap-4">
                {/* Search */}
                <div className="flex-1 max-w-lg">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                        <input
                            type="text"
                            placeholder="Search by invoice number, customer..."
                            value={searchQuery}
                            onChange={(e) => onSearchChange(e.target.value)}
                            className="w-full pl-10 pr-4 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm bg-white"
                        />
                    </div>
                </div>

                {/* Date Chips */}
                <div className="flex items-center gap-1">
                    {DATE_CHIPS.map(chip => (
                        <button
                            key={chip.value}
                            onClick={() => onDateFilterChange(chip.value)}
                            className={`px-3 py-1.5 text-xs font-medium rounded-full transition-colors ${dateFilter === chip.value
                                    ? 'bg-blue-100 text-blue-700 border border-blue-200'
                                    : 'text-gray-600 hover:bg-gray-100'
                                }`}
                        >
                            {chip.label}
                        </button>
                    ))}
                </div>

                {/* Refresh */}
                <button
                    onClick={onRefresh}
                    disabled={refreshing}
                    className="p-2.5 text-gray-600 hover:bg-gray-100 rounded-lg disabled:opacity-50 transition-colors"
                    title="Refresh"
                >
                    {refreshing ? (
                        <RefreshCw className="w-4 h-4 animate-spin" />
                    ) : refreshSuccess ? (
                        <CheckCircle className="w-4 h-4 text-green-600" />
                    ) : (
                        <RefreshCw className="w-4 h-4" />
                    )}
                </button>

                {/* Export */}
                <button
                    className="p-2.5 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                    title="Export All"
                >
                    <Download className="w-4 h-4" />
                </button>
            </div>

            {/* Status Tabs */}
            <div className="flex items-center gap-2">
                {STATUS_TABS.map(tab => (
                    <button
                        key={tab.value}
                        onClick={() => onStatusFilterChange(tab.value)}
                        className={`px-4 py-2 text-sm font-medium rounded-lg transition-all ${getStatusTabClass(tab.value, tab.color)}`}
                    >
                        {tab.label}
                        {statusCounts && (
                            <span className={`ml-2 px-1.5 py-0.5 text-xs rounded-full ${statusFilter === tab.value
                                    ? 'bg-white/20'
                                    : 'bg-gray-100 text-gray-600'
                                }`}>
                                {statusCounts[tab.value as keyof typeof statusCounts] || 0}
                            </span>
                        )}
                    </button>
                ))}
            </div>

            {/* Expanded Filters (if needed for advanced options) */}
            {showFilters && (
                <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
                    <div className="grid grid-cols-3 gap-4">
                        <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1.5">Date Range</label>
                            <div className="relative">
                                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                                <select
                                    value={dateFilter}
                                    onChange={(e) => onDateFilterChange(e.target.value)}
                                    className="w-full pl-10 pr-3 py-2.5 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
                                >
                                    <option value="all">All Time</option>
                                    <option value="today">Today</option>
                                    <option value="week">This Week</option>
                                    <option value="month">This Month</option>
                                    <option value="quarter">This Quarter</option>
                                    <option value="year">This Year</option>
                                </select>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
});

InvoiceFilters.displayName = 'InvoiceFilters';

