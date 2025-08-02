import React, { useState, forwardRef } from 'react';
import { Search, FileText, Calendar, ChevronRight, Package } from 'lucide-react';

const PurchaseInvoiceSelector = forwardRef(({ purchases = [], onPurchaseSelect, loading }, ref) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedPurchaseId, setSelectedPurchaseId] = useState(null);

  // Filter purchases based on search
  const filteredPurchases = purchases.filter(purchase => {
    const search = searchTerm.toLowerCase();
    return (
      purchase.invoice_number?.toLowerCase().includes(search) ||
      purchase.supplier_name?.toLowerCase().includes(search)
    );
  });

  const handleSelect = (purchase) => {
    setSelectedPurchaseId(purchase.purchase_id);
    onPurchaseSelect(purchase);
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
          placeholder="Search by invoice number or supplier name..."
          className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent"
        />
      </div>

      {/* Loading State */}
      {loading && (
        <div className="text-center py-8">
          <div className="animate-spin w-8 h-8 border-2 border-orange-500 border-t-transparent rounded-full mx-auto"></div>
          <p className="text-gray-600 mt-2">Loading purchase invoices...</p>
        </div>
      )}

      {/* Purchase List */}
      {!loading && filteredPurchases.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredPurchases.map((purchase) => (
            <div
              key={purchase.purchase_id}
              onClick={() => handleSelect(purchase)}
              className={`border rounded-lg p-4 cursor-pointer transition-all ${
                selectedPurchaseId === purchase.purchase_id
                  ? 'border-orange-500 bg-orange-50'
                  : 'border-gray-200 hover:border-orange-300 hover:bg-gray-50'
              }`}
            >
              <div className="flex justify-between items-start mb-3">
                <div className="flex items-center gap-2">
                  <FileText className="w-5 h-5 text-gray-600" />
                  <h4 className="font-semibold text-gray-900">#{purchase.invoice_number}</h4>
                </div>
                <ChevronRight className="w-4 h-4 text-gray-400" />
              </div>

              <div className="space-y-2 text-sm">
                <div className="flex items-center gap-2 text-gray-600">
                  <Calendar className="w-4 h-4" />
                  <span>{new Date(purchase.invoice_date).toLocaleDateString()}</span>
                </div>
                
                <div className="text-gray-600">
                  <span className="font-medium">Amount:</span> ₹{purchase.total_amount}
                </div>

                {purchase.has_returns && (
                  <div className="text-orange-600">
                    <span className="font-medium">Has Previous Returns</span>
                  </div>
                )}

                <div className="pt-2 border-t border-gray-100">
                  <div className="flex items-center gap-2 text-xs text-gray-500">
                    <Package className="w-3 h-3" />
                    <span>
                      {purchase.total_items} items • {purchase.can_return ? 'Returnable' : 'No returns'}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* No Results */}
      {!loading && filteredPurchases.length === 0 && (
        <div className="text-center py-8">
          <FileText className="w-12 h-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-600">
            {searchTerm ? 'No purchases found matching your search' : 'No returnable purchases found'}
          </p>
        </div>
      )}
    </div>
  );
});

PurchaseInvoiceSelector.displayName = 'PurchaseInvoiceSelector';

export default PurchaseInvoiceSelector;