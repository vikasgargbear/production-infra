import React, { useState, useEffect, useRef } from 'react';
import {
  X, Package, Calendar, AlertCircle, CheckCircle,
  Zap, Shield, Clock, Box, TrendingDown
} from 'lucide-react';
import { productAPI, customerAPI, supplierAPI, batchAPI } from '../../../services/api';
import { searchCache } from '../../../utils/searchCache';

import DateFormatter from '../../../services/dateFormatter';
import { INVOICE_CONFIG, getExpiryStatusConfig } from '../../../config/invoice.config';
import { APP_CONFIG } from '../../../config/app.config';
import { componentStyles as styles, cx } from '../../invoice/styles/invoiceStyles';
import offlineDB from '../../../services/offline/core/offlineDatabase';

/**
 * Global Batch Selector Component
 * 
 * Props:
 * - show: Boolean to show/hide the modal
 * - product: Product object for which batches are being selected
 * - onBatchSelect: Function called when a batch is selected
 * - onClose: Function called when modal is closed
 * - mode: 'modal' | 'inline' | 'dropdown' (default: 'modal')
 * - allowCreateDefault: Allow creating default batch if none available
 * - showExpiryStatus: Show expiry status indicators
 * - sortBy: 'expiry' | 'quantity' | 'manufacturing' (default: 'expiry')
 * - sortOrder: 'asc' | 'desc' (default: 'desc' for expiry)
 * - filterExpired: Filter out expired batches (default: true)
 * - minQuantity: Minimum quantity to show batch (default: 0)
 * - renderBatchInfo: Custom render function for batch display
 * - className: Additional CSS classes
 * - maxHeight: Maximum height for inline/dropdown mode
 */

