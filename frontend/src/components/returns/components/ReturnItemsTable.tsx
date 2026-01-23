/**
 * ReturnItemsTable Component
 * Table for selecting and managing return items
 * Matches invoice items table style with editable inputs
 */

import React, { useMemo } from 'react';
import { Trash2, Package } from 'lucide-react';
import { ProductSearch } from '../../global';
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

    // Calculate totals for an item
    const calculateItemTotal = (item: any) => {
        const paidQty = parseFloat(String(item.return_paid_qty || item.return_quantity || 0));
        const freeQty = parseFloat(String(item.return_free_qty || 0));
        const rate = parseFloat(String(item.unit_price || 0));
        const discPercent = parseFloat(String(item.discount_percent || 0));
        const taxPercent = parseFloat(String(item.tax_percent || 0));

        // Only paid qty contributes to value (free qty has no value)
        const grossAmount = paidQty * rate;
        const discountAmount = (grossAmount * discPercent) / 100;
        const taxableAmount = grossAmount - discountAmount;
        const taxAmount = (taxableAmount * taxPercent) / 100;
        return taxableAmount + taxAmount;
    };

    return (
        <div className="mb-6">
            {/* Section Header */}
            <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-blue-700 uppercase tracking-wider flex items-center">
                    <Package className="w-4 h-4 mr-2" />
                    RETURN ITEMS ({selectedItems.length})
                    <span className="ml-2 text-xs text-gray-500 normal-case font-normal">
                        (Use Tab/Enter for quick data entry)
                    </span>
                </h3>
            </div>

            {/* Product Search for Manual Entry */}
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
                                <th className="px-2 py-2 text-left text-xs font-semibold text-gray-700 uppercase w-48">Product</th>
                                {selectedInvoice && (
                                    <th className="px-2 py-2 text-center text-xs font-semibold text-gray-700 uppercase">Original</th>
                                )}
                                <th className="px-2 py-2 text-center text-xs font-semibold text-gray-700 uppercase">
                                    QTY<br /><span className="text-[10px] text-gray-500">(Paid/Free)</span>
                                </th>
                                <th className="px-2 py-2 text-right text-xs font-semibold text-gray-700 uppercase">Rate</th>
                                <th className="px-2 py-2 text-center text-xs font-semibold text-gray-700 uppercase">Disc %</th>
                                <th className="px-2 py-2 text-center text-xs font-semibold text-gray-700 uppercase">Tax %</th>
                                <th className="px-2 py-2 text-right text-xs font-semibold text-gray-700 uppercase">Total</th>
                                <th className="px-2 py-2 text-center text-xs font-semibold text-gray-700 uppercase">Action</th>
                            </tr>
                        </thead>
                        <tbody>
                            {items.map((row, index) => {
                                const originalPaidQty = parseFloat(String(row.paid_quantity || 0));
                                const originalFreeQty = parseFloat(String(row.free_quantity || 0));
                                const returnPaidQty = parseFloat(String(row.return_paid_qty ?? row.return_quantity ?? 0));
                                const returnFreeQty = parseFloat(String(row.return_free_qty ?? 0));
                                const total = calculateItemTotal(row);

                                return (
                                    <tr key={index} className="border-b border-gray-100 hover:bg-blue-50/30">
                                        {/* Product Info */}
                                        <td className="px-2 py-2">
                                            <div className="font-medium text-gray-900 text-sm">{row.product_name}</div>
                                            <div className="text-xs text-gray-500">
                                                {row.batch_number || 'N/A'} | HSN: {row.hsn_code || 'N/A'}
                                            </div>
                                        </td>

                                        {/* Original Qty (invoice-driven only) */}
                                        {selectedInvoice && (
                                            <td className="px-2 py-2 text-center text-sm">
                                                <div className="text-xs">
                                                    <span className="font-medium">{originalPaidQty}</span>
                                                    {originalFreeQty > 0 && (
                                                        <span className="text-green-600">+{originalFreeQty}F</span>
                                                    )}
                                                </div>
                                            </td>
                                        )}

                                        {/* Return Qty: Paid + Free */}
                                        <td className="px-2 py-2">
                                            <div className="flex items-center justify-center gap-1">
                                                <input
                                                    type="number"
                                                    value={returnPaidQty}
                                                    onChange={(e) => onUpdateItem(index, 'return_paid_qty', parseFloat(e.target.value) || 0)}
                                                    className="w-14 px-1 py-1 border border-gray-300 rounded text-center text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                                    min={0}
                                                    max={selectedInvoice ? originalPaidQty : 9999}
                                                    placeholder="Paid"
                                                />
                                                <span className="text-gray-400 text-xs">/</span>
                                                <input
                                                    type="number"
                                                    value={returnFreeQty}
                                                    onChange={(e) => onUpdateItem(index, 'return_free_qty', parseFloat(e.target.value) || 0)}
                                                    className="w-12 px-1 py-1 border border-gray-300 rounded text-center text-sm text-green-600 focus:ring-2 focus:ring-green-500 focus:border-green-500"
                                                    min={0}
                                                    max={selectedInvoice ? originalFreeQty : 9999}
                                                    placeholder="Free"
                                                />
                                            </div>
                                        </td>

                                        {/* Rate */}
                                        <td className="px-2 py-2">
                                            <div className="flex items-center justify-end">
                                                <span className="text-gray-500 text-sm mr-1">₹</span>
                                                <input
                                                    type="number"
                                                    value={row.unit_price || 0}
                                                    onChange={(e) => onUpdateItem(index, 'unit_price', parseFloat(e.target.value) || 0)}
                                                    className="w-20 px-1 py-1 border border-gray-300 rounded text-right text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                                    min={0}
                                                    step={0.01}
                                                    disabled={!row.is_manual && !!selectedInvoice}
                                                />
                                            </div>
                                        </td>

                                        {/* Discount % */}
                                        <td className="px-2 py-2">
                                            <div className="flex items-center justify-center">
                                                <input
                                                    type="number"
                                                    value={row.discount_percent || 0}
                                                    onChange={(e) => onUpdateItem(index, 'discount_percent', parseFloat(e.target.value) || 0)}
                                                    className="w-14 px-1 py-1 border border-gray-300 rounded text-center text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                                                    min={0}
                                                    max={100}
                                                    step={0.1}
                                                    disabled={!row.is_manual && !!selectedInvoice}
                                                />
                                                <span className="text-gray-500 text-xs ml-1">%</span>
                                            </div>
                                        </td>

                                        {/* Tax % (read-only) */}
                                        <td className="px-2 py-2 text-center text-sm text-gray-600">
                                            {row.tax_percent || 0}%
                                        </td>

                                        {/* Total */}
                                        <td className="px-2 py-2 text-right text-sm font-semibold text-gray-900">
                                            ₹{total.toFixed(2)}
                                        </td>

                                        {/* Actions */}
                                        <td className="px-2 py-2 text-center">
                                            <button
                                                onClick={() => onRemoveItem(row.id ?? index)}
                                                className="p-1.5 text-red-500 hover:bg-red-50 rounded transition-colors"
                                                title="Remove item"
                                            >
                                                <Trash2 className="w-4 h-4" />
                                            </button>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>

                    {/* Help text */}
                    <div className="px-3 py-2 bg-gray-50 border-t border-gray-200 text-xs text-gray-500">
                        <strong>Keyboard Navigation:</strong> Tab → Next field | Shift+Tab → Previous | Enter → Save & next row | ↑↓ → Navigate rows
                    </div>
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
