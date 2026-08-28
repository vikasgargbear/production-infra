import React, { useState, useEffect, useCallback } from 'react';
import { X, Search, FileText, Calendar, CheckCircle } from 'lucide-react';
import { toast } from 'react-toastify';
import {
  projectCanonicalImportLines,
  type CanonicalImportLine,
} from '../../sales/utils/documentImport';
import { formatExactCurrency, normalizeAuthoritativeDecimal } from '../../../utils/exactDecimal';

export interface ImportData {
  source_type: string;
  source_id: string | number;
  customer_id?: string | number;
  customer_name?: string;
  customer_details?: any;
  customer?: any;
  billing_address?: string;
  shipping_address?: string;
  items: CanonicalImportLine[];
  transport_details?: any;
  delivery_details?: any;
  payment_details?: any;
  notes?: string;
  reference_number?: string;
}

export interface DocumentImportType {
  value: string;
  label: string;
  icon?: React.ComponentType<any>;
  loadFunction: (searchQuery?: string) => Promise<any[]>;
  resolveDocument?: (document: any) => Promise<any>;
}

interface DocumentImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImport: (data: ImportData) => void;
  documentTypes?: DocumentImportType[];
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
  const selectedTypeLabel = documentTypes.find(type => type.value === selectedType)?.label
    || 'documents';

  const loadDocuments = useCallback(async (query: string = '') => {
    setLoading(true);
    try {
      const typeConfig = documentTypes.find(t => t.value === selectedType);
      if (typeConfig && typeConfig.loadFunction) {
        const results = await typeConfig.loadFunction(query);
        setDocuments(Array.isArray(results) ? results : []);
      }
    } catch (error) {
      toast.error('Failed to load documents');
      setDocuments([]);
    } finally {
      setLoading(false);
    }
  }, [documentTypes, selectedType]);

  useEffect(() => {
    if (!selectedType && documentTypes[0]?.value) {
      setSelectedType(documentTypes[0].value);
    }
  }, [documentTypes, selectedType]);

  useEffect(() => {
    if (isOpen && selectedType) {
      void loadDocuments();
    }
  }, [isOpen, selectedType, loadDocuments]);

  const handleSearch = () => {
    void loadDocuments(searchQuery);
  };

  const handleImport = async () => {
    if (!selectedDoc) {
      toast.warning('Please select a document to import');
      return;
    }

    setImporting(true);

    try {
      const typeConfig = documentTypes.find(type => type.value === selectedType);
      const sourceDocument = typeConfig?.resolveDocument
        ? await typeConfig.resolveDocument(selectedDoc)
        : selectedDoc;
      const formattedItems = projectCanonicalImportLines(
        sourceDocument.items || sourceDocument.line_items,
        { requireBatch: true },
      );

      const customerDetails = sourceDocument.customer_details
        || sourceDocument.customer
        || (sourceDocument.customer_id ? {
          customer_id: sourceDocument.customer_id,
          customer_name: sourceDocument.customer_name,
        } : undefined);

      const sourceId = sourceDocument.id
        ?? sourceDocument.invoice_id
        ?? sourceDocument.order_id
        ?? sourceDocument.challan_id;
      if (sourceId === undefined || sourceId === null || String(sourceId).trim() === '') {
        throw new Error('The selected canonical document identity is unavailable.');
      }

      const importData: ImportData = {
        source_type: selectedType,
        source_id: sourceId,
        customer_id: sourceDocument.customer_id,
        customer_name: sourceDocument.customer_name,
        customer_details: customerDetails,
        customer: customerDetails,
        billing_address: sourceDocument.billing_address,
        shipping_address: sourceDocument.shipping_address || sourceDocument.delivery_address,
        items: formattedItems,
        transport_details: sourceDocument.transport_details,
        delivery_details: sourceDocument.delivery_details || sourceDocument.transport_details,
        payment_details: sourceDocument.payment_details,
        notes: sourceDocument.notes,
        reference_number: sourceDocument.invoice_number || sourceDocument.order_number || sourceDocument.challan_number
      };

      onImport(importData);
      toast.success(`Data imported from ${selectedType}`);
      onClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to import document data');
    } finally {
      setImporting(false);
    }
  };

  const formatDate = (dateString: string) => {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-IN');
  };

  const authoritativeAmount = (document: Record<string, unknown>): string | null => {
    const amount = document.total_amount ?? document.net_amount;
    if (amount === undefined || amount === null) return null;
    return normalizeAuthoritativeDecimal(amount, 'Imported document amount', {
      scale: 2, maximumWholeDigits: 20, allowNegative: true,
    });
  };

  const documentIdentity = (document: Record<string, unknown>): string => String(
    document.id ?? document.invoice_id ?? document.order_id ?? document.challan_id ?? '',
  );

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
                placeholder={`Search ${selectedTypeLabel.toLowerCase()} by number or customer...`}
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
              No {selectedTypeLabel.toLowerCase()} found
            </div>
          ) : (
            <div className="space-y-2">
              {documents.map((doc) => (
                <button
                  type="button"
                  key={doc.id || doc.invoice_id || doc.order_id || doc.challan_id}
                  data-testid={`import-document-${selectedType}-${documentIdentity(doc)}`}
                  aria-label={`Select canonical ${selectedType} ${documentIdentity(doc)}`}
                  aria-pressed={Boolean(
                    selectedDoc && documentIdentity(selectedDoc) === documentIdentity(doc),
                  )}
                  onClick={() => setSelectedDoc(doc)}
                  className={`
                    w-full p-4 border rounded-lg cursor-pointer text-left transition-all
                    ${selectedDoc && documentIdentity(selectedDoc) === documentIdentity(doc)
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                    }
                  `}
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="flex items-center space-x-2">
                        <span className="font-medium text-gray-900">
                          {doc.invoice_number || doc.order_number || doc.challan_number || 'Document number unavailable'}
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
                        <span>{doc.customer_name || 'Customer unavailable'}</span>
                        {doc.date && (
                          <span className="ml-3">
                            <Calendar className="w-3 h-3 inline mr-1" />
                            {formatDate(doc.date)}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="text-right">
                      {authoritativeAmount(doc) === null ? (
                        <div className="text-sm text-gray-500">Amount not applicable</div>
                      ) : (
                        <div className="font-semibold text-gray-900">
                          {formatExactCurrency(authoritativeAmount(doc)!, 'Imported document amount')}
                        </div>
                      )}
                      {doc.items && (
                        <div className="text-xs text-gray-500 mt-1">
                          {doc.items.length} items
                        </div>
                      )}
                    </div>
                  </div>
                </button>
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
                      Qty: {item.quantity ?? item.dispatched_quantity ?? 'Unavailable'}
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
