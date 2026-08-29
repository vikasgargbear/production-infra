import React, { useState, useEffect, useRef, useCallback, KeyboardEvent, ReactNode } from 'react';
import { X, Package, AlertCircle, CheckCircle, Box } from 'lucide-react';
import { batchesApi } from '../../../services/api';
import DateFormatter from '../../../services/dateFormatter';
import { isCanonicalUuid } from '../../../utils/canonicalUuid';
import type { Product as CanonicalProduct } from '../../../types/models';
import {
    compareExactDecimals,
    formatExactDecimal,
    normalizeAuthoritativeDecimal,
} from '../../../utils/exactDecimal';
import {
    batchDisabledReason,
    batchSelectionDisabledReason,
    compareBatchAvailability,
    compareBatchesByCanonicalFefo,
} from './batchEligibility';

// ==================== HELPERS ====================

const quantityOptions = { scale: 6, maximumWholeDigits: 14 } as const;
const moneyOptions = { scale: 4, maximumWholeDigits: 16 } as const;
const rateOptions = { scale: 6, maximumWholeDigits: 4 } as const;

const requiredDecimal = (
    value: unknown,
    field: string,
    row: number,
    options: typeof quantityOptions | typeof moneyOptions | typeof rateOptions,
): string => normalizeAuthoritativeDecimal(value, `Batch row ${row} ${field}`, options);

// Simple class concatenation helper (replaces cx from invoiceStyles)
const cx = (...classNames: (string | boolean | undefined | null)[]) =>
    classNames.filter(Boolean).join(' ');

// Modal styles derived from theme components
const styles = {
    modalOverlay: 'fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4',
    modalHeader: 'bg-white px-6 py-4 border-b border-gray-200',
    modalBody: 'p-6 overflow-y-auto max-h-[calc(90vh-100px)]',
    iconButton: 'min-h-11 min-w-11 p-2 hover:bg-gray-100 rounded-md transition-colors group flex items-center justify-center',
};

// ==================== TYPE DEFINITIONS ====================

// Extended Product with batch-specific UI fields
type Product = Omit<CanonicalProduct, 'mrp' | 'sale_price' | 'cost_per_unit' | 'gst_percent'> & {
    id?: number | string;
    name?: string;
    mrp_per_unit?: string;
    sale_price_per_unit?: string;
    unit_price?: string;
    mrp?: string;
    sale_price?: string;
    cost_per_unit?: string;
    gst_percent?: string;
    batches?: any[];  // OPTIMIZATION: Embedded batches from search
};

interface Batch {
    batch_id: string;
    batch_number: string;
    expiry_date: string;
    manufacturing_date: string;
    quantity_available: string;
    sale_price_per_unit: string;
    mrp_per_unit: string;
    cost_per_unit: string;
    days_to_expiry: number | null;
    has_pending_sync: boolean;
    product_id: string;
    product_name: string;
    gst_percent: string;
    location_id?: string;
    branch_id?: string;
    uom_conversion_id?: string;
    location_name?: string;
    branch_name?: string;
    batch_status: string;
    // Pack info
    units_per_pack?: string;
    packages_per_box?: string;
    pack_type?: string;
}

export interface BatchAllocationCandidate {
    batch_id: string;
    batch_number: string;
    expiry_date: string;
    available_quantity: string;
    location_id: string;
    branch_id: string;
    uom_conversion_id: string;
}

interface ProductWithBatch extends Product {
    batch_id: number | string;
    batch_number: string;
    available_quantity: string;
    quantity_available: string;
    quantity: string;
    free_quantity: string;
    unit_price: string;
    mrp: string;
    expiry_date: string;
    manufacturing_date: string;
    allocation_batches: BatchAllocationCandidate[];
}

interface ExpiryInfo {
    status: 'expired' | 'available';
    days: number;
}

interface BatchSelectorProps {
    show: boolean;
    product: Product | null;
    onBatchSelect: (productWithBatch: ProductWithBatch) => void;
    onClose: () => void;
    mode?: 'modal' | 'inline' | 'dropdown';
    showExpiryStatus?: boolean;
    sortBy?: 'expiry' | 'quantity' | 'manufacturing';
    sortOrder?: 'asc' | 'desc';
    filterExpired?: boolean;
    minQuantity?: number;
    enforceFefo?: boolean;
    renderBatchInfo?: (batch: Batch) => ReactNode;
    className?: string;
    maxHeight?: string;
}

