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
    batch_display?: string;
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
    quantityDecimalPlaces?: number;
}

type NavigationDirection = 'right' | 'next' | 'left' | 'down' | 'up';

// Canonical inventory and commercial quantities are numeric(20, 6). Keep the
// editor precision aligned with that contract; quantity formatting must never
// make a fractional value appear to be a whole unit.
const QUANTITY_DECIMAL_PLACES = 6;
const COMMERCIAL_DECIMAL_PLACES = 2;
const RATE_PRECISION_ERROR = 'Rate supports up to 2 decimal places.';
const DISCOUNT_PRECISION_ERROR = 'Discount supports up to 2 decimal places.';

const visibleQuantityDecimalPlaces = (value: number | string | undefined): number => {
    const fraction = String(value ?? 0).split('.')[1] || '';
    return Math.min(fraction.replace(/0+$/, '').length, QUANTITY_DECIMAL_PLACES);
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
    quantityDecimalPlaces = QUANTITY_DECIMAL_PLACES,
}, ref) => {

    const readOnly = readOnlyProp !== undefined ? readOnlyProp : mode === 'preview';
    const enableKeyboardNav = enableKeyboardNavProp !== undefined ? enableKeyboardNavProp : mode === 'entry';

    const fieldRefs = useRef<Record<string, EditableCellRef | null>>({});
    const freeTreatmentRefs = useRef<Record<number, HTMLSelectElement | null>>({});
    const [mobileQuantityErrors, setMobileQuantityErrors] = useState<Record<string, string>>({});
    const [mobileCommercialErrors, setMobileCommercialErrors] = useState<Record<string, string>>({});
    const EDITABLE_FIELDS = ['quantity', 'unit_price', 'discount_percent', 'free'];

    const quantityInputStep = quantityDecimalPlaces === 0
        ? '1'
        : `0.${'0'.repeat(Math.max(0, quantityDecimalPlaces - 1))}1`;
    const quantityPrecisionError = `Quantity supports up to ${quantityDecimalPlaces} decimal places.`;

    const updateMobileQuantity = (
        index: number,
        field: 'quantity' | 'free_quantity',
        rawValue: string,
    ): void => {
        const errorKey = `${index}-${field}`;
        const isPlainNonNegativeDecimal = /^(?:\d+|\d*\.\d*)$/.test(rawValue);
        const decimalPart = rawValue.split('.')[1];
        if (!isPlainNonNegativeDecimal
            || (decimalPart !== undefined && decimalPart.replace(/0+$/, '').length > quantityDecimalPlaces)) {
            setMobileQuantityErrors(previous => ({
                ...previous,
                [errorKey]: quantityPrecisionError,
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

    const updateMobileCommercialValue = (
        index: number,
        field: 'unit_price' | 'discount_percent',
        rawValue: string,
    ): void => {
        const errorKey = `${index}-${field}`;
        const significantFraction = (rawValue.split('.')[1] || '').replace(/0+$/, '');
        const upperBoundValid = field !== 'discount_percent' || Number(rawValue) <= 100;
        const valid = /^(?:\d+|\d*\.\d*)$/.test(rawValue)
            && significantFraction.length <= COMMERCIAL_DECIMAL_PLACES
            && upperBoundValid;
        if (!valid) {
            setMobileCommercialErrors(previous => ({
                ...previous,
                [errorKey]: field === 'unit_price' ? RATE_PRECISION_ERROR : DISCOUNT_PRECISION_ERROR,
            }));
            return;
        }
        if (rawValue === '') return;
        setMobileCommercialErrors(previous => {
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
                } else if (showFreeSupplyTaxTreatment) {
                    const freeValue = fieldRefs.current[`${currentRow}-free`]?.getValue?.() ?? '0';
                    try {
                        if (exactDecimalUnits(
                            freeValue,
                            'Free quantity',
                            { scale: QUANTITY_DECIMAL_PLACES, maximumWholeDigits: 14 },
                        ) > 0n) {
                            window.setTimeout(() => freeTreatmentRefs.current[currentRow]?.focus(), 0);
                            break;
                        }
                    } catch {
                        break;
                    }
                    if (currentRow < items.length - 1) {
                        focusField(currentRow + 1, EDITABLE_FIELDS[0]);
                    } else if (productSearchRef?.current) {
                        window.setTimeout(() => productSearchRef.current?.focus(), 0);
                    }
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
        const numericAmount = Number(amount);
        const formatted = new Intl.NumberFormat('en-IN', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        }).format(Number.isFinite(numericAmount) ? numericAmount : 0);
        return `${currencySymbol}${formatted}`;
    };

    const formatPercent = (percent: number | string | undefined): string => {
        const numericPercent = Number(percent ?? 0);
        return new Intl.NumberFormat('en-IN', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
        }).format(Number.isFinite(numericPercent) ? numericPercent : 0);
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
        if (!positiveFreeQuantity) return null;
        return (
            <label className="block text-xs font-medium text-gray-600">
                <span className={surface === 'mobile' ? 'mb-1 block' : 'sr-only'}>
                    How should free units be billed?
                </span>
                <select
                    ref={surface === 'desktop'
                        ? element => { freeTreatmentRefs.current[index] = element; }
                        : undefined}
                    data-no-enter-tab
                    data-testid={`${surface}-free-supply-treatment-${item.batch_id || index}`}
                    aria-label={`${productName} free units billing`}
                    value={item.free_supply_tax_treatment || ''}
                    disabled={readOnly}
                    onChange={(event) => onUpdateItem?.(
                        index,
                        'free_supply_tax_treatment',
                        event.target.value,
                    )}
                    onKeyDown={surface === 'desktop' ? event => {
                        if (event.key !== 'Enter' || !event.currentTarget.value) return;
                        event.preventDefault();
                        if (index < items.length - 1) {
                            focusField(index + 1, EDITABLE_FIELDS[0]);
                        } else {
                            window.setTimeout(() => productSearchRef?.current?.focus(), 0);
                        }
                    } : undefined}
                    className="min-h-11 w-full rounded border border-gray-300 bg-white px-2 text-sm text-gray-900 disabled:bg-gray-100 disabled:text-gray-600"
                >
                    <option value="">Choose how free units are billed</option>
                    <option value="excluded_from_taxable_value">Free — do not charge</option>
                    <option value="included_at_unit_rate">Charge at item rate</option>
                </select>
                {surface === 'mobile' && (
                    <span className="mt-1 block font-normal text-gray-500">
                        Choose “Free” for normal bonus units. Use “Charge” only when those units should add to the invoice value.
                    </span>
                )}
            </label>
        );
    };

    useEffect(() => {
        const desktopLayout = typeof window === 'undefined'
            || typeof window.matchMedia !== 'function'
            || window.matchMedia('(min-width: 1280px)').matches;
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
            <div className="space-y-3 xl:hidden">
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
                                <p className="mt-1 break-words text-xs text-gray-500">Batch: {item.batch_display || item.batch_number || 'No batch'}</p>
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
                            <div><dt className="text-xs text-gray-500">GST</dt><dd className="mt-1 text-gray-800">{formatPercent(item.gst_percent ?? item.tax_rate)}%</dd></div>
                        </dl>

                        <div className="mt-4 grid grid-cols-2 gap-3">
                            <label className="text-xs font-medium text-gray-600">Quantity
                                <input type="number" min="0" step={quantityInputStep} inputMode="decimal" value={item.quantity || 0} onChange={(event) => updateMobileQuantity(index, 'quantity', event.target.value)} readOnly={readOnly} aria-invalid={mobileQuantityErrors[`${index}-quantity`] ? true : undefined} aria-describedby={mobileQuantityErrors[`${index}-quantity`] ? `mobile-quantity-error-${index}` : undefined} className="mt-1 min-h-11 w-full border border-gray-300 px-3 text-right text-base text-gray-900" />
                                {mobileQuantityErrors[`${index}-quantity`] && <span id={`mobile-quantity-error-${index}`} role="alert" className="mt-1 block text-xs text-red-700">{mobileQuantityErrors[`${index}-quantity`]}</span>}
                            </label>
                            <label className="text-xs font-medium text-gray-600">Rate
                                <input type="number" min="0" step="0.01" inputMode="decimal" value={item.unit_price || 0} onChange={(event) => updateMobileCommercialValue(index, 'unit_price', event.target.value)} readOnly={readOnly} aria-invalid={mobileCommercialErrors[`${index}-unit_price`] ? true : undefined} aria-describedby={mobileCommercialErrors[`${index}-unit_price`] ? `mobile-rate-error-${index}` : undefined} className="mt-1 min-h-11 w-full border border-gray-300 px-3 text-right text-base text-gray-900" />
                                {mobileCommercialErrors[`${index}-unit_price`] && <span id={`mobile-rate-error-${index}`} role="alert" className="mt-1 block text-xs text-red-700">{mobileCommercialErrors[`${index}-unit_price`]}</span>}
                            </label>
                            <label className="text-xs font-medium text-gray-600">Discount %
                                <input type="number" min="0" max="100" step="0.01" inputMode="decimal" value={item.discount_percent || item.discount || 0} onChange={(event) => updateMobileCommercialValue(index, 'discount_percent', event.target.value)} readOnly={readOnly} aria-invalid={mobileCommercialErrors[`${index}-discount_percent`] ? true : undefined} aria-describedby={mobileCommercialErrors[`${index}-discount_percent`] ? `mobile-discount-error-${index}` : undefined} className="mt-1 min-h-11 w-full border border-gray-300 px-3 text-right text-base text-gray-900" />
                                {mobileCommercialErrors[`${index}-discount_percent`] && <span id={`mobile-discount-error-${index}`} role="alert" className="mt-1 block text-xs text-red-700">{mobileCommercialErrors[`${index}-discount_percent`]}</span>}
                            </label>
                            <label className="text-xs font-medium text-gray-600">Free quantity
                                <input type="number" min="0" step={quantityInputStep} inputMode="decimal" value={item.free_quantity || item.free || 0} onChange={(event) => updateMobileQuantity(index, 'free_quantity', event.target.value)} readOnly={readOnly} aria-invalid={mobileQuantityErrors[`${index}-free_quantity`] ? true : undefined} aria-describedby={mobileQuantityErrors[`${index}-free_quantity`] ? `mobile-free-quantity-error-${index}` : undefined} className="mt-1 min-h-11 w-full border border-gray-300 px-3 text-right text-base text-gray-900" />
                                {mobileQuantityErrors[`${index}-free_quantity`] && <span id={`mobile-free-quantity-error-${index}`} role="alert" className="mt-1 block text-xs text-red-700">{mobileQuantityErrors[`${index}-free_quantity`]}</span>}
                            </label>
                            {showFreeSupplyTaxTreatment && (
                                <div className="col-span-2">
                                    {freeSupplyTreatmentSelect(item, index, 'mobile')}
                                </div>
                            )}
                        </div>

                        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-gray-100 pt-3 text-sm">
                            <span className="text-gray-500">MRP {formatCurrency(item.mrp || 0)}</span>
                            <span className="font-semibold text-gray-900">Line total {formatCurrency(calculateItemTotal(item))}</span>
                        </div>
                    </article>
                ))}
            </div>

            <div className="hidden overflow-x-auto rounded-lg border border-gray-200 bg-white xl:block">
            <table className="min-w-[1080px] w-full border-collapse">
                <thead>
                    <tr className="bg-gradient-to-r from-blue-50 to-indigo-50 border-b-2 border-blue-200">
                        <th className="px-3 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">#</th>
                        <th className="min-w-72 px-3 py-3 text-left text-xs font-semibold text-gray-700 uppercase tracking-wider">Product / batch</th>
                        <th className="px-3 py-3 text-right text-xs font-semibold text-gray-700 uppercase tracking-wider">
                            Qty
                            <div className="text-[10px] font-normal text-gray-500">Enter/Tab →</div>
                        </th>
                        <th className="px-3 py-3 text-right text-xs font-semibold text-gray-700 uppercase tracking-wider">Rate</th>
                        <th className="px-3 py-3 text-right text-xs font-semibold text-gray-700 uppercase tracking-wider">Discount %</th>
                        <th className="min-w-64 px-3 py-3 text-right text-xs font-semibold text-gray-700 uppercase tracking-wider">
                            {showFreeSupplyTaxTreatment ? 'Free qty / billing' : 'Free qty'}
                        </th>
                        <th className="px-3 py-3 text-right text-xs font-semibold text-gray-700 uppercase tracking-wider">GST %</th>
                        <th className="px-3 py-3 text-right text-xs font-semibold text-gray-700 uppercase tracking-wider">Line total</th>
                        {!readOnly && (
                            <th className="px-3 py-3 text-center text-xs font-semibold text-gray-700 uppercase tracking-wider">Action</th>
                        )}
                    </tr>
                </thead>
                <tbody>
                    {items.length === 0 ? (
                        <tr>
                            <td colSpan={readOnly ? 8 : 9} className="px-3 py-8 text-center text-gray-500">
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
                                <td className="min-w-72 px-3 py-2">
                                    <div className="text-sm font-medium leading-5 text-gray-900">{item.product_name || item.name}</div>
                                    <div className="mt-1 break-words text-xs text-gray-500">Batch: {item.batch_display || item.batch_number || 'No batch'}</div>
                                    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-gray-500">
                                        <span>Pack {item.packages_per_box || 1}×{item.units_per_pack || 1}</span>
                                        <span>Expiry {item.expiry_date ? new Date(item.expiry_date).toLocaleDateString('en-IN', { month: 'short', year: '2-digit' }) : '—'}</span>
                                        <span>MRP {formatCurrency(item.mrp || 0)}</span>
                                    </div>
                                </td>
                                <td className="px-3 py-2 text-right">
                                    <EditableCell
                                        ref={(el) => setFieldRef(index, 'quantity', el)}
                                        value={item.quantity || 0}
                                        type="number"
                                        min={0}
                                        step={Number(quantityInputStep)}
                                        decimalPlaces={Math.min(visibleQuantityDecimalPlaces(item.quantity), quantityDecimalPlaces)}
                                        maxDecimalPlaces={quantityDecimalPlaces}
                                        decimalPlacesErrorMessage={quantityPrecisionError}
                                        onSave={(val) => onUpdateItem?.(index, 'quantity', val)}
                                        onNavigate={(dir) => handleNavigate(index, 'quantity', dir as NavigationDirection)}
                                        readOnly={readOnly}
                                        selectOnFocus={true}
                                        className="w-20"
                                        preserveDecimalString={preserveExactDecimals}
                                        ariaLabel={`${item.product_name || item.name || `Item ${index + 1}`} quantity`}
                                    />
                                </td>
                                <td className="px-3 py-2 text-right">
                                    <EditableCell
                                        ref={(el) => setFieldRef(index, 'unit_price', el)}
                                        value={item.unit_price || 0}
                                        type="number"
                                        min={0}
                                        decimalPlaces={2}
                                        maxDecimalPlaces={COMMERCIAL_DECIMAL_PLACES}
                                        decimalPlacesErrorMessage={RATE_PRECISION_ERROR}
                                        prefix={currencySymbol}
                                        onSave={(val) => {
                                            onUpdateItem?.(index, 'unit_price', val);
                                        }}
                                        onNavigate={(dir) => handleNavigate(index, 'unit_price', dir as NavigationDirection)}
                                        readOnly={readOnly}
                                        selectOnFocus={true}
                                        className="w-24"
                                        preserveDecimalString={preserveExactDecimals}
                                        minimumDisplayDecimalPlaces={2}
                                        ariaLabel={`${item.product_name || item.name || `Item ${index + 1}`} rate`}
                                    />
                                </td>
                                <td className="px-3 py-2 text-right">
                                    <EditableCell
                                        ref={(el) => setFieldRef(index, 'discount_percent', el)}
                                        value={item.discount_percent || item.discount || 0}
                                        type="number"
                                        min={0}
                                        max={100}
                                        decimalPlaces={2}
                                        maxDecimalPlaces={COMMERCIAL_DECIMAL_PLACES}
                                        decimalPlacesErrorMessage={DISCOUNT_PRECISION_ERROR}
                                        suffix="%"
                                        onSave={(val) => onUpdateItem?.(index, 'discount_percent', val)}
                                        onNavigate={(dir) => handleNavigate(index, 'discount_percent', dir as NavigationDirection)}
                                        readOnly={readOnly}
                                        selectOnFocus={true}
                                        className="w-20"
                                        preserveDecimalString={preserveExactDecimals}
                                        minimumDisplayDecimalPlaces={2}
                                        ariaLabel={`${item.product_name || item.name || `Item ${index + 1}`} discount percent`}
                                    />
                                </td>
                                <td className="min-w-64 px-3 py-2 text-right">
                                    <EditableCell
                                        ref={(el) => setFieldRef(index, 'free', el)}
                                        value={item.free_quantity || item.free || 0}
                                        type="number"
                                        min={0}
                                        step={Number(quantityInputStep)}
                                        decimalPlaces={Math.min(visibleQuantityDecimalPlaces(item.free_quantity ?? item.free), quantityDecimalPlaces)}
                                        maxDecimalPlaces={quantityDecimalPlaces}
                                        decimalPlacesErrorMessage={quantityPrecisionError}
                                        onSave={(val) => onUpdateItem?.(index, 'free_quantity', val)}
                                        onNavigate={(dir) => handleNavigate(index, 'free', dir as NavigationDirection)}
                                        readOnly={readOnly}
                                        selectOnFocus={true}
                                        className="w-16"
                                        preserveDecimalString={preserveExactDecimals}
                                        ariaLabel={`${item.product_name || item.name || `Item ${index + 1}`} free quantity`}
                                    />
                                    {showFreeSupplyTaxTreatment && (
                                        <div className="mt-2">
                                            {freeSupplyTreatmentSelect(item, index, 'desktop')}
                                        </div>
                                    )}
                                </td>
                                <td className="px-3 py-2 text-right">
                                    <span className="text-sm text-gray-900 font-medium" title="Tax percentage from product master data (read-only)">
                                        {formatPercent(item.gst_percent ?? item.tax_rate)}%
                                    </span>
                                </td>
                                <td className="px-3 py-2 text-right">
                                    <div className="text-sm font-semibold text-gray-900">{formatCurrency(calculateItemTotal(item))}</div>
                                </td>
                                {!readOnly && (
                                    <td className="px-3 py-2 text-center">
                                        <button
                                            onClick={() => onRemoveItem?.(index)}
                                            className="inline-flex min-h-11 min-w-11 items-center justify-center rounded text-red-600 transition-colors hover:bg-red-50"
                                            title="Remove item"
                                            aria-label={`Remove ${item.product_name || item.name || 'item'}`}
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
                <div className="mt-2 hidden border border-blue-200 bg-blue-50 px-3 py-2 text-xs text-gray-600 xl:block">
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
