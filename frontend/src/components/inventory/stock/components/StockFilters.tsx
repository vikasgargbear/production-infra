/**
 * StockFilters Component
 * Filter bar with search, category, low stock, and expiring filters
 * Optimized with React.memo
 */

import React from 'react';
import {
    Search,
    Filter,
    AlertTriangle,
    Clock,
    RefreshCw
} from 'lucide-react';
import type { StockFiltersProps } from '../types/stock.types';

export const StockFilters = React.memo<StockFiltersProps>(({
    filters,
    onFilterChange,
    onRefresh,
    refreshing,
    lowStockCount,
    expiringCount
}) => {
    return (
        <div className="border border-gray-200 bg-white shadow-sm p-4 rounded-lg mb-6">
            <div className="flex items-center space-x-3">
                {/* Search */}
                <div className="flex-1 relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                        type="text"
                        placeholder="Search products by name or code..."
                        value={filters.searchQuery || ''}
                        onChange={(e) => onFilterChange({ searchQuery: e.target.value })}
                        className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                    />
                </div>

                {/* Low Stock Filter */}
                <button
                    onClick={() => onFilterChange({ showLowStock: !filters.showLowStock })}
                    className={`px-3 py-2 rounded-lg text-sm transition-all duration-200 flex items-center space-x-1.5 border ${filters.showLowStock
                            ? 'bg-amber-50 border-amber-300 text-amber-700'
                            : 'bg-white border-gray-300 hover:border-amber-300 hover:bg-amber-50 text-gray-600 hover:text-amber-600'
                        }`}
                    title={filters.showLowStock ? 'Showing low stock items' : 'Filter low stock items'}
                >
                    <AlertTriangle className="w-4 h-4" />
                    <span>Low Stock</span>
                    {filters.showLowStock && lowStockCount > 0 && (
                        <span className="ml-1 text-xs font-semibold">({lowStockCount})</span>
                    )}
                </button>

                {/* Expiring Soon Filter */}
                <button
                    onClick={() => onFilterChange({ showExpiring: !filters.showExpiring })}
                    className={`px-3 py-2 rounded-lg text-sm transition-all duration-200 flex items-center space-x-1.5 border ${filters.showExpiring
                            ? 'bg-red-50 border-red-300 text-red-700'
                            : 'bg-white border-gray-300 hover:border-red-300 hover:bg-red-50 text-gray-600 hover:text-red-600'
                        }`}
                    title={filters.showExpiring ? 'Showing expiring items' : 'Filter expiring items'}
                >
                    <Clock className="w-4 h-4" />
                    <span>Expiring</span>
                    {filters.showExpiring && expiringCount > 0 && (
                        <span className="ml-1 text-xs font-semibold">({expiringCount})</span>
                    )}
                </button>

                {/* Filter Divider */}
                <div className="h-8 w-px bg-gray-300"></div>

                {/* Refresh Button */}
                <button
                    onClick={onRefresh}
                    disabled={refreshing}
                    className={`p-2 rounded-xl transition-all duration-300 border ${refreshing
                            ? 'bg-blue-50 border-blue-300'
                            : 'bg-white border-gray-300 hover:bg-gray-50 hover:border-gray-400'
                        }`}
                    title="Refresh data"
                >
                    <RefreshCw className={`w-5 h-5 text-gray-600 ${refreshing ? 'animate-spin' : ''}`} />
                </button>
            </div>
        </div>
    );
});

StockFilters.displayName = 'StockFilters';
