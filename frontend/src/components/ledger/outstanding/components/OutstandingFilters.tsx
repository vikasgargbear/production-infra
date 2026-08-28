/**
 * OutstandingFilters Component
 * Search, status filtering, and export functionality
 * Optimized with React.memo
 */

import React from 'react';
import { Search, FileSpreadsheet, RefreshCw } from 'lucide-react';
import { Select } from '../../../global';
import type { OutstandingFiltersProps } from '../types/outstanding.types';

export const OutstandingFilters = React.memo<OutstandingFiltersProps>(({
    partyType,
    status,
    searchQuery,
    viewMode,
    onStatusChange,
    onSearchChange,
    onViewModeChange,
    onExport,
    onRefresh
}) => {
    return (
        <div className="bg-white p-4 rounded-lg shadow-sm mb-6">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div className="grid flex-1 grid-cols-1 gap-3 sm:grid-cols-[minmax(220px,1fr)_minmax(180px,auto)]">
                    <div className="max-w-md">
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                            <input
                                type="text"
                                placeholder="Search by party name or phone..."
                                value={searchQuery}
                                onChange={(e) => onSearchChange(e.target.value)}
                                aria-label="Search outstanding parties"
                                className="min-h-11 w-full rounded-md border border-gray-300 py-2 pl-10 pr-4 text-base focus:border-blue-500 focus:ring-2 focus:ring-blue-500"
                            />
                        </div>
                    </div>

                    <Select
                        value={status}
                        onChange={(value) => onStatusChange(String(value))}
                        options={[
                            { value: 'all', label: partyType === 'customer' ? 'All Customers' : 'All Suppliers' },
                            { value: 'net-outstanding', label: 'Net Outstanding Only' },
                            { value: 'overdue', label: 'Overdue Only' },
                            { value: 'current', label: 'Current Only' }
                        ]}
                    />
                </div>

                <div className="grid grid-cols-2 gap-2 sm:flex">
                    <div className="col-span-2 grid grid-cols-2 rounded-lg bg-gray-100 p-1 sm:col-span-1">
                        {(['summary', 'aging'] as const).map(mode => (
                            <button
                                key={mode}
                                type="button"
                                aria-pressed={viewMode === mode}
                                onClick={() => onViewModeChange(mode)}
                                className={`min-h-11 rounded-md px-3 text-sm font-medium capitalize ${viewMode === mode ? 'bg-white text-gray-950 shadow-sm' : 'text-gray-600'}`}
                            >
                                {mode}
                            </button>
                        ))}
                    </div>
                    <button type="button" onClick={onRefresh} className="min-h-11 rounded-md border border-gray-300 bg-white px-3 text-sm font-medium text-gray-700 hover:bg-gray-50">
                        <RefreshCw className="mr-2 inline h-4 w-4" />Refresh
                    </button>
                    <button type="button" onClick={onExport} className="min-h-11 rounded-md border border-gray-300 bg-white px-3 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500">
                        <FileSpreadsheet className="mr-2 inline h-4 w-4" />Export
                    </button>
                </div>
            </div>
        </div>
    );
});

OutstandingFilters.displayName = 'OutstandingFilters';
