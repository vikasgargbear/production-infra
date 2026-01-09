/**
 * InvoiceFilters Component
 * Search, date, and status filtering for invoices
 * Optimized with React.memo
 */

import React from 'react';
import { Search, Filter, RefreshCw, CheckCircle } from 'lucide-react';
import type { InvoiceFiltersProps } from '../types/invoicelist.types';

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
    refreshSuccess
}) => {
    return (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-4">
            <div className="flex items-center justify-between gap-4">
                {/* Search */}
                <div className="flex-1 max-w-md">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                        <input
                            type="text"
                            placeholder="Search invoices by number, customer..."
                            value={searchQuery}
                            onChange={(e) => onSearchChange(e.target.value)}
                            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        />
                    </div>
                </div>

                {/* Filter Toggles */}
                <div className="flex items-center gap-2">
                    <button
                        onClick={onToggleFilters}
                        className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${showFilters
                                ? 'bg-blue-100 text-blue-700 border border-blue-300'
                                : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
                            }`}
                    >
                        <Filter className="w-4 h-4 inline-block mr-2" />
                        Filters
                    </button>

                    <button
                        onClick={onRefresh}
                        disabled={refreshing}
                        className="px-4 py-2 text-sm font-medium bg-white text-gray-700 border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                        {refreshing ? (
                            <RefreshCw className="w-4 h-4 inline-block mr-2 animate-spin" />
                        ) : refreshSuccess ? (
                            <CheckCircle className="w-4 h-4 inline-block mr-2 text-green-600" />
                        ) : (
                            <RefreshCw className="w-4 h-4 inline-block mr-2" />
                        )}
                        {refreshing ? 'Refreshing...' : 'Refresh'}
                    </button>
                </div>
            </div>

            {/* Expanded Filters */}
            {showFilters && (
                <div className="mt-4 pt-4 border-t border-gray-200 grid grid-cols-3 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Date Range</label>
                        <select
                            value={dateFilter}
                            onChange={(e) => onDateFilterChange(e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        >
                            <option value="all">All Time</option>
                            <option value="today">Today</option>
                            <option value="week">This Week</option>
                            <option value="month">This Month</option>
                            <option value="quarter">This Quarter</option>
                            <option value="year">This Year</option>
                        </select>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">Payment Status</label>
                        <select
                            value={statusFilter}
                            onChange={(e) => onStatusFilterChange(e.target.value)}
                            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        >
                            <option value="all">All Status</option>
                            <option value="paid">Paid</option>
                            <option value="partial">Partial</option>
                            <option value="pending">Pending</option>
                            <option value="overdue">Overdue</option>
                        </select>
                    </div>
                </div>
            )}
        </div>
    );
});

InvoiceFilters.displayName = 'InvoiceFilters';
