import React, { useRef, useEffect, useState, forwardRef, useImperativeHandle, RefObject, ForwardRefRenderFunction } from 'react';
import { Trash2 } from 'lucide-react';
import EditableCell, { EditableCellRef } from './EditableCell';
import { exactDecimalUnits } from '../../../../utils/exactDecimal';

// ==================== TYPE DEFINITIONS ====================

export interface ItemsTableItem {
    product_id?: number | string;
    product_name?: string;
    name?: string;
    batch_id?: number | string;
    batch_number?: string;
    quantity?: number | string;
    unit_price?: number | string;
    mrp?: number;
    discount?: number;
    discount_percent?: number | string;
    gst_percent?: number | string;
    tax_rate?: number | string;
    free_quantity?: number | string;
    free?: number | string;
    free_supply_tax_treatment?: 'excluded_from_taxable_value' | 'included_at_unit_rate';
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
    preserveExactDecimals?: boolean;
    showFreeSupplyTaxTreatment?: boolean;
}

type NavigationDirection = 'right' | 'next' | 'left' | 'down' | 'up';

// Canonical inventory and commercial quantities are numeric(20, 6). Keep the
// editor precision aligned with that contract; quantity formatting must never
// make a fractional value appear to be a whole unit.
const QUANTITY_DECIMAL_PLACES = 6;
const QUANTITY_INPUT_STEP = '0.000001';
const QUANTITY_PRECISION_ERROR = 'Quantity supports up to 6 decimal places.';

