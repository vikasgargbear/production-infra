import React, { useState, useEffect, useRef, KeyboardEvent, ReactNode } from 'react';
import { X, Package, AlertCircle, CheckCircle, Shield, Clock, Box } from 'lucide-react';
import { batchesApi } from '../../../services/api';
import DateFormatter from '../../../services/dateFormatter';
import { INVOICE_CONFIG, getExpiryStatusConfig } from '../../../config/invoice.config';
import { mergeProductAndBatch } from '../../../utils/productMapper';
import { isCanonicalUuid } from '../../../utils/canonicalUuid';
import type { Product as CanonicalProduct } from '../../../types/models';

// ==================== HELPERS ====================

const requiredNumber = (value: unknown, field: string, row: number): number => {
    if (value === null || value === undefined || value === '') {
        throw new Error(`Batch row ${row} is missing ${field}`);
    }
    const parsed = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(parsed)) throw new Error(`Batch row ${row} has invalid ${field}`);
    return parsed;
};

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
type Product = CanonicalProduct & {
    id?: number | string;
    name?: string;
    mrp_per_unit?: number;
    sale_price_per_unit?: number;
    unit_price?: number;
    batches?: any[];  // OPTIMIZATION: Embedded batches from search
};

interface Batch {
    batch_id: string;
    batch_number: string;
    expiry_date: string;
    manufacturing_date: string;
    quantity_available: number;
    sale_price_per_unit: number;
    mrp_per_unit: number;
    cost_per_unit: number;
    days_to_expiry: number | null;
    has_pending_sync: boolean;
    product_id: string;
    product_name: string;
    gst_percent: number;
    location_id?: string;
    branch_id?: string;
    uom_conversion_id?: string;
    location_name?: string;
    branch_name?: string;
    // Pack info
    units_per_pack?: number;
    packages_per_box?: number;
    pack_type?: string;
}

interface ProductWithBatch extends Product {
    batch_id: number | string;
    batch_number: string;
    available_quantity: number;
    quantity: number;
    unit_price: number;
    mrp: number;
    expiry_date: string;
    manufacturing_date: string;
}

