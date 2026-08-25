import React, { useState, useEffect, useCallback } from 'react';
import { X, Search, Truck, ShoppingCart, Calendar } from 'lucide-react';
import { toast } from 'react-toastify';
import { ordersApi, challansApi } from '../../../services/api';
import useDialogFocus from '../../../hooks/useDialogFocus';
import useEscapeKey from '../../../hooks/useEscapeKey';
import {
  extractDocumentCollection,
  extractDocumentDetail,
  projectCanonicalImportLines,
  type CanonicalImportLine,
} from '../utils/documentImport';

interface DocumentItem {
  item_id?: number;
  product_id: string;
  product_name: string;
  product_code?: string;
  batch_id?: string;
  batch_number?: string;
  hsn_code?: string;
  expiry_date?: string | null;
  quantity: number | string;
  dispatched_quantity?: number | string;
  mrp?: number | string;
  unit_price?: number | string;
  sale_price?: number | string;
  discount_percent?: number | string;
  free_quantity?: number | string;
  gst_percent?: number | string;
  tax_rate?: number | string;
  available_quantity?: number | string;
}

interface Document {
  order_id?: number | string;
  challan_id?: number | string;
  order_number?: string;
  challan_number?: string;
  order_date?: string;
  challan_date?: string;
  customer_id: number | string;
  customer_name: string;
  customer_phone?: string;
  billing_address?: string;
  delivery_address?: string;
  address?: string;
  shipping_address?: string;
  items?: DocumentItem[];
  order_items?: DocumentItem[];
  final_amount?: number;
  total_amount?: number;
  order_status?: string;
  status?: string;
  transport_company?: string;
  vehicle_number?: string;
  lr_number?: string;
  invoice_created?: boolean;
  converted_to_invoice?: boolean;
}

interface ImportData {
  customer: Record<string, unknown>;
  items: CanonicalImportLine[];
  delivery_details: {
    delivery_type: 'DELIVERY';
    delivery_charges: number;
  };
  source: string;
}

interface ImportDocumentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onImport: (data: ImportData) => void;
}

