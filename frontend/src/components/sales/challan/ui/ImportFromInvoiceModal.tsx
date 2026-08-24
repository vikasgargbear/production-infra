import React, { useState, useEffect, useCallback } from 'react';
import { X, FileText, ShoppingCart, Calendar } from 'lucide-react';
import { toast } from 'react-toastify';
import { invoicesApi, ordersApi } from '../../../../services/api';
import useDialogFocus from '../../../../hooks/useDialogFocus';
import useEscapeKey from '../../../../hooks/useEscapeKey';
import {
    extractDocumentCollection,
    extractDocumentDetail,
    projectCanonicalImportLines,
} from '../../utils/documentImport';

interface DocumentItem {
    product_id: string;
    product_name: string;
    hsn_code?: string;
    quantity: number;
    unit?: string;
    mrp?: number;
    unit_price?: number;
    selling_price?: number;
    tax_percent?: number;
    gst_percent?: number;
    manufacturer?: string;
    category?: string;
    batch_id?: string;
    batch_number?: string;
    expiry_date?: string;
    free_quantity?: number;
    discount_percent?: number;
}

interface Document {
    invoice_id?: string;
    order_id?: string;
    invoice_number?: string;
    order_number?: string;
    customer_id: string;
    customer_name: string;
    customer_details?: any;
    billing_address?: string;
    billing_city?: string;
    billing_state?: string;
    billing_pincode?: string;
    shipping_address?: string;
    shipping_city?: string;
    shipping_state?: string;
    shipping_pincode?: string;
    customer_phone?: string;
    customer_gst_number?: string;
    items?: DocumentItem[];
    invoice_items?: DocumentItem[];
    invoice_date?: string;
    order_date?: string;
    total_amount?: number;
    payment_status?: string;
}

interface ImportData {
    customer_id: string;
    customer_name: string;
    customer_details: any;
    billing_address?: string;
    delivery_address?: string;
    delivery_city?: string;
    delivery_state?: string;
    delivery_pincode?: string;
    items: any[];
    reference_doc: string;
    notes: string;
}

interface ImportFromInvoiceModalProps {
    isOpen: boolean;
    onClose: () => void;
    onImport: (data: ImportData) => void;
}