interface ExpiryInfo {
    status: 'expired' | 'critical' | 'warning' | 'good';
    icon: typeof AlertCircle;
    gradient: string;
    days: number;
    label?: string;
    color?: string;
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
    sortOrder = 'desc',
    filterExpired = true,
    minQuantity = 0,
    renderBatchInfo,
    className = '',
    maxHeight = '400px'
}) => {
    const [batches, setBatches] = useState<Batch[]>([]);
    const [loading, setLoading] = useState<boolean>(false);
    const [selectedBatch, setSelectedBatch] = useState<Batch | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [showCostInfo, setShowCostInfo] = useState<boolean>(false);
    const [focusedIndex, setFocusedIndex] = useState<number>(-1);
    const hasLoadedRef = useRef<number | string | false>(false);
    const containerRef = useRef<HTMLDivElement>(null);
    const batchRefs = useRef<(HTMLButtonElement | null)[]>([]);

    useEffect(() => {
        if (show && product && mode === 'modal') {
            const productId = product.product_id || product.id;

            if (!hasLoadedRef.current || hasLoadedRef.current !== productId) {
                loadBatches();
                hasLoadedRef.current = productId || false;
            }
            // Auto-focus modal for keyboard navigation
            setTimeout(() => containerRef.current?.focus(), 50);
        } else if (!show && mode === 'modal') {
            hasLoadedRef.current = false;
            setSelectedBatch(null);
            setBatches([]);
            setError(null);
            setFocusedIndex(-1);
        }
    }, [show, product?.product_id, product?.id, mode]);

    useEffect(() => {
        if (product && mode !== 'modal') {
            loadBatches();
        }
    }, [product, mode]);

    const loadBatches = async (): Promise<void> => {
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
    };

    const processBatches = (batchesData: any[]): void => {
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

            const daysToExpiry = batch.expiry_date
                ? Math.ceil((new Date(batch.expiry_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
                : null;

            const processed = {
                batch_id: batch.batch_id,
                batch_number: batch.batch_number,
                expiry_date: typeof batch.expiry_date === 'string' ? batch.expiry_date : '',
                manufacturing_date: typeof batch.manufacturing_date === 'string' ? batch.manufacturing_date : '',
                quantity_available: requiredNumber(batch.quantity_available, 'quantity_available', row),
                sale_price_per_unit: requiredNumber(batch.sale_price_per_unit, 'sale_price_per_unit', row),
                mrp_per_unit: requiredNumber(batch.mrp_per_unit, 'mrp_per_unit', row),
                cost_per_unit: requiredNumber(batch.cost_per_unit, 'cost_per_unit', row),
                days_to_expiry: daysToExpiry,
                has_pending_sync: false,
                product_id: batch.product_id,
                product_name: batch.product_name,
                gst_percent: requiredNumber(batch.gst_percent, 'gst_percent', row),
                location_id: batch.location_id,
                branch_id: batch.branch_id,
                uom_conversion_id: batch.uom_conversion_id,
                location_name: typeof batch.location_name === 'string' ? batch.location_name : undefined,
                branch_name: typeof batch.branch_name === 'string' ? batch.branch_name : undefined,
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
            processedBatches = processedBatches.filter(batch =>
                batch.quantity_available >= minQuantity
            );
        }

        processedBatches.sort((a, b) => {
            switch (sortBy) {
                case 'quantity':
                    return sortOrder === 'asc'
                        ? a.quantity_available - b.quantity_available
                        : b.quantity_available - a.quantity_available;

                case 'manufacturing':
                    const dateA = new Date(a.manufacturing_date || 0);
                    const dateB = new Date(b.manufacturing_date || 0);
                    return sortOrder === 'asc' ? dateA.getTime() - dateB.getTime() : dateB.getTime() - dateA.getTime();

                case 'expiry':
                default:
                    const daysA = a.days_to_expiry ?? 999999;
                    const daysB = b.days_to_expiry ?? 999999;
                    return sortOrder === 'asc' ? daysA - daysB : daysB - daysA;
            }
        });

        setBatches(processedBatches);
        batchRefs.current = processedBatches.map(() => null);

        // Auto-focus first batch for keyboard navigation (FEFO priority)
        if (processedBatches.length > 0) {
            setFocusedIndex(0);
        } else {
            setFocusedIndex(-1);
            setError('No batches available for this product (may be expired or out of stock)');
        }
    };

    const handleBatchSelect = (batch: Batch): void => {
        if (batch.quantity_available <= 0) {
            setError('This batch has no saleable stock. Refresh and select another batch.');
            return;
        }
        setSelectedBatch(batch);

        // Use centralized mapper to merge data correctly (ensures batch price > product price)
        const logicalBatch = mergeProductAndBatch(product as any, batch as any);

        // Ensure UI compatibility (strict strings vs undefined)
        const productWithBatch = {
            ...logicalBatch,
            manufacturing_date: logicalBatch.manufacturing_date || ''
        };

        setTimeout(() => {
            onBatchSelect(productWithBatch);
            if (mode === 'modal') {
                onClose();
            }
        }, (INVOICE_CONFIG as any).UI?.ANIMATION_DURATION || 150);
    };

    const getExpiryInfo = (expiryDate: string): ExpiryInfo | null => {
        if (!expiryDate) return null;

        const daysToExpiry = DateFormatter.daysBetween(new Date(), new Date(expiryDate));
        const status = getExpiryStatusConfig(daysToExpiry);

        const iconMap: Record<string, typeof AlertCircle> = {
            expired: AlertCircle,
            critical: AlertCircle,
            warning: Clock,
            good: Shield
        };

        return {
            ...status,
            icon: iconMap[status.status],
            gradient: '',
            days: daysToExpiry
        } as ExpiryInfo;
    };

    const defaultRenderBatchInfo = (batch: Batch, index?: number): ReactNode => {
        const expiryInfo = showExpiryStatus ? getExpiryInfo(batch.expiry_date) : null;
        const isSelected = selectedBatch?.batch_id === batch.batch_id;
        const isFocused = typeof index === 'number' && index === focusedIndex;

        return (
            <button
                type="button"
                key={String(batch.batch_id)}
                ref={(el) => { if (typeof index === 'number') batchRefs.current[index] = el; }}
                onClick={() => handleBatchSelect(batch)}
                role="option"
                aria-selected={isSelected}
                aria-label={`Select batch ${batch.batch_number} from ${batch.location_name || 'saleable stock'}`}
                className={cx(
                    'relative group block w-full cursor-pointer rounded-lg border text-left transition-colors bg-white mb-2',
                    isSelected
                        ? 'border-blue-500 bg-blue-50'
                        : isFocused
                            ? 'border-blue-400 ring-2 ring-blue-200 bg-blue-50'
                            : 'border-gray-200 hover:border-blue-300'
                )}
            >
                {isSelected && (
                    <div className="absolute -top-2 -right-2 w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center shadow-md z-10">
                        <CheckCircle className="w-4 h-4 text-white" />
                    </div>
                )}

                <div className="grid gap-4 p-3 items-center"
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
                    </div>

                    <div>
                        <div className="flex flex-col gap-0.5">
                            <span className="text-sm text-gray-700">
                                {DateFormatter.formatDate(batch.expiry_date, 'short')}
                            </span>
                            {showExpiryStatus && expiryInfo && (
                                <span className={cx(
                                    'text-xs font-medium',
                                    expiryInfo.status === 'expired' ? 'text-red-600' : '',
                                    expiryInfo.status === 'critical' ? 'text-red-600' : '',
                                    expiryInfo.status === 'warning' ? 'text-amber-600' : '',
                                    expiryInfo.status === 'good' ? 'text-emerald-600' : ''
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
                            (batch.quantity_available || 0) > 10 ? "text-emerald-600" :
                                (batch.quantity_available || 0) > 0 ? "text-amber-600" : "text-red-600"
                        )}>
                            {batch.quantity_available || 0}
                        </span>
                    </div>

                    <div className="text-right">
                        <span className="text-sm font-medium text-blue-700">
                            ₹{parseFloat(String(batch.sale_price_per_unit || 0)).toFixed(2)}
                        </span>
                    </div>

                    <div className="text-right">
                        <span className="text-sm text-gray-500">
                            ₹{parseFloat(String(batch.mrp_per_unit || 0)).toFixed(2)}
                        </span>
                    </div>

                    <div className="flex justify-end">
                        <div className={cx(
                            'px-3 py-1.5 rounded-md text-xs font-medium transition-all',
                            isSelected
                                ? 'bg-blue-500 text-white'
                                : 'bg-gray-100 text-gray-700 group-hover:bg-blue-100 group-hover:text-blue-700'
                        )}>
                            {isSelected ? '✓' : 'Select'}
                        </div>
                    </div>
                </div>

                {expiryInfo && (expiryInfo.status === 'expired' || expiryInfo.status === 'critical') && (
                    <div className={cx(
                        'px-3 py-1.5 border-t text-xs font-medium',
                        expiryInfo.status === 'expired' ? 'bg-red-50 text-red-700 border-red-200' : 'bg-amber-50 text-amber-700 border-amber-200'
                    )}>
                        <div className="flex items-center gap-1">
                            <AlertCircle size={12} />
                            <span>
                                {expiryInfo.status === 'expired'
                                    ? 'Expired - Cannot be sold'
                                    : 'Expiring soon - Prioritize (FEFO)'}
                            </span>
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
                    <div className="grid gap-4 px-3 py-2 bg-gray-50 border-b border-gray-200 mb-3 rounded-t-lg sticky top-0 z-10"
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
        if (e.shiftKey && (e.key === '~' || e.key === '`')) {
            e.preventDefault();
            setShowCostInfo(prev => !prev);
            return;
        }

        if (e.key === 'Escape') {
            e.preventDefault();
            onClose();
            return;
        }

        if (batches.length === 0) return;

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            setFocusedIndex(prev => {
                const next = (prev + 1) % batches.length;
                batchRefs.current[next]?.scrollIntoView({ block: 'nearest' });
                return next;
            });
            return;
        }

        if (e.key === 'ArrowUp') {
            e.preventDefault();
            setFocusedIndex(prev => {
                const next = (prev - 1 + batches.length) % batches.length;
                batchRefs.current[next]?.scrollIntoView({ block: 'nearest' });
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