const BatchSelector = ({
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
  const [batches, setBatches] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedBatch, setSelectedBatch] = useState(null);
  const [error, setError] = useState(null);
  const [showCostInfo, setShowCostInfo] = useState(false);
  const hasLoadedRef = useRef(false);
  const containerRef = useRef(null);

  useEffect(() => {
    if (show && product && mode === 'modal') {
      const productId = product.product_id || product.id;

      // Only load if we haven't loaded for this product yet
      if (!hasLoadedRef.current || hasLoadedRef.current !== productId) {
        loadBatches();
        hasLoadedRef.current = productId;
      }
    } else if (!show && mode === 'modal') {
      // Reset when modal closes
      hasLoadedRef.current = false;
      setSelectedBatch(null);
      setBatches([]);
      setError(null);
    }
  }, [show, product?.product_id, product?.id, mode]);

  // Load batches on mount for inline/dropdown modes
  useEffect(() => {
    if (product && mode !== 'modal') {
      loadBatches();
    }
  }, [product, mode]);

  const loadBatches = async () => {
    if (!product) return;

    const productId = product.product_id || product.id;

    // PERFORMANCE: Check memory cache FIRST (instant - synchronous, no await)
    const cacheKey = `batches_${productId}`;
    const cachedBatches = searchCache.get(cacheKey);
    if (cachedBatches && cachedBatches.length > 0) {
      console.log('[BatchSelector] Using memory cache - INSTANT');
      processBatches(cachedBatches);
      return; // Return immediately - INSTANT loading!
    }

    // PERFORMANCE: Check localStorage cache (faster than API, no IndexedDB async)
    try {
      const localCacheKey = `batches_${productId}`;
      const localCacheTime = `batches_${productId}_time`;
      const cached = localStorage.getItem(localCacheKey);
      const cacheTime = localStorage.getItem(localCacheTime);
      const cacheAge = cacheTime ? Date.now() - parseInt(cacheTime) : Infinity;

      // Use cache if less than 2 minutes old (batches don't change often in a session)
      if (cached && cacheAge < 2 * 60 * 1000) {
        console.log('[BatchSelector] Using localStorage cache - FAST');
        const batchesData = JSON.parse(cached);
        processBatches(batchesData);

        // Also store in memory cache for next time
        searchCache.set(cacheKey, batchesData);
        return;
      }
    } catch (error) {
      console.error('[BatchSelector] Cache read error:', error);
    }

    setLoading(true);
    setError(null);

    try {
      // Fetch from API and cache
      console.log('[BatchSelector] Fetching from API for product:', productId);
      await fetchAndStoreBatches(productId, true);
    } catch (error) {
      console.error('[BatchSelector] Failed to load batches:', error);
      setError('Failed to load batches. Please try again.');

      // Create a fallback batch if allowed
      if (allowCreateDefault) {
        const fallbackBatch = createDefaultBatch(product);
        setBatches([fallbackBatch]);
      }
    } finally {
      setLoading(false);
    }
  };

  // Fetch batches from API and cache aggressively
  const fetchAndStoreBatches = async (productId, showLoadingState = true) => {
    try {
      const response = await batchAPI.getByProduct(productId);
      const batchesData = response.data?.batches || response.data || [];

      console.log('[BatchSelector] Fetched', batchesData.length, 'batches from API');

      // PERFORMANCE: Triple cache strategy
      // 1. Memory cache (instant access)
      const cacheKey = `batches_${productId}`;
      searchCache.set(cacheKey, batchesData);

      // 2. localStorage cache (fast, 2-minute TTL)
      try {
        localStorage.setItem(`batches_${productId}`, JSON.stringify(batchesData));
        localStorage.setItem(`batches_${productId}_time`, Date.now().toString());
      } catch (e) {
        console.warn('[BatchSelector] localStorage cache failed:', e);
      }

      // 3. IndexedDB cache (offline support, slower but persistent)
      try {
        await offlineDB.storeBatches(batchesData);
      } catch (e) {
        console.warn('[BatchSelector] IndexedDB cache failed:', e);
      }

      if (showLoadingState) {
        processBatches(batchesData);
      }

      return batchesData;
    } catch (error) {
      console.error('[BatchSelector] Failed to fetch batches:', error);
      throw error;
    }
  };

  const processBatches = (batchesData) => {
    // Transform batches using DataTransformer
    let transformedBatches = batchesData.map(batch => {
      // Map batch data - using canonical backend field names
      const transformed = {
        batch_id: batch.id || batch.batch_id,
        batch_number: batch.batch_number || batch.batch_no,
        expiry_date: batch.expiry_date,
        manufacturing_date: batch.manufacturing_date,
        quantity_available: batch.quantity_available || batch.current_stock || batch.stock || 0,
        // CANONICAL: Backend uses mrp_per_unit and sale_price_per_unit for batches
        mrp: batch.mrp_per_unit || batch.mrp || 0,
        unit_price: batch.sale_price_per_unit || batch.selling_price || batch.sale_price || batch.unit_price || 0,
        sale_price: batch.sale_price_per_unit || batch.selling_price || batch.sale_price || batch.unit_price || 0,
        purchase_price: batch.cost_per_unit || batch.purchase_price || 0,
        days_to_expiry: batch.expiry_date ? DateFormatter.daysBetween(new Date(), new Date(batch.expiry_date)) : null,
        ...batch
      };

      // Add offline reservation info
      const reserved = batch.quantity_reserved_offline || 0;
      const available = batch.quantity_available || 0;
      const usable = available - reserved;

      return {
        ...transformed,
        quantity_reserved_offline: reserved,
        quantity_usable: usable,
        has_pending_sync: reserved > 0
      };
    });

    // Filter batches (use usable quantity, not just available)
    if (filterExpired) {
      transformedBatches = transformedBatches.filter(batch => {
        const daysToExpiry = batch.days_to_expiry;
        return daysToExpiry === null || daysToExpiry > 0;
      });
    }

    if (minQuantity > 0) {
      transformedBatches = transformedBatches.filter(batch =>
        batch.quantity_usable >= minQuantity  // Check usable, not available
      );
    }

    // Sort batches - CRITICAL: Show expiring soon FIRST (pharmaceutical FEFO)
    transformedBatches.sort((a, b) => {
      switch (sortBy) {
        case 'quantity':
          return sortOrder === 'asc'
            ? a.quantity_usable - b.quantity_usable
            : b.quantity_usable - a.quantity_usable;

        case 'manufacturing':
          const dateA = new Date(a.manufacturing_date || 0);
          const dateB = new Date(b.manufacturing_date || 0);
          return sortOrder === 'asc' ? dateA - dateB : dateB - dateA;

        case 'expiry':
        default:
          // CRITICAL FIX: Sort by days_to_expiry (closest expiry first)
          // This implements FEFO (First Expiry First Out) for pharmaceuticals
          const daysA = a.days_to_expiry ?? 999999;  // Expired/null batches last
          const daysB = b.days_to_expiry ?? 999999;

          // Ascending order: Lowest days first (expiring soon on top)
          // Descending order: Highest days first (furthest expiry on top)
          return sortOrder === 'asc' ? daysA - daysB : daysB - daysA;
      }
    });

    setBatches(transformedBatches);

    // If no batches found, create a default batch
    if (transformedBatches.length === 0 && allowCreateDefault) {
      const defaultBatch = createDefaultBatch(product);
      setBatches([defaultBatch]);
    }
  };

  const createDefaultBatch = (product) => {
    return {
      batch_id: `default_${product.product_id}`,
      batch_number: INVOICE_CONFIG.BATCH.DEFAULT_BATCH.BATCH_NUMBER,
      expiry_date: new Date(Date.now() + INVOICE_CONFIG.BATCH.DEFAULT_BATCH.EXPIRY_DAYS * 24 * 60 * 60 * 1000).toISOString(),
      manufacturing_date: new Date().toISOString(),
      quantity_available: INVOICE_CONFIG.BATCH.DEFAULT_BATCH.QUANTITY,
      quantity_usable: INVOICE_CONFIG.BATCH.DEFAULT_BATCH.QUANTITY,
      mrp: product.mrp || 0,
      unit_price: product.unit_price || product.mrp || 0,
      sale_price: product.unit_price || product.mrp || 0,
      days_to_expiry: INVOICE_CONFIG.BATCH.DEFAULT_BATCH.EXPIRY_DAYS,
      product_id: product.product_id || product.id
    };
  };

  const handleBatchSelect = (batch) => {
    setSelectedBatch(batch);

    const productWithBatch = {
      ...product,
      batch_id: batch.batch_id,
      batch_number: batch.batch_number,
      batch_no: batch.batch_number,
      available_quantity: batch.quantity_available,
      quantity: 1, // Default quantity
      // IMPORTANT: Use batch-specific pricing - unit_price is canonical backend name
      mrp: batch.mrp || product.mrp || 0,
      unit_price: batch.unit_price || batch.sale_price || product.unit_price || 0,
      rate: batch.unit_price || batch.sale_price || product.unit_price || 0,  // Legacy alias
      expiry_date: batch.expiry_date,
      manufacturing_date: batch.manufacturing_date,
      // IMPORTANT: Preserve product GST information (no default - user must enter)
      gst_percent: product.gst_percent || 0,  // Only gst_percent exists in product
      tax_rate: product.gst_percent || 0  // Legacy alias
    };

    setTimeout(() => {
      onBatchSelect(productWithBatch);
      if (mode === 'modal') {
        onClose();
      }
    }, INVOICE_CONFIG.UI.ANIMATION_DURATION);
  };

  const getExpiryInfo = (expiryDate) => {
    if (!expiryDate) return null;

    const daysToExpiry = DateFormatter.daysBetween(new Date(), new Date(expiryDate));
    const status = getExpiryStatusConfig(daysToExpiry);

    // Map status to icons
    const iconMap = {
      expired: AlertCircle,
      critical: AlertCircle,
      warning: Clock,
      good: Shield
    };

    // Map status to gradients
    const gradientMap = {
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
    };
  };

  const defaultRenderBatchInfo = (batch) => {
    const expiryInfo = showExpiryStatus ? getExpiryInfo(batch.expiry_date) : null;
    const isSelected = selectedBatch?.batch_id === batch.batch_id;

    return (
      <div
        key={batch.batch_id}
        onClick={() => handleBatchSelect(batch)}
        className={cx(
          'relative group cursor-pointer rounded-lg border-2 transition-all duration-200 bg-white hover:shadow-md mb-2',
          isSelected
            ? 'border-blue-500 shadow-lg bg-blue-50'
            : 'border-gray-200 hover:border-blue-300'
        )}
      >
        {/* Selection indicator */}
        {isSelected && (
          <div className="absolute -top-2 -right-2 w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center shadow-md z-10">
            <CheckCircle className="w-4 h-4 text-white" />
          </div>
        )}

        {/* Table-like grid layout - 12 columns matching header */}
        <div className="grid grid-cols-12 gap-3 p-3 items-center">

          {/* Column 1: Batch Number (2 cols) */}
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

          {/* Column 2: Expiry Date (3 cols) */}
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

          {/* Column 3: Mfg Date (2 cols) */}
          <div className="col-span-2">
            <span className="text-sm text-gray-600">
              {batch.manufacturing_date
                ? DateFormatter.formatDate(batch.manufacturing_date, 'short')
                : '-'}
            </span>
          </div>

          {/* Column 4: Stock (2 cols) */}
          <div className="col-span-2">
            <div className="flex flex-col items-center">
              <span className={cx(
                "text-base font-bold",
                (batch.quantity_usable || 0) > 10 ? "text-emerald-600" :
                  (batch.quantity_usable || 0) > 0 ? "text-amber-600" : "text-red-600"
              )}>
                {batch.quantity_usable || batch.quantity_available || 0}
              </span>
              {batch.has_pending_sync && (
                <span className="text-xs text-amber-600">
                  {batch.quantity_reserved_offline} pending
                </span>
              )}
            </div>
          </div>

          {/* Column 5: MRP (2 cols) */}
          <div className="col-span-2 text-right">
            <span className="text-sm font-semibold text-gray-900">
              ₹{parseFloat(batch.mrp || 0).toFixed(2)}
            </span>
          </div>

          {/* Column 6: Select (1 col) */}
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

        {/* Expiry warning banner */}
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

  const renderContent = () => (
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
          {/* Column Headers */}
          <div className="grid grid-cols-12 gap-3 px-3 py-2 bg-gray-50 border-b border-gray-200 mb-3 rounded-t-lg sticky top-0 z-10">
            <div className="col-span-2 text-xs font-semibold text-gray-700 uppercase">Batch #</div>
            <div className="col-span-3 text-xs font-semibold text-gray-700 uppercase">Expiry Date</div>
            <div className="col-span-2 text-xs font-semibold text-gray-700 uppercase">Mfg Date</div>
            <div className="col-span-2 text-xs font-semibold text-gray-700 uppercase text-center">Stock</div>
            <div className="col-span-2 text-xs font-semibold text-gray-700 uppercase text-right">MRP</div>
            <div className="col-span-1 text-xs font-semibold text-gray-700 uppercase text-right">Action</div>
          </div>

          {/* Batch List */}
          <div className="space-y-0 max-w-full">
            {batches.map((batch) =>
              renderBatchInfo ? renderBatchInfo(batch) : defaultRenderBatchInfo(batch)
            )}
          </div>
        </>
      )}
    </>
  );

  // Render based on mode
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

  // Keyboard navigation
  const handleKeyDown = (e) => {
    // Shift+` to toggle cost/profit info
    if (e.shiftKey && (e.key === '~' || e.key === '`')) {
      e.preventDefault();
      setShowCostInfo(prev => !prev);
      return;
    }
  };

  // Default modal mode
  if (!show) return null;

  return (
    <div className={styles.modalOverlay}>
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl max-h-[90vh] overflow-hidden"
        tabIndex={-1}
        onKeyDown={handleKeyDown}
        ref={containerRef}
      >
        {/* Header */}
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
              {/* Cost info toggle hint */}
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

        {/* Content */}
        <div className={styles.modalBody}>
          {renderContent()}
        </div>
      </div>
    </div>
  );
};

export default BatchSelector;