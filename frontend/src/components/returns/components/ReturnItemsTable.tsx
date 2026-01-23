/**
 * ReturnItemsTable Component
 * Table for selecting and managing return items
 * Optimized with React.memo
 */

import React, { useMemo } from 'react';
import { Trash2, Package } from 'lucide-react';
import { ProductSearch, NumberInput } from '../../global';
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
    const selectedItems = useMemo(() =>
        items.filter(item => item.selected),
        [items]
    );

    return (
        <div className="mb-6">
            {/* Section Header */}
            <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-blue-700 uppercase tracking-wider flex items-center">
                    <Package className="w-4 h-4 mr-2" />
                    RETURN ITEMS ({selectedItems.length})
                </h3>
            </div>

            {/* Product Search for Manual Entry - Full Width */}
            {showManualEntry && (
                <div className="mb-4">
                    <ProductSearch
                        onAddItem={onAddManualItem}
                        placeholder="Search products by name, code, or HSN..."
                        showBatchSelection={true}
                    />
                </div>
            )}

            {items.length > 0 ? (
                <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-x-auto">
                    <table className="w-full border-collapse">
                        <thead>
                            <tr className="bg-gray-50 border-b border-gray-200">
                                <th className="px-3 py-2 text-left text-xs font-semibold text-gray-700 uppercase">Product</th>
                                {selectedInvoice && (
                                    <th className="px-3 py-2 text-center text-xs font-semibold text-gray-700 uppercase">Original Qty</th>
                                )}
                                <th className="px-3 py-2 text-center text-xs font-semibold text-gray-700 uppercase">Return Qty</th>
                                <th className="px-3 py-2 text-right text-xs font-semibold text-gray-700 uppercase">Unit Price</th>
                                <th className="px-3 py-2 text-center text-xs font-semibold text-gray-700 uppercase">Tax %</th>
                                <th className="px-3 py-2 text-right text-xs font-semibold text-gray-700 uppercase">Total</th>
                                <th className="px-3 py-2 text-center text-xs font-semibold text-gray-700 uppercase">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {items.map((row, index) => {
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

                                return (
                                    <tr key={index} className="border-b border-gray-100 hover:bg-gray-50">
                                        <td className="px-3 py-2">
                                            <div className="font-medium text-gray-900">{row.product_name}</div>
                                            <div className="text-sm text-gray-500">
                                                Batch: {row.batch_number || 'N/A'} | HSN: {row.hsn_code || 'N/A'}
                                            </div>
                                        </td>
                                        {selectedInvoice && (
                                            <td className="px-3 py-2 text-center text-sm">
                                                <div>Total: {row.quantity}</div>
                                                <div className="text-gray-500">
                                                    Paid: {row.paid_quantity} | Free: {row.free_quantity}
                                                </div>
                                            </td>
                                        )}
                                        <td className="px-3 py-2 text-center">
                                            <NumberInput
                                                value={row.return_quantity}
                                                onChange={(val) => onUpdateItem(index, 'return_quantity', val)}
                                                min={0}
                                                max={row.max_returnable_qty || 9999}
                                                size="sm"
                                                className="w-24"
                                            />
                                        </td>
                                        <td className="px-3 py-2 text-right text-sm">
                                            {row.is_manual ? (
                                                <input
                                                    type="number"
                                                    value={row.unit_price || 0}
                                                    onChange={(e) => onUpdateItem(index, 'unit_price', parseFloat(e.target.value) || 0)}
                                                    className="w-20 px-2 py-1 border border-gray-300 rounded text-right text-sm"
                                                    min={0}
                                                    step={0.01}
                                                />
                                            ) : (
                                                <span>₹{(row.unit_price || 0).toFixed(2)}</span>
                                            )}
                                        </td>
                                        <td className="px-3 py-2 text-center text-sm">
                                            {row.tax_percent || 0}%
                                        </td>
                                        <td className="px-3 py-2 text-right text-sm font-medium">
                                            ₹{total.toFixed(2)}
                                        </td>
                                        <td className="px-3 py-2 text-center">
                                            {row.is_manual && (
                                                <button
                                                    onClick={() => onRemoveItem(row.id ?? index)}
                                                    className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                                    title="Remove item"
                                                >
                                                    <Trash2 className="w-4 h-4" />
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            ) : (
                <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
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
                </div>
            )}
        </div>
    );
});

ReturnItemsTable.displayName = 'ReturnItemsTable';