const ImportDocumentModal: React.FC<ImportDocumentModalProps> = ({ isOpen, onClose, onImport }) => {
  const [documentType, setDocumentType] = useState<'sales-order' | 'challan'>('sales-order');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [documents, setDocuments] = useState<Document[]>([]);
  const [selectedDoc, setSelectedDoc] = useState<Document | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [loadError, setLoadError] = useState<string>('');
  const dialogRef = useDialogFocus<HTMLDivElement>(isOpen);
  useEscapeKey(onClose, isOpen, 'ImportDocumentModal');

  const loadDocuments = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    setSelectedDoc(null);
    try {
      let results: Document[] = [];

      switch (documentType) {
        case 'sales-order':
          // Get sales orders that haven't been invoiced
          const ordersResponse = await ordersApi.getAll({
            limit: 20,
            order_status: 'approved',
            invoice_created: false
          });
          results = extractDocumentCollection(ordersResponse, ['orders', 'sales_orders']) as Document[];
          break;

        case 'challan':
          const challansResponse = await challansApi.getAll({
            limit: 20,
            converted_to_invoice: false
          });
          results = extractDocumentCollection(challansResponse, ['challans', 'delivery_challans']) as Document[];
          break;

        default:
          results = [];
      }

      setDocuments(results);
    } catch (error) {
      setDocuments([]);
      setLoadError('Unable to load canonical documents. Nothing can be imported right now.');
    } finally {
      setLoading(false);
    }
  }, [documentType]);

  useEffect(() => {
    if (isOpen) {
      void loadDocuments();
    }
  }, [isOpen, loadDocuments]);

  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      void loadDocuments();
      return;
    }

    setLoading(true);
    try {
      let results: Document[] = [];

      if (documentType === 'sales-order') {
        const response = await ordersApi.search(searchQuery, {
          invoice_created: false
        });
        results = extractDocumentCollection(response, ['orders', 'sales_orders']) as Document[];
      } else if (documentType === 'challan') {
        const response = await challansApi.getAll({
          search: searchQuery,
          converted_to_invoice: false
        });
        results = extractDocumentCollection(response, ['challans', 'delivery_challans']) as Document[];
      }

      setDocuments(results);
    } catch (error) {
      setDocuments([]);
      setLoadError('Search failed against the canonical API. Nothing was imported.');
    } finally {
      setLoading(false);
    }
  };

  const handleImport = async () => {
    if (!selectedDoc) return;

    setLoading(true);

    try {
      const selectedId = documentType === 'challan' ? selectedDoc.challan_id : selectedDoc.order_id;
      if (!selectedId) throw new Error('The selected document has no canonical UUID.');
      const detailResponse = documentType === 'challan'
        ? await challansApi.getById(selectedId)
        : await ordersApi.getById(selectedId);
      const sourceDoc = extractDocumentDetail(
        detailResponse,
        documentType === 'challan' ? ['challan', 'delivery_challan'] : ['order', 'sales_order'],
      ) as unknown as Document;
      const sourceNumber = documentType === 'challan'
        ? sourceDoc.challan_number
        : sourceDoc.order_number;
      if (!sourceDoc.customer_id || !sourceDoc.customer_name || !sourceNumber) {
        throw new Error('The canonical document detail is missing its customer or document identity.');
      }

      const importData: ImportData = {
        customer: {
          id: sourceDoc.customer_id,
          customer_id: sourceDoc.customer_id,
          customer_name: sourceDoc.customer_name,
          primary_phone: sourceDoc.customer_phone,
          address: sourceDoc.billing_address || sourceDoc.delivery_address || sourceDoc.address || '',
          billing_address: sourceDoc.billing_address || sourceDoc.address || '',
          shipping_address: sourceDoc.delivery_address || sourceDoc.shipping_address || '',
        },
        items: projectCanonicalImportLines(
          sourceDoc.items || sourceDoc.order_items,
          { requireBatch: true },
        ),
        delivery_details: {
          delivery_type: 'DELIVERY',
          delivery_charges: 0,
        },
        source: `${documentType === 'challan' ? 'Delivery Challan' : 'Sales Order'} ${sourceNumber}`,
      };

      onImport(importData);

      onClose();
    } catch (error: any) {
      toast.error(error.response?.data?.detail || error.message || 'Unable to import canonical document details.');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="import-document-title" tabIndex={-1} className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 bg-gradient-to-r from-blue-600 to-blue-700 text-white">
          <div className="flex justify-between items-center">
            <h2 id="import-document-title" className="text-xl font-semibold">Import from Document</h2>
            <button type="button" onClick={onClose} className="min-h-11 min-w-11 text-white hover:text-gray-200" aria-label="Close import document">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Document Type Selector */}
        <div className="px-6 py-4 border-b">
          <div className="flex gap-4">
            <button
              type="button"
              onClick={() => setDocumentType('sales-order')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all ${documentType === 'sales-order'
                ? 'bg-blue-100 text-blue-700 border-2 border-blue-300'
                : 'bg-gray-100 text-gray-600 border-2 border-transparent hover:bg-gray-200'
                }`}
            >
              <ShoppingCart className="w-4 h-4" />
              Sales Orders
            </button>
            <button
              type="button"
              onClick={() => setDocumentType('challan')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all ${documentType === 'challan'
                ? 'bg-blue-100 text-blue-700 border-2 border-blue-300'
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
                placeholder={`Search ${documentType === 'sales-order' ? 'orders' : 'challans'}...`}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
                className="w-full pl-10 pr-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <button
              type="button"
              onClick={handleSearch}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
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
              {loadError || `No ${documentType === 'sales-order' ? 'orders' : 'challans'} found`}
            </div>
          ) : (
            <div className="space-y-2">
              {documents.map((doc, index) => {
                const docId = documentType === 'sales-order' ? doc.order_id : doc.challan_id;
                const docNumber = documentType === 'sales-order'
                  ? (doc.order_number || `ORD-${doc.order_id}`)
                  : (doc.challan_number || `DC-${doc.challan_id}`);

                return (
                  <button
                    type="button"
                    key={docId || `doc-${index}`}
                    onClick={() => setSelectedDoc(doc)}
                    aria-pressed={selectedDoc?.order_id === doc.order_id || selectedDoc?.challan_id === doc.challan_id}
                    className={`w-full p-4 text-left border rounded-lg cursor-pointer transition-all ${selectedDoc?.order_id === doc.order_id || selectedDoc?.challan_id === doc.challan_id
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 hover:border-gray-300 hover:bg-gray-50'
                      }`}
                  >
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <div className="flex items-center gap-3">
                          <span className="font-medium text-gray-900">{docNumber}</span>
                          <span className="text-sm text-gray-500">
                            <Calendar className="w-3 h-3 inline mr-1" />
                            {new Date(doc.order_date || doc.challan_date!).toLocaleDateString()}
                          </span>
                        </div>
                        <div className="mt-1 text-sm text-gray-600">
                          {doc.customer_name}
                          {doc.items && ` • ${doc.items.length} items`}
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-medium text-gray-900">
                          ₹{doc.final_amount || doc.total_amount || 0}
                        </div>
                        <div className="text-sm text-gray-500">
                          {doc.order_status || doc.status}
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-gray-50 flex justify-end gap-3">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-gray-700 bg-white border rounded-lg hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleImport}
            disabled={!selectedDoc || loading}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
          >
            {loading ? 'Processing...' : 'Import to Invoice'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ImportDocumentModal;
