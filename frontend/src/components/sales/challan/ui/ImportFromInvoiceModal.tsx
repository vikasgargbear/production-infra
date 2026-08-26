import React, { useCallback, useEffect, useState } from 'react';
import { Calendar, ShoppingCart, X } from 'lucide-react';
import { toast } from 'react-toastify';
import { ordersApi } from '../../../../services/api';
import useDialogFocus from '../../../../hooks/useDialogFocus';
import useEscapeKey from '../../../../hooks/useEscapeKey';
import { formatExactCurrency } from '../../../../utils/exactDecimal';
import {
    extractDocumentDetail,
    projectCanonicalSalesOrderDispatchLines,
} from '../../utils/documentImport';
import type {
    ChallanItem,
    ImportData,
} from '../types/challanTypes';

interface ApprovedOrderSummary {
    order_id: string;
    order_number: string;
    order_date: string;
    customer_id: string;
    customer_name: string;
    total_amount: string;
    order_status: 'approved';
}

interface ApprovedOrderDetail extends ApprovedOrderSummary {
    dispatch_context_date: string;
    items: unknown[];
}

interface ImportFromInvoiceModalProps {
    isOpen: boolean;
    onClose: () => void;
    onImport: (data: ImportData) => void;
    dispatchDate: string;
}

/**
 * A canonical dispatch can only originate from an approved sales order.
 * Invoice-to-dispatch is deliberately not offered because it has no supported
 * lineage in the canonical dispatch command.
 */
