import React, { useState } from 'react';
import { X, Search, FileText, ShoppingCart, Calendar, FileInput } from 'lucide-react';
import { invoicesApi } from '../../../services/api/modules/invoices.api';
import { ordersApi } from '../../../services/api/modules/orders.api';

const ImportFromInvoiceModal = ({ isOpen, onClose, onImport }) => {
  const [searchType, setSearchType] = useState('invoice');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [selectedDoc, setSelectedDoc] = useState(null);
  const [loading, setLoading] = useState(false);

  // Load recent documents on mount
  React.useEffect(() => {
    if (isOpen) {
      loadRecentDocuments();
    }
  }, [isOpen, searchType]);

  const loadRecentDocuments = async () => {
    setLoading(true);
    try {
      let results = [];
      if (searchType === 'invoice') {
        // Get recent invoices (last 10)
        const response = await invoicesApi.getAll({ 
          limit: 10,
          sort: 'invoice_date',
          order: 'desc'
        });
        results = response.data || [];
      } else {
        // Get recent orders (last 10)
        const response = await ordersApi.getAll({ 
          limit: 10,
          order_type: 'sales',
          sort: 'order_date',
          order: 'desc'
        });
        results = response.data || [];
      }
      setSearchResults(results);
    } catch (error) {
      console.error('Error loading recent documents:', error);
      setSearchResults([]);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      // If search is empty, load recent documents
      loadRecentDocuments();
      return;
    }

    setLoading(true);
    try {
      let results = [];
      if (searchType === 'invoice') {
        const response = await invoicesApi.search(searchQuery);
        results = response.data || [];
      } else {
        const response = await ordersApi.getAll({ 
          search: searchQuery,
          order_type: 'sales'
        });
        results = response.data || [];
      }
      setSearchResults(results);
    } catch (error) {
      console.error('Search error:', error);
      setSearchResults([]);
    } finally {
      setLoading(false);
    }
  };

  const handleImport = () => {
    if (!selectedDoc) return;

    // Transform invoice/order data to challan format
    const importData = {
      customer_id: selectedDoc.customer_id,
      customer_name: selectedDoc.customer_name,
      customer_details: selectedDoc.customer_details || {
        customer_id: selectedDoc.customer_id,
        customer_name: selectedDoc.customer_name,
        address: selectedDoc.billing_address,
        city: selectedDoc.billing_city,
        state: selectedDoc.billing_state,
        pincode: selectedDoc.billing_pincode,
        phone: selectedDoc.customer_phone,
        gstin: selectedDoc.customer_gstin
      },
      billing_address: selectedDoc.billing_address,
      delivery_address: selectedDoc.shipping_address || selectedDoc.billing_address,
      delivery_city: selectedDoc.shipping_city || selectedDoc.billing_city,
      delivery_state: selectedDoc.shipping_state || selectedDoc.billing_state,
      delivery_pincode: selectedDoc.shipping_pincode || selectedDoc.billing_pincode,
      items: (selectedDoc.items || selectedDoc.invoice_items || []).map(item => ({
        id: Date.now() + Math.random(),
        product_id: item.product_id,
        product_name: item.product_name,
        hsn_code: item.hsn_code,
        quantity: item.quantity,
        unit: item.unit || 'NOS',
        mrp: item.mrp,
        unit_price: item.unit_price || item.selling_price,
        gst_percent: item.tax_percent || item.gst_percent || 18,
        manufacturer: item.manufacturer,
        category: item.category
      })),
      reference_doc: searchType === 'invoice' ? 
        `Invoice: ${selectedDoc.invoice_number}` : 
        `Order: ${selectedDoc.order_number}`,
      notes: `Delivery for ${searchType === 'invoice' ? 'Invoice' : 'Order'} #${selectedDoc.invoice_number || selectedDoc.order_number}`
    };

    onImport(importData);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg w-full max-w-3xl mx-4 max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <h3 className="text-lg font-semibold">Import from Invoice/Order</h3>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {/* Document Type */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">Document Type</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => {
                  setSearchType('invoice');
                  setSearchQuery('');
                }}
                className={`p-3 rounded-lg border-2 ${
                  searchType === 'invoice' 
                    ? 'border-blue-500 bg-blue-50' 
                    : 'border-gray-300'
                }`}
              >
                <FileText className="w-5 h-5 mx-auto mb-1" />
                <span className="text-sm">Sales Invoice</span>
              </button>
              <button
                onClick={() => {
                  setSearchType('order');
                  setSearchQuery('');
                }}
                className={`p-3 rounded-lg border-2 ${
                  searchType === 'order' 
                    ? 'border-blue-500 bg-blue-50' 
                    : 'border-gray-300'
                }`}
              >
                <ShoppingCart className="w-5 h-5 mx-auto mb-1" />
                <span className="text-sm">Sales Order</span>
              </button>
            </div>
          </div>

          {/* Search */}
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">Search Document</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                placeholder={`Enter ${searchType === 'invoice' ? 'invoice' : 'order'} number or customer name`}
                className="flex-1 px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
              />
              <button
                onClick={handleSearch}
                disabled={loading}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400"
              >
                {loading ? '...' : 'Search'}
              </button>
            </div>
          </div>

          {/* Results */}
          {searchResults.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-sm font-medium text-gray-700">
                {searchQuery ? 'Search Results' : `Recent ${searchType === 'invoice' ? 'Invoices' : 'Orders'}`}
              </h4>
              <div className="max-h-64 overflow-y-auto">
                {searchResults.map((doc) => (
                  <div
                  key={doc.invoice_id || doc.order_id}
                  onClick={() => setSelectedDoc(doc)}
                  className={`p-3 border rounded-lg cursor-pointer ${
                    selectedDoc?.invoice_id === doc.invoice_id || selectedDoc?.order_id === doc.order_id
                      ? 'border-blue-500 bg-blue-50' 
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="font-medium">
                        {searchType === 'invoice' ? doc.invoice_number : doc.order_number}
                      </div>
                      <div className="text-sm text-gray-600">{doc.customer_name}</div>
                      <div className="text-xs text-gray-500 flex items-center gap-2 mt-1">
                        <Calendar className="w-3 h-3" />
                        {new Date(doc.invoice_date || doc.order_date).toLocaleDateString()}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-medium">
                        ₹{(doc.total_amount || 0).toFixed(2)}
                      </div>
                      <div className="text-xs text-gray-500">
                        {doc.items?.length || doc.invoice_items?.length || 0} items
                      </div>
                      {doc.payment_status && (
                        <div className={`text-xs mt-1 px-2 py-0.5 rounded-full inline-block ${
                          doc.payment_status === 'paid' ? 'bg-green-100 text-green-700' :
                          doc.payment_status === 'partial' ? 'bg-yellow-100 text-yellow-700' :
                          'bg-red-100 text-red-700'
                        }`}>
                          {doc.payment_status}
                        </div>
                      )}
                    </div>
                  </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 p-4 border-t">
          <button
            onClick={onClose}
            className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={handleImport}
            disabled={!selectedDoc}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400"
          >
            Import to Challan
          </button>
        </div>
      </div>
    </div>
  );
};

export default ImportFromInvoiceModal;