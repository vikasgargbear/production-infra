import React, { useState, useMemo, ReactNode } from 'react';
import { ChevronUp, ChevronDown, Search, Filter, MoreVertical } from 'lucide-react';

type SortDirection = 'asc' | 'desc';

interface Column<T = any> {
  field?: string;
  header: string;
  accessor?: (row: T) => any;
  render?: (row: T) => ReactNode;
  sortable?: boolean;
  searchable?: boolean;
  className?: string;
  cellClassName?: string;
}

interface PaginationConfig {
  currentPage: number;
  totalPages: number;
  from: number;
  to: number;
  total: number;
  onNext: () => void;
  onPrevious: () => void;
}

interface DataTableProps<T = any> {
  data?: T[];
  columns?: Column<T>[];
  onRowClick?: (row: T) => void;
  selectable?: boolean;
  onSelectionChange?: (selectedRows: T[]) => void;
  loading?: boolean;
  pagination?: PaginationConfig | null;
  onSort?: (field: string, direction: SortDirection) => void;
  emptyMessage?: string;
  actions?: (row: T) => ReactNode;
  searchable?: boolean;
  searchPlaceholder?: string;
  className?: string;
}

/**
 * DataTable Component
 * A reusable table component with sorting, filtering, pagination, and actions
 */
const DataTable = <T extends Record<string, any>>({
  data = [],
  columns = [],
  onRowClick,
  selectable = false,
  onSelectionChange,
  loading = false,
  pagination = null,
  onSort,
  emptyMessage = "No data available",
  actions = null,
  searchable = false,
  searchPlaceholder = "Search...",
  className = ""
}: DataTableProps<T>) => {
  const [selectedRows, setSelectedRows] = useState<Set<number>>(new Set());
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [sortField, setSortField] = useState<Column<T> | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

  // Filter data based on search
  const filteredData = useMemo(() => {
    if (!searchQuery) return data;
    
    return data.filter(row => {
      return columns.some(col => {
        if (col.searchable === false) return false;
        const value = col.accessor ? col.accessor(row) : row[col.field!];
        return String(value).toLowerCase().includes(searchQuery.toLowerCase());
      });
    });
  }, [data, searchQuery, columns]);

  // Sort data
  const sortedData = useMemo(() => {
    if (!sortField) return filteredData;
    
    return [...filteredData].sort((a, b) => {
      const aVal = sortField.accessor ? sortField.accessor(a) : a[sortField.field!];
      const bVal = sortField.accessor ? sortField.accessor(b) : b[sortField.field!];
      
      if (aVal === bVal) return 0;
      
      if (sortDirection === 'asc') {
        return aVal > bVal ? 1 : -1;
      } else {
        return aVal < bVal ? 1 : -1;
      }
    });
  }, [filteredData, sortField, sortDirection]);

  // Handle sort
  const handleSort = (column: Column<T>) => {
    if (!column.sortable) return;
    
    if (sortField?.field === column.field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(column);
      setSortDirection('asc');
    }
    
    if (onSort && column.field) {
      onSort(column.field, sortDirection === 'asc' ? 'desc' : 'asc');
    }
  };

  // Handle row selection
  const handleSelectAll = () => {
    if (selectedRows.size === sortedData.length) {
      setSelectedRows(new Set());
      onSelectionChange && onSelectionChange([]);
    } else {
      const allIds = new Set(sortedData.map((_, index) => index));
      setSelectedRows(allIds);
      onSelectionChange && onSelectionChange(sortedData);
    }
  };

  const handleSelectRow = (index: number, row: T) => {
    const newSelected = new Set(selectedRows);
    if (newSelected.has(index)) {
      newSelected.delete(index);
    } else {
      newSelected.add(index);
    }
    setSelectedRows(newSelected);
    
    if (onSelectionChange) {
      const selectedData = sortedData.filter((_, i) => newSelected.has(i));
      onSelectionChange(selectedData);
    }
  };

  // Loading state
  if (loading) {
    return (
      <div className={`bg-white rounded-lg border border-gray-200 ${className}`}>
        <div className="animate-pulse">
          <div className="h-12 bg-gray-100 border-b border-gray-200" />
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-16 bg-gray-50 border-b border-gray-200" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className={`bg-white rounded-lg border border-gray-200 ${className}`}>
      {/* Search Bar */}
      {searchable && (
        <div className="px-4 py-3 border-b border-gray-200">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={searchPlaceholder}
              className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              {selectable && (
                <th className="px-4 py-3 text-left">
                  <input
                    type="checkbox"
                    checked={selectedRows.size === sortedData.length && sortedData.length > 0}
                    onChange={handleSelectAll}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                </th>
              )}
              {columns.map((column, index) => (
                <th
                  key={column.field || index}
                  className={`px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase tracking-wider ${
                    column.sortable ? 'cursor-pointer hover:bg-gray-100' : ''
                  } ${column.className || ''}`}
                  onClick={() => handleSort(column)}
                >
                  <div className="flex items-center gap-1">
                    {column.header}
                    {column.sortable && (
                      <div className="flex flex-col">
                        <ChevronUp 
                          className={`w-3 h-3 -mb-1 ${
                            sortField?.field === column.field && sortDirection === 'asc'
                              ? 'text-blue-600'
                              : 'text-gray-400'
                          }`}
                        />
                        <ChevronDown 
                          className={`w-3 h-3 -mt-1 ${
                            sortField?.field === column.field && sortDirection === 'desc'
                              ? 'text-blue-600'
                              : 'text-gray-400'
                          }`}
                        />
                      </div>
                    )}
                  </div>
                </th>
              ))}
              {actions && <th className="px-4 py-3 text-right">Actions</th>}
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {sortedData.length === 0 ? (
              <tr>
                <td 
                  colSpan={columns.length + (selectable ? 1 : 0) + (actions ? 1 : 0)}
                  className="px-4 py-12 text-center text-gray-500"
                >
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              sortedData.map((row, rowIndex) => (
                <tr
                  key={rowIndex}
                  onClick={() => onRowClick && onRowClick(row)}
                  className={`${
                    onRowClick ? 'cursor-pointer hover:bg-gray-50' : ''
                  } ${selectedRows.has(rowIndex) ? 'bg-blue-50' : ''}`}
                >
                  {selectable && (
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={selectedRows.has(rowIndex)}
                        onChange={(e) => {
                          e.stopPropagation();
                          handleSelectRow(rowIndex, row);
                        }}
                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                    </td>
                  )}
                  {columns.map((column, colIndex) => (
                    <td
                      key={column.field || colIndex}
                      className={`px-4 py-3 text-sm ${column.cellClassName || ''}`}
                    >
                      {column.render
                        ? column.render(row)
                        : column.accessor
                        ? column.accessor(row)
                        : row[column.field!]}
                    </td>
                  ))}
                  {actions && (
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        {actions(row)}
                      </div>
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {pagination && (
        <div className="px-4 py-3 border-t border-gray-200 flex items-center justify-between">
          <div className="text-sm text-gray-700">
            Showing {pagination.from} to {pagination.to} of {pagination.total} entries
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={pagination.onPrevious}
              disabled={pagination.currentPage === 1}
              className="px-3 py-1 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Previous
            </button>
            <span className="text-sm text-gray-700">
              Page {pagination.currentPage} of {pagination.totalPages}
            </span>
            <button
              onClick={pagination.onNext}
              disabled={pagination.currentPage === pagination.totalPages}
              className="px-3 py-1 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default DataTable;
