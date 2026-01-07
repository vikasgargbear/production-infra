import React, { useState, useEffect } from 'react';
import { X, Search, FileText, Truck, ShoppingCart, Calendar, Package, CheckCircle } from 'lucide-react';
import { toast } from 'react-toastify';

interface DocumentItem {
  item_id?: number;
  product_id: string | number;
  product_name: string;
  product_code?: string;
  batch_id?: string;
  batch_number?: string;
  hsn_code?: string;
  expiry_date?: string;
  quantity: number;
  dispatched_quantity?: number;
  mrp?: number;
  unit_price?: number;
  sale_price?: number;
  discount_percent?: number;
  free_quantity?: number;
  gst_percent?: number;
  tax_rate?: number;
  available_quantity?: number;
}

interface ImportData {
  source_type: string;
  source_id: string | number;
  customer_id?: string | number;
  customer_name?: string;
  items: DocumentItem[];
  transport_details?: any;
  payment_details?: any;
  notes?: string;
  reference_number?: string;
}

interface DocumentImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImport: (data: ImportData) => void;
  documentTypes?: Array<{
    value: string;
    label: string;
    icon?: React.ComponentType<any>;
    loadFunction: (searchQuery?: string) => Promise<any[]>;
  }>;
  title?: string;
}

const DocumentImportModal: React.FC<DocumentImportModalProps> = ({
  isOpen,
  onClose,
  onImport,
  documentTypes = [],
  title = "Import from Document"
}) => {
  const [selectedType, setSelectedType] = useState(documentTypes[0]?.value || '');
  const [searchQuery, setSearchQuery] = useState('');
  const [documents, setDocuments] = useState<any[]>([]);
  const [selectedDoc, setSelectedDoc] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    if (isOpen && selectedType) {
      loadDocuments();
    }
  }, [isOpen, selectedType]);

  const loadDocuments = async () => {
    setLoading(true);
    try {
      const typeConfig = documentTypes.find(t => t.value === selectedType);
      if (typeConfig && typeConfig.loadFunction) {
        const results = await typeConfig.loadFunction(searchQuery);
        setDocuments(Array.isArray(results) ? results : []);
      }
    } catch (error) {
      toast.error('Failed to load documents');
      setDocuments([]);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = () => {
    loadDocuments();
  };

  const handleImport = () => {
    if (!selectedDoc) {
      toast.warning('Please select a document to import');
      return;
    }

    setImporting(true);

    try {
      // Format items for import
      const formattedItems = (selectedDoc.items || []).map((item: any) => ({
        product_id: item.product_id,
        product_name: item.product_name || item.name,
        product_code: item.product_code || item.code,
        batch_id: item.batch_id,
        batch_number: item.batch_number || item.batch_number,
        hsn_code: item.hsn_code,
        expiry_date: item.expiry_date,
        quantity: parseFloat(item.quantity || item.dispatched_quantity || '0'),
        mrp: parseFloat(item.mrp || '0'),
        unit_price: parseFloat(item.unit_price || item.unit_price || item.sale_price || '0'),
        discount_percent: parseFloat(item.discount_percent || '0'),
        free_quantity: parseFloat(item.free_quantity || '0'),
        tax_rate: parseFloat(item.tax_rate || item.gst_percent || '0')
      }));

      const importData: ImportData = {
        source_type: selectedType,
        source_id: selectedDoc.id || selectedDoc.invoice_id || selectedDoc.order_id || selectedDoc.challan_id,
        customer_id: selectedDoc.customer_id,
        customer_name: selectedDoc.customer_name,
        items: formattedItems,
        transport_details: selectedDoc.transport_details,
        payment_details: selectedDoc.payment_details,
        notes: selectedDoc.notes,
        reference_number: selectedDoc.invoice_number || selectedDoc.order_number || selectedDoc.challan_number
      };

      onImport(importData);
      toast.success(`Data imported from ${selectedType}`);
      onClose();
    } catch (error) {
      toast.error('Failed to import document data');
    } finally {
      setImporting(false);
    }
  };

  const formatDate = (dateString: string) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-IN');
  };

  const formatCurrency = (amount: number) => {
    return `₹${(amount || 0).toFixed(2)}`;
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-800">{title}</h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Document Type Selector */}
        {documentTypes.length > 0 && (
          <div className="p-4 border-b border-gray-200">
            <div className="flex space-x-2">
              {documentTypes.map((type) => {
                const Icon = type.icon || FileText;
                return (
                  <button
                    key={type.value}
                    onClick={() => setSelectedType(type.value)}
                    className={`
                      flex items-center space-x-2 px-4 py-2 rounded-lg transition-colors
                      ${selectedType === type.value
                        ? 'bg-blue-50 text-blue-600 border border-blue-300'
                        : 'bg-gray-50 text-gray-600 border border-gray-200 hover:bg-gray-100'
                      }
                    `}
                  >
                    <Icon className="w-4 h-4" />
                    <span className="text-sm font-medium">{type.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Search Bar */}
        <div className="p-4 border-b border-gray-200">
          <div className="flex space-x-2">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                placeholder={`Search ${selectedType}s by number or customer...`}
                className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <button
              onClick={handleSearch}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              Search
            </button>
          </div>
        </div>

        {/* Documents List */}
        <div className="flex-1 overflow-y-auto p-4" style={{ maxHeight: '400px' }}>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
          ) : documents.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              No {selectedType}s found
            </div>
          ) : (
            <div className="space-y-2">
              {documents.map((doc) => (
                <div
                  key={doc.id || doc.invoice_id || doc.order_id || doc.challan_id}
                  onClick={() => setSelectedDoc(doc)}
                  className={`
                    p-4 border rounded-lg cursor-pointer transition-all
                    ${selectedDoc?.id === doc.id ||
                      selectedDoc?.invoice_id === doc.invoice_id ||
                      selectedDoc?.order_id === doc.order_id ||
                      selectedDoc?.challan_id === doc.challan_id
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                    }
                  `}
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="flex items-center space-x-2">
                        <span className="font-medium text-gray-900">
                          {doc.invoice_number || doc.order_number || doc.challan_number || `#${doc.id}`}
                        </span>
                        {doc.status && (
                          <span className={`
                            px-2 py-0.5 text-xs rounded-full
                            ${doc.status === 'completed' || doc.status === 'paid'
                              ? 'bg-green-100 text-green-700'
                              : doc.status === 'pending'
                                ? 'bg-yellow-100 text-yellow-700'
                                : 'bg-gray-100 text-gray-700'
                            }
                          `}>
                            {doc.status}
                          </span>
                        )}
                      </div>
                      <div className="mt-1 text-sm text-gray-600">
                        <span>{doc.customer_name || 'Unknown Customer'}</span>
                        {doc.date && (
                          <span className="ml-3">
                            <Calendar className="w-3 h-3 inline mr-1" />
                            {formatDate(doc.date)}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-semibold text-gray-900">
                        {formatCurrency(doc.total_amount || doc.net_amount || 0)}
                      </div>
                      {doc.items && (
                        <div className="text-xs text-gray-500 mt-1">
                          {doc.items.length} items
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Selected Document Details */}
        {selectedDoc && (
          <div className="p-4 border-t border-gray-200 bg-gray-50">
            <div className="text-sm text-gray-600">
              <div className="font-medium text-gray-900 mb-2">Selected Document Items:</div>
              <div className="max-h-32 overflow-y-auto">
                {(selectedDoc.items || []).map((item: any, index: number) => (
                  <div key={index} className="flex justify-between py-1">
                    <span>{item.product_name || item.name}</span>
                    <span className="text-gray-500">
                      Qty: {item.quantity || item.dispatched_quantity}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="p-4 border-t border-gray-200 flex justify-end space-x-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleImport}
            disabled={!selectedDoc || importing}
            className={`
              px-4 py-2 rounded-lg transition-colors flex items-center space-x-2
              ${selectedDoc && !importing
                ? 'bg-blue-600 text-white hover:bg-blue-700'
                : 'bg-gray-300 text-gray-500 cursor-not-allowed'
              }
            `}
          >
            {importing ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                <span>Importing...</span>
              </>
            ) : (
              <>
                <CheckCircle className="w-4 h-4" />
                <span>Import Selected</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default DocumentImportModal;