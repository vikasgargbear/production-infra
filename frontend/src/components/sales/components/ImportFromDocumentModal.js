import React, { useState, useEffect } from 'react';
import { X, Search, FileText, Truck, Calendar } from 'lucide-react';
import { invoicesApi, challansAPI } from '../../../services/api';

const ImportFromDocumentModal = ({ isOpen, onClose, onImport }) => {
  const [documentType, setDocumentType] = useState('invoice');
  const [searchQuery, setSearchQuery] = useState('');
  const [documents, setDocuments] = useState([]);
  const [selectedDoc, setSelectedDoc] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
      loadDocuments();
    }
  }, [isOpen, documentType]);

  const loadDocuments = async () => {
    setLoading(true);
    try {
      let results = [];
      
      if (documentType === 'invoice') {
        // Get recent invoices
        const response = await invoicesApi.search('', { limit: 20 });
        // Handle different response formats
        results = Array.isArray(response) ? response : 
                 (response?.data && Array.isArray(response.data)) ? response.data :
                 (response?.invoices && Array.isArray(response.invoices)) ? response.invoices : [];
      } else if (documentType === 'challan') {
        // Get recent challans
        const response = await challansAPI.search({ limit: 20 });
        results = response?.data || [];
      }
      
      setDocuments(results);
    } catch (error) {
      setDocuments([]);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      loadDocuments();
      return;
    }

    setLoading(true);
    try {
      let results = [];
      
      if (documentType === 'invoice') {
        const response = await invoicesApi.search(searchQuery);
        results = Array.isArray(response) ? response : 
                 (response?.data && Array.isArray(response.data)) ? response.data :
                 (response?.invoices && Array.isArray(response.invoices)) ? response.invoices : [];
      } else if (documentType === 'challan') {
        const response = await challansAPI.search({ 
          search: searchQuery
        });
        results = response?.data || [];
      }
      
      setDocuments(results);
    } catch (error) {
      setDocuments([]);
    } finally {
      setLoading(false);
    }
  };

  const handleImport = () => {
    if (!selectedDoc) return;
    
    // Transform document data for sales order
    const importData = {
      source_type: documentType,
      source_id: documentType === 'invoice' ? selectedDoc.invoice_id : selectedDoc.challan_id,
      customer_id: selectedDoc.customer_id,
      customer_name: selectedDoc.customer_name,
      customer_phone: selectedDoc.customer_phone,
      customer_details: selectedDoc.customer_details || {
        customer_id: selectedDoc.customer_id,
        customer_name: selectedDoc.customer_name,
        phone: selectedDoc.customer_phone,
        address: selectedDoc.billing_address,
        gstin: selectedDoc.customer_gstin,
        dl_number: selectedDoc.customer_dl_number
      },
      billing_address: selectedDoc.billing_address,
      delivery_address: selectedDoc.shipping_address || selectedDoc.delivery_address,
      items: (selectedDoc.items || selectedDoc.invoice_items || []).map(item => ({
        product_id: item.product_id,
        product_name: item.product_name,
        product_code: item.product_code,
        batch_id: item.batch_id,
        batch_no: item.batch_no || item.batch_number,
        hsn_code: item.hsn_code,
        expiry_date: item.expiry_date,
        quantity: item.quantity || 0,
        mrp: item.mrp,
        rate: item.unit_price || item.rate || item.sale_price,
        sale_price: item.unit_price || item.rate || item.sale_price,
        discount_percent: item.discount_percent || 0,
        free_quantity: item.free_quantity || 0,
        gst_percent: item.gst_percent || item.tax_rate || 0
      })),
      reference_no: documentType === 'invoice' ? 
        `INV-${selectedDoc.invoice_number || selectedDoc.invoice_id}` : 
        `DC-${selectedDoc.challan_number || selectedDoc.challan_id}`,
      notes: `Created from ${documentType === 'invoice' ? 'Invoice' : 'Delivery Challan'} #${
        documentType === 'invoice' ? selectedDoc.invoice_number : selectedDoc.challan_number
      }`
    };
    
    onImport(importData);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 bg-gradient-to-r from-purple-600 to-purple-700 text-white">
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-semibold">Import from Document</h2>
            <button onClick={onClose} className="text-white hover:text-gray-200">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Document Type Selector */}
        <div className="px-6 py-4 border-b">
          <div className="flex gap-4">
            <button
              onClick={() => setDocumentType('invoice')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all ${
                documentType === 'invoice' 
                  ? 'bg-purple-100 text-purple-700 border-2 border-purple-300' 
                  : 'bg-gray-100 text-gray-600 border-2 border-transparent hover:bg-gray-200'
              }`}
            >
              <FileText className="w-4 h-4" />
              Invoices
            </button>
            <button
              onClick={() => setDocumentType('challan')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all ${
                documentType === 'challan' 
                  ? 'bg-purple-100 text-purple-700 border-2 border-purple-300' 
                  : 'bg-gray-100 text-gray-600 border-2 border-transparent hover:bg-gray-200'
              }`}
            >
              <Truck className="w-4 h-4" />
              Delivery Challans
            </button>
          </div>
        </div>

        {/* Search Bar */}
        <div className="px-6 py-4 border-b">
          <div className="flex gap-2">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
              <input
                type="text"
                placeholder={`Search ${documentType === 'invoice' ? 'invoices' : 'challans'}...`}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                className="w-full pl-10 pr-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
              />
            </div>
            <button
              onClick={handleSearch}
              className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700"
            >
              Search
            </button>
          </div>
        </div>

        {/* Documents List */}
        <div className="p-6 overflow-y-auto" style={{ maxHeight: '400px' }}>
          {loading ? (
            <div className="text-center py-8 text-gray-500">Loading...</div>
          ) : documents.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              No {documentType === 'invoice' ? 'invoices' : 'challans'} found
            </div>
          ) : (
            <div className="space-y-2">
              {documents.map((doc, index) => {
                const docId = documentType === 'invoice' ? doc.invoice_id : doc.challan_id;
                const docNumber = documentType === 'invoice' 
                  ? (doc.invoice_number || `INV-${doc.invoice_id}`)
                  : (doc.challan_number || `DC-${doc.challan_id}`);
                const docDate = documentType === 'invoice' ? doc.invoice_date : doc.challan_date;
                
                return (
                  <div
                    key={docId || `doc-${index}`}
                    onClick={() => setSelectedDoc(doc)}
                    className={`p-4 border rounded-lg cursor-pointer transition-all ${
                      selectedDoc === doc
                        ? 'border-purple-500 bg-purple-50'
                        : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <div className="flex items-center gap-3">
                          <span className="font-medium text-gray-900">{docNumber}</span>
                          {docDate && (
                            <span className="text-sm text-gray-500">
                              <Calendar className="w-3 h-3 inline mr-1" />
                              {new Date(docDate).toLocaleDateString()}
                            </span>
                          )}
                        </div>
                        <div className="mt-1 text-sm text-gray-600">
                          {doc.customer_name}
                          {doc.items && ` • ${doc.items.length} items`}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-medium text-gray-900">
                          ₹{doc.final_amount || doc.total_amount || doc.net_amount || 0}
                        </div>
                        <div className="text-sm text-gray-500">
                          {doc.status || 'Active'}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-gray-50 flex justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-700 bg-white border rounded-lg hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={handleImport}
            disabled={!selectedDoc || loading}
            className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
          >
            Import to Sales Order
          </button>
        </div>
      </div>
    </div>
  );
};

export default ImportFromDocumentModal;