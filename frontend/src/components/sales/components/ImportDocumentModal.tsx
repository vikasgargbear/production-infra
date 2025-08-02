import React, { useState, useEffect } from 'react';
import { X, Search, FileText, Truck, ShoppingCart, Calendar, LucideIcon } from 'lucide-react';
import { ordersApi, challansApi, salesOrdersAPI } from '../../../services/api';

interface DocumentItem {
  item_id?: number;
  product_id: string;
  product_name: string;
  product_code?: string;
  batch_id?: string;
  batch_no?: string;
  batch_number?: string;
  hsn_code?: string;
  expiry_date?: string;
  quantity: number;
  dispatched_quantity?: number;
  mrp?: number;
  rate?: number;
  unit_price?: number;
  sale_price?: number;
  discount_percent?: number;
  free_quantity?: number;
  gst_percent?: number;
  tax_rate?: number;
  available_quantity?: number;
}

interface TransportDetails {
  transport_company?: string;
  vehicle_number?: string;
  lr_number?: string;
}

interface Document {
  order_id?: number;
  challan_id?: number;
  order_number?: string;
  challan_number?: string;
  order_date?: string;
  challan_date?: string;
  customer_id: number;
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
  source_type: string;
  source_id: number;
  customer_id: number;
  customer_name: string;
  customer_phone?: string;
  billing_address?: string;
  delivery_address?: string;
  items: DocumentItem[];
  order_id?: number;
  challan_id?: number | null;
  transport_details: TransportDetails;
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

  useEffect(() => {
    if (isOpen) {
      loadDocuments();
    }
  }, [isOpen, documentType]);

  const loadDocuments = async () => {
    setLoading(true);
    try {
      let results: Document[] = [];
      
      switch (documentType) {
        case 'sales-order':
          // Get sales orders that haven't been invoiced
          const ordersResponse = await salesOrdersAPI.getAll({ 
            limit: 20,
            order_status: 'approved',
            invoice_created: false
          });
          results = ordersResponse.data || [];
          break;
          
        case 'challan':
          // Get challans - try multiple endpoints to find working one
          try {
            // Try main challans endpoint first
            const challansResponse = await challansApi.getAll({ 
              limit: 20,
              converted_to_invoice: false
            });
            results = challansResponse.data || [];
            
            // If no results, try delivery API as fallback
            if (!results.length) {
              console.log('Trying delivery API fallback...');
              const deliveryResponse = await fetch('/api/delivery-challans/')
                .then(res => res.json())
                .catch(() => ({ data: [] }));
              results = deliveryResponse.data || [];
            }
          } catch (error) {
            console.error('Challans API error:', error);
            results = []; // No mock data - let user know API is not working
          }
          break;
          
        default:
          results = [];
      }
      
      setDocuments(results);
    } catch (error) {
      console.error('Error loading documents:', error);
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
      let results: Document[] = [];
      
      if (documentType === 'sales-order') {
        const response = await salesOrdersAPI.search({ 
          query: searchQuery,
          invoice_created: false 
        });
        results = response.data || [];
      } else if (documentType === 'challan') {
        const response = await challansApi.getAll({ 
          search: searchQuery,
          converted_to_invoice: false
        });
        results = response.data || [];
      }
      
      setDocuments(results);
    } catch (error) {
      console.error('Error searching:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleImport = async () => {
    if (!selectedDoc) return;
    
    setLoading(true);
    
    try {
      if (documentType === 'challan') {
        // For challans, get the challan data and populate the form (don't create invoice yet)
        console.log('Importing challan:', selectedDoc.challan_id);
        
        let challan: Document;
        try {
          const challanResponse = await challansApi.getById(selectedDoc.challan_id!);
          challan = challanResponse.data;
          console.log('Fetched challan data:', challan);
        } catch (fetchError) {
          console.error('Failed to fetch challan data:', fetchError);
          // Use the selectedDoc data directly if fetch fails
          challan = selectedDoc;
        }
        
        if (challan) {
          // Transform challan data for invoice form population
          const importData: ImportData = {
            source_type: 'challan',
            source_id: challan.challan_id!,
            customer_id: challan.customer_id,
            customer_name: challan.customer_name,
            customer_phone: challan.customer_phone,
            billing_address: challan.billing_address || challan.delivery_address,
            delivery_address: challan.delivery_address,
            items: (challan.items || []).map(item => ({
              item_id: Date.now() + Math.random(),
              product_id: item.product_id,
              product_name: item.product_name,
              product_code: item.product_code,
              batch_id: item.batch_id,
              batch_no: item.batch_number,
              batch_number: item.batch_number,
              hsn_code: item.hsn_code,
              expiry_date: item.expiry_date,
              quantity: item.dispatched_quantity || item.quantity,
              mrp: item.mrp,
              rate: item.unit_price,
              sale_price: item.unit_price,
              discount_percent: 0,
              free_quantity: 0,
              gst_percent: item.gst_percent || 12,
              tax_rate: item.gst_percent || 12,
              available_quantity: item.quantity
            })),
            // Link references
            order_id: challan.order_id,
            challan_id: challan.challan_id,
            // Transport details
            transport_details: {
              transport_company: challan.transport_company,
              vehicle_number: challan.vehicle_number,
              lr_number: challan.lr_number
            }
          };
          
          console.log('Sending import data to form:', importData);
          onImport(importData);
        }
      } else {
        // For sales orders, transform document data for invoice form population
        const importData: ImportData = {
          source_type: documentType,
          source_id: selectedDoc.order_id!,
          customer_id: selectedDoc.customer_id,
          customer_name: selectedDoc.customer_name,
          customer_phone: selectedDoc.customer_phone,
          billing_address: selectedDoc.billing_address || selectedDoc.address,
          delivery_address: selectedDoc.delivery_address || selectedDoc.shipping_address,
          items: selectedDoc.items || selectedDoc.order_items || [],
          // Link references
          order_id: selectedDoc.order_id,
          challan_id: null,
          // Additional data
          transport_details: {
            transport_company: selectedDoc.transport_company,
            vehicle_number: selectedDoc.vehicle_number,
            lr_number: selectedDoc.lr_number
          }
        };
        
        onImport(importData);
      }
      
      onClose();
    } catch (error: any) {
      console.error('Error importing document:', error);
      alert(`Failed to import: ${error.response?.data?.detail || error.message}`);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 bg-gradient-to-r from-blue-600 to-blue-700 text-white">
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
              onClick={() => setDocumentType('sales-order')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all ${
                documentType === 'sales-order' 
                  ? 'bg-blue-100 text-blue-700 border-2 border-blue-300' 
                  : 'bg-gray-100 text-gray-600 border-2 border-transparent hover:bg-gray-200'
              }`}
            >
              <ShoppingCart className="w-4 h-4" />
              Sales Orders
            </button>
            <button
              onClick={() => setDocumentType('challan')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-all ${
                documentType === 'challan' 
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
              No {documentType === 'sales-order' ? 'orders' : 'challans'} found
            </div>
          ) : (
            <div className="space-y-2">
              {documents.map((doc) => {
                const docId = documentType === 'sales-order' ? doc.order_id : doc.challan_id;
                const docNumber = documentType === 'sales-order' 
                  ? (doc.order_number || `ORD-${doc.order_id}`)
                  : (doc.challan_number || `DC-${doc.challan_id}`);
                
                return (
                  <div
                    key={docId}
                    onClick={() => setSelectedDoc(doc)}
                    className={`p-4 border rounded-lg cursor-pointer transition-all ${
                      selectedDoc?.order_id === doc.order_id || selectedDoc?.challan_id === doc.challan_id
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