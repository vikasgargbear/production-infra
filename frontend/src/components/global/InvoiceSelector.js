import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { 
  Search, Calendar, Filter, ChevronLeft, ChevronRight, 
  FileText, AlertCircle, CheckCircle, Clock, DollarSign,
  Package, RotateCcw, X
} from 'lucide-react';
import InvoiceApiService from '../../services/InvoiceApiService';
import { formatCurrency, formatDate } from '../../utils/formatters';
import StandardDatePicker from './ui/forms/StandardDatePicker';
import { Select } from './ui';
import LoadingSpinner from '../LoadingSpinner';

/**
 * Global Invoice Selector Component
 * Reusable component for selecting invoices across different modules
 * 
 * @param {Object} props
 * @param {string} props.customerId - Customer ID to fetch invoices for
 * @param {Function} props.onSelect - Callback when invoice is selected
 * @param {Object} props.filters - Additional filters to apply
 * @param {string} props.mode - Selection mode: 'single', 'multiple', 'returnable'
 * @param {boolean} props.showReturnStatus - Show return status for each invoice
 * @param {boolean} props.showPaymentStatus - Show payment status
 * @param {boolean} props.showItems - Load and show invoice items
 * @param {string} props.title - Custom title for the selector
 * @param {Function} props.filterPredicate - Custom filter function
 * @param {number} props.pageSize - Number of items per page (default: 10)
 */
