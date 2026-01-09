/**
 * ReturnItemsTable Component
 * Table for selecting and managing return items
 * Optimized with React.memo
 */

import React, { useMemo } from 'react';
import { Plus, Trash2, Package } from 'lucide-react';
import { ProductSearch, ItemsTable, NumberInput } from '../../global';
import type { ReturnItemsTableProps } from '../types/return.types';

export const ReturnItemsTable = React.memo<ReturnItemsTableProps>(({
    items,
    selectedInvoice,
    showManualEntry,
    availableBatches,
    onUpdateItem,
    onAddManualItem,
    onRemoveItem
}) => {
    const tableColumns = useMemo(() => [
        {
            header: 'Product',
            key: 'product_name',
            render: (value: any, row: any) => (
                <div>
                    <div className="font-medium text-gray-900">{row.product_name}</div>
                    <div className="text-sm text-gray-500">
                        Batch: {row.batch_number || 'N/A'} | HSN: {row.hsn_code || 'N/A'}
                    </div>
                </div>
            )
        },
        {
            header: 'Invoice Qty',
            key: 'quantity',
            render: (value: any, row: any) => (
                <div className="text-sm">
                    <div>Total: {row.quantity}</div>
                    <div className="text-gray-500">
                        Paid: {row.paid_quantity} | Free: {row.free_quantity}
                    </div>
                </div>
            )
        },
        {
            header: 'Return Qty',
            key: 'return_quantity',
            render: (value: any, row: any, index: number) => (
                <NumberInput
                    value={row.return_quantity}
                    onChange={(val) => onUpdateItem(index, 'return_quantity', val)}
                    min={0}
                    max={row.max_returnable_qty}
                    size="sm"
                    className="w-24"
                />
            )
        },
        {
            header: 'Unit Price',
            key: 'unit_price',
            render: (value: any) => `₹${value?.toFixed(2) || '0.00'}`
        },
        {
            header: 'Tax %',
            key: 'tax_percent',
            render: (value: any) => `${value || 0}%`
        },
        {
            header: 'Total',
            key: 'total',
            render: (value: any, row: any) => {
                const returnQty = parseFloat(String(row.return_quantity || 0));
                const paidQty = Math.max(0, parseFloat(String(row.paid_quantity || 0)));
                const paidReturnQty = Math.min(returnQty, paidQty);
                const unitPrice = parseFloat(String(row.unit_price || 0));
                const discountPercent = parseFloat(String(row.discount_percent || 0));
                const taxPercent = parseFloat(String(row.tax_percent || 0));

                const baseAmount = paidReturnQty * unitPrice;
                const discountAmount = (baseAmount * discountPercent) / 100;
                const afterDiscount = baseAmount - discountAmount;
                const taxAmount = (afterDiscount * taxPercent) / 100;
                const total = afterDiscount + taxAmount;

                return `₹${total.toFixed(2)}`;
            }
        },
        {
            header: 'Actions',
            key: 'actions',
            render: (value: any, row: any) => {
                if (row.is_manual) {
                    return (
                        <button
                            onClick={() => onRemoveItem(row.id)}
                            className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                            title="Remove item"
                        >
                            <Trash2 className="w-4 h-4" />
                        </button>
                    );
                }
                return null;
            }
        }
    ], [onUpdateItem, onRemoveItem]);

    const selectedItems = useMemo(() =>
        items.filter(item => item.selected),
        [items]
    );

    return (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">
                    RETURN ITEMS ({selectedItems.length})
                </h3>

                {showManualEntry && (
                    <div className="flex-1 max-w-md ml-4">
                        <ProductSearch
                            onChange={onAddManualItem}
                            placeholder="Add product manually..."
                            size="md"
                            showStock
                        />
                    </div>
                )}
            </div>

            {items.length > 0 ? (
                <ItemsTable
                    columns={tableColumns}
                    data={items}
                    onUpdateItem={onUpdateItem}
                    showSelection
                />
            ) : (
                <div className="text-center py-8 text-gray-500">
                    <Package className="w-12 h-12 mx-auto mb-2 text-gray-300" />
                    <p>No items added yet</p>
                    {selectedInvoice ? (
                        <p className="text-sm mt-1">Invoice items will appear here</p>
                    ) : showManualEntry ? (
                        <p className="text-sm mt-1">Search and add products manually</p>
                    ) : (
                        <p className="text-sm mt-1">Select an invoice or use manual entry</p>
                    )}
                </div>
            )}
        </div>
    );
});

ReturnItemsTable.displayName = 'ReturnItemsTable';
