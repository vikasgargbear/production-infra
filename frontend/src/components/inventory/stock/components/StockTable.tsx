/**
 * StockTable Component
 * Main table displaying stock items with sorting and actions
 * Optimized with React.memo
 */

import React, { useMemo } from 'react';
import {
    Eye,
    Edit2,
    Printer,
    Download,
    MessageCircle,
    AlertTriangle,
    CheckCircle,
    TrendingDown
} from 'lucide-react';
import { formatCurrency } from '../../../../utils/formatters';
import type { StockTableProps, StockItem } from '../types/stock.types';

const getStockStatus = (item: StockItem) => {
    if (item.total_quantity_available === 0) {
        return { color: 'red', text: 'Out of Stock', icon: AlertTriangle };
    } else if (item.low_stock) {
        return { color: 'orange', text: 'Low Stock', icon: TrendingDown };
    } else {
        return { color: 'green', text: 'In Stock', icon: CheckCircle };
    }
};

export const StockTable = React.memo<StockTableProps>(({
    data,
    loading,
    sortConfig,
    onSort,
    onViewDetails,
    onEdit,
    selectedIds,
    onSelectionChange
}) => {
    const handleSort = (key: string) => {
        const direction = sortConfig.key === key && sortConfig.direction === 'asc' ? 'desc' : 'asc';
        onSort(key);
    };

    const handleSelectAll = () => {
        if (selectedIds.size === data.length) {
            onSelectionChange(new Set());
        } else {
            onSelectionChange(new Set(data.map(item => item.product_id)));
        }
    };

    const handleSelectOne = (id: number) => {
        const newIds = new Set(selectedIds);
        if (newIds.has(id)) {
            newIds.delete(id);
        } else {
            newIds.add(id);
        }
        onSelectionChange(newIds);
    };

    if (loading) {
        return (
            <div className="bg-white rounded-xl shadow-sm p-8 text-center">
                <div className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
                <p className="text-gray-600">Loading stock data...</p>
            </div>
        );
    }

    if (data.length === 0) {
        return (
            <div className="bg-white rounded-xl shadow-sm p-8 text-center">
                <p className="text-gray-600">No stock items found</p>
            </div>
        );
    }

    return (
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                        <tr>
                            <th className="px-6 py-3 text-left">
                                <input
                                    type="checkbox"
                                    checked={selectedIds.size === data.length && data.length > 0}
                                    onChange={handleSelectAll}
                                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                />
                            </th>
                            <th
                                className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                                onClick={() => handleSort('product_name')}
                            >
                                Product {sortConfig.key === 'product_name' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Category
                            </th>
                            <th
                                className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider cursor-pointer hover:bg-gray-100"
                                onClick={() => handleSort('total_quantity_available')}
                            >
                                Stock {sortConfig.key === 'total_quantity_available' && (sortConfig.direction === 'asc' ? '↑' : '↓')}
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Reorder Level
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Value
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Status
                            </th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                Actions
                            </th>
                        </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                        {data.map(item => {
                            const status = getStockStatus(item);
                            const StatusIcon = status.icon;

                            return (
                                <tr key={item.product_id} className="hover:bg-gray-50">
                                    <td className="px-6 py-4">
                                        <input
                                            type="checkbox"
                                            checked={selectedIds.has(item.product_id)}
                                            onChange={() => handleSelectOne(item.product_id)}
                                            className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                        />
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="font-medium text-gray-900">{item.product_name}</div>
                                        <div className="text-sm text-gray-500">{item.product_code || 'No Code'}</div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <span className="px-2 py-1 text-xs font-medium bg-gray-100 text-gray-700 rounded">
                                            {item.category || 'No Category'}
                                        </span>
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="flex items-center space-x-2">
                                            <StatusIcon className={`w-4 h-4 text-${status.color}-500`} />
                                            <div>
                                                <div className="font-medium">
                                                    {item.total_quantity_available} {item.sale_unit || item.unit}
                                                </div>
                                                {item.available_stock !== undefined && (
                                                    <div className="text-xs text-gray-500">
                                                        Available: {item.available_stock}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </td>
                                    <td className={`px-6 py-4 ${item.low_stock ? 'text-orange-600 font-medium' : ''}`}>
                                        {item.reorder_level || 0} {item.unit}
                                    </td>
                                    <td className="px-6 py-4">
                                        {formatCurrency(item.stock_value || item.total_value || 0)}
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="flex items-center space-x-2">
                                            <span className={`px-2 py-1 text-xs font-medium bg-${status.color}-100 text-${status.color}-800 rounded`}>
                                                {status.text}
                                            </span>
                                            {item.expiry_alert && (
                                                <span className="px-2 py-1 text-xs font-medium bg-orange-100 text-orange-800 rounded">
                                                    Expiring Soon
                                                </span>
                                            )}
                                        </div>
                                    </td>
                                    <td className="px-6 py-4">
                                        <div className="flex items-center space-x-1">
                                            <button
                                                onClick={() => onViewDetails(item)}
                                                className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                                title="View Details"
                                            >
                                                <Eye className="w-4 h-4" />
                                            </button>
                                            <button
                                                onClick={() => onEdit(item)}
                                                className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                                title="Edit"
                                            >
                                                <Edit2 className="w-4 h-4" />
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
});

StockTable.displayName = 'StockTable';
