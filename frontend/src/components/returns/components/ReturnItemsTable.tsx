/**
 * ReturnItemsTable Component
 * Table for selecting and managing return items
 * Matches invoice items table styling exactly
 */

import React, { useMemo, useRef, useCallback } from 'react';
import { Trash2, Package } from 'lucide-react';
import { ProductSearch, EditableCell } from '../../global';
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

    // Editable fields for keyboard navigation
    const EDITABLE_FIELDS = ['return_paid_qty', 'return_free_qty', 'unit_price'];
    const fieldRefs = useRef<Record<string, any>>({});

    const setFieldRef = (rowIndex: number, fieldName: string, element: any): void => {
        const key = `${rowIndex}-${fieldName}`;
        fieldRefs.current[key] = element;
    };

    const focusField = (rowIndex: number, fieldName: string): void => {
        const key = `${rowIndex}-${fieldName}`;
        const fieldRef = fieldRefs.current[key];
        if (fieldRef?.focus) {
            setTimeout(() => fieldRef.focus(), 0);
        }
    };

    const handleNavigate = useCallback((currentRow: number, currentField: string, direction: string): void => {
        const currentFieldIndex = EDITABLE_FIELDS.indexOf(currentField);

        switch (direction) {
            case 'right':
            case 'next':
                if (currentFieldIndex < EDITABLE_FIELDS.length - 1) {
                    focusField(currentRow, EDITABLE_FIELDS[currentFieldIndex + 1]);
                } else if (currentRow < items.length - 1) {
                    focusField(currentRow + 1, EDITABLE_FIELDS[0]);
                }
                break;
            case 'left':
                if (currentFieldIndex > 0) {
                    focusField(currentRow, EDITABLE_FIELDS[currentFieldIndex - 1]);
                } else if (currentRow > 0) {
                    focusField(currentRow - 1, EDITABLE_FIELDS[EDITABLE_FIELDS.length - 1]);
                }
                break;
            case 'down':
                if (currentRow < items.length - 1) {
                    focusField(currentRow + 1, currentField);
                }
                break;
            case 'up':
                if (currentRow > 0) {
                    focusField(currentRow - 1, currentField);
                }
                break;
        }
    }, [items.length]);

    // Calculate totals for an item
    const calculateItemTotal = (item: any): number => {
        const paidQty = parseFloat(String(item.return_paid_qty || item.return_quantity || 0));
        const rate = parseFloat(String(item.unit_price || 0));
        const discPercent = parseFloat(String(item.discount_percent || 0));
        const taxPercent = parseFloat(String(item.tax_percent || 0));

        const grossAmount = paidQty * rate;
        const discountAmount = (grossAmount * discPercent) / 100;
        const taxableAmount = grossAmount - discountAmount;
        const taxAmount = (taxableAmount * taxPercent) / 100;
        return taxableAmount + taxAmount;
    };

    const formatExpiry = (dateStr: string | undefined): string => {
        if (!dateStr) return '-';
        try {
            return new Date(dateStr).toLocaleDateString('en-IN', { month: 'short', year: '2-digit' });
        } catch {
            return '-';
        }
    };

    return (
        <div className="mb-6">
            {/* Section Header */}
            <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold text-blue-700 uppercase tracking-wider flex items-center">
                    <Package className="w-4 h-4 mr-2" />
                    RETURN ITEMS ({selectedItems.length})
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
                <div className="overflow-x-auto">
                    <table className="w-full border-collapse">
                        <thead>
                            <tr className="bg-gradient-to-r from-blue-50 to-indigo-50 border-b-2 border-blue-200">
                                <th className="px-3 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">#</th>
                                <th className="px-3 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Product</th>
                                <th className="px-3 py-3 text-center text-xs font-semibold text-gray-700 uppercase tracking-wider">Expiry</th>
                                {selectedInvoice && (
                                    <th className="px-3 py-3 text-center text-xs font-semibold text-gray-700 uppercase tracking-wider">
                                        Original
                                        <div className="text-[10px] font-normal text-gray-500">Paid + Free</div>
                                    </th>
                                )}
                                <th className="px-3 py-3 text-center text-xs font-semibold text-gray-700 uppercase tracking-wider">
                                    Return Qty
                                    <div className="text-[10px] font-normal text-gray-500">Enter/Tab →</div>
                                </th>
                                <th className="px-3 py-3 text-center text-xs font-semibold text-gray-700 uppercase tracking-wider">Free</th>
                                <th className="px-3 py-3 text-center text-xs font-semibold text-gray-700 uppercase tracking-wider">Rate</th>

                                <th className="px-3 py-3 text-center text-xs font-semibold text-gray-700 uppercase tracking-wider">Tax %</th>
                                <th className="px-3 py-3 text-right text-xs font-semibold text-gray-700 uppercase tracking-wider">Total</th>
                                <th className="px-3 py-3 text-center text-xs font-semibold text-gray-700 uppercase tracking-wider">Action</th>
                            </tr>
                        </thead>
                        <tbody>
                            {items.map((row, index) => {
                                const originalPaidQty = parseFloat(String(row.paid_quantity || 0));
                                const originalFreeQty = parseFloat(String(row.free_quantity || 0));
                                const isFromInvoice = !row.is_manual && !!selectedInvoice;
                                const total = calculateItemTotal(row);

                                return (
                                    <tr
                                        key={index}
                                        className="border-b border-gray-200 hover:bg-gray-50 transition-colors"
                                    >
                                        {/* Row Number */}
                                        <td className="px-3 py-2 text-sm text-gray-600">{index + 1}</td>

                                        {/* Product Info */}
                                        <td className="px-3 py-2">
                                            <div className="text-sm font-medium text-gray-900">{row.product_name}</div>
                                            <div className="text-xs text-gray-500">{row.batch_number || 'No Batch'}</div>
                                        </td>

                                        {/* Expiry */}
                                        <td className="px-3 py-2 text-center">
                                            <div className="text-xs text-gray-600">{formatExpiry(row.expiry_date)}</div>
                                        </td>

                                        {/* Original Qty (invoice only) */}
                                        {selectedInvoice && (
                                            <td className="px-3 py-2 text-center">
                                                <div className="text-sm text-gray-900 font-medium">
                                                    {originalPaidQty}
                                                    {originalFreeQty > 0 && (
                                                        <span className="text-green-600 ml-1">+{originalFreeQty}</span>
                                                    )}
                                                </div>
                                            </td>
                                        )}

                                        {/* Return Qty (Paid) */}
                                        <td className="px-3 py-2">
                                            <EditableCell
                                                ref={(el: any) => setFieldRef(index, 'return_paid_qty', el)}
                                                value={row.return_paid_qty ?? row.return_quantity ?? 0}
                                                type="number"
                                                min={0}
                                                max={isFromInvoice ? originalPaidQty : undefined}
                                                step={1}
                                                decimalPlaces={0}
                                                onSave={(val: string | number) => onUpdateItem(index, 'return_paid_qty', Number(val))}
                                                onNavigate={(dir: string) => handleNavigate(index, 'return_paid_qty', dir)}
                                                selectOnFocus={true}
                                                className="w-16"
                                            />
                                        </td>

                                        {/* Free Qty */}
                                        <td className="px-3 py-2">
                                            <EditableCell
                                                ref={(el: any) => setFieldRef(index, 'return_free_qty', el)}
                                                value={row.return_free_qty ?? 0}
                                                type="number"
                                                min={0}
                                                max={isFromInvoice ? originalFreeQty : undefined}
                                                step={1}
                                                decimalPlaces={0}
                                                onSave={(val: string | number) => onUpdateItem(index, 'return_free_qty', Number(val))}
                                                onNavigate={(dir: string) => handleNavigate(index, 'return_free_qty', dir)}
                                                selectOnFocus={true}
                                                className="w-14"
                                            />
                                        </td>

                                        {/* Rate */}
                                        <td className="px-3 py-2">
                                            <EditableCell
                                                ref={(el: any) => setFieldRef(index, 'unit_price', el)}
                                                value={row.unit_price || 0}
                                                type="number"
                                                min={0}
                                                decimalPlaces={2}
                                                prefix="₹"
                                                onSave={(val: string | number) => onUpdateItem(index, 'unit_price', Number(val))}
                                                onNavigate={(dir: string) => handleNavigate(index, 'unit_price', dir)}
                                                selectOnFocus={true}
                                                className="w-20"
                                            />
                                        </td>



                                        {/* Tax % (read-only) */}
                                        <td className="px-3 py-2 text-center">
                                            <span className="text-sm text-gray-900 font-medium" title="Tax from product (read-only)">
                                                {row.tax_percent || 0}%
                                            </span>
                                        </td>

                                        {/* Total */}
                                        <td className="px-3 py-2 text-right">
                                            <div className="text-sm font-semibold text-gray-900">₹{total.toFixed(2)}</div>
                                        </td>

                                        {/* Actions */}
                                        <td className="px-3 py-2 text-center">
                                            <button
                                                onClick={() => onRemoveItem(row.id ?? index)}
                                                className="p-1.5 text-red-600 hover:bg-red-50 rounded transition-colors"
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

                    {/* Keyboard Navigation Help */}
                    <div className="mt-2 px-3 py-2 bg-blue-50 border border-blue-200 rounded text-xs text-gray-600">
                        <strong className="text-blue-700">Keyboard Navigation:</strong>
                        <kbd className="mx-1 px-1.5 py-0.5 bg-white border border-gray-300 rounded text-[10px]">Tab</kbd> Next field •
                        <kbd className="mx-1 px-1.5 py-0.5 bg-white border border-gray-300 rounded text-[10px]">Enter</kbd> Save & next •
                        <kbd className="mx-1 px-1.5 py-0.5 bg-white border border-gray-300 rounded text-[10px]">↓↑</kbd> Navigate rows •
                        <kbd className="mx-1 px-1.5 py-0.5 bg-white border border-gray-300 rounded text-[10px]">Esc</kbd> Cancel
                    </div>
                </div>
            ) : (
                <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg border-2 border-blue-200 p-6">
                    <div className="text-center py-8 text-gray-500">
                        <Package className="w-12 h-12 mx-auto mb-2 text-gray-300" />
                        <p className="text-sm">No items added yet</p>
                        {selectedInvoice ? (
                            <p className="text-xs text-gray-400 mt-1">Invoice items will appear here</p>
                        ) : showManualEntry ? (
                            <p className="text-xs text-gray-400 mt-1">Search and select products to add</p>
                        ) : (
                            <p className="text-xs text-gray-400 mt-1">Select an invoice or use manual entry</p>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
});

ReturnItemsTable.displayName = 'ReturnItemsTable';
