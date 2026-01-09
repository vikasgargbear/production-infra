import React from 'react';
import { Search } from 'lucide-react';

interface InvoiceFiltersProps {
    searchQuery: string;
    filterStatus: string;
    onSearchChange: (query: string) => void;
    onStatusChange: (status: string) => void;
}

export const InvoiceFilters: React.FC<InvoiceFiltersProps> = ({
    searchQuery,
    filterStatus,
    onSearchChange,
    onStatusChange
}) => {
    return (
        <div className="flex items-center space-x-4 mb-4">
            {/* Search */}
            <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                    type="text"
                    placeholder="Search invoices..."
                    value={searchQuery}
                    onChange={(e) => onSearchChange(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
            </div>

            {/* Status Filter */}
            <div className="w-48">
                <select
                    value={filterStatus}
                    onChange={(e) => onStatusChange(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                    <option value="all">All Status</option>
                    <option value="paid">Paid</option>
                    <option value="pending">Pending</option>
                    <option value="partial">Partial</option>
                    <option value="overdue">Overdue</option>
                    <option value="draft">Draft</option>
                </select>
            </div>
        </div>
    );
};
