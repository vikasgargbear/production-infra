import React, { useState, useEffect, useRef } from 'react';
import { 
  X, Package, Calendar, AlertCircle, CheckCircle, 
  TrendingDown, Zap, Shield, Clock, Box
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
  const batchCacheKey = `batches_${product?.product_id}`;
  const hasLoadedRef = useRef(false);

  useEffect(() => {
    if (show && product) {
      loadBatches();
      hasLoadedRef.current = true;
    } else if (!show) {
      // Reset when modal closes
      hasLoadedRef.current = false;
      setSelectedBatch(null);
      setBatches([]);
    }
  }, [show, product]);

  const loadBatches = async () => {
    // Check cache first for instant loading
    const cachedBatches = searchCache.get('batches', { product_id: product.product_id });
    if (cachedBatches) {
      setBatches(cachedBatches);
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
      }
    } catch (error) {
      console.error('Error fetching batches:', error);
      console.error('Error response:', error.response);
      
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
    } finally {
      setLoading(false);
    }
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
      gst_percent: product.gst_percent || 12, // Ensure GST percent is passed
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
              <div className="space-y-3 max-w-2xl mx-auto">
              {batches.map((batch) => {
                const expiryInfo = getExpiryInfo(batch.expiry_date);
                const isSelected = selectedBatch?.batch_id === batch.batch_id;
                
                return (
                  <div
                    key={batch.batch_id}
                    onClick={() => handleBatchSelect(batch)}
                    className={`
                      relative group cursor-pointer rounded-xl border-2 transition-all duration-300
                      ${isSelected 
                        ? 'border-blue-500 shadow-lg shadow-blue-100 scale-[1.02]' 
                        : 'border-gray-200 hover:border-gray-300 hover:shadow-lg'
                      }
                    `}
                  >
                    {/* Selection indicator */}
                    {isSelected && (
                      <div className="absolute -top-2 -right-2 w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center animate-scale-in">
                        <CheckCircle className="w-4 h-4 text-white" />
                      </div>
                    )}

                    <div className="p-4">
                      <div className="flex items-center justify-between">
                        {/* Left side - Batch info */}
                        <div className="flex items-center gap-4">
                          <div>
                            <div className="flex items-center gap-2">
                              <h4 className="text-base font-bold text-gray-900">
                                #{batch.batch_number || batch.batch_no}
                              </h4>
                              <div className={`px-2 py-0.5 rounded-full ${expiryInfo.bg} ${expiryInfo.border} border`}>
                                <span className={`text-xs font-medium ${expiryInfo.color}`}>
                                  {expiryInfo.label} • {expiryInfo.days}
                                </span>
                              </div>
                            </div>
                            <div className="flex items-center gap-4 mt-1 text-sm text-gray-600">
                              <span>Exp: {formatDate(batch.expiry_date)}</span>
                              <span>Mfg: {formatDate(batch.mfg_date || batch.manufacturing_date)}</span>
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
                            <p className="text-lg font-bold text-gray-900">₹{batch.mrp || product.mrp}</p>
                          </div>
                          <div className={`
                            px-4 py-2 rounded-lg transition-all duration-300 cursor-pointer
                            ${isSelected 
                              ? 'bg-blue-500 text-white' 
                              : 'bg-gray-100 text-gray-600 group-hover:bg-gray-200'
                            }
                          `}>
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
                  </div>
                );
              })}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default BatchSelectionModalV2;