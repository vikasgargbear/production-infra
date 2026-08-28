/**
 * ReturnItemsTable Component
 * Table for selecting and managing return items
 * Matches invoice items table styling exactly
 */

import React, { useMemo, useRef, useCallback } from 'react';
import { Trash2, Package } from 'lucide-react';
import { EditableCell } from '../../global';
import type { ReturnItemsTableProps } from '../types/return.types';
import { exactDecimalUnits } from '../../../utils/exactDecimal';
import { formatReturnMoney } from '../utils/returnDecimal';
import { formatCalendarDate } from '../../../utils/calendarDate';

const EDITABLE_FIELDS: string[] = ['return_paid_qty', 'return_free_qty'];

const isPositiveQuantity = (value: unknown): boolean => {
    try {
        return exactDecimalUnits(value, 'Return quantity', { scale: 6, maximumWholeDigits: 14 }) > 0n;
    } catch {
        return false;
    }
};

export const ReturnItemsTable = React.memo<ReturnItemsTableProps>(({
    items,
    selectedInvoice,
    onUpdateItem,
    onRemoveItem,
}) => {
    const selectedItems = useMemo(() =>
        items.filter(item => item.selected),
        [items]
    );

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

    const displayItemTotal = (item: any): string => {
        try {
            const amount = item.total_amount ?? item.line_total;
            if (amount === '' || amount === null || amount === undefined) return 'Pending canonical preview';
            return formatReturnMoney(amount, `Return total for ${item.product_name || 'item'}`);
        } catch {
            return 'Invalid amount';
        }
    };

    const formatExpiry = (dateStr: string | undefined): string => {
        if (!dateStr) return '-';
        try { return formatCalendarDate(dateStr); }
        catch { return 'Unavailable'; }
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

            {items.length > 0 ? (
                <>
                <div className="space-y-3 md:hidden" data-testid="sales-return-mobile-lines">
                    {items.map((row, index) => {
                        const isFromInvoice = Boolean(selectedInvoice);
                        return <article key={String(row.id ?? index)} className={`rounded-lg border p-3 ${row.selected ? 'border-blue-300 bg-blue-50' : 'border-gray-200 bg-white'}`}>
                            <div className="flex items-start justify-between gap-3"><label className="flex min-h-12 min-w-0 flex-1 cursor-pointer items-center gap-3"><input type="checkbox" aria-label={`Mobile return ${row.product_name}`} checked={Boolean(row.selected)} onChange={event => onUpdateItem(index, 'selected', event.target.checked)} className="h-5 w-5 rounded border-gray-300" /><span className="min-w-0"><strong className="block truncate">{row.product_name}</strong><span className="block text-xs text-gray-500">{row.batch_number || 'Batch unavailable'} · expires {formatExpiry(row.expiry_date)}</span></span></label><button onClick={() => onRemoveItem(row.id ?? index)} aria-label={`Remove ${row.product_name}`} className="inline-flex min-h-12 min-w-12 items-center justify-center rounded-lg text-red-600 hover:bg-red-50"><Trash2 className="h-4 w-4" /></button></div>
                            {isFromInvoice && <div className="mt-3 grid gap-3"><label className="text-sm font-medium">Condition<select aria-label={`Mobile return condition for ${row.product_name}`} value={String((row as any).return_condition || '')} onChange={event => onUpdateItem(index, 'return_condition', event.target.value)} className="mt-1 min-h-12 w-full rounded-lg border border-gray-300 bg-white px-3 text-base"><option value="">Select condition</option><option value="sealed_resaleable">Sealed / resaleable</option><option value="opened">Opened</option><option value="damaged">Damaged</option><option value="expired">Expired</option><option value="recalled">Recalled</option><option value="quality_hold">Quality hold</option></select></label><label className="text-sm font-medium">Quarantine location<select aria-label={`Mobile quarantine location for ${row.product_name}`} value={String((row as any).to_location_id || '')} onChange={event => onUpdateItem(index, 'to_location_id', event.target.value)} className="mt-1 min-h-12 w-full rounded-lg border border-gray-300 bg-white px-3 text-base"><option value="">Select quarantine location</option>{((row as any).quarantine_locations || []).map((location: any) => <option key={location.id} value={location.id}>{location.code} · {location.name}</option>)}</select></label></div>}
                            <div className="mt-3 grid grid-cols-2 gap-3"><label className="text-sm font-medium">Billed quantity<input type="text" inputMode="decimal" value={String(row.return_paid_qty ?? '')} onChange={event => onUpdateItem(index, 'return_paid_qty', event.target.value)} className="mt-1 min-h-12 w-full rounded-lg border border-gray-300 px-3 text-right text-base" /></label><label className="text-sm font-medium">Free quantity<input type="text" inputMode="decimal" value={String(row.return_free_qty ?? '')} onChange={event => onUpdateItem(index, 'return_free_qty', event.target.value)} className="mt-1 min-h-12 w-full rounded-lg border border-gray-300 px-3 text-right text-base" /></label></div>
                            <dl className="mt-3 grid grid-cols-3 gap-2 border-t border-gray-200 pt-3 text-sm"><div><dt className="text-gray-500">Rate</dt><dd>{row.unit_price === '' || row.unit_price == null ? '—' : `₹${row.unit_price}`}</dd></div><div><dt className="text-gray-500">Tax</dt><dd>{row.tax_percent === '' || row.tax_percent == null ? '—' : `${row.tax_percent}%`}</dd></div><div className="text-right"><dt className="text-gray-500">Total</dt><dd className="font-semibold">{displayItemTotal(row)}</dd></div></dl>
                        </article>;
                    })}
                </div>
                <div className="hidden overflow-x-auto md:block">
                    <table className="w-full border-collapse">
                        <thead>
                            <tr className="bg-gradient-to-r from-blue-50 to-indigo-50 border-b-2 border-blue-200">
                                <th className="px-3 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Return</th>
                                <th className="px-3 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Product</th>
                                <th className="px-3 py-3 text-center text-xs font-semibold text-gray-700 uppercase tracking-wider">Pack</th>
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
                                const originalPaidQty = row.paid_quantity;
                                const originalFreeQty = row.free_quantity;
                                const isFromInvoice = !!selectedInvoice;
                                const total = displayItemTotal(row);

                                return (
                                    <tr
                                        key={index}
                                        className="border-b border-gray-200 hover:bg-gray-50 transition-colors"
                                    >
                                        <td className="px-3 py-2 text-left">
                                            <input
                                                type="checkbox"
                                                aria-label={`Return ${row.product_name}`}
                                                checked={Boolean(row.selected)}
                                                onChange={(event) => onUpdateItem(index, 'selected', event.target.checked)}
                                                className="h-5 w-5 rounded border-gray-300"
                                            />
                                        </td>

                                        {/* Product Info */}
                                        <td className="px-3 py-2">
                                            <div className="text-sm font-medium text-gray-900">{row.product_name}</div>
                                            <div className="text-xs text-gray-500">{row.batch_number || 'Batch unavailable'}</div>
                                            {isFromInvoice && (
                                                <div className="mt-2 grid gap-2">
                                                    <select
                                                        aria-label={`Return condition for ${row.product_name}`}
                                                        value={String((row as any).return_condition || '')}
                                                        onChange={(event) => onUpdateItem(index, 'return_condition', event.target.value)}
                                                        className="min-h-11 rounded border border-gray-300 bg-white px-2 text-xs"
                                                    >
                                                        <option value="">Select condition</option>
                                                        <option value="sealed_resaleable">Sealed / resaleable</option>
                                                        <option value="opened">Opened</option>
                                                        <option value="damaged">Damaged</option>
                                                        <option value="expired">Expired</option>
                                                        <option value="recalled">Recalled</option>
                                                        <option value="quality_hold">Quality hold</option>
                                                        <option value="quality_hold">Quality hold</option>
                                                    </select>
                                                    <select
                                                        aria-label={`Quarantine location for ${row.product_name}`}
                                                        value={String((row as any).to_location_id || '')}
                                                        onChange={(event) => onUpdateItem(index, 'to_location_id', event.target.value)}
                                                        className="min-h-11 rounded border border-gray-300 bg-white px-2 text-xs"
                                                    >
                                                        <option value="">Select quarantine location</option>
                                                        {((row as any).quarantine_locations || []).map((location: any) => (
                                                            <option key={location.id} value={location.id}>{location.code} · {location.name}</option>
                                                        ))}
                                                    </select>
                                                </div>
                                            )}
                                        </td>

                                        {/* Pack Info */}
                                        <td className="px-3 py-2 text-center">
                                            <div className="text-sm text-gray-700">
                                                {row.packages_per_box !== undefined && row.units_per_pack !== undefined
                                                    ? `${row.packages_per_box} × ${row.units_per_pack}`
                                                    : 'Unavailable'}
                                            </div>
                                        </td>

                                        {/* Expiry */}
                                        <td className="px-3 py-2 text-center">
                                            <div className="text-xs text-gray-600">{formatExpiry(row.expiry_date)}</div>
                                        </td>

                                        {/* Original Qty (invoice only) */}
                                        {selectedInvoice && (
                                            <td className="px-3 py-2 text-center">
                                                <div className="text-sm text-gray-900 font-medium">
                                                    {originalPaidQty === '' || originalPaidQty === undefined ? 'Unavailable' : originalPaidQty}
                                                    {originalFreeQty !== '' && originalFreeQty !== undefined && isPositiveQuantity(originalFreeQty) && (
                                                        <span className="text-green-600 ml-1">+{originalFreeQty}</span>
                                                    )}
                                                </div>
                                            </td>
                                        )}

                                        {/* Return Qty (Paid) */}
                                        <td className="px-3 py-2">
                                            <div className="flex justify-center">
                                                <EditableCell
                                                    ref={(el: any) => setFieldRef(index, 'return_paid_qty', el)}
                                                    value={row.return_paid_qty ?? ''}
                                                    ariaLabel={`Billed quantity for ${row.product_name}`}
                                                    type="number"
                                                    maxDecimalPlaces={6}
                                                    preserveDecimalString
                                                    onSave={(val: string | number) => onUpdateItem(index, 'return_paid_qty', String(val))}
                                                    onNavigate={(dir: string) => handleNavigate(index, 'return_paid_qty', dir)}
                                                    selectOnFocus={true}
                                                    className="w-16"
                                                />
                                            </div>
                                        </td>

                                        {/* Free Qty */}
                                        <td className="px-3 py-2">
                                            <div className="flex justify-center">
                                                <EditableCell
                                                    ref={(el: any) => setFieldRef(index, 'return_free_qty', el)}
                                                    value={row.return_free_qty ?? ''}
                                                    ariaLabel={`Free quantity for ${row.product_name}`}
                                                    type="number"
                                                    maxDecimalPlaces={6}
                                                    preserveDecimalString
                                                    onSave={(val: string | number) => onUpdateItem(index, 'return_free_qty', String(val))}
                                                    onNavigate={(dir: string) => handleNavigate(index, 'return_free_qty', dir)}
                                                    selectOnFocus={true}
                                                    className="w-14"
                                                />
                                            </div>
                                        </td>

                                        {/* Rate */}
                                        <td className="px-3 py-2">
                                            <div className="flex justify-center">
                                                <span className="text-sm text-gray-900">
                                                    {row.unit_price === '' || row.unit_price === null || row.unit_price === undefined
                                                        ? 'Unavailable'
                                                        : `₹${row.unit_price}`}
                                                </span>
                                            </div>
                                        </td>



                                        {/* Tax % (read-only) */}
                                        <td className="px-3 py-2 text-center">
                                            <span className="text-sm text-gray-900 font-medium" title="Tax from product (read-only)">
                                                {row.tax_percent === '' || row.tax_percent === null || row.tax_percent === undefined
                                                    ? 'Unavailable'
                                                    : `${row.tax_percent}%`}
                                            </span>
                                        </td>

                                        {/* Total */}
                                        <td className="px-3 py-2 text-right">
                                            <div className="text-sm font-semibold text-gray-900">{total}</div>
                                        </td>

                                        {/* Actions */}
                                        <td className="px-3 py-2 text-center">
                                            <button
                                                onClick={() => onRemoveItem(row.id ?? index)}
                                className="inline-flex min-h-11 min-w-11 items-center justify-center rounded text-red-600 transition-colors hover:bg-red-50"
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
                </>
            ) : (
                <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg border-2 border-blue-200 p-6">
                    <div className="text-center py-8 text-gray-500">
                        <Package className="w-12 h-12 mx-auto mb-2 text-gray-300" />
                        <p className="text-sm">No items added yet</p>
                        {selectedInvoice ? (
                            <p className="text-xs text-gray-400 mt-1">Invoice items will appear here</p>
                        ) : (
                            <p className="text-xs text-gray-400 mt-1">Select a posted invoice with exact dispatch allocation lineage</p>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
});

ReturnItemsTable.displayName = 'ReturnItemsTable';
