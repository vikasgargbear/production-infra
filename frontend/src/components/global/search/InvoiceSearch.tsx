import React, { useState, useEffect, useCallback, useRef, forwardRef, useImperativeHandle } from 'react';
import { Search, FileText, Package, AlertCircle, ExternalLink } from 'lucide-react';
import { invoicesApi } from '../../../services/api';
import { useDebounce } from '../../../hooks/useDebounce';
import { format } from 'date-fns';

// Import centralized types - single source of truth
import type {
  Invoice,
  InvoiceFilters,
  DateRange
} from '../../sales/invoice/types/invoiceTypes';

// ==================== COMPONENT PROPS ====================

interface InvoiceSearchProps {
  onSelect: (invoice: Invoice | Invoice[]) => void;
  customerId?: string | number | null;
  dateRange?: DateRange | null;
  invoiceType?: 'SALES' | 'PURCHASE';
  placeholder?: string;
  autoFocus?: boolean;
  className?: string;
  disabled?: boolean;
  allowMultiple?: boolean;
  selectedInvoices?: Invoice[];
  showDetails?: boolean;
  searchDelay?: number;
  minSearchLength?: number;
  maxResults?: number;
  filters?: InvoiceFilters;
  onSearchStart?: () => void;
  onSearchComplete?: (results: Invoice[]) => void;
  onError?: (error: Error) => void;
  onViewAll?: () => void; // Callback when user clicks "View All Invoices"
}

export interface InvoiceSearchHandle {
  focus: () => void;
  clear: () => void;
}

interface APIResponse {
  success?: boolean;
  data?: {
    invoices?: Invoice[];
    [key: string]: unknown;
  } | Invoice[];
  error?: {
    message?: string;
  };
}

// ==================== COMPONENT ====================

/**
 * Global Invoice Search Component
 * Enterprise-level component for searching and selecting invoices
 * Supports multiple search criteria and provides rich invoice details
 */
