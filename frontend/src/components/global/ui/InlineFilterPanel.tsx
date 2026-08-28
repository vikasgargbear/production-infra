import React, { useState } from 'react';
import { Filter, X } from 'lucide-react';
import Button from './Button';

interface FilterOption {
  key: string;
  label: string;
  type: 'select' | 'date' | 'text' | 'number';
  options?: { value: string; label: string }[];
  placeholder?: string;
}

interface InlineFilterPanelProps {
  filters: FilterOption[];
  onFilterChange: (filters: any) => void;
  searchQuery?: string;
  onSearchChange?: (query: string) => void;
  showFilters?: boolean;
  onToggleFilters?: (show: boolean) => void;
  onClearFilters?: () => void;
  className?: string;
  searchPlaceholder?: string;
  showFilterToggle?: boolean;
}

const InlineFilterPanel: React.FC<InlineFilterPanelProps> = ({
  filters,
  onFilterChange,
  searchQuery = '',
  onSearchChange,
  showFilters = false,
  onToggleFilters,
  onClearFilters,
  className = '',
  searchPlaceholder = 'Search by customer name, invoice number, or order number...',
  showFilterToggle = true,
}) => {
  const [filterValues, setFilterValues] = useState<Record<string, any>>({});

  const handleFilterChange = (key: string, value: any) => {
    const newFilters = { ...filterValues, [key]: value };
    setFilterValues(newFilters);

    // Auto-apply filters when they change
    const activeFilters = Object.fromEntries(
      Object.entries(newFilters).filter(([_, val]) => val && val !== '')
    );
    onFilterChange(activeFilters);
  };

  const clearAllFilters = () => {
    setFilterValues({});
    if (onClearFilters) {
      onClearFilters();
      return;
    }
    onFilterChange({});
    if (onSearchChange) {
      onSearchChange('');
    }
  };

  const hasActiveFilters = Object.values(filterValues).some(val => val && val !== '') || searchQuery;

  return (
    <div className={`bg-white rounded-lg border border-gray-200 p-4 ${className}`}>
      <div className="flex items-center space-x-4">
        {/* Search Input */}
        {onSearchChange && (
          <div className="flex-1">
            <div className="relative">
              <input
                type="text"
                placeholder={searchPlaceholder}
                className="w-full pl-4 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                value={searchQuery}
                onChange={(e) => onSearchChange(e.target.value)}
                onKeyPress={(e) => {
                  if (e.key === 'Enter') {
                    onFilterChange({ search: searchQuery });
                  }
                }}
              />
              {searchQuery && (
                <button
                  onClick={() => {
                    onSearchChange('');
                  }}
                  className="absolute right-1 top-1/2 inline-flex min-h-11 min-w-11 -translate-y-1/2 items-center justify-center rounded-lg text-gray-400 hover:bg-gray-100 hover:text-gray-600"
                  aria-label="Clear search"
                  title="Clear search"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        )}

        {/* Filter Toggle */}
        {showFilterToggle && <div className="flex flex-col items-end space-y-2">
          <Button
            variant={showFilters ? "primary" : "outline"}
            onClick={() => onToggleFilters?.(!showFilters)}
            icon={<Filter className="w-4 h-4" />}
            iconPosition="left"
          >
            {showFilters ? 'Hide Filters' : 'Show Filters'}
          </Button>
        </div>}
      </div>

      {/* Inline Filters */}
      {showFilterToggle && showFilters && (
        <div className="mt-4 pt-4 border-t border-gray-200">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {filters.map((filter) => (
              <div key={filter.key}>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  {filter.label}
                </label>
                {filter.type === 'select' ? (
                  <select
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={filterValues[filter.key] || ''}
                    onChange={(e) => handleFilterChange(filter.key, e.target.value)}
                  >
                    <option value="">All {filter.label}</option>
                    {filter.options?.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                ) : filter.type === 'date' ? (
                  <input
                    type="date"
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={filterValues[filter.key] || ''}
                    onChange={(e) => handleFilterChange(filter.key, e.target.value)}
                  />
                ) : filter.type === 'number' ? (
                  <input
                    type="number"
                    placeholder={filter.placeholder}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={filterValues[filter.key] || ''}
                    onChange={(e) => handleFilterChange(filter.key, e.target.value)}
                  />
                ) : (
                  <input
                    type="text"
                    placeholder={filter.placeholder}
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    value={filterValues[filter.key] || ''}
                    onChange={(e) => handleFilterChange(filter.key, e.target.value)}
                  />
                )}
              </div>
            ))}
          </div>

          {/* Clear Filters Button */}
          {hasActiveFilters && (
            <div className="mt-4 flex justify-end">
              <Button
                variant="ghost"
                size="sm"
                onClick={clearAllFilters}
              >
                Clear All Filters
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default InlineFilterPanel;
