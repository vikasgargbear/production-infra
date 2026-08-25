import React, { useState, forwardRef } from 'react';
import { Search, FileText, Calendar, ChevronRight, Package, Truck, AlertCircle } from 'lucide-react';
import { formatCalendarDate } from '../../../utils/calendarDate';

// ==================== TYPE DEFINITIONS ====================

interface PurchaseInvoice {
  supplier_invoice_id?: number | string;
  grn_id?: number | string;
  supplier_invoice_number?: string;
  invoice_number?: string;
  invoice_date?: string;
  grn_date?: string;
  grn_number?: string;
  supplier_name?: string;
  total_amount?: number | string | null;
  invoice_amount?: number | string | null;
  has_returns?: boolean;
  can_return?: boolean;
  total_items?: number | null;
  grn_ids?: string[];
  [key: string]: unknown;
}

interface PurchaseReturnSelectorProps {
  invoices?: PurchaseInvoice[];
  onInvoiceSelect: (invoice: PurchaseInvoice) => void;
  loading?: boolean;
  invoiceType?: 'supplier' | 'grn';
}

export interface PurchaseReturnSelectorHandle {
  // Reserved for future ref methods
}

// ==================== COMPONENT ====================

/**
 * PurchaseReturnSelector
 * Used to select a purchase invoice or GRN for processing supplier returns.
 * Formerly known as SupplierInvoiceSelector.
 */
const PurchaseReturnSelector = forwardRef<HTMLInputElement, PurchaseReturnSelectorProps>(({
  invoices = [],
  onInvoiceSelect,
  loading = false,
  invoiceType = 'supplier' // 'supplier' or 'grn'
}, ref) => {
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [selectedInvoiceId, setSelectedInvoiceId] = useState<string | number | null>(null);

  // Filter invoices based on search
  const filteredInvoices = invoices.filter((invoice: PurchaseInvoice) => {
    const search = searchTerm.toLowerCase();
    return (
      invoice.supplier_invoice_number?.toLowerCase().includes(search) ||
      invoice.invoice_number?.toLowerCase().includes(search) ||
      invoice.supplier_name?.toLowerCase().includes(search) ||
      invoice.grn_number?.toLowerCase().includes(search)
    );
  });

  const handleSelect = (invoice: PurchaseInvoice): void => {
    setSelectedInvoiceId(invoice.supplier_invoice_id ?? invoice.grn_id ?? null);
    onInvoiceSelect(invoice);
  };

  const formatAmount = (value: PurchaseInvoice['total_amount']): string => {
    if (value === null || value === undefined || value === '') return 'Amount unavailable';
    const numeric = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(numeric)) return 'Invalid amount';
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(numeric);
  };

  return (
    <div className="space-y-4">
      {/* Search Bar */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
        <input
          ref={ref}
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          placeholder="Search by invoice number, GRN number, or supplier name..."
          className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
        />
      </div>

      {/* Loading State */}
      {loading && (
        <div className="text-center py-8">
          <div className="animate-spin w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full mx-auto"></div>
          <p className="text-gray-600 mt-2">Loading supplier invoices...</p>
        </div>
      )}

      {/* Invoice List */}
      {!loading && filteredInvoices.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredInvoices.map((invoice) => {
            const invoiceId = invoice.supplier_invoice_id ?? invoice.grn_id;
            const invoiceNumber = invoice.supplier_invoice_number ?? invoice.invoice_number;
            const invoiceDate = invoice.invoice_date ?? invoice.grn_date;
            const totalAmount = invoice.total_amount ?? invoice.invoice_amount;
            const hasGrn = invoice.grn_ids && invoice.grn_ids.length > 0;

            return (
              <button
                type="button"
                key={invoiceId}
                onClick={() => handleSelect(invoice)}
                aria-label={`Select supplier invoice ${invoiceNumber}`}
                className={`border rounded-lg p-4 cursor-pointer transition-all ${selectedInvoiceId === invoiceId
                  ? 'border-orange-500 bg-orange-50'
                  : 'border-gray-200 hover:border-orange-300 hover:bg-gray-50'
                  } text-left`}
              >
                <div className="flex justify-between items-start mb-3">
                  <div className="flex items-center gap-2">
                    <FileText className="w-5 h-5 text-gray-600" />
                    <h4 className="font-semibold text-gray-900">#{invoiceNumber || 'Number unavailable'}</h4>
                  </div>
                  <ChevronRight className="w-4 h-4 text-gray-400" />
                </div>

                <div className="space-y-2 text-sm">
                  <div className="flex items-center gap-2 text-gray-600">
                    <Calendar className="w-4 h-4" />
                    <span>{invoiceDate ? formatCalendarDate(invoiceDate) : 'Unavailable'}</span>
                  </div>

                  <div className="text-gray-600">
                    <span className="font-medium">Supplier:</span> {invoice.supplier_name || 'Unavailable'}
                  </div>

                  <div className="text-gray-600">
                    <span className="font-medium">Amount:</span> {formatAmount(totalAmount)}
                  </div>

                  {hasGrn && (
                    <div className="flex items-center gap-2 text-green-600">
                      <Truck className="w-4 h-4" />
                      <span className="text-xs">Has GRN</span>
                    </div>
                  )}

                  {invoice.has_returns && (
                    <div className="flex items-center gap-2 text-orange-600">
                      <AlertCircle className="w-4 h-4" />
                      <span className="text-xs">Has Previous Returns</span>
                    </div>
                  )}

                  <div className="pt-2 border-t border-gray-100">
                    <div className="flex items-center gap-2 text-xs text-gray-500">
                      <Package className="w-3 h-3" />
                      <span>
                        {invoice.total_items === null || invoice.total_items === undefined
                          ? 'Item count unavailable'
                          : `${invoice.total_items} items`} •
                        {invoice.can_return === true
                          ? ' Returnable'
                          : invoice.can_return === false
                            ? ' Non-returnable'
                            : ' Return authority pending context'}
                      </span>
                    </div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}

      {/* No Results */}
      {!loading && filteredInvoices.length === 0 && (
        <div className="text-center py-8">
          <FileText className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-600">
            {searchTerm ? 'No invoices found matching your search' : 'No returnable supplier invoices found'}
          </p>
          <p className="text-sm text-gray-500 mt-2">
            Make sure the supplier has delivered goods first
          </p>
        </div>
      )}
    </div>
  );
});

PurchaseReturnSelector.displayName = 'PurchaseReturnSelector';

export default PurchaseReturnSelector;
