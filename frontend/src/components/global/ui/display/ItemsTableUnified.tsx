import React, { useRef, useEffect, forwardRef, useImperativeHandle, RefObject, ForwardRefRenderFunction } from 'react';
import { Trash2 } from 'lucide-react';
import EditableCell, { EditableCellRef } from './EditableCell';

// ==================== TYPE DEFINITIONS ====================

export interface ItemsTableItem {
    product_id?: number | string;
    product_name?: string;
    name?: string;
    batch_id?: number | string;
    batch_number?: string;
    quantity?: number;
    unit_price?: number;
    mrp?: number;
    discount?: number;
    discount_percent?: number;
    gst_percent?: number;
    tax_rate?: number;
    free_quantity?: number;
    free?: number;
    expiry_date?: string;
    packages_per_box?: number;
    units_per_pack?: number;
    [key: string]: unknown;
}

export interface ItemsTableTotals {
    final_amount?: number;
    finalAmount?: number;
    total?: number;
}

export interface ItemsTableRef {
    focusField: (rowIndex: number, fieldName: string) => void;
    focusFirstField: () => void;
}

export interface ItemsTableProps {
    items?: ItemsTableItem[];
    onUpdateItem?: (index: number, field: string, value: unknown) => void;
    onRemoveItem?: (index: number) => void;
    currencySymbol?: string;
    mode?: 'entry' | 'preview';
    readOnly?: boolean;
    enableKeyboardNav?: boolean;
    productSearchRef?: RefObject<HTMLInputElement>;
    showTotals?: boolean;
    totals?: ItemsTableTotals;
    title?: string;
    className?: string;
}

type NavigationDirection = 'right' | 'next' | 'left' | 'down' | 'up';

// ==================== COMPONENT ====================