// ==================== COMPONENT ====================

const BatchSelector: React.FC<BatchSelectorProps> = ({
    show,
    product,
    onBatchSelect,
    onClose,
    mode = 'modal',
    showExpiryStatus = true,
    sortBy = 'expiry',
    sortOrder = 'asc',
    filterExpired = true,
    minQuantity = 0,
    enforceFefo = false,
    renderBatchInfo,
    className = '',
    maxHeight = '400px'
}) => {
    const [batches, setBatches] = useState<Batch[]>([]);
    const [loading, setLoading] = useState<boolean>(false);
    const [selectedBatch, setSelectedBatch] = useState<Batch | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [focusedIndex, setFocusedIndex] = useState<number>(-1);
    const hasLoadedRef = useRef<number | string | false>(false);
    const containerRef = useRef<HTMLDivElement>(null);
    const batchRefs = useRef<(HTMLButtonElement | null)[]>([]);

    const processBatches = useCallback((batchesData: any[]): void => {
        let processedBatches: Batch[] = batchesData.map((batch, index) => {
            const row = index + 1;
            for (const [field, value] of [
                ['batch_id', batch.batch_id], ['product_id', batch.product_id],
                ['location_id', batch.location_id], ['branch_id', batch.branch_id],
                ['uom_conversion_id', batch.uom_conversion_id],
            ]) {
                if (!isCanonicalUuid(value)) throw new Error(`Batch row ${row} has invalid ${field}`);
            }
            if (typeof batch.batch_number !== 'string' || typeof batch.product_name !== 'string'
                || typeof batch.expiry_date !== 'string') {
                throw new Error(`Batch row ${row} is missing identity fields`);
            }

            if (!Number.isInteger(batch.days_to_expiry)) {
                throw new Error(`Batch row ${row} is missing canonical days_to_expiry`);
            }

            const processed = {
                batch_id: batch.batch_id,
                batch_number: batch.batch_number,
                expiry_date: typeof batch.expiry_date === 'string' ? batch.expiry_date : '',
                manufacturing_date: typeof batch.manufacturing_date === 'string' ? batch.manufacturing_date : '',
                quantity_available: requiredDecimal(batch.quantity_available, 'quantity_available', row, quantityOptions),
                sale_price_per_unit: requiredDecimal(batch.sale_price_per_unit, 'sale_price_per_unit', row, moneyOptions),
                mrp_per_unit: requiredDecimal(batch.mrp_per_unit, 'mrp_per_unit', row, moneyOptions),
                cost_per_unit: requiredDecimal(batch.cost_per_unit, 'cost_per_unit', row, moneyOptions),
                days_to_expiry: batch.days_to_expiry,
                has_pending_sync: false,
                product_id: batch.product_id,
                product_name: batch.product_name,
                gst_percent: requiredDecimal(batch.gst_percent, 'gst_percent', row, rateOptions),
                location_id: batch.location_id,
                branch_id: batch.branch_id,
                uom_conversion_id: batch.uom_conversion_id,
                location_name: typeof batch.location_name === 'string' ? batch.location_name : undefined,
                branch_name: typeof batch.branch_name === 'string' ? batch.branch_name : undefined,
                batch_status: typeof batch.batch_status === 'string' ? batch.batch_status : '',
            };

            return processed;
        });

        if (filterExpired) {
            processedBatches = processedBatches.filter(batch => {
                const daysToExpiry = batch.days_to_expiry;
                return daysToExpiry === null || daysToExpiry > 0;
            });
        }

        if (minQuantity > 0) {
            processedBatches = processedBatches.filter(batch => compareExactDecimals(
                batch.quantity_available,
                String(minQuantity),
                'Minimum batch quantity',
                quantityOptions,
            ) >= 0);
        }

        processedBatches.sort((a, b) => {
            switch (sortBy) {
                case 'quantity':
                    return sortOrder === 'asc'
                        ? compareBatchAvailability(a, b)
                        : compareBatchAvailability(b, a);

                case 'manufacturing':
                    const dateA = new Date(a.manufacturing_date || 0);
                    const dateB = new Date(b.manufacturing_date || 0);
                    return sortOrder === 'asc' ? dateA.getTime() - dateB.getTime() : dateB.getTime() - dateA.getTime();

                case 'expiry':
                default:
                    return sortOrder === 'asc'
                        ? compareBatchesByCanonicalFefo(a, b)
                        : compareBatchesByCanonicalFefo(b, a);
            }
        });

        setBatches(processedBatches);
        batchRefs.current = processedBatches.map(() => null);

        // Auto-focus the first saleable batch; blocked stock is informational.
        const firstSaleableIndex = processedBatches.findIndex(batch =>
            !batchSelectionDisabledReason(batch, processedBatches, enforceFefo)
        );
        if (firstSaleableIndex >= 0) {
            setFocusedIndex(firstSaleableIndex);
            setSelectedBatch(enforceFefo ? processedBatches[firstSaleableIndex] : null);
        } else {
            setFocusedIndex(-1);
            // Keep lifecycle-blocked rows visible so the reason is actionable.
            setError(processedBatches.length === 0
                ? 'No batches available for this product (may be expired or out of stock)'
                : null);
        }
    }, [enforceFefo, filterExpired, minQuantity, sortBy, sortOrder]);

    const loadBatches = useCallback(async (): Promise<void> => {
        if (!product) return;

        const productId = product.product_id || product.id;
        if (!isCanonicalUuid(productId)) {
            setError('This product is missing its canonical UUID. Re-select it and try again.');
            return;
        }
        setLoading(true);
        setError(null);

        try {
            const response = await batchesApi.getByProduct(String(productId));
            const batchesData = response.data?.batches;
            if (!Array.isArray(batchesData)) {
                throw new Error('Batch API returned an invalid canonical response');
            }
            processBatches(batchesData);
        } catch (error) {
            console.error('[BatchSelector] API load failed:', error);
            setBatches([]);
            setError(error instanceof Error ? error.message : 'Failed to load batches. Please try again.');
        } finally {
            setLoading(false);
        }
    }, [processBatches, product]);

    useEffect(() => {
        if (show && product && mode === 'modal') {
            const productId = product.product_id || product.id;

            if (!hasLoadedRef.current || hasLoadedRef.current !== productId) {
                void loadBatches();
                hasLoadedRef.current = productId || false;
            }
            const focusTimer = window.setTimeout(() => containerRef.current?.focus(), 50);
            return () => window.clearTimeout(focusTimer);
        }
        if (!show && mode === 'modal') {
            hasLoadedRef.current = false;
            setSelectedBatch(null);
            setBatches([]);
            setError(null);
            setFocusedIndex(-1);
        }
        return undefined;
    }, [loadBatches, mode, product, show]);

    useEffect(() => {
        if (product && mode !== 'modal') {
            void loadBatches();
        }
    }, [loadBatches, mode, product]);

    const handleBatchSelect = (batch: Batch): void => {
        if (!product) return;
        const disabledReason = batchSelectionDisabledReason(batch, batches, enforceFefo);
        if (disabledReason) {
            setError(`${disabledReason}. Refresh or select another batch.`);
            return;
        }
        setSelectedBatch(batch);

        // The selected canonical batch owns stock and price.  Product-level
        // price aliases are deliberately overwritten, never used as fallback.
        const allocationBatches = batches
            .filter(candidate => candidate.location_id === batch.location_id)
            .filter(candidate => batchDisabledReason(candidate) === null)
            .sort((left, right) => {
                if (left.batch_id === batch.batch_id) return -1;
                if (right.batch_id === batch.batch_id) return 1;
                return compareBatchesByCanonicalFefo(left, right);
            })
            .map((candidate): BatchAllocationCandidate => ({
                batch_id: candidate.batch_id,
                batch_number: candidate.batch_number,
                expiry_date: candidate.expiry_date,
                available_quantity: candidate.quantity_available,
                location_id: candidate.location_id!,
                branch_id: candidate.branch_id!,
                uom_conversion_id: candidate.uom_conversion_id!,
            }));

        const productWithBatch: ProductWithBatch = {
            ...product,
            ...batch,
            available_quantity: batch.quantity_available,
            quantity_available: batch.quantity_available,
            quantity: '1.000000',
            free_quantity: '0.000000',
            unit_price: batch.sale_price_per_unit,
            sale_price: batch.sale_price_per_unit,
            mrp: batch.mrp_per_unit,
            manufacturing_date: batch.manufacturing_date,
            allocation_batches: allocationBatches,
        };

        onBatchSelect(productWithBatch);
        if (mode === 'modal') {
            onClose();
        }
    };

    const getExpiryInfo = (batch: Batch): ExpiryInfo => {
        const days = batch.days_to_expiry;
        if (typeof days !== 'number' || !Number.isInteger(days)) {
            throw new Error(`Batch ${batch.batch_number} is missing canonical days_to_expiry`);
        }
        return { status: days <= 0 ? 'expired' : 'available', days };
    };

    const defaultRenderBatchInfo = (batch: Batch, index?: number): ReactNode => {
        const expiryInfo = showExpiryStatus ? getExpiryInfo(batch) : null;
        const isSelected = selectedBatch?.batch_id === batch.batch_id;
        const isFocused = typeof index === 'number' && index === focusedIndex;
        const disabledReason = batchSelectionDisabledReason(batch, batches, enforceFefo);
        const recommendedBatchId = batches.find(candidate =>
            !batchSelectionDisabledReason(candidate, batches, enforceFefo)
        )?.batch_id;
        const isRecommended = enforceFefo && recommendedBatchId === batch.batch_id;

        return (
            <button
                type="button"
                key={String(batch.batch_id)}
                data-batch-id={batch.batch_id}
                data-testid={`select-batch-${batch.batch_id}`}
                ref={(el) => { if (typeof index === 'number') batchRefs.current[index] = el; }}
                onClick={() => handleBatchSelect(batch)}
                disabled={Boolean(disabledReason)}
                role="option"
                aria-selected={isSelected}
                aria-disabled={Boolean(disabledReason)}
                aria-label={disabledReason
                    ? `Batch ${batch.batch_number} unavailable: ${disabledReason}`
                    : `Select batch ${batch.batch_number} from ${batch.location_name || 'saleable stock'}`}
                className={cx(
                    'relative group block w-full rounded-lg border text-left transition-colors bg-white mb-2',
                    disabledReason
                        ? 'cursor-not-allowed border-gray-200 bg-gray-50 opacity-75'
                        : 'cursor-pointer',
                    !disabledReason && isSelected
                        ? 'border-blue-500 bg-blue-50'
                        : !disabledReason && isFocused
                            ? 'border-blue-400 ring-2 ring-blue-200 bg-blue-50'
                            : !disabledReason ? 'border-gray-200 hover:border-blue-300' : ''
                )}
            >
                {isSelected && (
                    <div className="absolute -top-2 -right-2 w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center shadow-md z-10">
                        <CheckCircle className="w-4 h-4 text-white" />
                    </div>
                )}

                <div className="hidden gap-4 p-3 items-center md:grid"
                    style={{ gridTemplateColumns: '2fr 1.3fr 1.3fr 0.7fr 0.8fr 0.8fr 0.6fr' }}>
                    <div>
                        <div className="flex items-center gap-1.5">
                            <Package size={14} className="text-gray-400 flex-shrink-0" />
                            <span className={cx(
                                "font-semibold text-sm",
                                isSelected ? "text-blue-700" : "text-gray-900"
                            )}>
                                {batch.batch_number}
                            </span>
                        </div>
                        {batch.location_name && (
                            <div className="mt-1 text-xs text-gray-500">
                                {batch.location_name}{batch.branch_name ? ` · ${batch.branch_name}` : ''}
                            </div>
                        )}
                        {isRecommended && (
                            <div className="mt-1 text-xs font-semibold text-blue-700">
                                Recommended FEFO batch
                            </div>
                        )}
                    </div>

                    <div>
                        <div className="flex flex-col gap-0.5">
                            <span className="text-sm text-gray-700">
                                {DateFormatter.formatDate(batch.expiry_date, 'short')}
                            </span>
                            {showExpiryStatus && expiryInfo && (
                                <span className={cx(
                                    'text-xs font-medium',
                                    expiryInfo.status === 'expired' ? 'text-red-600' : 'text-gray-600'
                                )}>
                                    {expiryInfo.days > 0 ? `${expiryInfo.days} days` : 'Expired'}
                                </span>
                            )}
                        </div>
                    </div>

                    <div>
                        <span className="text-sm text-gray-600">
                            {batch.manufacturing_date
                                ? DateFormatter.formatDate(batch.manufacturing_date, 'short')
                                : '-'}
                        </span>
                    </div>

                    <div className="text-center">
                        <span className={cx(
                            "text-sm font-bold",
                            compareExactDecimals(batch.quantity_available, '0', 'Batch availability', quantityOptions) > 0
                                ? "text-gray-900" : "text-red-600"
                        )}>
                            {formatExactDecimal(batch.quantity_available, 'Batch availability', quantityOptions)}
                        </span>
                    </div>

                    <div className="text-right">
                        <span className="text-sm font-medium text-blue-700">
                            ₹{formatExactDecimal(batch.sale_price_per_unit, 'Batch sale rate', moneyOptions, 2)}
                        </span>
                    </div>

                    <div className="text-right">
                        <span className="text-sm text-gray-500">
                            ₹{formatExactDecimal(batch.mrp_per_unit, 'Batch MRP', moneyOptions, 2)}
                        </span>
                    </div>

                    <div className="flex justify-end">
                        <div className={cx(
                            'px-3 py-1.5 rounded-md text-xs font-medium transition-all',
                            disabledReason
                                ? 'bg-gray-200 text-gray-600'
                                : isSelected
                                ? 'bg-blue-500 text-white'
                                : 'bg-gray-100 text-gray-700 group-hover:bg-blue-100 group-hover:text-blue-700'
                        )}>
                            {disabledReason ? 'Unavailable' : isSelected ? '✓' : 'Select'}
                        </div>
                    </div>
                </div>

                <div className="p-3 md:hidden">
                    <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                                <Package size={16} className="shrink-0 text-gray-400" />
                                <span className={cx(
                                    'truncate text-sm font-semibold',
                                    isSelected ? 'text-blue-700' : 'text-gray-900'
                                )}>
                                    {batch.batch_number}
                                </span>
                            </div>
                            {batch.location_name && (
                                <div className="mt-1 text-xs text-gray-500">
                                    {batch.location_name}{batch.branch_name ? ` · ${batch.branch_name}` : ''}
                                </div>
                            )}
                        </div>
                        <div className="shrink-0 rounded-md bg-gray-100 px-2 py-1 text-xs font-semibold text-gray-800">
                            Stock {formatExactDecimal(batch.quantity_available, 'Batch availability', quantityOptions)}
                        </div>
                    </div>

                    <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3 border-t border-gray-100 pt-3">
                        <div>
                            <dt className="text-[11px] font-medium uppercase tracking-wide text-gray-500">Expiry</dt>
                            <dd className="mt-0.5 text-sm text-gray-800">
                                {DateFormatter.formatDate(batch.expiry_date, 'short')}
                            </dd>
                        </div>
                        <div>
                            <dt className="text-[11px] font-medium uppercase tracking-wide text-gray-500">Mfg date</dt>
                            <dd className="mt-0.5 text-sm text-gray-800">
                                {batch.manufacturing_date
                                    ? DateFormatter.formatDate(batch.manufacturing_date, 'short')
                                    : '—'}
                            </dd>
                        </div>
                        <div>
                            <dt className="text-[11px] font-medium uppercase tracking-wide text-gray-500">Rate</dt>
                            <dd className="mt-0.5 text-sm font-medium text-gray-900">
                                ₹{formatExactDecimal(batch.sale_price_per_unit, 'Batch sale rate', moneyOptions, 2)}
                            </dd>
                        </div>
                        <div>
                            <dt className="text-[11px] font-medium uppercase tracking-wide text-gray-500">MRP</dt>
                            <dd className="mt-0.5 text-sm text-gray-800">
                                ₹{formatExactDecimal(batch.mrp_per_unit, 'Batch MRP', moneyOptions, 2)}
                            </dd>
                        </div>
                    </dl>

                    <div className={cx(
                        'mt-3 flex min-h-11 w-full items-center justify-center rounded-md px-4 text-sm font-semibold',
                        disabledReason
                            ? 'bg-gray-200 text-gray-600'
                            : isSelected
                                ? 'bg-blue-600 text-white'
                                : 'bg-blue-600 text-white group-hover:bg-blue-700'
                    )}>
                        {disabledReason ? 'Unavailable' : isSelected ? '✓ Selected' : 'Select this batch'}
                    </div>
                </div>

                {expiryInfo?.status === 'expired' && (
                    <div className="border-t border-red-200 bg-red-50 px-3 py-1.5 text-xs font-medium text-red-700">
                        <div className="flex items-center gap-1">
                            <AlertCircle size={12} />
                            <span>Expired - Cannot be sold</span>
                        </div>
                    </div>
                )}
                {disabledReason && (
                    <div className="border-t border-gray-200 bg-gray-100 px-3 py-1.5 text-xs font-medium text-gray-700">
                        <div className="flex items-center gap-1">
                            <AlertCircle size={12} />
                            <span>{disabledReason}</span>
                        </div>
                    </div>
                )}
            </button>
        );
    };

    const renderContent = (): ReactNode => (
        <>
            {loading ? (
                <div className="flex flex-col items-center justify-center py-20">
                    <div className="relative">
                        <div className="w-16 h-16 border-4 border-gray-200 rounded-full"></div>
                        <div className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin absolute inset-0"></div>
                    </div>
                    <p className="text-gray-600 mt-4 font-medium">Loading batches...</p>
                </div>
            ) : error ? (
                <div className="text-center py-20">
                    <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
                    <p className="text-red-600 font-medium">{error}</p>
                    <button
                        onClick={loadBatches}
                        className="mt-4 min-h-11 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors"
                    >
                        Retry
                    </button>
                </div>
            ) : batches.length === 0 ? (
                <div className="text-center py-20">
                    <div className="w-20 h-20 bg-gray-50 border border-gray-200 rounded-lg flex items-center justify-center mx-auto mb-5">
                        <Package className="w-12 h-12 text-gray-400" />
                    </div>
                    <p className="text-gray-900 font-bold text-xl">No Batches Available</p>
                    <p className="text-gray-500 mt-2">This product doesn't have any batches in stock</p>
                </div>
            ) : (
                <>
                    {enforceFefo && batches.some(batch =>
                        batchSelectionDisabledReason(batch, batches, true)?.includes('FEFO requires')
                    ) && (
                        <div className="mb-3 rounded-md border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-900">
                            FEFO protects stock from expiry loss. Choose any batch in the earliest-expiry tier; later-expiry stock unlocks only after earlier stock is used.
                        </div>
                    )}
                    {!batches.some(batch =>
                        !batchSelectionDisabledReason(batch, batches, enforceFefo)
                    ) && (
                        <div className="mb-3 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                            No saleable batch is currently released. See each batch for the blocking reason.
                        </div>
                    )}
                    <div className="hidden gap-4 px-3 py-2 bg-gray-50 border-b border-gray-200 mb-3 rounded-t-lg sticky top-0 z-10 md:grid"
                        style={{ gridTemplateColumns: '2fr 1.3fr 1.3fr 0.7fr 0.8fr 0.8fr 0.6fr' }}>
                        <div className="text-xs font-semibold text-gray-700 uppercase">Batch #</div>
                        <div className="text-xs font-semibold text-gray-700 uppercase">Expiry</div>
                        <div className="text-xs font-semibold text-gray-700 uppercase">Mfg Date</div>
                        <div className="text-xs font-semibold text-gray-700 uppercase text-center">Stock</div>
                        <div className="text-xs font-semibold text-gray-700 uppercase text-right">Rate</div>
                        <div className="text-xs font-semibold text-gray-700 uppercase text-right">MRP</div>
                        <div className="text-xs font-semibold text-gray-700 uppercase text-right">Action</div>
                    </div>

                    <div className="space-y-0 max-w-full">
                        {batches.map((batch, index) =>
                            renderBatchInfo ? renderBatchInfo(batch) : defaultRenderBatchInfo(batch, index)
                        )}
                    </div>
                </>
            )}
        </>
    );

    if (mode === 'inline') {
        return (
            <div className={cx('bg-white rounded-lg border border-gray-200', className)} ref={containerRef}>
                <div className="p-4">
                    <h3 className="text-sm font-medium text-gray-700 mb-3 flex items-center">
                        <Box className="w-4 h-4 mr-2" />
                        Select Batch {product ? `for ${product.product_name}` : ''}
                    </h3>
                    <div style={{ maxHeight, overflowY: 'auto' }}>
                        {renderContent()}
                    </div>
                </div>
            </div>
        );
    }

    if (mode === 'dropdown') {
        return (
            <div className={cx('relative', className)} ref={containerRef}>
                <div className="absolute z-10 mt-1 w-full bg-white rounded-lg border border-gray-200"
                    style={{ maxHeight, overflowY: 'auto' }}>
                    <div className="p-4">
                        {renderContent()}
                    </div>
                </div>
            </div>
        );
    }

    const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>): void => {
        if (e.key === 'Escape') {
            e.preventDefault();
            onClose();
            return;
        }

        const saleableIndexes = batches
            .map((batch, index) =>
                batchSelectionDisabledReason(batch, batches, enforceFefo) ? -1 : index
            )
            .filter(index => index >= 0);
        if (saleableIndexes.length === 0) return;

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setFocusedIndex(prev => {
                const current = saleableIndexes.indexOf(prev);
                const next = saleableIndexes[(current + 1) % saleableIndexes.length];
                const nextBatch = batchRefs.current[next];
                if (typeof nextBatch?.scrollIntoView === 'function') {
                    nextBatch.scrollIntoView({ block: 'nearest' });
                }
                return next;
            });
            return;
        }

        if (e.key === 'ArrowUp') {
            e.preventDefault();
            setFocusedIndex(prev => {
                const current = saleableIndexes.indexOf(prev);
                const next = saleableIndexes[(current - 1 + saleableIndexes.length) % saleableIndexes.length];
                const nextBatch = batchRefs.current[next];
                if (typeof nextBatch?.scrollIntoView === 'function') {
                    nextBatch.scrollIntoView({ block: 'nearest' });
                }
                return next;
            });
            return;
        }

        if (e.key === 'Enter' && focusedIndex >= 0 && focusedIndex < batches.length) {
            e.preventDefault();
            handleBatchSelect(batches[focusedIndex]);
            return;
        }
    };

    if (!show) return null;

    return (
        <div className={styles.modalOverlay}>
            <div
                className="bg-white rounded-lg border border-gray-200 w-full max-w-4xl max-h-[90vh] overflow-hidden outline-none"
                tabIndex={-1}
                onKeyDown={handleKeyDown}
                ref={containerRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby="batch-selector-title"
            >
                <div className={styles.modalHeader}>
                    <div className="flex items-center justify-between">
                        <div>
                            <h3 id="batch-selector-title" className="text-lg font-bold text-gray-900">Select Batch</h3>
                            <p className="text-sm text-gray-500 mt-0.5">{product?.product_name}</p>
                        </div>
                        <div className="flex items-center gap-3">
                            <span className="text-xs text-gray-400 hidden sm:inline">
                                <kbd className="px-1 py-0.5 bg-gray-100 rounded border border-gray-200 text-gray-500 font-mono text-[10px]">↑↓</kbd> Navigate
                                <span className="mx-1">·</span>
                                <kbd className="px-1 py-0.5 bg-gray-100 rounded border border-gray-200 text-gray-500 font-mono text-[10px]">Enter</kbd> Select
                                <span className="mx-1">·</span>
                                <kbd className="px-1 py-0.5 bg-gray-100 rounded border border-gray-200 text-gray-500 font-mono text-[10px]">Esc</kbd> Close
                            </span>
                            <button
                                type="button"
                                onClick={onClose}
                                className={styles.iconButton}
                                aria-label="Close batch selector"
                                title="Close"
                            >
                                <X className="w-5 h-5 text-gray-500 group-hover:text-gray-700" />
                            </button>
                        </div>
                    </div>
                </div>

                <div className={styles.modalBody}>
                    {renderContent()}
                </div>
            </div>
        </div>
    );
};

export default BatchSelector;
