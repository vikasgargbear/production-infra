import React, { useState, forwardRef } from 'react';
import { Search, FileText, Calendar, ChevronRight, Package, Truck, AlertCircle } from 'lucide-react';

const SupplierInvoiceSelector = forwardRef(({ 
  invoices = [], 
  onInvoiceSelect, 
  loading,
  invoiceType = 'supplier' // 'supplier' or 'grn'
}, ref) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedInvoiceId, setSelectedInvoiceId] = useState(null);

  // Filter invoices based on search
  const filteredInvoices = invoices.filter(invoice => {
    const search = searchTerm.toLowerCase();
    return (
      invoice.supplier_invoice_number?.toLowerCase().includes(search) ||
      invoice.invoice_number?.toLowerCase().includes(search) ||
      invoice.supplier_name?.toLowerCase().includes(search) ||
      invoice.grn_number?.toLowerCase().includes(search)
    );
  });

  const handleSelect = (invoice) => {
    setSelectedInvoiceId(invoice.supplier_invoice_id || invoice.grn_id);
    onInvoiceSelect(invoice);
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
            const invoiceId = invoice.supplier_invoice_id || invoice.grn_id;
            const invoiceNumber = invoice.supplier_invoice_number || invoice.invoice_number;
            const invoiceDate = invoice.invoice_date || invoice.grn_date;
            const totalAmount = invoice.total_amount || invoice.invoice_amount;
            const hasGrn = invoice.grn_ids && invoice.grn_ids.length > 0;
            
            return (
              <div
                key={invoiceId}
                onClick={() => handleSelect(invoice)}
                className={`border rounded-lg p-4 cursor-pointer transition-all ${
                  selectedInvoiceId === invoiceId
                    ? 'border-orange-500 bg-orange-50'
                    : 'border-gray-200 hover:border-orange-300 hover:bg-gray-50'
                }`}
              >
                <div className="flex justify-between items-start mb-3">
                  <div className="flex items-center gap-2">
                    <FileText className="w-5 h-5 text-gray-600" />
                    <h4 className="font-semibold text-gray-900">#{invoiceNumber}</h4>
                  </div>
                  <ChevronRight className="w-4 h-4 text-gray-400" />
                </div>

                <div className="space-y-2 text-sm">
                  <div className="flex items-center gap-2 text-gray-600">
                    <Calendar className="w-4 h-4" />
                    <span>{new Date(invoiceDate).toLocaleDateString()}</span>
                  </div>
                  
                  <div className="text-gray-600">
                    <span className="font-medium">Supplier:</span> {invoice.supplier_name}
                  </div>
                  
                  <div className="text-gray-600">
                    <span className="font-medium">Amount:</span> ₹{totalAmount?.toLocaleString() || '0'}
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
                        {invoice.total_items || 0} items • 
                        {invoice.can_return !== false ? ' Returnable' : ' Non-returnable'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
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

SupplierInvoiceSelector.displayName = 'SupplierInvoiceSelector';

export default SupplierInvoiceSelector;