const InvoiceSearch = forwardRef<InvoiceSearchHandle, InvoiceSearchProps>(({
  onSelect,
  customerId = null,
  dateRange = null,
  invoiceType = 'SALES',
  placeholder = 'Search by invoice number, customer name, or product...',
  autoFocus = false,
  className = '',
  disabled = false,
  allowMultiple = false,
  selectedInvoices = [],
  showDetails = true,
  searchDelay = 300,
  minSearchLength = 2,
  maxResults = 50,
  filters = {},
  onSearchStart,
  onSearchComplete,
  onError,
  onViewAll
}, ref) => {
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [selectedIndex, setSelectedIndex] = useState<number>(-1);
  const [recentInvoices, setRecentInvoices] = useState<Invoice[]>([]);
  const [hasSearched, setHasSearched] = useState<boolean>(false);
  const hasFetchedRecent = useRef<boolean>(false); // Guard against infinite fetches

  const searchInputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const debouncedSearchQuery = useDebounce(searchQuery, searchDelay);

  // Expose focus method to parent
  useImperativeHandle(ref, () => ({
    focus: () => {
      searchInputRef.current?.focus();
    },
    clear: () => {
      setSearchQuery('');
      setInvoices([]);
    }
  }));

  // Fetch recent invoices - only once per customer
  const fetchRecentInvoices = useCallback(async () => {
    if (!customerId) {
      return;
    }

    // Guard against repeated fetches
    if (hasFetchedRecent.current) {
      return;
    }
    hasFetchedRecent.current = true;

    setLoading(true);
    setError(null);

    try {
      const response = await invoicesApi.search({
        customer_id: customerId as any,
        limit: 5,
        sort: 'invoice_date',
        order: 'desc'
      });

      if ((response as APIResponse).success || (response as APIResponse).data) {
        const respData = (response as APIResponse).data;
        const results: Invoice[] = (respData as { invoices?: Invoice[] })?.invoices || (Array.isArray(respData) ? respData : []);
        setRecentInvoices(results);
        setInvoices(results);
      }
    } catch (err) {
      // Don't show error for recent invoices fetch
      setRecentInvoices([]);
      setInvoices([]);
    } finally {
      setLoading(false);
    }
  }, [customerId]);

  // Search invoices - use refs for values that change frequently to avoid dep loop
  const searchInvoices = useCallback(async (query: string) => {
    setHasSearched(true);

    if (!query || query.length < minSearchLength) {
      // Empty query - show nothing or recent invoices
      setInvoices([]);
      return;
    }

    setLoading(true);
    setError(null);
    onSearchStart?.();

    try {
      const searchParams = {
        ...filters,
        query,
        invoice_type: invoiceType,
        customer_id: (customerId ?? undefined) as any,
        date_from: dateRange?.from,
        date_to: dateRange?.to,
        limit: maxResults,
        include_items: showDetails
      };

      const response = await invoicesApi.search(searchParams);

      if ((response as APIResponse).success) {
        const respData = (response as APIResponse).data as { invoices?: Invoice[] };
        const results: Invoice[] = respData?.invoices || [];
        setInvoices(results);

        onSearchComplete?.(results);
      } else {
        const errorResp = response as APIResponse;
        throw new Error(errorResp.error?.message || 'Search failed');
      }
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'Unknown error';
      setError(errMsg);
      setInvoices([]);
      if (err instanceof Error) {
        onError?.(err);
      }
    } finally {
      setLoading(false);
    }
  }, [
    invoiceType, customerId, dateRange, maxResults, showDetails,
    filters, minSearchLength, onSearchStart,
    onSearchComplete, onError
  ]);

  // Effect to search when debounced query changes
  useEffect(() => {
    if (debouncedSearchQuery) {
      searchInvoices(debouncedSearchQuery);
    }
  }, [debouncedSearchQuery]); // Only depend on query, not searchInvoices function);

  // Effect to fetch recent invoices when customer changes
  useEffect(() => {
    if (customerId) {
      hasFetchedRecent.current = false; // Reset on customer change
      fetchRecentInvoices();
    }
  }, [customerId]); // Only depend on customerId, not the function

  // Show recent invoices when focused with no search query
  useEffect(() => {
    if (isOpen && !searchQuery && recentInvoices.length > 0) {
      setInvoices(recentInvoices);
    }
  }, [isOpen, searchQuery, recentInvoices]);

  // Handle invoice selection
  const handleSelect = useCallback((invoice) => {
    if (allowMultiple) {
      const isSelected = selectedInvoices.some(inv => inv.id === invoice.id);
      const newSelection = isSelected
        ? selectedInvoices.filter(inv => inv.id !== invoice.id)
        : [...selectedInvoices, invoice];
      onSelect(newSelection);
    } else {
      onSelect(invoice);
      setIsOpen(false);
      setSearchQuery('');
    }
  }, [allowMultiple, selectedInvoices, onSelect]);

  // Keyboard navigation
  const handleKeyDown = useCallback((e) => {
    if (!isOpen || invoices.length === 0) return;

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setSelectedIndex(prev =>
          prev < invoices.length - 1 ? prev + 1 : 0
        );
        break;

      case 'ArrowUp':
        e.preventDefault();
        setSelectedIndex(prev =>
          prev > 0 ? prev - 1 : invoices.length - 1
        );
        break;

      case 'Enter':
        e.preventDefault();
        if (selectedIndex >= 0 && selectedIndex < invoices.length) {
          handleSelect(invoices[selectedIndex]);
        }
        break;

      case 'Escape':
        e.preventDefault();
        setIsOpen(false);
        setSelectedIndex(-1);
        break;
    }
  }, [isOpen, invoices, selectedIndex, handleSelect]);

  // Format invoice display
  const formatInvoiceDisplay = (invoice) => {
    const date = format(new Date(invoice.invoice_date), 'dd/MM/yyyy');
    const amountValue = invoice.final_amount ?? invoice.total_amount;
    const amount = amountValue === null || amountValue === undefined
      ? 'Amount unavailable'
      : new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: 'INR',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
      }).format(amountValue);

    return {
      primary: invoice.invoice_number,
      secondary: date, // Just date, no customer name (already selected)
      amount,
      status: invoice.payment_status || invoice.status,
      itemCount: invoice.items?.length || 0
    };
  };

  // Check if invoice is selected
  const isInvoiceSelected = (invoice) => {
    return allowMultiple && selectedInvoices.some(inv => inv.id === invoice.id);
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
          onFocus={() => {
            setIsOpen(true);
            // If no search query and we have recent invoices, show them
            if (!searchQuery && recentInvoices.length > 0) {
              setInvoices(recentInvoices);
            }
          }}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          autoFocus={autoFocus}
          disabled={disabled}
        />

        {loading && (
          <div className="absolute right-3 top-1/2 transform -translate-y-1/2">
            <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-500"></div>
          </div>
        )}
      </div>

      {/* Error Message */}
      {error && (
        <div className="absolute z-10 w-full mt-1 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2">
          <AlertCircle className="h-4 w-4 text-red-500 flex-shrink-0" />
          <span className="text-sm text-red-700">{error}</span>
        </div>
      )}

      {/* Results Dropdown */}
      {isOpen && !error && invoices.length > 0 && (
        <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-96 overflow-y-auto">
          {!searchQuery && recentInvoices.length > 0 && (
            <div className="px-3 py-2 bg-gray-50 border-b border-gray-200">
              <span className="text-xs text-gray-600 font-medium">Recent Invoices</span>
            </div>
          )}
          {invoices.map((invoice, index) => {
            const display = formatInvoiceDisplay(invoice);
            const isSelected = selectedIndex === index;
            const isChecked = isInvoiceSelected(invoice);

            return (
              <div
                key={invoice.id}
                className={`p-3 cursor-pointer transition-colors ${isSelected ? 'bg-blue-50' : 'hover:bg-gray-50'
                  } ${isChecked ? 'bg-blue-100' : ''}`}
                onClick={() => handleSelect(invoice)}
                onMouseEnter={() => setSelectedIndex(index)}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <FileText className="h-4 w-4 text-gray-400" />
                      <span className="font-medium text-gray-900">
                        {display.primary}
                      </span>
                      {invoice.status && (
                        <span className={`text-xs px-2 py-0.5 rounded-full ${invoice.status === 'PAID'
                          ? 'bg-green-100 text-green-700'
                          : invoice.status === 'PARTIAL'
                            ? 'bg-yellow-100 text-yellow-700'
                            : 'bg-gray-100 text-gray-700'
                          }`}>
                          {invoice.status}
                        </span>
                      )}
                    </div>

                    <div className="mt-1 text-sm text-gray-600">
                      {display.secondary}
                    </div>

                    {showDetails && invoice.items && (
                      <div className="mt-1 text-xs text-gray-500">
                        <Package className="inline h-3 w-3 mr-1" />
                        {display.itemCount} items
                      </div>
                    )}
                  </div>

                  <div className="text-right ml-4">
                    <div className="font-medium text-gray-900">
                      {display.amount}
                    </div>
                    {allowMultiple && (
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => { }}
                        className="mt-1"
                      />
                    )}
                  </div>
                </div>
              </div>
            );
          })}

          {/* View All Invoices button */}
          {onViewAll && (
            <div
              className="border-t border-gray-200 p-3 bg-gray-50 cursor-pointer hover:bg-gray-100 transition-colors"
              onClick={() => {
                setIsOpen(false);
                onViewAll();
              }}
            >
              <div className="flex items-center justify-between text-sm text-blue-600 font-medium">
                <span>View All Invoices</span>
                <ExternalLink className="h-4 w-4" />
              </div>
            </div>
          )}
        </div>
      )}

      {/* No Results */}
      {isOpen && !error && !loading && ((searchQuery.length >= minSearchLength && invoices.length === 0) || (!searchQuery && customerId && recentInvoices.length === 0)) && (
        <div className="absolute z-10 w-full mt-1 p-4 bg-white border border-gray-200 rounded-lg shadow-lg text-center">
          <FileText className="h-8 w-8 text-gray-300 mx-auto mb-2" />
          <p className="text-sm text-gray-500">
            {searchQuery ? 'No invoices found' : 'No recent invoices for this customer'}
          </p>
        </div>
      )}

      {/* Loading state */}
      {isOpen && loading && (
        <div className="absolute z-10 w-full mt-1 p-4 bg-white border border-gray-200 rounded-lg shadow-lg text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500 mx-auto mb-2"></div>
          <p className="text-sm text-gray-500">Loading invoices...</p>
        </div>
      )}
    </div>
  );
});

InvoiceSearch.displayName = 'InvoiceSearch';

export default InvoiceSearch;