const ImportFromInvoiceModal: React.FC<ImportFromInvoiceModalProps> = ({
    isOpen,
    onClose,
    onImport,
    dispatchDate,
}) => {
    const [searchQuery, setSearchQuery] = useState('');
    const [searchResults, setSearchResults] = useState<ApprovedOrderSummary[]>([]);
    const [selectedOrder, setSelectedOrder] = useState<ApprovedOrderSummary | null>(null);
    const [loading, setLoading] = useState(false);
    const [importing, setImporting] = useState(false);
    const dialogRef = useDialogFocus<HTMLDivElement>(isOpen);
    useEscapeKey(onClose, isOpen, 'ChallanImportFromInvoiceModal');

    const loadOrders = useCallback(async (search = '') => {
        setLoading(true);
        try {
            const results = await ordersApi.listApprovedForDispatch(search, 10);
            setSearchResults(results as ApprovedOrderSummary[]);
            setSelectedOrder(null);
        } catch (error) {
            setSearchResults([]);
            setSelectedOrder(null);
            toast.error(error instanceof Error
                ? error.message
                : 'Unable to load approved sales orders.');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (isOpen) void loadOrders();
    }, [isOpen, loadOrders]);

    if (!isOpen) return null;

    const handleSearch = () => {
        void loadOrders(searchQuery.trim());
    };

    const handleImport = async () => {
        if (!selectedOrder) return;
        if (!/^\d{4}-\d{2}-\d{2}$/.test(dispatchDate)) {
            toast.error('Select a valid dispatch date before importing an approved order.');
            return;
        }

        setImporting(true);
        try {
            const detailResponse = await ordersApi.getById(selectedOrder.order_id, dispatchDate);
            const sourceOrder = extractDocumentDetail(
                detailResponse,
                ['order', 'sales_order'],
            ) as unknown as ApprovedOrderDetail;
            if (!sourceOrder.order_id
                || !sourceOrder.order_number
                || !sourceOrder.customer_id
                || !sourceOrder.customer_name
                || sourceOrder.order_status !== 'approved'
                || sourceOrder.dispatch_context_date !== dispatchDate) {
                throw new Error('The canonical order detail is missing its approved order or customer identity.');
            }
            const importableItems = projectCanonicalSalesOrderDispatchLines(sourceOrder.items);
            const challanItems = importableItems.map((item, index) => {
                if (!item.source_line_id) {
                    throw new Error(`Order line ${index + 1} is missing its canonical sales-order line identity.`);
                }
                return {
                    ...item,
                    id: `${String(item.source_line_id)}:${String(item.batch_id)}`,
                    source_order_line_id: String(item.source_line_id),
                };
            }) as unknown as ChallanItem[];

            const importData: ImportData = {
                source_order_id: sourceOrder.order_id,
                customer_id: sourceOrder.customer_id,
                customer_name: sourceOrder.customer_name,
                customer_details: {
                    customer_id: sourceOrder.customer_id,
                    customer_name: sourceOrder.customer_name,
                },
                items: challanItems,
                reference_doc: `Order: ${sourceOrder.order_number}`,
                notes: `Delivery for approved sales order #${sourceOrder.order_number}`,
            };

            onImport(importData);
            onClose();
        } catch (error) {
            toast.error(error instanceof Error
                ? error.message
                : 'Unable to load the approved order. Nothing was imported.');
        } finally {
            setImporting(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
            <div
                ref={dialogRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby="import-order-title"
                tabIndex={-1}
                className="mx-4 flex max-h-[80vh] w-full max-w-3xl flex-col rounded-lg bg-white"
            >
                <div className="flex items-center justify-between border-b p-4">
                    <div>
                        <h3 id="import-order-title" className="text-lg font-semibold">Import approved sales order</h3>
                        <p className="mt-1 text-sm text-gray-600">
                            Dispatch lines retain the selected order, order-line, location, and batch identities.
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="min-h-11 min-w-11 rounded-lg p-2 hover:bg-gray-100"
                        aria-label="Close approved sales order import"
                    >
                        <X className="h-5 w-5" />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-4">
                    <div className="mb-4 rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
                        <ShoppingCart className="mr-2 inline h-4 w-4" />
                        Only approved orders returned by the canonical history API are eligible.
                    </div>

                    <div className="mb-4">
                        <label htmlFor="challan-order-search" className="mb-2 block text-sm font-medium text-gray-700">
                            Search approved orders
                        </label>
                        <div className="flex gap-2">
                            <input
                                id="challan-order-search"
                                type="search"
                                value={searchQuery}
                                onChange={(event) => setSearchQuery(event.target.value)}
                                onKeyDown={(event) => {
                                    if (event.key === 'Enter') handleSearch();
                                }}
                                placeholder="Order number or customer name"
                                className="min-h-11 flex-1 rounded-lg border px-3 py-2 focus:ring-2 focus:ring-blue-500"
                            />
                            <button
                                type="button"
                                onClick={handleSearch}
                                disabled={loading}
                                className="min-h-11 rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:bg-gray-400"
                            >
                                {loading ? 'Loading…' : 'Search'}
                            </button>
                        </div>
                    </div>

                    {!loading && searchResults.length === 0 && (
                        <div className="rounded-lg border border-gray-200 bg-gray-50 p-5 text-center text-sm text-gray-600">
                            No approved sales orders are available for dispatch.
                        </div>
                    )}

                    {searchResults.length > 0 && (
                        <div className="space-y-2">
                            <h4 className="text-sm font-medium text-gray-700">
                                {searchQuery ? 'Search results' : 'Recent approved orders'}
                            </h4>
                            <div className="max-h-64 space-y-2 overflow-y-auto">
                                {searchResults.map((order) => (
                                    <button
                                        type="button"
                                        key={order.order_id}
                                        onClick={() => setSelectedOrder(order)}
                                        aria-label={`Select canonical sales order ${order.order_id}`}
                                        aria-pressed={selectedOrder?.order_id === order.order_id}
                                        className={`w-full rounded-lg border p-3 text-left ${selectedOrder?.order_id === order.order_id
                                            ? 'border-blue-500 bg-blue-50'
                                            : 'border-gray-200 hover:border-gray-300'
                                            }`}
                                    >
                                        <div className="flex justify-between gap-4">
                                            <div>
                                                <div className="font-medium">{order.order_number}</div>
                                                <div className="text-sm text-gray-600">{order.customer_name}</div>
                                                <div className="mt-1 flex items-center gap-2 text-xs text-gray-500">
                                                    <Calendar className="h-3 w-3" />
                                                    <span>{order.order_date}</span>
                                                </div>
                                            </div>
                                            <div className="text-right">
                                                <div className="font-medium">
                                                    {formatExactCurrency(order.total_amount, 'Approved order total')}
                                                </div>
                                                <div className="mt-1 text-xs text-green-700">Approved</div>
                                            </div>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                <div className="flex justify-end gap-2 border-t p-4">
                    <button
                        type="button"
                        onClick={onClose}
                        className="min-h-11 rounded-lg border border-gray-300 px-4 py-2 hover:bg-gray-50"
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        onClick={handleImport}
                        disabled={!selectedOrder || importing}
                        className="min-h-11 rounded-lg bg-blue-600 px-4 py-2 text-white hover:bg-blue-700 disabled:bg-gray-400"
                    >
                        {importing ? 'Loading exact lines…' : 'Import order to challan'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default ImportFromInvoiceModal;
