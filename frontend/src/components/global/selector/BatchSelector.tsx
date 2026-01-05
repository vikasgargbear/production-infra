import React, { useState, useEffect, useRef, KeyboardEvent, ReactNode } from 'react';
import { X, Package, AlertCircle, CheckCircle, Shield, Clock, Box } from 'lucide-react';
import { batchesApi } from '../../../services/api';
import { searchCache } from '../../../utils/searchCache';
import DateFormatter from '../../../services/dateFormatter';
import { INVOICE_CONFIG, getExpiryStatusConfig } from '../../../config/invoice.config';
import offlineDB from '../../../services/offline/core/offlineDatabase';
import { mergeProductAndBatch } from '../../../utils/productMapper';

// ==================== HELPERS ====================

/** Generate consistent cache key for batches */
const getBatchCacheKey = (productId: string | number): string => `batches_${productId}`;

// Simple class concatenation helper (replaces cx from invoiceStyles)
const cx = (...classNames: (string | boolean | undefined | null)[]) =>
    classNames.filter(Boolean).join(' ');

// Modal styles derived from theme components
const styles = {
    modalOverlay: 'fixed inset-0 bg-black/40 backdrop-blur-sm flex items-center justify-center z-50 p-4',
    modalHeader: 'bg-gradient-to-r from-blue-50 to-indigo-50 px-6 py-5 border-b border-gray-100',
    modalBody: 'p-6 overflow-y-auto max-h-[calc(90vh-120px)]',
    iconButton: 'p-2 hover:bg-gray-100 rounded-lg transition-colors group',
};


// ==================== TYPE DEFINITIONS ====================

interface Product {
    product_id?: number | string;
    id?: number | string;
    product_name?: string;
    name?: string;
    gst_percent?: number;
    mrp_per_unit?: number;
    mrp?: number;
    sale_price_per_unit?: number;
    unit_price?: number;
    [key: string]: unknown;
    batches?: any[]; // OPTIMIZATION: Embedded batches from search
}

interface Batch {
    batch_id: number | string;
    batch_number: string;
    expiry_date: string;
    manufacturing_date: string;
    quantity_available: number;
    sale_price_per_unit: number;
    mrp_per_unit: number;
    cost_per_unit: number;
    days_to_expiry: number | null;
    has_pending_sync: boolean;
    product_id?: number | string;
    product_name: string;
    gst_percent: number;
}

