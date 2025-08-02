import React, { useState, useMemo, useCallback } from 'react';
import {
  ChevronUp,
  ChevronDown,
  ChevronsUpDown,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Search,
  Filter,
  Download,
  RefreshCw,
} from 'lucide-react';
import { Button } from '../Button';
import { Input } from '../forms/Input';
import { Select } from '../forms/Select';
import { Checkbox } from '../forms/Checkbox';

export interface Column<T> {
  key: keyof T | string;
  header: string;
  accessor?: (row: T) => React.ReactNode;
  render?: (value: any, row: T) => React.ReactNode;
  sortable?: boolean;
  width?: string | number;
  align?: 'left' | 'center' | 'right';
  sticky?: boolean;
}

export interface DataTableProps<T = Record<string, any>> {
  data: T[];
  columns: Column<T>[];
  keyField: keyof T;
  
  // Selection
  selectable?: boolean;
  selectedRows?: T[];
  onSelectionChange?: (selectedRows: T[]) => void;
  
  // Sorting
  sortable?: boolean;
  defaultSortKey?: string;
  defaultSortOrder?: 'asc' | 'desc';
  onSort?: (key: string, order: 'asc' | 'desc') => void;
  
  // Pagination
  paginated?: boolean;
  pageSize?: number;
  currentPage?: number;
  totalItems?: number;
  onPageChange?: (page: number) => void;
  onPageSizeChange?: (pageSize: number) => void;
  pageSizeOptions?: number[];
  
  // Search & Filter
  searchable?: boolean;
  searchPlaceholder?: string;
  onSearch?: (query: string) => void;
  
  // Actions
  actions?: React.ReactNode;
  onRefresh?: () => void;
  onExport?: () => void;
  
  // Loading & Empty states
  loading?: boolean;
  emptyMessage?: string;
  emptyIcon?: React.ReactNode;
  
  // Styling
  striped?: boolean;
  hoverable?: boolean;
  bordered?: boolean;
  compact?: boolean;
  className?: string;
  headerClassName?: string;
  bodyClassName?: string;
}