const visibleQuantityDecimalPlaces = (value: number | string | undefined): number => {
    const fraction = String(value ?? 0).split('.')[1] || '';
    return Math.min(fraction.length, QUANTITY_DECIMAL_PLACES);
};

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
    className = '',
    preserveExactDecimals = false,
    showFreeSupplyTaxTreatment = false,
}, ref) => {

    const readOnly = readOnlyProp !== undefined ? readOnlyProp : mode === 'preview';
    const enableKeyboardNav = enableKeyboardNavProp !== undefined ? enableKeyboardNavProp : mode === 'entry';

    const fieldRefs = useRef<Record<string, EditableCellRef | null>>({});
    const [mobileQuantityErrors, setMobileQuantityErrors] = useState<Record<string, string>>({});
    const EDITABLE_FIELDS = ['quantity', 'unit_price', 'discount_percent', 'free'];

    const updateMobileQuantity = (
        index: number,
        field: 'quantity' | 'free_quantity',
        rawValue: string,
    ): void => {
        const errorKey = `${index}-${field}`;
        const isPlainNonNegativeDecimal = /^(?:\d+|\d*\.\d*)$/.test(rawValue);
        const decimalPart = rawValue.split('.')[1];
        if (!isPlainNonNegativeDecimal
            || (decimalPart !== undefined && decimalPart.length > QUANTITY_DECIMAL_PLACES)) {
            setMobileQuantityErrors(previous => ({
                ...previous,
                [errorKey]: QUANTITY_PRECISION_ERROR,
            }));
            return;
        }

        if (rawValue === '') return;
        setMobileQuantityErrors(previous => {
            if (!previous[errorKey]) return previous;
            const next = { ...previous };
            delete next[errorKey];
            return next;
        });
        onUpdateItem?.(index, field, preserveExactDecimals ? rawValue : Number(rawValue));
    };

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
        const suppliedTotal = Number(item.line_total ?? item.total ?? 0);
        if (suppliedTotal > 0) return suppliedTotal;

        const quantity = Number(item.quantity || 0);
        const rate = Number(item.unit_price || 0);
        const discount = Math.min(100, Math.max(0, Number(item.discount_percent ?? item.discount ?? 0)));
        const taxRate = Math.max(0, Number(item.gst_percent ?? item.tax_rate ?? 0));
        const taxable = quantity * rate * (1 - discount / 100);
        return Math.round(taxable * (1 + taxRate / 100) * 100) / 100;
    };

    const hasPositiveFreeQuantity = (item: ItemsTableItem): boolean => {
        try {
            return exactDecimalUnits(
                item.free_quantity ?? item.free ?? '0',
                'Free quantity',
                { scale: QUANTITY_DECIMAL_PLACES, maximumWholeDigits: 14 },
            ) > 0n;
        } catch {
            return false;
        }
    };

    const freeSupplyTreatmentSelect = (
        item: ItemsTableItem,
        index: number,
        surface: 'mobile' | 'desktop',
    ) => {
        const productName = item.product_name || item.name || `Item ${index + 1}`;
        const positiveFreeQuantity = hasPositiveFreeQuantity(item);
        return (
            <label className="block text-xs font-medium text-gray-600">
                <span className="sr-only">{productName} free supply tax treatment</span>
                <select
                    data-testid={`${surface}-free-supply-treatment-${item.batch_id || index}`}
                    aria-label={`${productName} free supply tax treatment`}
                    value={positiveFreeQuantity ? (item.free_supply_tax_treatment || '') : 'excluded_from_taxable_value'}
                    disabled={readOnly || !positiveFreeQuantity}
                    onChange={(event) => onUpdateItem?.(
                        index,
                        'free_supply_tax_treatment',
                        event.target.value,
                    )}
                    className="min-h-11 w-full rounded border border-gray-300 bg-white px-2 text-sm text-gray-900 disabled:bg-gray-100 disabled:text-gray-600"
                >
                    {positiveFreeQuantity && <option value="">Choose treatment</option>}
                    <option value="excluded_from_taxable_value">Exclude from taxable value</option>
                    <option value="included_at_unit_rate">Include at unit rate</option>
                </select>
            </label>
        );
    };

    useEffect(() => {
        const desktopLayout = typeof window === 'undefined'
            || typeof window.matchMedia !== 'function'
            || window.matchMedia('(min-width: 768px)').matches;
        if (desktopLayout && items.length > 0 && !readOnly) {
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
    }, [items, readOnly]);

    return (
        <div className={className}>
            <div className="space-y-3 md:hidden">
                {items.length === 0 ? (
                    <div className="border border-gray-200 bg-white px-4 py-8 text-center">
                        <p className="text-sm text-gray-600">No items added yet</p>
                        <p className="mt-1 text-xs text-gray-400">Search and select products to add</p>
                    </div>
                ) : items.map((item, index) => (
                    <article key={`mobile-${item.product_id}-${item.batch_id || 'nb'}-${index}`} className="border border-gray-200 bg-white p-4">
                        <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                                <h4 className="break-words font-medium text-gray-900">{item.product_name || item.name}</h4>
                                <p className="mt-1 break-all text-xs text-gray-500">Batch: {item.batch_number || 'No batch'}</p>
                            </div>
                            {!readOnly && (
                                <button type="button" onClick={() => onRemoveItem?.(index)} className="inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center border border-red-200 text-red-700" aria-label={`Remove ${item.product_name || item.name || 'item'}`}>
                                    <Trash2 className="h-4 w-4" />
                                </button>
                            )}
                        </div>

                        <dl className="mt-3 grid grid-cols-3 gap-2 border-t border-gray-100 pt-3 text-sm">
                            <div><dt className="text-xs text-gray-500">Pack</dt><dd className="mt-1 text-gray-800">{item.packages_per_box || 1}×{item.units_per_pack || 1}</dd></div>
                            <div><dt className="text-xs text-gray-500">Expiry</dt><dd className="mt-1 text-gray-800">{item.expiry_date ? new Date(item.expiry_date).toLocaleDateString('en-IN', { month: 'short', year: '2-digit' }) : '-'}</dd></div>
                            <div><dt className="text-xs text-gray-500">GST</dt><dd className="mt-1 text-gray-800">{item.gst_percent || item.tax_rate || 0}%</dd></div>
                        </dl>

                        <div className="mt-4 grid grid-cols-2 gap-3">
                            <label className="text-xs font-medium text-gray-600">Quantity
                                <input type="number" min="0" step={QUANTITY_INPUT_STEP} inputMode="decimal" value={item.quantity || 0} onChange={(event) => updateMobileQuantity(index, 'quantity', event.target.value)} readOnly={readOnly} aria-invalid={mobileQuantityErrors[`${index}-quantity`] ? true : undefined} aria-describedby={mobileQuantityErrors[`${index}-quantity`] ? `mobile-quantity-error-${index}` : undefined} className="mt-1 min-h-11 w-full border border-gray-300 px-3 text-base text-gray-900" />
                                {mobileQuantityErrors[`${index}-quantity`] && <span id={`mobile-quantity-error-${index}`} role="alert" className="mt-1 block text-xs text-red-700">{mobileQuantityErrors[`${index}-quantity`]}</span>}
                            </label>
                            <label className="text-xs font-medium text-gray-600">Rate
                                <input type="number" min="0" step="0.01" inputMode="decimal" value={item.unit_price || 0} onChange={(event) => onUpdateItem?.(index, 'unit_price', preserveExactDecimals ? event.target.value : Number(event.target.value))} readOnly={readOnly} className="mt-1 min-h-11 w-full border border-gray-300 px-3 text-base text-gray-900" />
                            </label>
                            <label className="text-xs font-medium text-gray-600">Discount %
                                <input type="number" min="0" max="100" step="0.01" inputMode="decimal" value={item.discount_percent || item.discount || 0} onChange={(event) => onUpdateItem?.(index, 'discount_percent', preserveExactDecimals ? event.target.value : Number(event.target.value))} readOnly={readOnly} className="mt-1 min-h-11 w-full border border-gray-300 px-3 text-base text-gray-900" />
                            </label>
                            <label className="text-xs font-medium text-gray-600">Free quantity
                                <input type="number" min="0" step={QUANTITY_INPUT_STEP} inputMode="decimal" value={item.free_quantity || item.free || 0} onChange={(event) => updateMobileQuantity(index, 'free_quantity', event.target.value)} readOnly={readOnly} aria-invalid={mobileQuantityErrors[`${index}-free_quantity`] ? true : undefined} aria-describedby={mobileQuantityErrors[`${index}-free_quantity`] ? `mobile-free-quantity-error-${index}` : undefined} className="mt-1 min-h-11 w-full border border-gray-300 px-3 text-base text-gray-900" />
                                {mobileQuantityErrors[`${index}-free_quantity`] && <span id={`mobile-free-quantity-error-${index}`} role="alert" className="mt-1 block text-xs text-red-700">{mobileQuantityErrors[`${index}-free_quantity`]}</span>}
                            </label>
                            {showFreeSupplyTaxTreatment && (
                                <div className="col-span-2">
                                    {freeSupplyTreatmentSelect(item, index, 'mobile')}
                                </div>
                            )}
                        </div>

                        <div className="mt-4 flex items-center justify-between border-t border-gray-100 pt-3 text-sm">
                            <span className="text-gray-500">MRP {formatCurrency(item.mrp || 0)}</span>
                            <span className="font-semibold text-gray-900">Line total {formatCurrency(calculateItemTotal(item))}</span>
                        </div>
                    </article>
                ))}
            </div>

            <div className="hidden overflow-x-auto md:block">
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
                        {showFreeSupplyTaxTreatment && (
                            <th className="px-3 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Free tax treatment</th>
                        )}
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
                            <td colSpan={(readOnly ? 11 : 12) + (showFreeSupplyTaxTreatment ? 1 : 0)} className="px-3 py-8 text-center text-gray-500">
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
                                        step={Number(QUANTITY_INPUT_STEP)}
                                        decimalPlaces={visibleQuantityDecimalPlaces(item.quantity)}
                                        maxDecimalPlaces={QUANTITY_DECIMAL_PLACES}
                                        decimalPlacesErrorMessage={QUANTITY_PRECISION_ERROR}
                                        onSave={(val) => onUpdateItem?.(index, 'quantity', val)}
                                        onNavigate={(dir) => handleNavigate(index, 'quantity', dir as NavigationDirection)}
                                        readOnly={readOnly}
                                        selectOnFocus={true}
                                        className="w-20"
                                        preserveDecimalString={preserveExactDecimals}
                                        ariaLabel={`${item.product_name || item.name || `Item ${index + 1}`} quantity`}
                                    />
                                </td>
                                <td className="px-3 py-2 text-center">
                                    <div className="text-sm text-gray-900 font-medium">{formatCurrency(item.mrp || 0)}</div>
                                </td>
                                <td className="px-3 py-2 text-center">
                                    <EditableCell
                                        ref={(el) => setFieldRef(index, 'unit_price', el)}
                                        value={item.unit_price || 0}
                                        type="number"
                                        min={0}
                                        decimalPlaces={2}
                                        prefix={currencySymbol}
                                        onSave={(val) => {
                                            onUpdateItem?.(index, 'unit_price', val);
                                        }}
                                        onNavigate={(dir) => handleNavigate(index, 'unit_price', dir as NavigationDirection)}
                                        readOnly={readOnly}
                                        selectOnFocus={true}
                                        className="w-24"
                                        preserveDecimalString={preserveExactDecimals}
                                        ariaLabel={`${item.product_name || item.name || `Item ${index + 1}`} rate`}
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
                                        onSave={(val) => onUpdateItem?.(index, 'discount_percent', val)}
                                        onNavigate={(dir) => handleNavigate(index, 'discount_percent', dir as NavigationDirection)}
                                        readOnly={readOnly}
                                        selectOnFocus={true}
                                        className="w-20"
                                        preserveDecimalString={preserveExactDecimals}
                                        ariaLabel={`${item.product_name || item.name || `Item ${index + 1}`} discount percent`}
                                    />
                                </td>
                                <td className="px-3 py-2 text-center">
                                    <EditableCell
                                        ref={(el) => setFieldRef(index, 'free', el)}
                                        value={item.free_quantity || item.free || 0}
                                        type="number"
                                        min={0}
                                        step={Number(QUANTITY_INPUT_STEP)}
                                        decimalPlaces={visibleQuantityDecimalPlaces(item.free_quantity ?? item.free)}
                                        maxDecimalPlaces={QUANTITY_DECIMAL_PLACES}
                                        decimalPlacesErrorMessage={QUANTITY_PRECISION_ERROR}
                                        onSave={(val) => onUpdateItem?.(index, 'free_quantity', val)}
                                        onNavigate={(dir) => handleNavigate(index, 'free', dir as NavigationDirection)}
                                        readOnly={readOnly}
                                        selectOnFocus={true}
                                        className="w-16"
                                        preserveDecimalString={preserveExactDecimals}
                                        ariaLabel={`${item.product_name || item.name || `Item ${index + 1}`} free quantity`}
                                    />
                                </td>
                                {showFreeSupplyTaxTreatment && (
                                    <td className="min-w-52 px-3 py-2">
                                        {freeSupplyTreatmentSelect(item, index, 'desktop')}
                                    </td>
                                )}
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
            </div>

            {!readOnly && enableKeyboardNav && items.length > 0 && (
                <div className="mt-2 hidden border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-gray-600 md:block">
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
