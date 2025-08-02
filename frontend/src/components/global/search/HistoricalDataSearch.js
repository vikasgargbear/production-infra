import React, { useState, useEffect, useCallback, forwardRef, useImperativeHandle, useRef } from 'react';
import { Search, Calendar, Filter, ChevronDown, X } from 'lucide-react';
import { format, subDays, startOfMonth, endOfMonth } from 'date-fns';
import { useDebounce } from '../../../hooks/useDebounce';

/**
 * Universal Historical Data Search Component
 * Enterprise-level component for searching any historical data with date ranges
 * Can be used for invoices, orders, payments, returns, etc.
 */
const HistoricalDataSearch = forwardRef(({
  // Data configuration
  dataType = 'records', // invoices, orders, payments, etc.
  searchFields = ['number', 'name', 'date'], // Fields to search in
  displayFields = {
    primary: 'number',
    secondary: 'name', 
    date: 'date',
    amount: 'amount',
    status: 'status'
  },
  
  // API configuration
  searchFunction, // Required: async function to search data
  recentFunction, // Optional: async function to get recent data
  
  // UI configuration
  title = 'Search Historical Data',
  placeholder = 'Search...',
  showDateFilter = true,
  showStatusFilter = true,
  showAmountRange = false,
  quickDateRanges = true,
  
  // Behavior
  autoShowRecent = true,
  minSearchLength = 2,
  searchDelay = 300,
  recentLimit = 10,
  searchLimit = 50,
  
  // Callbacks
  onSelect,
  onSearchStart,
  onSearchComplete,
  onError,
  
  // Other props
  className = '',
  disabled = false,
  filters: externalFilters = {}
}, ref) => {
  // State
  const [searchQuery, setSearchQuery] = useState('');
  const [data, setData] = useState([]);
  const [recentData, setRecentData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [isOpen, setIsOpen] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  
  // Filters
  const [dateRange, setDateRange] = useState({ from: null, to: null });
  const [statusFilter, setStatusFilter] = useState('all');
  const [amountRange, setAmountRange] = useState({ min: '', max: '' });
  
  // Refs
  const searchInputRef = useRef(null);
  const dropdownRef = useRef(null);
  
  // Debounced search
  const debouncedSearchQuery = useDebounce(searchQuery, searchDelay);

  // Quick date ranges
  const quickRanges = [
    { label: 'Today', value: () => ({ from: new Date(), to: new Date() }) },
    { label: 'Yesterday', value: () => ({ from: subDays(new Date(), 1), to: subDays(new Date(), 1) }) },
    { label: 'Last 7 days', value: () => ({ from: subDays(new Date(), 7), to: new Date() }) },
    { label: 'Last 30 days', value: () => ({ from: subDays(new Date(), 30), to: new Date() }) },
    { label: 'This month', value: () => ({ from: startOfMonth(new Date()), to: endOfMonth(new Date()) }) },
    { label: 'Last month', value: () => {
      const lastMonth = subDays(startOfMonth(new Date()), 1);
      return { from: startOfMonth(lastMonth), to: endOfMonth(lastMonth) };
    }},
    { label: 'Custom', value: 'custom' }
  ];

  // Expose methods to parent
  useImperativeHandle(ref, () => ({
    focus: () => searchInputRef.current?.focus(),
    clear: () => {
      setSearchQuery('');
      setData([]);
      resetFilters();
    },
    resetFilters,
    search: (query) => {
      setSearchQuery(query);
    }
  }));

  // Reset filters
  const resetFilters = () => {
    setDateRange({ from: null, to: null });
    setStatusFilter('all');
    setAmountRange({ min: '', max: '' });
  };

  // Fetch recent data
  const fetchRecentData = useCallback(async () => {
    if (!recentFunction || !autoShowRecent) return;

    try {
      setLoading(true);
      const response = await recentFunction(recentLimit);
      setRecentData(response.data || []);
    } catch (err) {
      console.error(`Error fetching recent ${dataType}:`, err);
    } finally {
      setLoading(false);
    }
  }, [recentFunction, recentLimit, dataType, autoShowRecent]);

  // Search data
  const searchData = useCallback(async (query) => {
    if (!searchFunction) {
      console.error('searchFunction is required');
      return;
    }

    if (!query && !showFilters) {
      setData(recentData);
      return;
    }

    setLoading(true);
    setError(null);
    onSearchStart?.();

    try {
      const searchParams = {
        query,
        limit: searchLimit,
        dateFrom: dateRange.from,
        dateTo: dateRange.to,
        status: statusFilter !== 'all' ? statusFilter : undefined,
        amountMin: amountRange.min || undefined,
        amountMax: amountRange.max || undefined,
        ...externalFilters
      };

      const response = await searchFunction(searchParams);
      const results = response.data || [];
      setData(results);
      onSearchComplete?.(results);
    } catch (err) {
      console.error(`Error searching ${dataType}:`, err);
      setError(err.message);
      setData([]);
      onError?.(err);
    } finally {
      setLoading(false);
    }
  }, [
    searchFunction, dataType, searchLimit, dateRange, statusFilter, 
    amountRange, externalFilters, showFilters, recentData,
    onSearchStart, onSearchComplete, onError
  ]);

  // Effects
  useEffect(() => {
    if (autoShowRecent) {
      fetchRecentData();
    }
  }, [fetchRecentData]);

  useEffect(() => {
    if (debouncedSearchQuery || showFilters) {
      searchData(debouncedSearchQuery);
    } else if (autoShowRecent && recentData.length > 0) {
      setData(recentData);
    }
  }, [debouncedSearchQuery, searchData, autoShowRecent, recentData, showFilters]);

  // Format display
  const formatDisplay = (item) => {
    const getValue = (field) => {
      if (!field) return null;
      return field.split('.').reduce((obj, key) => obj?.[key], item);
    };

    return {
      primary: getValue(displayFields.primary),
      secondary: getValue(displayFields.secondary),
      date: getValue(displayFields.date),
      amount: getValue(displayFields.amount),
      status: getValue(displayFields.status)
    };
  };

  // Handle click outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className={`relative ${className}`} ref={dropdownRef}>
      {/* Search Input */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
        <input
          ref={searchInputRef}
          type="text"
          value={searchQuery}
          onChange={(e) => {
            setSearchQuery(e.target.value);
            setIsOpen(true);
          }}
          onFocus={() => setIsOpen(true)}
          placeholder={placeholder}
          className="w-full pl-10 pr-20 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          disabled={disabled}
        />
        
        <div className="absolute right-2 top-1/2 transform -translate-y-1/2 flex items-center gap-2">
          {loading && (
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-500"></div>
          )}
          {(showDateFilter || showStatusFilter || showAmountRange) && (
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`p-1 rounded hover:bg-gray-100 ${showFilters ? 'text-blue-600' : 'text-gray-400'}`}
            >
              <Filter className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* Filters */}
      {showFilters && (
        <div className="absolute z-20 w-full mt-1 p-4 bg-white border border-gray-200 rounded-lg shadow-lg">
          <div className="space-y-4">
            {/* Date Range Filter */}
            {showDateFilter && (
              <div>
                <label className="text-sm font-medium text-gray-700">Date Range</label>
                {quickDateRanges && (
                  <div className="flex flex-wrap gap-2 mt-2">
                    {quickRanges.map((range) => (
                      <button
                        key={range.label}
                        onClick={() => {
                          if (range.value === 'custom') {
                            // Show custom date picker
                          } else {
                            setDateRange(range.value());
                          }
                        }}
                        className="px-3 py-1 text-sm border border-gray-300 rounded-md hover:bg-gray-50"
                      >
                        {range.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Status Filter */}
            {showStatusFilter && (
              <div>
                <label className="text-sm font-medium text-gray-700">Status</label>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                >
                  <option value="all">All Status</option>
                  <option value="paid">Paid</option>
                  <option value="unpaid">Unpaid</option>
                  <option value="partial">Partial</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </div>
            )}

            {/* Amount Range */}
            {showAmountRange && (
              <div>
                <label className="text-sm font-medium text-gray-700">Amount Range</label>
                <div className="flex gap-2 mt-1">
                  <input
                    type="number"
                    placeholder="Min"
                    value={amountRange.min}
                    onChange={(e) => setAmountRange(prev => ({ ...prev, min: e.target.value }))}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                  />
                  <span className="self-center">-</span>
                  <input
                    type="number"
                    placeholder="Max"
                    value={amountRange.max}
                    onChange={(e) => setAmountRange(prev => ({ ...prev, max: e.target.value }))}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2">
              <button
                onClick={resetFilters}
                className="px-3 py-1 text-sm text-gray-600 hover:text-gray-800"
              >
                Clear
              </button>
              <button
                onClick={() => searchData(searchQuery)}
                className="px-3 py-1 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700"
              >
                Apply
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Results */}
      {isOpen && !error && data.length > 0 && (
        <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-96 overflow-y-auto">
          {!searchQuery && !showFilters && autoShowRecent && (
            <div className="px-3 py-2 bg-gray-50 border-b border-gray-200">
              <span className="text-xs text-gray-600 font-medium">Recent {dataType}</span>
            </div>
          )}
          
          {data.map((item, index) => {
            const display = formatDisplay(item);
            
            return (
              <div
                key={item.id || index}
                className="p-3 cursor-pointer hover:bg-gray-50 border-b border-gray-100 last:border-b-0"
                onClick={() => {
                  onSelect?.(item);
                  setIsOpen(false);
                  setSearchQuery('');
                }}
              >
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <div className="font-medium text-gray-900">{display.primary}</div>
                    {display.secondary && (
                      <div className="text-sm text-gray-600">{display.secondary}</div>
                    )}
                    {display.date && (
                      <div className="text-xs text-gray-500">
                        <Calendar className="inline h-3 w-3 mr-1" />
                        {format(new Date(display.date), 'dd MMM yyyy')}
                      </div>
                    )}
                  </div>
                  
                  <div className="text-right ml-4">
                    {display.amount && (
                      <div className="font-medium text-gray-900">
                        ₹{Number(display.amount).toLocaleString('en-IN')}
                      </div>
                    )}
                    {display.status && (
                      <span className={`text-xs px-2 py-0.5 rounded-full ${
                        display.status === 'paid' ? 'bg-green-100 text-green-700' :
                        display.status === 'partial' ? 'bg-yellow-100 text-yellow-700' :
                        display.status === 'cancelled' ? 'bg-red-100 text-red-700' :
                        'bg-gray-100 text-gray-700'
                      }`}>
                        {display.status}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* No Results */}
      {isOpen && !error && !loading && searchQuery && data.length === 0 && (
        <div className="absolute z-10 w-full mt-1 p-4 bg-white border border-gray-200 rounded-lg shadow-lg text-center">
          <p className="text-sm text-gray-500">No {dataType} found</p>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="absolute z-10 w-full mt-1 p-3 bg-red-50 border border-red-200 rounded-lg">
          <span className="text-sm text-red-700">{error}</span>
        </div>
      )}
    </div>
  );
});

HistoricalDataSearch.displayName = 'HistoricalDataSearch';

export default HistoricalDataSearch;