export function DataTable<T extends Record<string, any>>({
  data,
  columns,
  keyField,
  
  selectable = false,
  selectedRows = [],
  onSelectionChange,
  
  sortable = true,
  defaultSortKey = '',
  defaultSortOrder = 'asc',
  onSort,
  
  paginated = false,
  pageSize = 10,
  currentPage = 1,
  totalItems,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [10, 25, 50, 100],
  
  searchable = false,
  searchPlaceholder = 'Search...',
  onSearch,
  
  actions,
  onRefresh,
  onExport,
  
  loading = false,
  emptyMessage = 'No data available',
  emptyIcon,
  
  striped = true,
  hoverable = true,
  bordered = true,
  compact = false,
  className = '',
  headerClassName = '',
  bodyClassName = '',
}: DataTableProps<T>) {
  const [localSortKey, setLocalSortKey] = useState(defaultSortKey);
  const [localSortOrder, setLocalSortOrder] = useState<'asc' | 'desc'>(defaultSortOrder);
  const [searchQuery, setSearchQuery] = useState('');
  const [localSelectedRows, setLocalSelectedRows] = useState<T[]>(selectedRows);
  
  // Use external or local state for selection
  const effectiveSelectedRows = onSelectionChange ? selectedRows : localSelectedRows;
  const setEffectiveSelectedRows = onSelectionChange || setLocalSelectedRows;
  
  // Calculate pagination
  const totalPages = Math.ceil((totalItems || data.length) / pageSize);
  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = startIndex + pageSize;
  
  // Sort data
  const sortedData = useMemo(() => {
    if (!sortable || !localSortKey) return data;
    
    return [...data].sort((a, b) => {
      const column = columns.find(col => col.key === localSortKey);
      const aValue = column?.accessor ? column.accessor(a) : a[localSortKey as keyof T];
      const bValue = column?.accessor ? column.accessor(b) : b[localSortKey as keyof T];
      
      if (aValue === bValue) return 0;
      if (aValue == null || bValue == null) {
        // Handle null/undefined values - put them at the end
        if (aValue == null && bValue == null) return 0;
        if (aValue == null) return 1;
        return -1;
      }
      
      const comparison = aValue > bValue ? 1 : -1;
      return localSortOrder === 'asc' ? comparison : -comparison;
    });
  }, [data, localSortKey, localSortOrder, columns, sortable]);
  
  // Filter data
  const filteredData = useMemo(() => {
    if (!searchQuery) return sortedData;
    
    return sortedData.filter(row => {
      return columns.some(column => {
        const value = column.accessor ? column.accessor(row) : row[column.key as keyof T];
        return String(value).toLowerCase().includes(searchQuery.toLowerCase());
      });
    });
  }, [sortedData, searchQuery, columns]);
  
  // Paginate data
  const paginatedData = paginated 
    ? filteredData.slice(startIndex, endIndex)
    : filteredData;
  
  // Handle sort
  const handleSort = (key: string) => {
    if (!sortable) return;
    
    const newOrder = localSortKey === key && localSortOrder === 'asc' ? 'desc' : 'asc';
    setLocalSortKey(key);
    setLocalSortOrder(newOrder);
    
    if (onSort) {
      onSort(key, newOrder);
    }
  };
  
  // Handle select all
  const handleSelectAll = () => {
    if (effectiveSelectedRows.length === paginatedData.length) {
      setEffectiveSelectedRows([]);
    } else {
      setEffectiveSelectedRows(paginatedData);
    }
  };
  
  // Handle row selection
  const handleRowSelect = (row: T) => {
    const isSelected = effectiveSelectedRows.some(
      selected => selected[keyField] === row[keyField]
    );
    
    if (isSelected) {
      setEffectiveSelectedRows(
        effectiveSelectedRows.filter(
          selected => selected[keyField] !== row[keyField]
        )
      );
    } else {
      setEffectiveSelectedRows([...effectiveSelectedRows, row]);
    }
  };
  
  // Check if row is selected
  const isRowSelected = (row: T) => {
    return effectiveSelectedRows.some(
      selected => selected[keyField] === row[keyField]
    );
  };
  
  // Render sort icon
  const renderSortIcon = (columnKey: string) => {
    if (!sortable) return null;
    
    if (localSortKey === columnKey) {
      return localSortOrder === 'asc' ? (
        <ChevronUp className="w-4 h-4" />
      ) : (
        <ChevronDown className="w-4 h-4" />
      );
    }
    
    return <ChevronsUpDown className="w-4 h-4 opacity-50" />;
  };
  
  // Cell alignment classes
  const getAlignmentClass = (align?: 'left' | 'center' | 'right') => {
    switch (align) {
      case 'center': return 'text-center';
      case 'right': return 'text-right';
      default: return 'text-left';
    }
  };
  
  // Table classes
  const tableClasses = [
    'min-w-full divide-y divide-gray-200',
    bordered && 'border border-gray-200',
    className,
  ].filter(Boolean).join(' ');
  
  const thClasses = [
    'px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider',
    compact && 'px-4 py-2',
  ].filter(Boolean).join(' ');
  
  const tdClasses = [
    'px-6 py-4 whitespace-nowrap text-sm text-gray-900',
    compact && 'px-4 py-2',
  ].filter(Boolean).join(' ');
  
  return (
    <div className="space-y-4">
      {/* Header Actions */}
      {(searchable || actions || onRefresh || onExport) && (
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          {searchable && (
            <div className="flex-1 max-w-md">
              <Input
                leftIcon={<Search className="w-5 h-5" />}
                placeholder={searchPlaceholder}
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  onSearch?.(e.target.value);
                }}
              />
            </div>
          )}
          
          <div className="flex items-center gap-2">
            {actions}
            {onRefresh && (
              <Button
                variant="outline"
                size="sm"
                leftIcon={<RefreshCw className="w-4 h-4" />}
                onClick={onRefresh}
              >
                Refresh
              </Button>
            )}
            {onExport && (
              <Button
                variant="outline"
                size="sm"
                leftIcon={<Download className="w-4 h-4" />}
                onClick={onExport}
              >
                Export
              </Button>
            )}
          </div>
        </div>
      )}
      
      {/* Table */}
      <div className="overflow-x-auto">
        <table className={tableClasses}>
          <thead className={`bg-gray-50 ${headerClassName}`}>
            <tr>
              {selectable && (
                <th scope="col" className={`${thClasses} w-12`}>
                  <Checkbox
                    checked={effectiveSelectedRows.length === paginatedData.length && paginatedData.length > 0}
                    indeterminate={effectiveSelectedRows.length > 0 && effectiveSelectedRows.length < paginatedData.length}
                    onChange={handleSelectAll}
                  />
                </th>
              )}
              {columns.map((column) => (
                <th
                  key={String(column.key)}
                  scope="col"
                  className={`${thClasses} ${getAlignmentClass(column.align)} ${
                    column.sortable !== false && sortable ? 'cursor-pointer select-none' : ''
                  }`}
                  style={{ width: column.width }}
                  onClick={() => column.sortable !== false && handleSort(String(column.key))}
                >
                  <div className="flex items-center gap-1">
                    {column.header}
                    {column.sortable !== false && renderSortIcon(String(column.key))}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          
          <tbody className={`bg-white divide-y divide-gray-200 ${bodyClassName}`}>
            {loading ? (
              <tr>
                <td colSpan={columns.length + (selectable ? 1 : 0)} className="text-center py-8">
                  <div className="inline-flex items-center gap-2 text-gray-500">
                    <RefreshCw className="w-5 h-5 animate-spin" />
                    Loading...
                  </div>
                </td>
              </tr>
            ) : paginatedData.length === 0 ? (
              <tr>
                <td colSpan={columns.length + (selectable ? 1 : 0)} className="text-center py-8">
                  <div className="text-gray-500">
                    {emptyIcon && <div className="mb-2 flex justify-center">{emptyIcon}</div>}
                    {emptyMessage}
                  </div>
                </td>
              </tr>
            ) : (
              paginatedData.map((row, index) => (
                <tr
                  key={String(row[keyField])}
                  className={[
                    striped && index % 2 === 1 && 'bg-gray-50',
                    hoverable && 'hover:bg-gray-100',
                    'transition-colors',
                  ].filter(Boolean).join(' ')}
                >
                  {selectable && (
                    <td className={`${tdClasses} w-12`}>
                      <Checkbox
                        checked={isRowSelected(row)}
                        onChange={() => handleRowSelect(row)}
                      />
                    </td>
                  )}
                  {columns.map((column) => {
                    const value = column.accessor ? column.accessor(row) : row[column.key as keyof T];
                    const cellContent = column.render ? column.render(value, row) : value;
                    
                    return (
                      <td
                        key={String(column.key)}
                        className={`${tdClasses} ${getAlignmentClass(column.align)}`}
                      >
                        {cellContent}
                      </td>
                    );
                  })}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      
      {/* Pagination */}
      {paginated && totalPages > 1 && (
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-700">Show</span>
            <Select
              selectSize="sm"
              value={String(pageSize)}
              onChange={(value) => onPageSizeChange?.(Number(value))}
              options={pageSizeOptions.map(size => ({
                value: String(size),
                label: String(size),
              }))}
            />
            <span className="text-sm text-gray-700">entries</span>
          </div>
          
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => onPageChange?.(1)}
              disabled={currentPage === 1}
            >
              <ChevronsLeft className="w-4 h-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onPageChange?.(currentPage - 1)}
              disabled={currentPage === 1}
            >
              <ChevronLeft className="w-4 h-4" />
            </Button>
            
            <span className="px-3 text-sm text-gray-700">
              Page {currentPage} of {totalPages}
            </span>
            
            <Button
              variant="outline"
              size="sm"
              onClick={() => onPageChange?.(currentPage + 1)}
              disabled={currentPage === totalPages}
            >
              <ChevronRight className="w-4 h-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => onPageChange?.(totalPages)}
              disabled={currentPage === totalPages}
            >
              <ChevronsRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}