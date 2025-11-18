import React, { useState, useEffect, useRef } from 'react';
import { 
  X, Package, Calendar, AlertCircle, CheckCircle, 
  TrendingDown, Zap, Shield, Clock, Box, DollarSign
} from 'lucide-react';
import { batchesApi } from '../../../services/api';
import { searchCache } from '../../../utils/searchCache';
import DataTransformer from '../../../services/dataTransformer';
import DateFormatter from '../../../services/dateFormatter';
import { componentStyles as styles, cx } from '../styles/invoiceStyles';

const BatchSelectionModalV2 = ({ 
  show, 
  product, 
  onClose, 
  onBatchSelect 
}) => {
  const [batches, setBatches] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedBatch, setSelectedBatch] = useState(null);
  const [highlightedIndex, setHighlightedIndex] = useState(0); // Start with first batch highlighted
  const [showCostInfo, setShowCostInfo] = useState(false);
  const batchCacheKey = `batches_${product?.product_id}`;
  const hasLoadedRef = useRef(false);
  const modalRef = useRef(null);

  useEffect(() => {
    if (show && product) {
      loadBatches();
      hasLoadedRef.current = true;
      // Focus modal for keyboard navigation
      setTimeout(() => {
        if (modalRef.current) {
          modalRef.current.focus();
        }
      }, 100);
    } else if (!show) {
      // Reset when modal closes
      hasLoadedRef.current = false;
      setSelectedBatch(null);
      setBatches([]);
      setHighlightedIndex(0);
    }
  }, [show, product]);

  const loadBatches = async () => {
    // Check cache first for instant loading
    const cachedBatches = searchCache.get('batches', { product_id: product.product_id });
    if (cachedBatches) {
      setBatches(cachedBatches);
      // Auto-select first batch
      if (cachedBatches.length > 0) {
        setSelectedBatch(cachedBatches[0]);
        setHighlightedIndex(0);
      }
      return;
    }

    setLoading(true);
    try {
      const response = await batchesApi.getByProduct(product.product_id);
      
      const batchesData = response.data?.batches || response.data || [];
      // Transform batches using DataTransformer
      const transformedBatches = batchesData.map(batch => 
        DataTransformer.transformBatch(batch, product)
      );
      const availableBatches = transformedBatches
        .filter(batch => batch.quantity_available > 0)
        .sort((a, b) => new Date(b.expiry_date) - new Date(a.expiry_date)); // Descending order (latest expiry first)
      
      // Cache the results
      searchCache.set('batches', { product_id: product.product_id }, availableBatches);
      setBatches(availableBatches);
      
      // Auto-select first batch
      if (availableBatches.length > 0) {
        setSelectedBatch(availableBatches[0]);
        setHighlightedIndex(0);
      }
      
      // If no batches found, create a default batch
      if (availableBatches.length === 0) {
        const defaultBatch = DataTransformer.transformBatch({
          batch_id: `default_${product.product_id}`,
          batch_number: 'DEFAULT',
          expiry_date: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
          quantity_available: 100,
          mrp: product.mrp || 0,
          sale_price: product.sale_price || product.mrp || 0
        }, product);
        setBatches([defaultBatch]);
        setSelectedBatch(defaultBatch);
        setHighlightedIndex(0);
      }
    } catch (error) {
      
      // Create a fallback batch if API fails
      const fallbackBatch = DataTransformer.transformBatch({
        batch_id: `fallback_${product.product_id}`,
        batch_number: 'STOCK',
        expiry_date: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
        quantity_available: product.quantity || 100,
        mrp: product.mrp || 0,
        selling_price: product.sale_price || product.mrp || 0
      }, product);
      setBatches([fallbackBatch]);
      setSelectedBatch(fallbackBatch);
      setHighlightedIndex(0);
    } finally {
      setLoading(false);
    }
  };

  // Keyboard navigation
  const handleKeyDown = (e) => {
    // Shift+~ to toggle cost/profit info
    if (e.shiftKey && e.key === '~') {
      e.preventDefault();
      setShowCostInfo(prev => !prev);
      return;
    }
    
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIndex(prev => 
        prev < batches.length - 1 ? prev + 1 : 0
      );
      if (batches[highlightedIndex + 1] || batches[0]) {
        setSelectedBatch(batches[highlightedIndex < batches.length - 1 ? highlightedIndex + 1 : 0]);
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIndex(prev => 
        prev > 0 ? prev - 1 : batches.length - 1
      );
      if (batches[highlightedIndex - 1] || batches[batches.length - 1]) {
        setSelectedBatch(batches[highlightedIndex > 0 ? highlightedIndex - 1 : batches.length - 1]);
      }
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (selectedBatch) {
        confirmBatchSelection();
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  const confirmBatchSelection = () => {
    if (!selectedBatch) return;
    
    const productWithBatch = {
      ...product,
      batch_id: selectedBatch.batch_id,
      batch_number: selectedBatch.batch_number || selectedBatch.batch_no,
      expiry_date: selectedBatch.expiry_date,
      mfg_date: selectedBatch.mfg_date || selectedBatch.manufacturing_date,
      available_quantity: selectedBatch.quantity_available,
      mrp: selectedBatch.mrp,
      sale_price: selectedBatch.sale_price || selectedBatch.selling_price,
      // GST should come from product master, not batch
      gst_percent: product.gst_percent ?? 0,
      tax_rate: product.gst_percent ?? 0,
    };
    
    onBatchSelect(productWithBatch);
    onClose();
  };

  const handleBatchSelect = (batch) => {
    
    setSelectedBatch(batch);
    
    const productWithBatch = {
      ...product,
      batch_id: batch.batch_id,
      batch_number: batch.batch_number || batch.batch_no,
      expiry_date: batch.expiry_date,
      mfg_date: batch.mfg_date || batch.manufacturing_date,
      available_quantity: batch.quantity_available,
      mrp: batch.mrp || product.mrp,
      sale_price: batch.sale_price || batch.selling_price || product.sale_price || product.mrp || 0,
      // GST should come from product master, not batch
      gst_percent: product.gst_percent ?? 0,
      tax_rate: product.gst_percent ?? 0,
      quantity: 1
    };

    setTimeout(() => {
      onBatchSelect(productWithBatch);
      onClose();
    }, 300);
  };

  const getExpiryInfo = (expiryDate) => {
    const status = DateFormatter.getExpiryStatus(expiryDate);
    
    // Map status to icons
    const iconMap = {
      expired: AlertCircle,
      critical: AlertCircle,
      warning: Clock,
      good: Shield,
      unknown: AlertCircle
    };
    
    // Map status to gradients
    const gradientMap = {
      expired: 'from-red-700 to-red-800',
      critical: 'from-red-500 to-red-600',
      warning: 'from-amber-500 to-amber-600',
      good: 'from-emerald-500 to-emerald-600',
      unknown: 'from-gray-500 to-gray-600'
    };
    
    return {
      ...status,
      icon: iconMap[status.status],
      gradient: gradientMap[status.status]
    };
  };

  const formatDate = (date) => {
    return DateFormatter.formatDate(date, 'long');
  };

  if (!show) return null;

  return (
    <div className={styles.modalOverlay}>
      <div 
        ref={modalRef}
        className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl max-h-[90vh] overflow-hidden"
        tabIndex={-1}
        onKeyDown={handleKeyDown}
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
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20">
              <div className="relative">
                <div className="w-16 h-16 border-4 border-gray-200 rounded-full"></div>
                <div className="w-16 h-16 border-4 border-blue-600 border-t-transparent rounded-full animate-spin absolute inset-0"></div>
              </div>
              <p className="text-gray-600 mt-4 font-medium">Loading batches...</p>
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
                  Showing {batches.length} batch{batches.length !== 1 ? 'es' : ''} • Sorted by latest expiry first
                </p>
              </div>
              {/* Table Layout with Header */}
              <div className="border border-gray-200 rounded-lg overflow-hidden">
                {/* Header Row */}
                <div className="bg-gray-50 border-b border-gray-200 px-5 py-2.5">
                  <div className="flex items-center gap-10">
                    <div className="w-96 text-xs font-semibold text-gray-600 uppercase">Batch Number</div>
                    <div className="flex items-center gap-16 flex-1">
                      <div className="w-20 text-center text-xs font-semibold text-gray-600 uppercase">Stock</div>
                      <div className="w-36 text-center text-xs font-semibold text-gray-600 uppercase">Expiry</div>
                      <div className="w-36 text-center text-xs font-semibold text-gray-600 uppercase">Mfg Date</div>
                      <div className="w-28 text-center text-xs font-semibold text-gray-600 uppercase">MRP</div>
                      <div className="w-32 text-right text-xs font-semibold text-gray-600 uppercase">Action</div>
                    </div>
                  </div>
                </div>

                {/* Data Rows */}
                <div className="divide-y divide-gray-100">
                  {batches.map((batch, index) => {
                    const expiryInfo = getExpiryInfo(batch.expiry_date);
                    const isSelected = selectedBatch?.batch_id === batch.batch_id;
                    const isHighlighted = highlightedIndex === index;
                    
                    return (
                      <div
                        key={batch.batch_id}
                        onClick={() => handleBatchSelect(batch)}
                        className={`
                          cursor-pointer transition-colors duration-150
                          ${isSelected
                            ? 'bg-blue-100' 
                            : isHighlighted
                            ? 'bg-blue-50'
                            : 'hover:bg-gray-50'
                          }
                        `}
                      >
                        <div className="px-5 py-3">
                          <div className="flex items-center gap-10">
                            {/* Batch Number and Status */}
                            <div className="w-96 flex items-center gap-3">
                              <span className="font-semibold text-gray-900 whitespace-nowrap">#{batch.batch_number || batch.batch_no}</span>
                              <span className={`px-2 py-0.5 text-xs rounded whitespace-nowrap ${expiryInfo.bg} ${expiryInfo.color}`}>
                                {expiryInfo.label}
                              </span>
                              <span className="text-xs text-gray-500 whitespace-nowrap">{expiryInfo.days}</span>
                            </div>

                            {/* Data columns */}
                            <div className="flex items-center gap-16 flex-1">
                              <div className="w-20 text-center">
                                <span className="text-sm font-semibold text-gray-900">{batch.quantity_available}</span>
                              </div>
                              <div className="w-36 text-center">
                                <span className="text-sm text-gray-900">{formatDate(batch.expiry_date)}</span>
                              </div>
                              <div className="w-36 text-center">
                                <span className="text-sm text-gray-600">{formatDate(batch.mfg_date || batch.manufacturing_date)}</span>
                              </div>
                              <div className="w-28 text-center">
                                <span className="text-sm font-semibold text-gray-900">₹{batch.mrp || product.mrp}</span>
                              </div>
                              
                              {/* Select button */}
                              <div className="w-32 text-right">
                                {isSelected ? (
                                  <div className="inline-flex items-center gap-1.5 text-blue-600 font-medium text-sm">
                                    <CheckCircle className="w-4 h-4" />
                                    <span>Selected</span>
                                  </div>
                                ) : (
                                  <div className="text-gray-500 hover:text-blue-600 font-medium text-sm">
                                    Select →
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Cost/Profit Overlay - Separate panel (Shift+~ to toggle) */}
              {showCostInfo && batches.length > 0 && (
                <div className="mt-6 border-t-2 border-blue-200 pt-4">
                  <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl p-4 border border-blue-200">
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="font-semibold text-gray-900 flex items-center gap-2">
                        <DollarSign className="w-5 h-5 text-blue-600" />
                        Cost & Profit Analysis
                      </h4>
                      <span className="text-xs text-blue-600 font-medium">Confidential</span>
                    </div>
                    
                    <div className="space-y-2">
                      {batches.map((batch, index) => {
                        const costPrice = parseFloat(batch.cost_per_unit) || parseFloat(batch.weighted_average_cost) || 0;
                        const sellPrice = parseFloat(batch.sale_price_per_unit) || parseFloat(batch.mrp_per_unit) || 0;
                        const profit = sellPrice - costPrice;
                        const margin = sellPrice > 0 ? ((profit / sellPrice) * 100) : 0;
                        
                        return (
                          <div key={batch.batch_id} className="bg-white rounded-lg p-3 flex items-center justify-between border border-gray-200">
                            <div className="flex-1">
                              <span className="font-medium text-gray-900">#{batch.batch_number}</span>
                              <span className="text-xs text-gray-500 ml-2">Stock: {batch.quantity_available}</span>
                            </div>
                            <div className="flex items-center gap-4 text-sm">
                              <div>
                                <span className="text-gray-600">Cost: </span>
                                <span className="font-semibold">₹{costPrice.toFixed(2)}</span>
                              </div>
                              <div>
                                <span className="text-gray-600">Sell: </span>
                                <span className="font-semibold">₹{sellPrice.toFixed(2)}</span>
                              </div>
                              <div>
                                <span className="text-gray-600">Profit: </span>
                                <span className={`font-semibold ${profit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                                  ₹{profit.toFixed(2)}
                                </span>
                              </div>
                              <div>
                                <span className="text-gray-600">Margin: </span>
                                <span className={`font-semibold ${margin >= 0 ? 'text-purple-600' : 'text-red-600'}`}>
                                  {margin.toFixed(1)}%
                                </span>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    
                    <div className="mt-3 text-xs text-gray-500 text-center">
                      Press <kbd className="px-1 py-0.5 bg-white rounded border">Shift+~</kbd> again to hide
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer with keyboard hints */}
        <div className="px-6 py-3 bg-gray-50 border-t border-gray-200 flex items-center justify-between">
          <div className="flex items-center space-x-4 text-xs text-gray-500">
            <span className="flex items-center">
              <kbd className="px-2 py-1 bg-white rounded border border-gray-300 mr-1.5">↑↓</kbd> Navigate
            </span>
            <span className="flex items-center">
              <kbd className="px-2 py-1 bg-white rounded border border-gray-300 mr-1.5">Enter</kbd> Select
            </span>
            <span className="flex items-center">
              <kbd className="px-2 py-1 bg-white rounded border border-gray-300 mr-1.5 flex items-center gap-1">
                <span>Shift</span><span>+</span><span>~</span>
              </kbd> 
              {showCostInfo ? 'Hide' : 'Show'} Cost/Profit
            </span>
            <span className="flex items-center">
              <kbd className="px-2 py-1 bg-white rounded border border-gray-300 mr-1.5">Esc</kbd> Close
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default BatchSelectionModalV2;