import React, { useState, useEffect, useRef } from 'react';
import {
  Package, AlertCircle, TrendingUp, TrendingDown, Settings,
  Plus, X, Trash2, Upload, Download, Loader2, CheckCircle
} from 'lucide-react';
import {
  GlobalDocumentFlow, ProductSearch, BatchSelector, Select, DatePicker,
  NotesSection, useToast
} from '../../global';
import {
  prepareCanonicalAction,
  approveAndExecuteCanonicalAction,
  canonicalExecutionCompleted,
} from '../../../services/api/canonicalOperatorActions';
import type { CanonicalCommandPreview } from '../../../services/api/canonicalOperatorActions';
import { ADJUSTMENT_TYPES, ADJUSTMENT_TYPE_LABELS, ADJUSTMENT_REASONS } from '../../../constants/stockAdjustment';
import { parseStockAdjustmentCsv, type StockAdjustmentCsvResult } from './utils/stockAdjustmentCsv';

const EnhancedStockAdjustmentFlow = ({ onClose }) => {
  const [currentStep, setCurrentStep] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);
  const toast = useToast();

  // Refs
  const productSearchRef = useRef(null);
  const reasonSelectRef = useRef(null);
  const datePickerRef = useRef(null);

  // Adjustment data state
  const [adjustmentData, setAdjustmentData] = useState<{
    adjustment_no: string;
    adjustment_type: string;
    reason: string;
    adjustment_date: string;
    notes: string;
    items: any[];
  }>({
    adjustment_no: '',
    adjustment_type: '',
    reason: '',
    adjustment_date: new Date().toISOString().split('T')[0],
    notes: '',
    items: []
  });

  const [adjustmentReasons, setAdjustmentReasons] = useState<Record<string, any[]>>({ increase: [], decrease: [] });
  const [showProductSearch, setShowProductSearch] = useState(false);
  const [showBulkUpload, setShowBulkUpload] = useState(false);
  const [csvPreview, setCsvPreview] = useState<StockAdjustmentCsvResult | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<any | null>(null);
  const [showBatchSelector, setShowBatchSelector] = useState(false);

  // Canonical command state: prepare → confirm modal → execute
  const [preparedPreview, setPreparedPreview] = useState<CanonicalCommandPreview | null>(null);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [isPreparing, setIsPreparing] = useState(false);
  const [isCommitting, setIsCommitting] = useState(false);
  const [committedRef, setCommittedRef] = useState<string | null>(null);

  // Generate adjustment number
  const generateAdjustmentNumber = () => {
    const timestamp = Date.now();
    return `ADJ-${new Date().getFullYear()}-${timestamp.toString().slice(-6)}`;
  };

  // Initialize adjustment number
  useEffect(() => {
    setAdjustmentData(prev => ({
      ...prev,
      adjustment_no: generateAdjustmentNumber()
    }));
  }, []);

  // Use constants for adjustment reasons - enterprise pattern
  useEffect(() => {
    setAdjustmentReasons(ADJUSTMENT_REASONS);
  }, []);

  // Auto-open product search when both adjustment type and reason are selected
  useEffect(() => {
    if (adjustmentData.adjustment_type && adjustmentData.reason && !adjustmentData.items.length && !showBulkUpload) {
      setShowProductSearch(true);
    }
  }, [adjustmentData.adjustment_type, adjustmentData.reason, adjustmentData.items.length, showBulkUpload]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.ctrlKey || e.metaKey) {
        switch (e.key) {
          case 'u':
            e.preventDefault();
            setShowBulkUpload(!showBulkUpload);
            setShowProductSearch(false);
            break;
          case 'a':
            e.preventDefault();
            if (adjustmentData.adjustment_type && adjustmentData.reason) {
              setShowProductSearch(true);
              setShowBulkUpload(false);
            }
            break;
          case 's':
            e.preventDefault();
            if (currentStep === 1) {
              handleProceedToReview();
            }
            break;
        }
      }

      // ESC key handling with stopPropagation
      if (e.key === 'Escape') {
        e.stopPropagation();
        if (showConfirmModal) {
          setShowConfirmModal(false);
        } else if (showBatchSelector) {
          setShowBatchSelector(false);
          setSelectedProduct(null);
        } else if (showProductSearch) {
          setShowProductSearch(false);
        } else if (showBulkUpload) {
          setShowBulkUpload(false);
        } else if (currentStep === 2) {
          setCurrentStep(1);
        } else {
          onClose();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [currentStep, showProductSearch, showBulkUpload, showBatchSelector, showConfirmModal, adjustmentData.adjustment_type, adjustmentData.reason, onClose]);

  // Step 1: Product selection - just store the product and show batch selector
  const handleProductSelect = (product) => {
    if (!product) return;

    // Check if product already added
    if ((adjustmentData.items || []).find(item => item.product_id === product.product_id)) {
      toast.error('Product already added to adjustment list');
      return;
    }

    setSelectedProduct(product);
    setShowProductSearch(false);
    setShowBatchSelector(true);
  };

  // Step 2: Quick batch selection - just add with default qty of 1
  const handleBatchSelect = (batch) => {
    if (!batch || !selectedProduct) return;

    const newItem = {
      id: Date.now(),
      product_id: selectedProduct.product_id,
      product_name: selectedProduct.product_name || selectedProduct.name,
      product_code: selectedProduct.product_code || selectedProduct.code,
      batch_id: batch.batch_id,
      batch_number: batch.batch_number,
      quantity_available: batch.quantity_available || 0,
      adjustment_quantity: 1, // Default quantity, editable in table
      unit: selectedProduct.unit || batch.base_uom || 'Units',
      expiry_date: batch.expiry_date,
      after_adjustment: adjustmentData.adjustment_type === 'increase'
        ? (batch.quantity_available || 0) + 1
        : Math.max(0, (batch.quantity_available || 0) - 1)
    };

    setAdjustmentData(prev => ({
      ...prev,
      items: [...prev.items, newItem]
    }));

    // Reset states
    setSelectedProduct(null);
    setShowBatchSelector(false);

    toast.success(`Added ${selectedProduct.product_name} - edit quantity in table`);
  };

  const updateItemQuantity = (itemId: any, quantity: any) => {
    // Don't allow empty string or deletion to make it 0
    if (quantity === '' || quantity === null || quantity === undefined) {
      // Keep minimum value of 1
      quantity = 1;
    }

    const qty = parseInt(quantity) || 1; // Default to 1 instead of 0
    if (qty <= 0) {
      // Minimum quantity is 1
      return;
    }

    setAdjustmentData(prev => ({
      ...prev,
      items: prev.items.map(item => {
        if (item.id === itemId) {
          return {
            ...item,
            adjustment_quantity: qty,
            after_adjustment: item.quantity_available === null
              ? null
              : adjustmentData.adjustment_type === 'increase'
                ? item.quantity_available + qty
                : Math.max(0, item.quantity_available - qty)
          };
        }
        return item;
      })
    }));
  };

  const handleRemoveItem = (itemId: any) => {
    setAdjustmentData(prev => ({
      ...prev,
      items: prev.items.filter(item => item.id !== itemId)
    }));
  };

  const downloadTemplate = () => {
    const csvContent = `product_id,batch_id,product_name,adjustment_quantity,reason,product_code,current_stock,notes
018f1e5a-7b2c-7abc-8def-0123456789ab,018f1e5a-7b2c-7abc-9def-0123456789ac,Example Product,5,physical_count,EXAMPLE-1,,Replace example UUIDs with canonical product and batch UUIDs`;

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `stock_adjustment_template.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  };

  const handleBulkUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = typeof event.target?.result === 'string' ? event.target.result : '';
      setCsvPreview(parseStockAdjustmentCsv(text));
    };
    reader.onerror = () => setCsvPreview({
      rows: [],
      errors: ['The selected CSV could not be read.'],
      adjustmentType: null,
      reason: null,
    });

    reader.readAsText(file);
    e.target.value = '';
  };

  const applyCsvPreview = () => {
    if (!csvPreview || csvPreview.errors.length > 0 || !csvPreview.adjustmentType || !csvPreview.reason) return;

    setAdjustmentData(prev => ({
      ...prev,
      adjustment_type: csvPreview.adjustmentType || '',
      reason: csvPreview.reason || '',
      items: csvPreview.rows.map((row, index) => ({
        id: `csv-${row.productId}-${row.batchId}-${index}`,
        product_id: row.productId,
        batch_id: row.batchId,
        product_name: row.productName,
        product_code: row.productCode,
        batch_number: row.batchId,
        quantity_available: row.currentStock,
        adjustment_quantity: Math.abs(row.adjustmentQuantity),
        unit: '',
        after_adjustment: row.currentStock === null
          ? null
          : csvPreview.adjustmentType === 'increase'
            ? row.currentStock + Math.abs(row.adjustmentQuantity)
            : Math.max(0, row.currentStock - Math.abs(row.adjustmentQuantity)),
        notes: row.notes,
      })),
    }));
    setShowBulkUpload(false);
    setCsvPreview(null);
    toast.info('Validated CSV rows loaded for review. No stock was changed.');
  };

  const validateAdjustment = () => {
    if (!adjustmentData.adjustment_type) {
      toast.error('Please select adjustment type');
      return false;
    }

    if (!adjustmentData.reason) {
      toast.error('Please select a reason');
      return false;
    }

    if (adjustmentData.items.length === 0) {
      toast.error('Please add at least one product');
      return false;
    }

    return true;
  };

  const isAdjustmentValid = () => Boolean(
    adjustmentData.adjustment_type
    && adjustmentData.reason
    && adjustmentData.items.length > 0
  );

  const handleProceedToReview = () => {
    if (validateAdjustment()) {
      setCurrentStep(2);
      window.scrollTo(0, 0);
    }
  };

  // Step 1: Prepare the canonical command — does NOT mutate any data yet.
  const handlePrepare = async () => {
    if (!validateAdjustment()) return;
    setIsPreparing(true);
    setError(null);
    try {
      const payload: Record<string, unknown> = {
        adjustment_type: adjustmentData.adjustment_type,
        reason: adjustmentData.reason,
        adjustment_date: adjustmentData.adjustment_date,
        notes: adjustmentData.notes || '',
        idempotency_key: `erp-web-inventory-adjustment-prepare:${adjustmentData.adjustment_no}`,
        items: adjustmentData.items.map(item => ({
          product_id: String(item.product_id),
          batch_id: String(item.batch_id),
          quantity: item.adjustment_quantity,
        })),
      };
      const prepared = await prepareCanonicalAction('inventory.adjustment.prepare', payload);
      setPreparedPreview(prepared.data);
      setShowConfirmModal(true);
    } catch (err: any) {
      const msg = err?.response?.data?.detail?.message || err?.message || 'Failed to prepare adjustment. No data was changed.';
      setError(msg);
      toast.error(msg);
    } finally {
      setIsPreparing(false);
    }
  };

  // Step 2: User confirmed — approve + execute the prepared command.
  const handleCommit = async () => {
    if (!preparedPreview) return;
    setIsCommitting(true);
    setError(null);
    try {
      const { executed } = await approveAndExecuteCanonicalAction('inventory.adjustment.prepare', preparedPreview);
      if (canonicalExecutionCompleted(executed.data)) {
        const ref = executed.data.resource_id
          ? String(executed.data.resource_id)
          : adjustmentData.adjustment_no;
        setCommittedRef(ref);
        setShowConfirmModal(false);
        toast.success(`Stock adjustment ${ref} posted successfully`);
      } else {
        throw new Error(`Unexpected execution status: ${executed.data.status}`);
      }
    } catch (err: any) {
      const msg = err?.response?.data?.detail?.message || err?.message || 'Adjustment execution failed. Check server status before retrying.';
      setError(msg);
      toast.error(msg);
    } finally {
      setIsCommitting(false);
    }
  };

  // Create content for step 1
  const createContent = (
    <div className="space-y-6">
      {/* Loading State */}
      {isLoading && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8">
          <div className="text-center">
            <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4 text-blue-600" />
            <p className="text-gray-600">Processing...</p>
          </div>
        </div>
      )}

      {/* Error State */}
      {error && (
        <div className="bg-white rounded-lg shadow-sm border border-red-200 p-6">
          <div className="text-center max-w-md mx-auto">
            <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-red-800 mb-2">Error</h3>
            <p className="text-red-700 mb-4">{error}</p>
            <button
              onClick={() => setError(null)}
              className="px-4 py-2 bg-red-100 text-red-700 rounded-md hover:bg-red-200 text-sm"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* Type & Details Section */}
      <div className="mb-6">
        <h3 className="text-lg font-medium text-gray-900 mb-3 flex items-center">
          <Settings className="w-5 h-5 mr-2 text-blue-600" />
          Adjustment Details
        </h3>
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">

          {/* Adjustment Type Selection */}
          <div className="flex items-center space-x-4 mb-6">
            <button
              onClick={() => {
                setAdjustmentData(prev => ({ ...prev, adjustment_type: 'increase', reason: '', items: [] }));
                // Auto-focus reason dropdown after selection
                setTimeout(() => {
                  const selectElement = document.querySelector('[data-reason-select]') as HTMLElement;
                  if (selectElement) selectElement.focus();
                }, 100);
              }}
              className={`flex-1 flex items-center justify-center space-x-2 p-3 rounded-lg border-2 transition-all ${adjustmentData.adjustment_type === 'increase'
                ? 'border-green-500 bg-green-50 text-green-700'
                : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
                }`}
            >
              <TrendingUp className="w-5 h-5" />
              <span className="font-medium">Increase Stock</span>
            </button>

            <button
              onClick={() => {
                setAdjustmentData(prev => ({ ...prev, adjustment_type: 'decrease', reason: '', items: [] }));
                // Auto-focus reason dropdown after selection
                setTimeout(() => {
                  const selectElement = document.querySelector('[data-reason-select]') as HTMLElement;
                  if (selectElement) selectElement.focus();
                }, 100);
              }}
              className={`flex-1 flex items-center justify-center space-x-2 p-3 rounded-lg border-2 transition-all ${adjustmentData.adjustment_type === 'decrease'
                ? 'border-red-500 bg-red-50 text-red-700'
                : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
                }`}
            >
              <TrendingDown className="w-5 h-5" />
              <span className="font-medium">Decrease Stock</span>
            </button>
          </div>

          {/* Reason and Date Row */}
          {adjustmentData.adjustment_type && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Reason for Adjustment
                </label>
                <Select
                  data-reason-select
                  value={adjustmentData.reason}
                  onChange={(value) => {
                    setAdjustmentData(prev => ({ ...prev, reason: String(value || '') }));
                    // Auto-focus date picker after selecting reason
                    if (value) {
                      setTimeout(() => {
                        const dateElement = document.querySelector('[data-date-picker]') as HTMLElement;
                        if (dateElement) dateElement.focus();
                      }, 100);
                    }
                  }}
                  options={[
                    { value: '', label: 'Select reason...' },
                    ...(Array.isArray(adjustmentReasons[adjustmentData.adjustment_type])
                      ? adjustmentReasons[adjustmentData.adjustment_type].map(r => ({
                        value: r.value || r,
                        label: r.label || r
                      }))
                      : [])
                  ]}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Adjustment Date
                </label>
                <DatePicker
                  data-date-picker
                  value={adjustmentData.adjustment_date ? new Date(adjustmentData.adjustment_date) : null}
                  onChange={(date) => {
                    setAdjustmentData(prev => ({ ...prev, adjustment_date: typeof date === 'string' ? date : new Date(date).toISOString().split('T')[0] }));
                    // Auto-open product search after date selection if reason is set
                    if (adjustmentData.reason && !adjustmentData.items.length) {
                      setTimeout(() => setShowProductSearch(true), 100);
                    }
                  }}
                  maxDate={new Date()}
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Bulk Upload Section */}
      {showBulkUpload && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-lg font-medium text-gray-900 flex items-center">
              <Upload className="w-5 h-5 mr-2 text-purple-600" />
              Bulk Upload
            </h3>
            <button
              onClick={() => setShowBulkUpload(false)}
              className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-700"
              aria-label="Close bulk upload"
              title="Close bulk upload"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="space-y-4">
            <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
              <input
                type="file"
                accept=".csv"
                onChange={handleBulkUpload}
                className="hidden"
                id="bulk-upload-adjustment"
              />
              <label
                htmlFor="bulk-upload-adjustment"
                className="cursor-pointer"
              >
                <Upload className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                <p className="text-sm text-gray-600">
                  Drop CSV file here or <span className="text-blue-600 font-medium">browse</span>
                </p>
                <p className="text-xs text-gray-500 mt-1">
                  Validates canonical product and batch UUIDs before rows can be loaded
                </p>
              </label>
            </div>

            <div className="flex items-center justify-between">
              <button
                onClick={downloadTemplate}
                className="flex items-center space-x-2 text-blue-600 hover:text-blue-700"
              >
                <Download className="w-4 h-4" />
                <span className="text-sm">Download Template</span>
              </button>

              <div className="text-xs text-gray-500">
                <span className="font-medium">Required:</span> product_id, batch_id, product_name, adjustment_quantity, reason
              </div>
            </div>

            {csvPreview && (
              <div className="rounded-lg border border-gray-200 bg-gray-50 p-4" aria-live="polite">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-medium text-gray-900">CSV validation preview</p>
                    <p className="text-sm text-gray-600">
                      {csvPreview.rows.length} valid row{csvPreview.rows.length === 1 ? '' : 's'}; no inventory data has been changed.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={applyCsvPreview}
                    disabled={csvPreview.errors.length > 0 || csvPreview.rows.length === 0}
                    className="inline-flex min-h-11 items-center rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-300"
                  >
                    Use validated rows
                  </button>
                </div>

                {csvPreview.errors.length > 0 && (
                  <div className="mt-3 rounded-md border border-red-200 bg-red-50 p-3" role="alert">
                    <p className="text-sm font-medium text-red-800">Fix these CSV errors</p>
                    <ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-red-700">
                      {csvPreview.errors.map((message, index) => <li key={`${message}-${index}`}>{message}</li>)}
                    </ul>
                  </div>
                )}

                {csvPreview.rows.length > 0 && (
                  <div className="mt-3 overflow-x-auto rounded-md border border-gray-200 bg-white">
                    <table className="min-w-full text-sm">
                      <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
                        <tr>
                          <th className="px-3 py-2">Product</th>
                          <th className="px-3 py-2">Batch UUID</th>
                          <th className="px-3 py-2 text-right">Quantity</th>
                          <th className="px-3 py-2">Reason</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {csvPreview.rows.map((row, index) => (
                          <tr key={`${row.productId}-${row.batchId}-${index}`}>
                            <td className="px-3 py-2">
                              <div className="font-medium text-gray-900">{row.productName}</div>
                              <div className="font-mono text-xs text-gray-500">{row.productId}</div>
                            </td>
                            <td className="px-3 py-2 font-mono text-xs text-gray-600">{row.batchId}</td>
                            <td className="px-3 py-2 text-right font-medium">{row.adjustmentQuantity}</td>
                            <td className="px-3 py-2">{row.reason}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Product Selection Section */}
      {adjustmentData.adjustment_type && (
        <div className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-lg font-medium text-gray-900 flex items-center">
              <Package className="w-5 h-5 mr-2 text-blue-600" />
              Products to Adjust
            </h3>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  setShowProductSearch(true);
                  setShowBulkUpload(false);
                }}
                disabled={!adjustmentData.reason}
                className="flex items-center space-x-2 px-3 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Plus className="w-4 h-4" />
                <span>Add Product</span>
              </button>
              <button
                onClick={() => {
                  setShowBulkUpload(!showBulkUpload);
                  setShowProductSearch(false);
                }}
                className="flex items-center space-x-2 px-3 py-1.5 min-h-[44px] border border-gray-300 bg-white text-gray-700 text-sm rounded-lg hover:bg-gray-50"
              >
                <Upload className="w-4 h-4" />
                <span>Bulk Upload</span>
              </button>
            </div>
          </div>
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">

            {/* Product Search Modal */}
            {showProductSearch && (
              <div className="mb-4 p-4 bg-gray-50 rounded-lg">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="font-medium text-gray-900">Search Product</h4>
                  <button
                    onClick={() => setShowProductSearch(false)}
                    className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-700"
                    aria-label="Close product search"
                    title="Close product search"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <ProductSearch
                  onAddItem={handleProductSelect}
                  onCreateProduct={(searchQuery) => {
                    // Handle product creation if needed
                  }}
                  showBatchSelection={false}
                  placeholder="Search and select product..."
                  ref={productSearchRef}
                />
              </div>
            )}

            {/* Batch Selection Modal Popup - More Compact */}
            {showBatchSelector && selectedProduct && (
              <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                {/* Backdrop */}
                <div
                  className="absolute inset-0 bg-black bg-opacity-50"
                  onClick={() => {
                    setShowBatchSelector(false);
                    setSelectedProduct(null);
                  }}
                />

                {/* Modal - Compact and efficient */}
                <div className="relative bg-white rounded-lg shadow-2xl w-full max-w-4xl max-h-[85vh] overflow-hidden">
                  {/* Compact Header */}
                  <div className="flex items-center justify-between px-4 py-3 border-b bg-gray-50">
                    <div className="flex items-center space-x-3">
                      <Package className="h-5 w-5 text-blue-600" />
                      <div>
                        <h3 className="text-base font-semibold text-gray-900">Select Batch for {selectedProduct?.product_name}</h3>
                        <p className="text-xs text-gray-500">Choose a batch - quantity can be edited after selection</p>
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        setShowBatchSelector(false);
                        setSelectedProduct(null);
                      }}
                      className="inline-flex min-h-11 min-w-11 items-center justify-center p-1.5 hover:bg-gray-200 rounded-lg transition-colors"
                      aria-label="Close batch selector"
                      title="Close batch selector"
                    >
                      <X className="h-5 w-5 text-gray-500" />
                    </button>
                  </div>

                  {/* Body - Minimal padding, maximum content */}
                  <div className="overflow-y-auto" style={{ maxHeight: 'calc(85vh - 120px)' }}>
                    <BatchSelector
                      show={true}
                      mode="inline"
                      product={selectedProduct}
                      onBatchSelect={handleBatchSelect}
                      onClose={() => {
                        setShowBatchSelector(false);
                        setSelectedProduct(null);
                      }}
                      showExpiryStatus={true}
                      filterExpired={false}
                      maxHeight="none"
                      className="w-full"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Selected Products Table */}
            {adjustmentData.items.length > 0 ? (
              <div>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Product</th>
                        <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Batch</th>
                        <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Current Stock</th>
                        <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Adjustment Qty</th>
                        <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">New Stock</th>
                        <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {adjustmentData.items.map((item) => (
                        <tr key={item.id}>
                          <td className="px-4 py-3">
                            <div>
                              <div className="font-medium text-gray-900">{item.product_name}</div>
                              <div className="text-sm text-gray-500">{item.product_code}</div>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <div>
                              <div className="font-medium">{item.batch_number || 'Default'}</div>
                              {item.expiry_date && (
                                <div className="text-xs text-gray-500">Exp: {new Date(item.expiry_date).toLocaleDateString()}</div>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-center">{item.quantity_available === null ? '—' : item.quantity_available}</td>
                          <td className="px-4 py-3 text-center">
                            <input
                              type="number"
                              value={item.adjustment_quantity}
                              onChange={(e) => updateItemQuantity(item.id, e.target.value)}
                              min="1"
                              className="w-24 px-2 py-1 border border-gray-300 rounded text-center focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span className={`font-medium ${adjustmentData.adjustment_type === 'increase' ? 'text-green-600' : 'text-red-600'
                              }`}>
                              {item.after_adjustment === null ? 'Server validates' : item.after_adjustment}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <button
                              onClick={() => handleRemoveItem(item.id)}
                              className="inline-flex min-h-11 min-w-11 items-center justify-center p-1 text-red-600 hover:text-red-800 hover:bg-red-50 rounded"
                              aria-label={`Remove ${item.product_name}`}
                              title={`Remove ${item.product_name}`}
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500">
                <Package className="w-12 h-12 mx-auto mb-3 text-gray-400" />
                <p>No products added yet</p>
                <p className="text-sm mt-1">Click "Add Product" to start</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );

  // Review content for step 2
  const reviewContent = (
    <div className="space-y-6">
      {/* Error State */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-start space-x-3">
            <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-red-800">Could not prepare adjustment</p>
              <p className="text-sm text-red-700 mt-1">{error}</p>
            </div>
          </div>
        </div>
      )}

      {/* Success State */}
      {committedRef && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <div className="flex items-start space-x-3">
            <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-green-800">Adjustment posted</p>
              <p className="text-sm text-green-700 mt-1">
                Stock adjustment <strong>{committedRef}</strong> has been committed to inventory.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Canonical Confirm Modal */}
      {showConfirmModal && preparedPreview && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="adjustment-confirm-title"
        >
          <div className="absolute inset-0 bg-black bg-opacity-50" onClick={() => !isCommitting && setShowConfirmModal(false)} />
          <div className="relative bg-white rounded-lg shadow-2xl w-full max-w-lg p-6">
            <div className="flex items-center space-x-3 mb-4">
              <AlertCircle className="w-6 h-6 text-amber-600" />
              <h3 id="adjustment-confirm-title" className="text-lg font-semibold text-gray-900">Confirm Stock Adjustment</h3>
            </div>
            <p className="text-sm text-gray-700 mb-2">
              You are about to post a <strong>{adjustmentData.adjustment_type}</strong> adjustment
              for <strong>{adjustmentData.items.length}</strong> product(s) on{' '}
              <strong>{new Date(adjustmentData.adjustment_date).toLocaleDateString()}</strong>.
            </p>
            <p className="text-xs text-gray-500 mb-4">
              Command ID: <span className="font-mono">{preparedPreview.command_request_id}</span>
            </p>
            <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded p-3 mb-6">
              This action will permanently update stock levels. It cannot be undone from the UI.
            </p>
            <div className="flex space-x-3">
              <button
                onClick={() => setShowConfirmModal(false)}
                disabled={isCommitting}
                className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleCommit}
                disabled={isCommitting}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center justify-center space-x-2"
              >
                {isCommitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Posting...</span>
                  </>
                ) : (
                  <span>Post Adjustment</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Summary Card */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4">Adjustment Summary</h3>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div>
            <p className="text-sm text-gray-600">Type</p>
            <p className="font-medium flex items-center space-x-2">
              {adjustmentData.adjustment_type === 'increase' ? (
                <>
                  <TrendingUp className="w-4 h-4 text-green-600" />
                  <span className="text-green-600">Stock Increase</span>
                </>
              ) : (
                <>
                  <TrendingDown className="w-4 h-4 text-red-600" />
                  <span className="text-red-600">Stock Decrease</span>
                </>
              )}
            </p>
          </div>
          <div>
            <p className="text-sm text-gray-600">Reason</p>
            <p className="font-medium">
              {adjustmentReasons[adjustmentData.adjustment_type]?.find(r => r.value === adjustmentData.reason)?.label}
            </p>
          </div>
          <div>
            <p className="text-sm text-gray-600">Date</p>
            <p className="font-medium">{new Date(adjustmentData.adjustment_date).toLocaleDateString()}</p>
          </div>
          <div>
            <p className="text-sm text-gray-600">Total Items</p>
            <p className="font-medium">{adjustmentData.items.length} products</p>
          </div>
        </div>

        {/* Products Table */}
        <div className="border border-gray-200 rounded-lg overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Product</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Batch</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Current Stock</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Adjustment</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">New Stock</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {adjustmentData.items.map((item) => (
                <tr key={item.id}>
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-900">{item.product_name}</div>
                    <div className="text-sm text-gray-500">{item.product_code}</div>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <div className="font-medium">{item.batch_number || 'Default'}</div>
                    {item.expiry_date && (
                      <div className="text-xs text-gray-500">Exp: {new Date(item.expiry_date).toLocaleDateString()}</div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center">{item.quantity_available === null ? '—' : item.quantity_available}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={`font-medium ${adjustmentData.adjustment_type === 'increase' ? 'text-green-600' : 'text-red-600'
                      }`}>
                      {adjustmentData.adjustment_type === 'increase' ? '+' : '-'}{item.adjustment_quantity}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center font-medium">{item.after_adjustment === null ? 'Server validates' : item.after_adjustment}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Notes Section */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <NotesSection
          value={adjustmentData.notes}
          onChange={(value) => setAdjustmentData(prev => ({
            ...prev,
            notes: value
          }))}
          placeholder="Add any additional notes about this adjustment..."
          label="Additional Notes"
          rows={3}
        />
      </div>
    </div>
  );

  return (
    <GlobalDocumentFlow
      documentType="stock-adjustment"
      currentStep={currentStep}
      onStepChange={setCurrentStep}
      createContent={createContent}
      reviewContent={reviewContent}
      onClose={onClose}
      canProceedToReview={isAdjustmentValid}
      keyboardShortcuts={{
        1: [
          { key: 'Ctrl+A', action: 'Add Product' },
          { key: 'Ctrl+U', action: 'Bulk Upload' },
          { key: 'Esc', action: 'Close' }
        ],
        2: [
          { key: 'Esc', action: 'Back' }
        ]
      }}
      onSave={committedRef ? undefined : handlePrepare}
      isSaving={isPreparing || isCommitting}
      saveLabel={committedRef ? 'Adjustment Posted' : 'Post Adjustment'}
      footerTotals={{ itemCount: adjustmentData.items.length }}
      additionalActions={[
        {
          label: "Bulk Adjust",
          icon: Upload,
          onClick: () => {
            setShowBulkUpload(!showBulkUpload);
            setShowProductSearch(false);
          }
        }
      ]}
    />
  );
};

export default EnhancedStockAdjustmentFlow;