interface ProductWithBatch extends Product {
    batch_id: number | string;
    batch_number: string;
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
    allowCreateDefault?: boolean;
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
    allowCreateDefault = true,
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
    const hasLoadedRef = useRef<number | string | false>(false);
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (show && product && mode === 'modal') {
            const productId = product.product_id || product.id;

            if (!hasLoadedRef.current || hasLoadedRef.current !== productId) {
                loadBatches();
                hasLoadedRef.current = productId || false;
            }
        } else if (!show && mode === 'modal') {
            hasLoadedRef.current = false;
            setSelectedBatch(null);
            setBatches([]);
            setError(null);
        }
    }, [show, product?.product_id, product?.id, mode]);

    useEffect(() => {
        if (product && mode !== 'modal') {
            loadBatches();
        }
    }, [product, mode]);

    const loadBatches = async (): Promise<void> => {
        if (!product) return;

        // OPTIMIZATION: Use embedded batches if available (no API call needed)
        if (product.batches && Array.isArray(product.batches) && product.batches.length > 0) {
            console.log('[BatchSelector] Using embedded batches from product (OPTIMIZED)');
            processBatches(product.batches);
            return;
        }

        const productId = product.product_id || product.id;
        if (!productId) {
            console.warn('[BatchSelector] No product ID available');
            setError('Product ID not available');
            return;
        }
        const cacheKey = getBatchCacheKey(productId);

        // LAYER 1: Memory cache (instant)
        const cachedBatches = searchCache.get(cacheKey);
        if (cachedBatches && cachedBatches.length > 0) {
            console.log('[BatchSelector] Using memory cache (instant)');
            processBatches(cachedBatches);
            return;
        }

        try {
            const offlineBatches = await offlineDB.getBatchesByProduct(productId);
            if (offlineBatches && offlineBatches.length > 0) {
                console.log(`[BatchSelector] Loaded ${offlineBatches.length} batches from IndexedDB (instant)`);
                processBatches(offlineBatches);
                searchCache.set(cacheKey, offlineBatches); // Promote to memory cache
                // NOTE: No background API refresh needed - data is fresh from search-with-batches
                return;
            }
        } catch (offlineError) {
            console.warn('[BatchSelector] IndexedDB load failed:', offlineError);
        }

        // No local data - must fetch from API
        setLoading(true);
        setError(null);

        try {
            await fetchAndStoreBatches(productId as string | number, true);
        } catch (error) {
            console.error('[BatchSelector] API load failed:', error);
            setError('Failed to load batches. Please try again.');

            if (allowCreateDefault && product) {
                const fallbackBatch = createDefaultBatch(product);
                setBatches([fallbackBatch]);
            }
        } finally {
            setLoading(false);
        }
    };

    const fetchAndStoreBatches = async (productId: string | number, showLoadingSpinner: boolean = true): Promise<Batch[]> => {
        try {
            const response = await batchesApi.getByProduct(productId);
            const batchesData = response.data?.batches || response.data || [];

            // Update caches
            searchCache.set(getBatchCacheKey(productId), batchesData);

            try {
                await offlineDB.storeBatches(batchesData);
            } catch (e) {
                console.warn('[BatchSelector] IndexedDB cache failed:', e);
            }

            // ALWAYS update UI with fresh data (critical for pricing accuracy)
            // The showLoadingSpinner flag only controls whether we showed a spinner initially
            processBatches(batchesData);
            console.log(`[BatchSelector] UI updated with ${batchesData.length} fresh batches from API`);

            return batchesData;
        } catch (error) {
            console.error('[BatchSelector] Failed to fetch batches:', error);
            throw error;
        }
    };

    const processBatches = (batchesData: any[]): void => {
        console.log('🔍 [BatchSelector] Raw batch data from API/cache:', batchesData);

        let processedBatches: Batch[] = batchesData.map(batch => {
            // DEBUG: Log raw batch pricing
            console.log(`🔍 [BatchSelector] Batch ${batch.batch_id} raw pricing:`, {
                sale_price_per_unit: batch.sale_price_per_unit,
                mrp_per_unit: batch.mrp_per_unit,
                cost_per_unit: batch.cost_per_unit
            });

            const daysToExpiry = batch.expiry_date
                ? Math.ceil((new Date(batch.expiry_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
                : null;

            const available = parseInt(batch.quantity_available || 0);

            const processed = {
                batch_id: batch.batch_id,
                batch_number: batch.batch_number || '',
                expiry_date: batch.expiry_date || '',
                manufacturing_date: batch.manufacturing_date || '',
                quantity_available: available,
                sale_price_per_unit: parseFloat(batch.sale_price_per_unit || 0),
                mrp_per_unit: parseFloat(batch.mrp_per_unit || 0),
                cost_per_unit: parseFloat(batch.cost_per_unit || 0),
                days_to_expiry: daysToExpiry,
                has_pending_sync: false,
                product_id: batch.product_id || product?.product_id,
                product_name: batch.product_name || product?.product_name || '',
                gst_percent: batch.gst_percent || product?.gst_percent || 0
            };

            // DEBUG: Log processed batch pricing
            console.log(`🔍 [BatchSelector] Batch ${batch.batch_id} processed:`, {
                sale_price_per_unit: processed.sale_price_per_unit,
                mrp_per_unit: processed.mrp_per_unit
            });

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

        if (processedBatches.length === 0 && allowCreateDefault && product) {
            const defaultBatch = createDefaultBatch(product);
            setBatches([defaultBatch]);
        }
    };

    const createDefaultBatch = (prod: Product): Batch => {
        const expiryDate = new Date(Date.now() + (INVOICE_CONFIG as any).BATCH.DEFAULT_BATCH.EXPIRY_DAYS * 24 * 60 * 60 * 1000);
        return {
            batch_id: `default_${prod.product_id}`,
            batch_number: (INVOICE_CONFIG as any).BATCH.DEFAULT_BATCH.BATCH_NUMBER,
            expiry_date: expiryDate.toISOString(),
            manufacturing_date: '',
            quantity_available: (INVOICE_CONFIG as any).BATCH.DEFAULT_BATCH.QUANTITY,
            mrp_per_unit: prod.mrp_per_unit || prod.mrp || 0,
            sale_price_per_unit: prod.sale_price_per_unit || prod.unit_price || prod.mrp || 0,
            cost_per_unit: 0,
            days_to_expiry: (INVOICE_CONFIG as any).BATCH.DEFAULT_BATCH.EXPIRY_DAYS,
            has_pending_sync: false,
            product_id: prod.product_id,
            product_name: prod.product_name || '',
            gst_percent: prod.gst_percent || 0
        };
    };

    const handleBatchSelect = (batch: Batch): void => {
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

        const gradientMap: Record<string, string> = {
            expired: 'from-red-700 to-red-800',
            critical: 'from-red-500 to-red-600',
            warning: 'from-amber-500 to-amber-600',
            good: 'from-emerald-500 to-emerald-600'
        };

        return {
            ...status,
            icon: iconMap[status.status],
            gradient: gradientMap[status.status],
            days: daysToExpiry
        } as ExpiryInfo;
    };

    const defaultRenderBatchInfo = (batch: Batch): ReactNode => {
        const expiryInfo = showExpiryStatus ? getExpiryInfo(batch.expiry_date) : null;
        const isSelected = selectedBatch?.batch_id === batch.batch_id;

        return (
            <div
                key={String(batch.batch_id)}
                onClick={() => handleBatchSelect(batch)}
                className={cx(
                    'relative group cursor-pointer rounded-lg border-2 transition-all duration-200 bg-white hover:shadow-md mb-2',
                    isSelected
                        ? 'border-blue-500 shadow-lg bg-blue-50'
                        : 'border-gray-200 hover:border-blue-300'
                )}
            >
                {isSelected && (
                    <div className="absolute -top-2 -right-2 w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center shadow-md z-10">
                        <CheckCircle className="w-4 h-4 text-white" />
                    </div>
                )}

                <div className="grid grid-cols-12 gap-3 p-3 items-center">
                    <div className="col-span-2">
                        <div className="flex items-center gap-1">
                            <Package size={14} className="text-gray-400 flex-shrink-0" />
                            <span className={cx(
                                "font-semibold text-sm truncate",
                                isSelected ? "text-blue-700" : "text-gray-900"
                            )}>
                                {batch.batch_number}
                            </span>
                        </div>
                    </div>

                    <div className="col-span-3">
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

                    <div className="col-span-2">
                        <span className="text-sm text-gray-600">
                            {batch.manufacturing_date
                                ? DateFormatter.formatDate(batch.manufacturing_date, 'short')
                                : '-'}
                        </span>
                    </div>

                    <div className="col-span-2">
                        <div className="flex flex-col items-center">
                            <span className={cx(
                                "text-base font-bold",
                                (batch.quantity_available || 0) > 10 ? "text-emerald-600" :
                                    (batch.quantity_available || 0) > 0 ? "text-amber-600" : "text-red-600"
                            )}>
                                {batch.quantity_available || 0}
                            </span>
                        </div>
                    </div>

                    <div className="col-span-2 text-right">
                        <span className="text-sm font-semibold text-gray-900">
                            ₹{parseFloat(String(batch.mrp_per_unit || 0)).toFixed(2)}
                        </span>
                    </div>

                    <div className="col-span-1 flex justify-end">
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
            </div>
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
                        className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                    >
                        Retry
                    </button>
                </div>
            ) : batches.length === 0 ? (
                <div className="text-center py-20">
                    <div className="w-24 h-24 bg-gradient-to-br from-gray-100 to-gray-200 rounded-2xl flex items-center justify-center mx-auto mb-5 shadow-inner">
                        <Package className="w-12 h-12 text-gray-400" />
                    </div>
                    <p className="text-gray-900 font-bold text-xl">No Batches Available</p>
                    <p className="text-gray-500 mt-2">This product doesn't have any batches in stock</p>
                </div>
            ) : (
                <>
                    <div className="grid grid-cols-12 gap-3 px-3 py-2 bg-gray-50 border-b border-gray-200 mb-3 rounded-t-lg sticky top-0 z-10">
                        <div className="col-span-2 text-xs font-semibold text-gray-700 uppercase">Batch #</div>
                        <div className="col-span-3 text-xs font-semibold text-gray-700 uppercase">Expiry Date</div>
                        <div className="col-span-2 text-xs font-semibold text-gray-700 uppercase">Mfg Date</div>
                        <div className="col-span-2 text-xs font-semibold text-gray-700 uppercase text-center">Stock</div>
                        <div className="col-span-2 text-xs font-semibold text-gray-700 uppercase text-right">MRP</div>
                        <div className="col-span-1 text-xs font-semibold text-gray-700 uppercase text-right">Action</div>
                    </div>

                    <div className="space-y-0 max-w-full">
                        {batches.map((batch) =>
                            renderBatchInfo ? renderBatchInfo(batch) : defaultRenderBatchInfo(batch)
                        )}
                    </div>
                </>
            )}
        </>
    );

    if (mode === 'inline') {
        return (
            <div className={cx('bg-white rounded-lg shadow-sm', className)} ref={containerRef}>
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
                <div className="absolute z-10 mt-1 w-full bg-white rounded-lg shadow-lg border border-gray-200"
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
    };

    if (!show) return null;

    return (
        <div className={styles.modalOverlay}>
            <div
                className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl max-h-[90vh] overflow-hidden"
                tabIndex={-1}
                onKeyDown={handleKeyDown}
                ref={containerRef}
            >
                <div className={styles.modalHeader}>
                    <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-4">
                            <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl flex items-center justify-center shadow-lg">
                                <Box className="w-6 h-6 text-white" />
                            </div>
                            <div>
                                <h3 className="text-xl font-bold text-gray-900">Select Batch</h3>
                                <p className="text-sm text-gray-600 mt-0.5">{product?.product_name}</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-3">
                            <span className="text-xs text-gray-400">
                                Press <kbd className="px-1.5 py-0.5 bg-gray-100 rounded border border-gray-300 text-gray-600 font-mono">Shift + `</kbd> for cost info
                            </span>
                            <button
                                onClick={onClose}
                                className={cx(styles.iconButton, 'hover:bg-white/80 rounded-xl')}
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
