/**
 * OutstandingFilters Component
 * Search, status filtering, and export functionality
 * Optimized with React.memo
 */

import React from 'react';
import { Search, FileSpreadsheet } from 'lucide-react';
import { Select } from '../../../global';
import type { OutstandingFiltersProps } from '../types/outstanding.types';

export const OutstandingFilters = React.memo<OutstandingFiltersProps>(({
    status,
    searchQuery,
    onStatusChange,
    onSearchChange,
    onExport
}) => {
    return (
        <div className="bg-white p-4 rounded-lg shadow-sm mb-6">
            <div className="flex items-center justify-between">
                <div className="flex items-center space-x-4 flex-1">
                    <div className="flex-1 max-w-md">
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                            <input
                                type="text"
                                placeholder="Search by party name or phone..."
                                value={searchQuery}
                                onChange={(e) => onSearchChange(e.target.value)}
                                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                            />
                        </div>
                    </div>

                    <Select
                        value={status}
                        onChange={(value) => onStatusChange(String(value))}
                        options={[
                            { value: 'all', label: 'All Customers' },
                            { value: 'net-outstanding', label: 'Net Outstanding Only' },
                            { value: 'overdue', label: 'Overdue Only' },
                            { value: 'current', label: 'Current Only' }
                        ]}
                    />
                </div>

                <button
                    onClick={onExport}
                    className="ml-4 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                >
                    <FileSpreadsheet className="w-4 h-4 inline-block mr-2" />
                    Export
                </button>
            </div>
        </div>
    );
});

OutstandingFilters.displayName = 'OutstandingFilters';