const InvoiceSelector = ({
  customerId,
  onSelect,
  filters = {},
  mode = 'single',
  showReturnStatus = false,
  showPaymentStatus = true,
  showItems = false,
  title = 'Select Invoice',
  filterPredicate = null,
  pageSize = 10,
  className = '',
  onClose = null
}) => {
  // State management
  const [invoices, setInvoices] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selectedInvoices, setSelectedInvoices] = useState(mode === 'multiple' ? [] : null);
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  
  // Local filters state
  const [localFilters, setLocalFilters] = useState({
    dateFrom: filters.dateFrom || '',
    dateTo: filters.dateTo || '',
    status: filters.status || 'all',
    minAmount: filters.minAmount || '',
    maxAmount: filters.maxAmount || '',
    hasReturns: filters.hasReturns || 'all',
    ...filters
  });

  // Fetch invoices when customer or filters change
  const fetchInvoices = useCallback(async () => {
    if (!customerId) {
      setInvoices([]);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Use the existing working getInvoices method
      const response = await InvoiceApiService.getInvoices({
        customer_id: customerId,
        limit: pageSize,
        offset: (currentPage - 1) * pageSize,
        // Pass backend filters if supported
        date_from: localFilters.dateFrom,
        date_to: localFilters.dateTo,
        payment_status: localFilters.status !== 'all' ? localFilters.status : undefined,
        min_amount: localFilters.minAmount,
        max_amount: localFilters.maxAmount
      });

      if (response.success && response.data) {
        let processedInvoices = response.data.invoices || response.data || [];
        
        // Transform invoice data to consistent format
        processedInvoices = processedInvoices.map(invoice => ({
          id: invoice.invoice_id || invoice.id,
          invoice_number: invoice.invoice_number,
          invoice_date: invoice.invoice_date,
          customer_name: invoice.customer_name || '',
          total_amount: parseFloat(invoice.final_amount || invoice.total_amount || 0),
          paid_amount: parseFloat(invoice.paid_amount || 0),
          credit_amount: parseFloat(invoice.credit_amount || 0),
          payment_status: invoice.payment_status || 'pending',
          items: invoice.items || [],
          has_returns: invoice.has_returns || false,
          return_count: invoice.return_count || 0,
          returnable: mode === 'returnable' ? (invoice.returnable !== false) : true,
          // Calculate outstanding amount
          outstanding: parseFloat(invoice.final_amount || invoice.total_amount || 0) - 
                      parseFloat(invoice.paid_amount || 0)
        }));

        // Apply custom filter predicate if provided
        if (filterPredicate) {
          processedInvoices = processedInvoices.filter(filterPredicate);
        }

        // Apply local search filter
        if (searchTerm) {
          processedInvoices = processedInvoices.filter(invoice => 
            invoice.invoice_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
            invoice.customer_name.toLowerCase().includes(searchTerm.toLowerCase())
          );
        }

        // Filter for returnable invoices if in returnable mode
        if (mode === 'returnable') {
          processedInvoices = processedInvoices.filter(invoice => invoice.returnable);
        }

        // Apply has returns filter
        if (localFilters.hasReturns === 'yes') {
          processedInvoices = processedInvoices.filter(invoice => invoice.has_returns);
        } else if (localFilters.hasReturns === 'no') {
          processedInvoices = processedInvoices.filter(invoice => !invoice.has_returns);
        }

        setInvoices(processedInvoices);
        
        // Update pagination
        const total = response.data.total || response.data.total_count || processedInvoices.length;
        setTotalCount(total);
        setTotalPages(Math.ceil(total / pageSize));
      }
    } catch (err) {
      console.error('Error fetching invoices:', err);
      setError('Failed to load invoices. Please try again.');
      setInvoices([]);
    } finally {
      setLoading(false);
    }
  }, [customerId, currentPage, pageSize, localFilters, searchTerm, filterPredicate, mode]);

  // Fetch invoices on mount and when dependencies change
  useEffect(() => {
    fetchInvoices();
  }, [fetchInvoices]);

  // Handle invoice selection
  const handleSelect = (invoice) => {
    if (mode === 'multiple') {
      const isSelected = selectedInvoices.some(inv => inv.id === invoice.id);
      if (isSelected) {
        setSelectedInvoices(selectedInvoices.filter(inv => inv.id !== invoice.id));
      } else {
        setSelectedInvoices([...selectedInvoices, invoice]);
      }
    } else {
      setSelectedInvoices(invoice);
      if (onSelect) {
        onSelect(invoice);
      }
    }
  };

  // Handle confirm for multiple selection
  const handleConfirmSelection = () => {
    if (mode === 'multiple' && onSelect) {
      onSelect(selectedInvoices);
    }
  };

  // Reset filters
  const resetFilters = () => {
    setLocalFilters({
      dateFrom: '',
      dateTo: '',
      status: 'all',
      minAmount: '',
      maxAmount: '',
      hasReturns: 'all'
    });
    setSearchTerm('');
    setCurrentPage(1);
  };

  // Get payment status badge color
  const getStatusColor = (status) => {
    switch (status?.toLowerCase()) {
      case 'paid': return 'bg-green-100 text-green-800';
      case 'partial': return 'bg-yellow-100 text-yellow-800';
      case 'pending': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  // Check if invoice is selected
  const isSelected = (invoice) => {
    if (mode === 'multiple') {
      return selectedInvoices.some(inv => inv.id === invoice.id);
    }
    return selectedInvoices?.id === invoice.id;
  };

  return (
    <div className={`bg-white rounded-lg shadow-sm ${className}`}>
      {/* Header */}
      <div className="p-4 border-b border-gray-200">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
            <FileText className="w-5 h-5" />
            {title}
          </h3>
          {onClose && (
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>

        {/* Search and Filters */}
        <div className="space-y-3">
          {/* Search Bar */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search by invoice number or customer..."
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          {/* Filter Controls */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StandardDatePicker
              value={localFilters.dateFrom}
              onChange={(date) => setLocalFilters({...localFilters, dateFrom: date})}
              placeholder="From Date"
              className="w-full"
            />
            
            <StandardDatePicker
              value={localFilters.dateTo}
              onChange={(date) => setLocalFilters({...localFilters, dateTo: date})}
              placeholder="To Date"
              className="w-full"
            />
            
            <Select
              value={localFilters.status}
              onChange={(value) => setLocalFilters({...localFilters, status: value})}
              options={[
                { value: 'all', label: 'All Status' },
                { value: 'paid', label: 'Paid' },
                { value: 'partial', label: 'Partial' },
                { value: 'pending', label: 'Pending' }
              ]}
              className="w-full"
            />

            {showReturnStatus && (
              <Select
                value={localFilters.hasReturns}
                onChange={(value) => setLocalFilters({...localFilters, hasReturns: value})}
                options={[
                  { value: 'all', label: 'All Invoices' },
                  { value: 'yes', label: 'Has Returns' },
                  { value: 'no', label: 'No Returns' }
                ]}
                className="w-full"
              />
            )}
          </div>

          {/* Amount Range Filters */}
          <div className="flex gap-3 items-center">
            <input
              type="number"
              value={localFilters.minAmount}
              onChange={(e) => setLocalFilters({...localFilters, minAmount: e.target.value})}
              placeholder="Min Amount"
              className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            />
            <span className="text-gray-500">to</span>
            <input
              type="number"
              value={localFilters.maxAmount}
              onChange={(e) => setLocalFilters({...localFilters, maxAmount: e.target.value})}
              placeholder="Max Amount"
              className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            />
            <button
              onClick={resetFilters}
              className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg"
            >
              Reset
            </button>
          </div>
        </div>
      </div>

      {/* Invoice List */}
      <div className="p-4">
        {loading ? (
          <div className="flex justify-center py-8">
            <LoadingSpinner />
          </div>
        ) : error ? (
          <div className="text-center py-8">
            <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-3" />
            <p className="text-red-600">{error}</p>
            <button
              onClick={fetchInvoices}
              className="mt-3 text-blue-600 hover:text-blue-800"
            >
              Retry
            </button>
          </div>
        ) : invoices.length === 0 ? (
          <div className="text-center py-8">
            <Package className="w-12 h-12 text-gray-400 mx-auto mb-3" />
            <p className="text-gray-500">No invoices found</p>
            {searchTerm || Object.values(localFilters).some(v => v && v !== 'all') ? (
              <button
                onClick={resetFilters}
                className="mt-3 text-blue-600 hover:text-blue-800"
              >
                Clear filters
              </button>
            ) : null}
          </div>
        ) : (
          <div className="space-y-3">
            {invoices.map((invoice) => (
              <div
                key={invoice.id}
                onClick={() => handleSelect(invoice)}
                className={`
                  p-4 border rounded-lg cursor-pointer transition-all
                  ${isSelected(invoice) 
                    ? 'border-blue-500 bg-blue-50' 
                    : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                  }
                  ${!invoice.returnable && mode === 'returnable' ? 'opacity-50 cursor-not-allowed' : ''}
                `}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <span className="font-semibold text-gray-900">
                        {invoice.invoice_number}
                      </span>
                      <span className="text-sm text-gray-500">
                        {formatDate(invoice.invoice_date)}
                      </span>
                      {showPaymentStatus && (
                        <span className={`px-2 py-1 text-xs rounded-full ${getStatusColor(invoice.payment_status)}`}>
                          {invoice.payment_status}
                        </span>
                      )}
                      {showReturnStatus && invoice.has_returns && (
                        <span className="px-2 py-1 text-xs rounded-full bg-purple-100 text-purple-800">
                          <RotateCcw className="w-3 h-3 inline mr-1" />
                          {invoice.return_count} Return(s)
                        </span>
                      )}
                    </div>
                    
                    <div className="flex items-center gap-4 text-sm text-gray-600">
                      <span className="flex items-center gap-1">
                        <DollarSign className="w-4 h-4" />
                        Total: {formatCurrency(invoice.total_amount)}
                      </span>
                      {invoice.outstanding > 0 && (
                        <span className="flex items-center gap-1 text-orange-600">
                          <Clock className="w-4 h-4" />
                          Due: {formatCurrency(invoice.outstanding)}
                        </span>
                      )}
                      {invoice.customer_name && (
                        <span>{invoice.customer_name}</span>
                      )}
                    </div>

                    {showItems && invoice.items?.length > 0 && (
                      <div className="mt-2 text-xs text-gray-500">
                        {invoice.items.length} item(s)
                      </div>
                    )}
                  </div>

                  {mode === 'multiple' && (
                    <input
                      type="checkbox"
                      checked={isSelected(invoice)}
                      onChange={() => {}}
                      className="mt-1"
                    />
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="mt-4 flex items-center justify-between">
            <div className="text-sm text-gray-600">
              Showing {((currentPage - 1) * pageSize) + 1} - {Math.min(currentPage * pageSize, totalCount)} of {totalCount}
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCurrentPage(currentPage - 1)}
                disabled={currentPage === 1}
                className="p-2 rounded-lg border border-gray-300 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="px-3 py-1 text-sm">
                Page {currentPage} of {totalPages}
              </span>
              <button
                onClick={() => setCurrentPage(currentPage + 1)}
                disabled={currentPage === totalPages}
                className="p-2 rounded-lg border border-gray-300 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* Multiple Selection Footer */}
        {mode === 'multiple' && selectedInvoices.length > 0 && (
          <div className="mt-4 p-3 bg-blue-50 rounded-lg flex items-center justify-between">
            <span className="text-sm text-blue-800">
              {selectedInvoices.length} invoice(s) selected
            </span>
            <button
              onClick={handleConfirmSelection}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              Confirm Selection
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default InvoiceSelector;