const ImportFromInvoiceModal: React.FC<ImportFromInvoiceModalProps> = ({ isOpen, onClose, onImport }) => {
    const [searchType, setSearchType] = useState<'invoice' | 'order'>('invoice');
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState<Document[]>([]);
    const [selectedDoc, setSelectedDoc] = useState<Document | null>(null);
    const [loading, setLoading] = useState(false);
    const [importing, setImporting] = useState(false);
    const dialogRef = useDialogFocus<HTMLDivElement>(isOpen);
    useEscapeKey(onClose, isOpen, 'ChallanImportFromInvoiceModal');

    const loadRecentDocuments = useCallback(async () => {
        setLoading(true);
        try {
            let results: Document[] = [];
            if (searchType === 'invoice') {
                const response = await invoicesApi.search({ search: '', limit: 10 });
                const responseData = response?.data || response;
                results = Array.isArray(responseData) ? responseData :
                    (responseData?.data && Array.isArray(responseData.data)) ? responseData.data :
                        (responseData?.invoices && Array.isArray(responseData.invoices)) ? responseData.invoices : [];
            } else {
                const response = await ordersApi.search('', { limit: 10 });
                results = extractDocumentCollection(response, ['orders', 'sales_orders']) as Document[];
            }
            setSearchResults(results);
        } catch (error) {
            setSearchResults([]);
        } finally {
            setLoading(false);
        }
    }, [searchType]);

    useEffect(() => {
        if (isOpen) {
            void loadRecentDocuments();
        }
    }, [isOpen, loadRecentDocuments]);

    if (!isOpen) return null;

    const handleSearch = async () => {
        if (!searchQuery.trim()) {
            void loadRecentDocuments();
            return;
        }

        setLoading(true);
        try {
            let results: Document[] = [];
            if (searchType === 'invoice') {
                const response = await invoicesApi.search({ search: searchQuery });
                const responseData = response?.data || response;
                results = Array.isArray(responseData) ? responseData :
                    (responseData?.data && Array.isArray(responseData.data)) ? responseData.data :
                        (responseData?.invoices && Array.isArray(responseData.invoices)) ? responseData.invoices : [];
            } else {
                const response = await ordersApi.search(searchQuery);
                results = extractDocumentCollection(response, ['orders', 'sales_orders']) as Document[];
            }
            setSearchResults(results);
        } catch (error) {
            setSearchResults([]);
        } finally {
            setLoading(false);
        }
    };

    const handleImport = async () => {
        if (!selectedDoc) return;

        setImporting(true);
        try {
            const detailResponse = searchType === 'invoice'
                ? await invoicesApi.getById(selectedDoc.invoice_id!)
                : await ordersApi.getById(selectedDoc.order_id!);
            const sourceDoc = extractDocumentDetail(
                detailResponse,
                searchType === 'invoice' ? ['invoice'] : ['order', 'sales_order'],
            ) as unknown as Document;
            const sourceNumber = searchType === 'invoice'
                ? sourceDoc.invoice_number
                : sourceDoc.order_number;
            if (!sourceDoc.customer_id || !sourceDoc.customer_name || !sourceNumber) {
                throw new Error('The canonical document detail is missing its customer or document identity.');
            }
            const importableItems = projectCanonicalImportLines(
                sourceDoc.items || sourceDoc.invoice_items,
                { requireBatch: true },
            );

            const importData: ImportData = {
                customer_id: sourceDoc.customer_id,
                customer_name: sourceDoc.customer_name,
                customer_details: sourceDoc.customer_details || {
                    customer_id: sourceDoc.customer_id,
                    customer_name: sourceDoc.customer_name,
                    address: sourceDoc.billing_address,
                    city: sourceDoc.billing_city,
                    state: sourceDoc.billing_state,
                    pincode: sourceDoc.billing_pincode,
                    phone: sourceDoc.customer_phone,
                    gst_number: sourceDoc.customer_gst_number
                },
                billing_address: sourceDoc.billing_address,
                delivery_address: sourceDoc.shipping_address || sourceDoc.billing_address,
                delivery_city: sourceDoc.shipping_city || sourceDoc.billing_city,
                delivery_state: sourceDoc.shipping_state || sourceDoc.billing_state,
                delivery_pincode: sourceDoc.shipping_pincode || sourceDoc.billing_pincode,
                items: importableItems.map(item => ({
                    id: Date.now() + Math.random(),
                    product_id: item.product_id,
                    product_name: item.product_name,
                    hsn_code: item.hsn_code,
                    quantity: item.quantity,
                    unit: item.unit || 'NOS',
                    mrp: item.mrp,
                    unit_price: item.unit_price,
                    gst_percent: item.gst_percent,
                    manufacturer: item.manufacturer,
                    category: item.category,
                    batch_id: item.batch_id,
                    batch_number: item.batch_number,
                    expiry_date: item.expiry_date,
                    source_line_id: item.source_line_id,
                    source_allocation_kind: item.source_allocation_kind,
                    allocation_id: item.allocation_id,
                    inventory_document_id: item.inventory_document_id,
                    inventory_document_line_id: item.inventory_document_line_id,
                    invoice_dispatch_allocation_id: item.invoice_dispatch_allocation_id,
                    dispatch_id: item.dispatch_id,
                    dispatch_line_id: item.dispatch_line_id,
                    free_quantity: item.free_quantity,
                    discount_percent: item.discount_percent,
                })),
                reference_doc: searchType === 'invoice' ?
                    `Invoice: ${sourceNumber}` :
                    `Order: ${sourceNumber}`,
                notes: `Delivery for ${searchType === 'invoice' ? 'Invoice' : 'Order'} #${sourceNumber}`
            };

            onImport(importData);
            onClose();
        } catch (error) {
            console.error('[ChallanImport] Failed to load document details:', error);
            toast.error('Unable to load document details. Nothing was imported.');
        } finally {
            setImporting(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="import-invoice-title" tabIndex={-1} className="bg-white rounded-lg w-full max-w-3xl mx-4 max-h-[80vh] flex flex-col">
                {/* Header */}
                <div className="flex items-center justify-between p-4 border-b">
                    <h3 id="import-invoice-title" className="text-lg font-semibold">Import from Invoice/Order</h3>
                    <button type="button" onClick={onClose} className="min-h-11 min-w-11 p-2 hover:bg-gray-100 rounded-lg" aria-label="Close import from invoice or order">
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
                                className={`p-3 rounded-lg border-2 ${searchType === 'invoice'
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
                                className={`p-3 rounded-lg border-2 ${searchType === 'order'
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
                                        className={`p-3 border rounded-lg cursor-pointer ${selectedDoc?.invoice_id === doc.invoice_id || selectedDoc?.order_id === doc.order_id
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
                                                    {new Date(doc.invoice_date || doc.order_date || '').toLocaleDateString()}
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
                                                    <div className={`text-xs mt-1 px-2 py-0.5 rounded-full inline-block ${doc.payment_status === 'paid' ? 'bg-green-100 text-green-700' :
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
                        disabled={!selectedDoc || importing}
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400"
                    >
                        {importing ? 'Loading details...' : 'Import to Challan'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ImportFromInvoiceModal;
