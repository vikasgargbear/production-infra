import React, { useState, useEffect, useRef } from 'react';
import { 
  X, Package, Calendar, AlertCircle, CheckCircle, 
  Zap, Shield, Clock, Box, TrendingDown
} from 'lucide-react';
import { productAPI, customerAPI, supplierAPI, batchAPI } from '../../../services/api';
import { searchCache } from '../../../utils/searchCache';
import DataTransformer from '../../../services/dataTransformer';
import DateFormatter from '../../../services/dateFormatter';
import { INVOICE_CONFIG, getExpiryStatusConfig } from '../../../config/invoice.config';
import { APP_CONFIG } from '../../../config/app.config';
import { componentStyles as styles, cx } from '../../invoice/styles/invoiceStyles';

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
  const hasLoadedRef = useRef(false);
  const containerRef = useRef(null);

  useEffect(() => {
    if (show && product && mode === 'modal') {
      loadBatches();
      hasLoadedRef.current = true;
    } else if (!show && mode === 'modal') {
      // Reset when modal closes
      hasLoadedRef.current = false;
      setSelectedBatch(null);
      setBatches([]);
      setError(null);
    }
  }, [show, product, mode]);

  // Load batches on mount for inline/dropdown modes
  useEffect(() => {
    if (product && mode !== 'modal') {
      loadBatches();
    }
  }, [product, mode]);

  const loadBatches = async () => {
    if (!product) return;

    // Check cache first for instant loading
    const cacheKey = `batches_${product.product_id}`;
    const cachedBatches = searchCache.get('batches', { product_id: product.product_id });
    if (cachedBatches) {
      processBatches(cachedBatches);
      return;
    }

    setLoading(true);
    setError(null);
    
    try {
      const response = await batchAPI.getByProduct(product.product_id);
      const batchesData = response.data?.batches || response.data || [];
      
      // Cache the results
      searchCache.set('batches', { product_id: product.product_id }, batchesData);
      processBatches(batchesData);
      
    } catch (error) {
      console.error('Error fetching batches:', error);
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

  const processBatches = (batchesData) => {
    // Transform batches using DataTransformer
    let transformedBatches = batchesData.map(batch => 
      DataTransformer.transformBatch(batch, product)
    );
    
    // Filter batches
    if (filterExpired) {
      transformedBatches = transformedBatches.filter(batch => {
        const daysToExpiry = batch.days_to_expiry;
        return daysToExpiry === null || daysToExpiry > 0;
      });
    }
    
    if (minQuantity > 0) {
      transformedBatches = transformedBatches.filter(batch => 
        batch.quantity_available >= minQuantity
      );
    }
    
    // Sort batches
    transformedBatches.sort((a, b) => {
      switch (sortBy) {
        case 'quantity':
          return sortOrder === 'asc' 
            ? a.quantity_available - b.quantity_available
            : b.quantity_available - a.quantity_available;
        
        case 'manufacturing':
          const dateA = new Date(a.manufacturing_date || 0);
          const dateB = new Date(b.manufacturing_date || 0);
          return sortOrder === 'asc' ? dateA - dateB : dateB - dateA;
        
        case 'expiry':
        default:
          const expiryA = new Date(a.expiry_date || 0);
          const expiryB = new Date(b.expiry_date || 0);
          return sortOrder === 'asc' ? expiryA - expiryB : expiryB - expiryA;
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
    return DataTransformer.transformBatch({
      batch_id: `default_${product.product_id}`,
      batch_number: INVOICE_CONFIG.BATCH.DEFAULT_BATCH.BATCH_NUMBER,
      expiry_date: new Date(Date.now() + INVOICE_CONFIG.BATCH.DEFAULT_BATCH.EXPIRY_DAYS * 24 * 60 * 60 * 1000).toISOString(),
      quantity_available: INVOICE_CONFIG.BATCH.DEFAULT_BATCH.QUANTITY,
      mrp: product.mrp || 0,
      sale_price: product.sale_price || product.mrp || 0
    }, product);
  };

  const handleBatchSelect = (batch) => {
    setSelectedBatch(batch);
    
    const productWithBatch = {
      ...product,
      ...batch,
      batch_id: batch.batch_id,
      batch_number: batch.batch_number,
      available_quantity: batch.quantity_available,
      quantity: 1 // Default quantity
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
          'relative group cursor-pointer rounded-xl border-2 transition-all duration-300 p-4',
          isSelected 
            ? 'border-blue-500 shadow-lg shadow-blue-100 scale-[1.02]' 
            : 'border-gray-200 hover:border-gray-300 hover:shadow-lg'
        )}
      >
        {/* Selection indicator */}
        {isSelected && (
          <div className="absolute -top-2 -right-2 w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center animate-scale-in">
            <CheckCircle className="w-4 h-4 text-white" />
          </div>
        )}

        <div className="flex items-center justify-between">
          {/* Left side - Batch info */}
          <div className="flex items-center gap-4">
            <div>
              <div className="flex items-center gap-2">
                <h4 className="text-base font-bold text-gray-900">
                  #{batch.batch_number}
                </h4>
                {showExpiryStatus && expiryInfo && (
                  <div className={cx(
                    'px-2 py-0.5 rounded-full border',
                    expiryInfo.status === 'expired' ? 'bg-red-50 border-red-200' : '',
                    expiryInfo.status === 'critical' ? 'bg-red-50 border-red-200' : '',
                    expiryInfo.status === 'warning' ? 'bg-amber-50 border-amber-200' : '',
                    expiryInfo.status === 'good' ? 'bg-emerald-50 border-emerald-200' : ''
                  )}>
                    <span className={cx(
                      'text-xs font-medium',
                      expiryInfo.status === 'expired' ? 'text-red-600' : '',
                      expiryInfo.status === 'critical' ? 'text-red-600' : '',
                      expiryInfo.status === 'warning' ? 'text-amber-600' : '',
                      expiryInfo.status === 'good' ? 'text-emerald-600' : ''
                    )}>
                      {expiryInfo.label} • {expiryInfo.days} days
                    </span>
                  </div>
                )}
              </div>
              <div className="flex items-center gap-4 mt-1 text-sm text-gray-600">
                <span>Exp: {DateFormatter.formatDate(batch.expiry_date, 'long')}</span>
                {batch.manufacturing_date && (
                  <span>Mfg: {DateFormatter.formatDate(batch.manufacturing_date, 'long')}</span>
                )}
              </div>
            </div>
          </div>

          {/* Right side - Key metrics */}
          <div className="flex items-center gap-6">
            <div className="text-center">
              <p className="text-xs text-gray-500 uppercase">Stock</p>
              <p className="text-lg font-bold text-gray-900">{batch.quantity_available}</p>
            </div>
            <div className="text-center">
              <p className="text-xs text-gray-500 uppercase">MRP</p>
              <p className="text-lg font-bold text-gray-900">₹{batch.mrp}</p>
            </div>
            <div className={cx(
              'px-4 py-2 rounded-lg transition-all duration-300 cursor-pointer',
              isSelected 
                ? 'bg-blue-500 text-white' 
                : 'bg-gray-100 text-gray-600 group-hover:bg-gray-200'
            )}>
              <span className="text-sm font-medium flex items-center gap-2">
                {isSelected ? (
                  <>
                    <CheckCircle className="w-4 h-4" />
                    Selected
                  </>
                ) : (
                  <>
                    <Zap className="w-4 h-4" />
                    Select
                  </>
                )}
              </span>
            </div>
          </div>
        </div>
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
          <div className="text-center mb-4">
            <p className="text-sm text-gray-600">
              Showing {batches.length} batch{batches.length !== 1 ? 'es' : ''} • 
              Sorted by {sortBy === 'expiry' ? 'expiry date' : sortBy === 'quantity' ? 'stock quantity' : 'manufacturing date'}
            </p>
          </div>
          <div className="space-y-3 max-w-2xl mx-auto">
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

  // Default modal mode
  if (!show) return null;

  return (
    <div className={styles.modalOverlay}>
      <div className={styles.modalContent}>
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
            <button
              onClick={onClose}
              className={cx(styles.iconButton, 'hover:bg-white/80 rounded-xl')}
            >
              <X className="w-5 h-5 text-gray-500 group-hover:text-gray-700" />
            </button>
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