const ItemsTableComponent: ForwardRefRenderFunction<ItemsTableRef, ItemsTableProps> = ({
    items = [],
    onUpdateItem,
    onRemoveItem,
    currencySymbol = '₹',
    mode = 'entry',
    readOnly: readOnlyProp,
    enableKeyboardNav: enableKeyboardNavProp,
    productSearchRef,
    showTotals = false,
    totals,
    title = 'Items',
    className = ''
}, ref) => {

    const readOnly = readOnlyProp !== undefined ? readOnlyProp : mode === 'preview';
    const enableKeyboardNav = enableKeyboardNavProp !== undefined ? enableKeyboardNavProp : mode === 'entry';

    const fieldRefs = useRef<Record<string, EditableCellRef | null>>({});
    const EDITABLE_FIELDS = ['quantity', 'unit_price', 'discount_percent', 'free', 'tax'];

    useImperativeHandle(ref, () => ({
        focusField: (rowIndex: number, fieldName: string) => {
            focusField(rowIndex, fieldName);
        },
        focusFirstField: () => {
            if (items.length > 0) {
                focusField(items.length - 1, 'quantity');
            }
        }
    }));

    const setFieldRef = (rowIndex: number, fieldName: string, element: EditableCellRef | null): void => {
        const key = `${rowIndex}-${fieldName}`;
        fieldRefs.current[key] = element;
    };

    const focusField = (rowIndex: number, fieldName: string): void => {
        const key = `${rowIndex}-${fieldName}`;
        const fieldRef = fieldRefs.current[key];
        if (fieldRef?.focus) {
            setTimeout(() => {
                fieldRef.focus();
            }, 0);
        }
    };

    const handleNavigate = (currentRow: number, currentField: string, direction: NavigationDirection): void => {
        const currentFieldIndex = EDITABLE_FIELDS.indexOf(currentField);

        switch (direction) {
            case 'right':
            case 'next':
                if (currentFieldIndex < EDITABLE_FIELDS.length - 1) {
                    focusField(currentRow, EDITABLE_FIELDS[currentFieldIndex + 1]);
                } else if (currentRow < items.length - 1) {
                    focusField(currentRow + 1, EDITABLE_FIELDS[0]);
                } else {
                    if (productSearchRef?.current) {
                        setTimeout(() => {
                            productSearchRef.current?.focus();
                        }, 0);
                    }
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
    };

    const formatCurrency = (amount: number | string): string => {
        return `${currencySymbol}${(parseFloat(String(amount)) || 0).toFixed(2)}`;
    };

    const calculateItemTotal = (item: ItemsTableItem): number => {
        const baseQuantity = parseFloat(String(item.quantity)) || 0;
        const unit_price = parseFloat(String(item.unit_price || item.unit_price)) || 0;
        const discount = parseFloat(String(item.discount_percent || item.discount || 0)) || 0;
        const gstPercent = parseFloat(String(item.gst_percent || item.tax_rate || 0)) || 0;

        const subtotal = baseQuantity * unit_price;
        const discountAmount = (subtotal * discount) / 100;
        const taxableAmount = subtotal - discountAmount;
        const gstAmount = (taxableAmount * gstPercent) / 100;
        return taxableAmount + gstAmount;
    };

    useEffect(() => {
        if (items.length > 0 && !readOnly) {
            const lastItem = items[items.length - 1];
            if (lastItem.quantity === 1 || lastItem.quantity === 0) {
                const key = `${items.length - 1}-quantity`;
                if (fieldRefs.current[key]) {
                    setTimeout(() => {
                        fieldRefs.current[key]?.focus?.();
                    }, 100);
                }
            }
        }
    }, [items.length, readOnly]);

    return (
        <div className={`overflow-x-auto ${className}`}>
            <table className="w-full border-collapse">
                <thead>
                    <tr className="bg-gradient-to-r from-blue-50 to-indigo-50 border-b-2 border-blue-200">
                        <th className="px-3 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">#</th>
                        <th className="px-3 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Product</th>
                        <th className="px-3 py-3 text-center text-xs font-semibold text-gray-700 uppercase tracking-wider">Pack</th>
                        <th className="px-3 py-3 text-center text-xs font-semibold text-gray-700 uppercase tracking-wider">Expiry</th>
                        <th className="px-3 py-3 text-center text-xs font-semibold text-gray-700 uppercase tracking-wider">
                            Qty
                            <div className="text-[10px] font-normal text-gray-500">Enter/Tab →</div>
                        </th>
                        <th className="px-3 py-3 text-center text-xs font-semibold text-gray-700 uppercase tracking-wider">MRP</th>
                        <th className="px-3 py-3 text-center text-xs font-semibold text-gray-700 uppercase tracking-wider">Rate</th>
                        <th className="px-3 py-3 text-center text-xs font-semibold text-gray-700 uppercase tracking-wider">Disc %</th>
                        <th className="px-3 py-3 text-center text-xs font-semibold text-gray-700 uppercase tracking-wider">Free</th>
                        <th className="px-3 py-3 text-center text-xs font-semibold text-gray-700 uppercase tracking-wider">Tax %</th>
                        <th className="px-3 py-3 text-right text-xs font-semibold text-gray-700 uppercase tracking-wider">Total</th>
                        {!readOnly && (
                            <th className="px-3 py-3 text-center text-xs font-semibold text-gray-700 uppercase tracking-wider">Action</th>
                        )}
                    </tr>
                </thead>
                <tbody>
                    {items.length === 0 ? (
                        <tr>
                            <td colSpan={readOnly ? 11 : 12} className="px-3 py-8 text-center text-gray-500">
                                <div className="flex flex-col items-center">
                                    <p className="text-sm">No items added yet</p>
                                    <p className="text-xs text-gray-400 mt-1">Search and select products to add</p>
                                </div>
                            </td>
                        </tr>
                    ) : (
                        items.map((item, index) => (
                            <tr
                                key={`${item.product_id}-${item.batch_id || 'nb'}-${index}`}
                                className="border-b border-gray-200 hover:bg-gray-50 transition-colors"
                            >
                                <td className="px-3 py-2 text-sm text-gray-600">{index + 1}</td>
                                <td className="px-3 py-2">
                                    <div className="text-sm font-medium text-gray-900">{item.product_name || item.name}</div>
                                    <div className="text-xs text-gray-500">{item.batch_number || item.batch_number || 'No Batch'}</div>
                                </td>
                                <td className="px-3 py-2 text-center">
                                    <div className="text-sm text-gray-700">{item.packages_per_box || 1}*{item.units_per_pack || 1}</div>
                                </td>
                                <td className="px-3 py-2 text-center">
                                    {item.expiry_date ? (
                                        <div className="text-xs text-gray-600">
                                            {new Date(item.expiry_date).toLocaleDateString('en-IN', { month: 'short', year: '2-digit' })}
                                        </div>
                                    ) : (
                                        <div className="text-xs text-gray-400">-</div>
                                    )}
                                </td>
                                <td className="px-3 py-2">
                                    <EditableCell
                                        ref={(el) => setFieldRef(index, 'quantity', el)}
                                        value={item.quantity || 0}
                                        type="number"
                                        min={0}
                                        step={1}
                                        decimalPlaces={0}
                                        onChange={(val) => onUpdateItem?.(index, 'quantity', val)}
                                        onSave={(val) => onUpdateItem?.(index, 'quantity', val)}
                                        onNavigate={(dir) => handleNavigate(index, 'quantity', dir as NavigationDirection)}
                                        readOnly={readOnly}
                                        selectOnFocus={true}
                                        className="w-20"
                                    />
                                </td>
                                <td className="px-3 py-2 text-center">
                                    <div className="text-sm text-gray-900 font-medium">{formatCurrency(item.mrp || 0)}</div>
                                </td>
                                <td className="px-3 py-2 text-center">
                                    <EditableCell
                                        ref={(el) => setFieldRef(index, 'unit_price', el)}
                                        value={item.unit_price || item.unit_price || 0}
                                        type="number"
                                        min={0}
                                        decimalPlaces={2}
                                        prefix={currencySymbol}
                                        onChange={(val) => {
                                            onUpdateItem?.(index, 'unit_price', val);
                                            onUpdateItem?.(index, 'unit_price', val);
                                        }}
                                        onSave={(val) => {
                                            onUpdateItem?.(index, 'unit_price', val);
                                            onUpdateItem?.(index, 'unit_price', val);
                                        }}
                                        onNavigate={(dir) => handleNavigate(index, 'unit_price', dir as NavigationDirection)}
                                        readOnly={readOnly}
                                        selectOnFocus={true}
                                        className="w-24"
                                    />
                                </td>
                                <td className="px-3 py-2 text-center">
                                    <EditableCell
                                        ref={(el) => setFieldRef(index, 'discount_percent', el)}
                                        value={item.discount_percent || item.discount || 0}
                                        type="number"
                                        min={0}
                                        max={100}
                                        decimalPlaces={2}
                                        suffix="%"
                                        onChange={(val) => onUpdateItem?.(index, 'discount_percent', val)}
                                        onSave={(val) => onUpdateItem?.(index, 'discount_percent', val)}
                                        onNavigate={(dir) => handleNavigate(index, 'discount_percent', dir as NavigationDirection)}
                                        readOnly={readOnly}
                                        selectOnFocus={true}
                                        className="w-20"
                                    />
                                </td>
                                <td className="px-3 py-2 text-center">
                                    <EditableCell
                                        ref={(el) => setFieldRef(index, 'free', el)}
                                        value={item.free_quantity || item.free || 0}
                                        type="number"
                                        min={0}
                                        decimalPlaces={0}
                                        onSave={(val) => onUpdateItem?.(index, 'free_quantity', val)}
                                        onNavigate={(dir) => handleNavigate(index, 'free', dir as NavigationDirection)}
                                        readOnly={readOnly}
                                        selectOnFocus={true}
                                        className="w-16"
                                    />
                                </td>
                                <td className="px-3 py-2 text-center">
                                    <span className="text-sm text-gray-900 font-medium" title="Tax percentage from product master data (read-only)">
                                        {item.gst_percent || item.tax_rate || 0}%
                                    </span>
                                </td>
                                <td className="px-3 py-2 text-right">
                                    <div className="text-sm font-semibold text-gray-900">{formatCurrency(calculateItemTotal(item))}</div>
                                </td>
                                {!readOnly && (
                                    <td className="px-3 py-2 text-center">
                                        <button
                                            onClick={() => onRemoveItem?.(index)}
                                            className="p-1.5 text-red-600 hover:bg-red-50 rounded transition-colors"
                                            title="Remove item"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </td>
                                )}
                            </tr>
                        ))
                    )}
                </tbody>
            </table>

            {!readOnly && enableKeyboardNav && items.length > 0 && (
                <div className="mt-2 px-3 py-2 bg-blue-50 border border-blue-200 rounded text-xs text-gray-600">
                    <strong className="text-blue-700">Keyboard Navigation:</strong>
                    <kbd className="mx-1 px-1.5 py-0.5 bg-white border border-gray-300 rounded text-[10px]">Tab</kbd> Next field •
                    <kbd className="mx-1 px-1.5 py-0.5 bg-white border border-gray-300 rounded text-[10px]">Enter</kbd> Save & next •
                    <kbd className="mx-1 px-1.5 py-0.5 bg-white border border-gray-300 rounded text-[10px]">↓↑</kbd> Navigate rows •
                    <kbd className="mx-1 px-1.5 py-0.5 bg-white border border-gray-300 rounded text-[10px]">Esc</kbd> Cancel •
                    <span className="text-blue-600 font-medium">Last field → Product search</span>
                </div>
            )}

            {showTotals && totals && items.length > 0 && (
                <div className="px-3 py-4 border-t border-gray-200 bg-gray-50">
                    <div className="flex items-center justify-between">
                        <span className="text-sm text-gray-600 uppercase tracking-wider">Total Amount</span>
                        <span className="text-2xl font-bold text-gray-900">
                            {currencySymbol}{(totals.final_amount || totals.finalAmount || totals.total || 0).toFixed(2)}
                        </span>
                    </div>
                </div>
            )}
        </div>
    );
};

const ItemsTable = forwardRef(ItemsTableComponent);
ItemsTable.displayName = 'ItemsTable';

export { ItemsTable as ItemsTableKeyboard };
export default ItemsTable;
