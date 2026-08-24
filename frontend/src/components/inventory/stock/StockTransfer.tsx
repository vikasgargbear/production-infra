import React, { useState, useEffect, useCallback } from 'react';
import {
  ArrowRightLeft, Package, MapPin, AlertCircle, CheckCircle,
  X, ArrowRight, Loader2
} from 'lucide-react';
import {
  GlobalDocumentFlow, ProductSearch, BatchSelector, Select, DatePicker,
  NotesSection, useToast
} from '../../global';
import { branchesApi, settingsApi } from '../../../services/api';
import {
  prepareCanonicalAction,
  approveAndExecuteCanonicalAction,
  canonicalExecutionCompleted,
} from '../../../services/api/canonicalOperatorActions';
import type { CanonicalCommandPreview } from '../../../services/api/canonicalOperatorActions';
import { canReviewStockTransfer } from './utils/canReviewStockTransfer';

const StockTransfer = ({ open = true, onClose }) => {
  const toast = useToast();
  const [currentStep, setCurrentStep] = useState(1);
  const [locations, setLocations] = useState<any[]>([]);
  const [loadingLocations, setLoadingLocations] = useState(true);

  // Transfer data
  const [transferData, setTransferData] = useState({
    movement_date: new Date().toISOString().split('T')[0],
    source_location: null as number | null,
    destination_location: null as number | null,
    reason: 'Stock transfer',
    notes: '',
    items: [] as any[]
  });

  // Product/Batch selection state
  const [showProductSearch, setShowProductSearch] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<any>(null);
  const [showBatchSelector, setShowBatchSelector] = useState(false);

  // Canonical command state: prepare → confirm modal → execute
  const [preparedPreview, setPreparedPreview] = useState<CanonicalCommandPreview | null>(null);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [isPreparing, setIsPreparing] = useState(false);
  const [isCommitting, setIsCommitting] = useState(false);
  const [committedRef, setCommittedRef] = useState<string | null>(null);
  const [transferError, setTransferError] = useState<string | null>(null);

  // Load storage locations
  useEffect(() => {
    const loadLocations = async () => {
      setLoadingLocations(true);
      try {
        const response = await branchesApi.getAll({ is_active: true });
        const branches = response?.data?.branches || response?.data || [];
        const locs = Array.isArray(branches) ? branches.filter((b: any) => b.is_active !== false) : [];
        setLocations(locs);

        // Auto-select source if only one location
        if (locs.length === 1) {
          setTransferData(prev => ({ ...prev, source_location: locs[0].branch_id }));
        }
      } catch (err) {
        // Fallback: try warehouse/location endpoint
        try {
          const locResponse = await settingsApi.warehouses?.getAll?.();
          const locs = locResponse?.data || [];
          setLocations(Array.isArray(locs) ? locs : []);
        } catch {
          setLocations([]);
        }
      } finally {
        setLoadingLocations(false);
      }
    };
    loadLocations();
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        if (showBatchSelector) {
          setShowBatchSelector(false);
          setSelectedProduct(null);
        } else if (showProductSearch) {
          setShowProductSearch(false);
        } else if (currentStep === 2) {
          setCurrentStep(1);
        } else {
          onClose();
        }
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        if (currentStep === 1 && validate()) setCurrentStep(2);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [currentStep, showProductSearch, showBatchSelector, onClose]);

  const handleProductSelect = (product: any) => {
    if (!product) return;
    if (transferData.items.find(i => i.product_id === product.product_id)) {
      toast.error('Product already added');
      return;
    }
    setSelectedProduct(product);
    setShowProductSearch(false);
    setShowBatchSelector(true);
  };

  const handleBatchSelect = (batch: any) => {
    if (!batch || !selectedProduct) return;

    const newItem = {
      id: Date.now(),
      product_id: selectedProduct.product_id,
      product_name: selectedProduct.product_name || selectedProduct.name,
      product_code: selectedProduct.product_code || selectedProduct.code,
      batch_id: batch.batch_id,
      batch_number: batch.batch_number,
      expiry_date: batch.expiry_date,
      quantity_available: batch.quantity_available || 0,
      transfer_quantity: 1
    };

    setTransferData(prev => ({ ...prev, items: [...prev.items, newItem] }));
    setSelectedProduct(null);
    setShowBatchSelector(false);
    toast.success(`Added ${selectedProduct.product_name}`);
  };

  const updateItemQuantity = (itemId: number, qty: number) => {
    const quantity = Math.max(1, Math.floor(qty) || 1);
    setTransferData(prev => ({
      ...prev,
      items: prev.items.map(item =>
        item.id === itemId ? { ...item, transfer_quantity: quantity } : item
      )
    }));
  };

  const removeItem = (itemId: number) => {
    setTransferData(prev => ({
      ...prev,
      items: prev.items.filter(item => item.id !== itemId)
    }));
  };

  const validate = useCallback(() => {
    if (!transferData.source_location) {
      toast.error('Please select source location');
      return false;
    }
    if (!transferData.destination_location) {
      toast.error('Please select destination location');
      return false;
    }
    if (transferData.source_location === transferData.destination_location) {
      toast.error('Source and destination must be different');
      return false;
    }
    if (transferData.items.length === 0) {
      toast.error('Please add at least one product');
      return false;
    }
    for (const item of transferData.items) {
      if (item.transfer_quantity <= 0 || item.transfer_quantity > item.quantity_available) {
        toast.error(`Insufficient stock for ${item.product_name}. Available: ${item.quantity_available}`);
        return false;
      }
    }
    return true;
  }, [transferData, toast]);

  // Step 1: Prepare the canonical command — does NOT mutate data yet.
  const handlePrepare = async () => {
    if (!validate()) return;
    setIsPreparing(true);
    setTransferError(null);
    try {
      const idempotencyKey = `erp-web-inventory-transfer-prepare:${transferData.movement_date}-${transferData.source_location}-${transferData.destination_location}-${Date.now()}`;
      const payload: Record<string, unknown> = {
        movement_date: transferData.movement_date,
        source_branch_id: String(transferData.source_location),
        destination_branch_id: String(transferData.destination_location),
        reason: transferData.reason,
        notes: transferData.notes || '',
        idempotency_key: idempotencyKey,
        items: transferData.items.map(item => ({
          product_id: String(item.product_id),
          batch_id: String(item.batch_id),
          quantity: item.transfer_quantity,
        })),
      };
      const prepared = await prepareCanonicalAction('inventory.transfer.prepare', payload);
      setPreparedPreview(prepared.data);
      setShowConfirmModal(true);
    } catch (err: any) {
      const msg = err?.response?.data?.detail?.message || err?.message || 'Failed to prepare transfer. No data was changed.';
      setTransferError(msg);
      toast.error(msg);
    } finally {
      setIsPreparing(false);
    }
  };

  // Step 2: User confirmed — approve + execute the prepared command.
  const handleCommit = async () => {
    if (!preparedPreview) return;
    setIsCommitting(true);
    setTransferError(null);
    try {
      const { executed } = await approveAndExecuteCanonicalAction('inventory.transfer.prepare', preparedPreview);
      if (canonicalExecutionCompleted(executed.data)) {
        const ref = executed.data.resource_id ? String(executed.data.resource_id) : `TRF-${Date.now()}`;
        setCommittedRef(ref);
        setShowConfirmModal(false);
        toast.success(`Stock transfer ${ref} posted successfully`);
      } else {
        throw new Error(`Unexpected execution status: ${executed.data.status}`);
      }
    } catch (err: any) {
      const msg = err?.response?.data?.detail?.message || err?.message || 'Transfer execution failed. Check server status before retrying.';
      setTransferError(msg);
      toast.error(msg);
    } finally {
      setIsCommitting(false);
    }
  };

  const locationOptions = [
    { value: '', label: 'Select location...' },
    ...locations.map(loc => ({
      value: loc.branch_id || loc.location_id,
      label: loc.branch_name || loc.location_name || `Location ${loc.branch_id || loc.location_id}`
    }))
  ];

  const needsMoreLocations = locations.length < 2;

  if (!open) return null;

  // Step 1: Create content
  const createContent = (
    <div className="space-y-6">
      {/* Info banner for single location */}
      {needsMoreLocations && !loadingLocations && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
          <div className="flex items-start space-x-3">
            <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-amber-800">Multiple locations required</p>
              <p className="text-sm text-amber-700 mt-1">
                Stock transfers require at least 2 locations. Add more branches/warehouses in Master Settings to enable transfers.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Transfer Details */}
      <div className="mb-6">
        <h3 className="text-lg font-medium text-gray-900 mb-3 flex items-center">
          <MapPin className="w-5 h-5 mr-2 text-gray-600" />
          Transfer Details
        </h3>
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
          {/* Location Selection Row */}
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-6 items-end">
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Source Location
              </label>
              <Select
                value={transferData.source_location || ''}
                onChange={(value) => setTransferData(prev => ({
                  ...prev,
                  source_location: value ? Number(value) : null
                }))}
                options={locationOptions}
                disabled={loadingLocations}
              />
            </div>

            <div className="flex items-center justify-center">
              <div className="w-10 h-10 rounded-full border border-gray-200 bg-white flex items-center justify-center">
                <ArrowRight className="w-5 h-5 text-gray-600" />
              </div>
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Destination Location
              </label>
              <Select
                value={transferData.destination_location || ''}
                onChange={(value) => setTransferData(prev => ({
                  ...prev,
                  destination_location: value ? Number(value) : null
                }))}
                options={locationOptions.filter(
                  opt => !opt.value || opt.value !== transferData.source_location
                )}
                disabled={loadingLocations}
              />
            </div>
          </div>

          {/* Date and Reason Row */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Transfer Date
              </label>
              <DatePicker
                value={transferData.movement_date ? new Date(transferData.movement_date) : null}
                onChange={(date) => {
                  setTransferData(prev => ({
                    ...prev,
                    movement_date: typeof date === 'string' ? date : new Date(date).toISOString().split('T')[0]
                  }));
                }}
                maxDate={new Date()}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Reason
              </label>
              <Select
                value={transferData.reason}
                onChange={(value) => setTransferData(prev => ({ ...prev, reason: String(value || 'Stock transfer') }))}
                options={[
                  { value: 'Stock transfer', label: 'Stock Transfer' },
                  { value: 'Rebalancing', label: 'Stock Rebalancing' },
                  { value: 'Branch request', label: 'Branch Request' },
                  { value: 'Consolidation', label: 'Stock Consolidation' },
                  { value: 'Other', label: 'Other' }
                ]}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Products Section */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-medium text-gray-900 flex items-center">
            <Package className="w-5 h-5 mr-2 text-gray-600" />
            Products to Transfer
          </h3>
          <button
            onClick={() => {
              setShowProductSearch(true);
              setShowBatchSelector(false);
            }}
            disabled={needsMoreLocations || !transferData.source_location || !transferData.destination_location}
            className="flex min-h-11 items-center space-x-2 px-4 py-2 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:text-gray-600 disabled:cursor-not-allowed"
            title={needsMoreLocations || !transferData.source_location || !transferData.destination_location ? 'Select two different locations first' : 'Add a product'}
          >
            <span>+ Add Product</span>
          </button>
        </div>
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">

          {/* Product Search */}
          {showProductSearch && (
            <div className="mb-4 p-4 bg-gray-50 rounded-lg">
              <div className="flex items-center justify-between mb-3">
                <h4 className="font-medium text-gray-900">Search Product</h4>
                <button onClick={() => setShowProductSearch(false)} className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-700" aria-label="Close product search" title="Close product search">
                  <X className="w-4 h-4" />
                </button>
              </div>
              <ProductSearch
                onAddItem={handleProductSelect}
                showBatchSelection={false}
                placeholder="Search product to transfer..."
              />
            </div>
          )}

          {/* Batch Selection Modal */}
          {showBatchSelector && selectedProduct && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
              <div className="absolute inset-0 bg-black bg-opacity-50" onClick={() => { setShowBatchSelector(false); setSelectedProduct(null); }} />
              <div className="relative bg-white rounded-lg shadow-2xl w-full max-w-4xl max-h-[85vh] overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 border-b bg-gray-50">
                  <div className="flex items-center space-x-3">
                    <Package className="h-5 w-5 text-gray-600" />
                    <div>
                      <h3 className="text-base font-semibold text-gray-900">Select Batch for {selectedProduct?.product_name}</h3>
                      <p className="text-xs text-gray-500">Choose a batch to transfer</p>
                    </div>
                  </div>
                  <button onClick={() => { setShowBatchSelector(false); setSelectedProduct(null); }} className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg hover:bg-gray-200" aria-label="Close batch selector" title="Close batch selector">
                    <X className="h-5 w-5 text-gray-500" />
                  </button>
                </div>
                <div className="overflow-y-auto" style={{ maxHeight: 'calc(85vh - 120px)' }}>
                  <BatchSelector
                    show={true}
                    mode="inline"
                    product={selectedProduct}
                    onBatchSelect={handleBatchSelect}
                    onClose={() => { setShowBatchSelector(false); setSelectedProduct(null); }}
                    showExpiryStatus={true}
                    filterExpired={true}
                    maxHeight="none"
                    className="w-full"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Items Table */}
          {transferData.items.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Product</th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Batch</th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Available</th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Transfer Qty</th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Remaining</th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {transferData.items.map((item) => {
                    const remaining = item.quantity_available - item.transfer_quantity;
                    const isOverStock = remaining < 0;
                    return (
                      <tr key={item.id} className={isOverStock ? 'bg-red-50' : ''}>
                        <td className="px-4 py-3">
                          <div className="font-medium text-gray-900">{item.product_name}</div>
                          <div className="text-sm text-gray-500">{item.product_code}</div>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <div className="font-medium">{item.batch_number}</div>
                          {item.expiry_date && (
                            <div className="text-xs text-gray-500">Exp: {new Date(item.expiry_date).toLocaleDateString()}</div>
                          )}
                        </td>
                        <td className="px-4 py-3 text-center">{item.quantity_available}</td>
                        <td className="px-4 py-3 text-center">
                          <input
                            type="number"
                            value={item.transfer_quantity}
                            onChange={(e) => updateItemQuantity(item.id, parseInt(e.target.value))}
                            min="1"
                            max={item.quantity_available}
                            className={`min-h-11 w-24 px-2 py-1 border rounded text-center focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                              isOverStock ? 'border-red-300 bg-red-50' : 'border-gray-300'
                            }`}
                          />
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className={`font-medium ${isOverStock ? 'text-red-600' : 'text-gray-900'}`}>
                            {remaining}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <button onClick={() => removeItem(item.id)} className="inline-flex min-h-11 min-w-11 items-center justify-center rounded text-red-600 hover:text-red-800 hover:bg-red-50" aria-label={`Remove ${item.product_name}`} title={`Remove ${item.product_name}`}>
                            <X className="w-4 h-4" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-center py-8 text-gray-500">
              <ArrowRightLeft className="w-12 h-12 mx-auto mb-3 text-gray-400" />
              <p>No products added yet</p>
              <p className="text-sm mt-1">
                {needsMoreLocations
                  ? 'Add more locations in Master Settings to enable transfers'
                  : !transferData.source_location || !transferData.destination_location
                  ? 'Select source and destination locations first'
                  : 'Click "Add Product" to start'}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  // Step 2: Review content
  const reviewContent = (
    <div className="space-y-6">
      {/* Error State */}
      {transferError && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-start space-x-3">
            <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-red-800">Could not prepare transfer</p>
              <p className="text-sm text-red-700 mt-1">{transferError}</p>
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
              <p className="text-sm font-medium text-green-800">Transfer posted</p>
              <p className="text-sm text-green-700 mt-1">
                Stock transfer <strong>{committedRef}</strong> has been committed to inventory.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Canonical Confirm Modal */}
      {showConfirmModal && preparedPreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black bg-opacity-50" onClick={() => !isCommitting && setShowConfirmModal(false)} />
          <div className="relative bg-white rounded-lg shadow-2xl w-full max-w-lg p-6">
            <div className="flex items-center space-x-3 mb-4">
              <AlertCircle className="w-6 h-6 text-amber-600" />
              <h3 className="text-lg font-semibold text-gray-900">Confirm Stock Transfer</h3>
            </div>
            <p className="text-sm text-gray-700 mb-2">
              You are about to transfer <strong>{transferData.items.length}</strong> product(s)
              from{' '}
              <strong>{locations.find(l => (l.branch_id || l.location_id) === transferData.source_location)?.branch_name || 'source'}</strong>
              {' '}to{' '}
              <strong>{locations.find(l => (l.branch_id || l.location_id) === transferData.destination_location)?.branch_name || 'destination'}</strong>
              {' '}on <strong>{new Date(transferData.movement_date).toLocaleDateString()}</strong>.
            </p>
            <p className="text-xs text-gray-500 mb-4">
              Command ID: <span className="font-mono">{preparedPreview.command_request_id}</span>
            </p>
            <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded p-3 mb-6">
              This action will permanently move stock between locations. It cannot be undone from the UI.
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
                  <span>Post Transfer</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4">Transfer Summary</h3>

        {/* Location Flow */}
        <div className="flex items-center justify-center space-x-4 mb-6 p-4 bg-gray-50 border border-gray-200 rounded-lg">
          <div className="text-center">
            <div className="text-xs text-gray-500 uppercase mb-1">From</div>
            <div className="font-semibold text-gray-900">
              {locations.find(l => (l.branch_id || l.location_id) === transferData.source_location)?.branch_name || 'Unknown'}
            </div>
          </div>
          <ArrowRight className="w-6 h-6 text-gray-600" />
          <div className="text-center">
            <div className="text-xs text-gray-500 uppercase mb-1">To</div>
            <div className="font-semibold text-gray-900">
              {locations.find(l => (l.branch_id || l.location_id) === transferData.destination_location)?.branch_name || 'Unknown'}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4 mb-6">
          <div>
            <p className="text-sm text-gray-600">Date</p>
            <p className="font-medium">{new Date(transferData.movement_date).toLocaleDateString()}</p>
          </div>
          <div>
            <p className="text-sm text-gray-600">Reason</p>
            <p className="font-medium">{transferData.reason}</p>
          </div>
          <div>
            <p className="text-sm text-gray-600">Total Items</p>
            <p className="font-medium">{transferData.items.length} product(s)</p>
          </div>
        </div>

        {/* Products Table */}
        <div className="border border-gray-200 rounded-lg overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Product</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Batch</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Available</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Transfer Qty</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {transferData.items.map((item) => (
                <tr key={item.id}>
                  <td className="px-4 py-3">
                    <div className="font-medium text-gray-900">{item.product_name}</div>
                    <div className="text-sm text-gray-500">{item.product_code}</div>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <div className="font-medium">{item.batch_number}</div>
                    {item.expiry_date && (
                      <div className="text-xs text-gray-500">Exp: {new Date(item.expiry_date).toLocaleDateString()}</div>
                    )}
                  </td>
                  <td className="px-4 py-3 text-center">{item.quantity_available}</td>
                  <td className="px-4 py-3 text-center">
                    <span className="font-semibold text-gray-900">{item.transfer_quantity}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Notes */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <NotesSection
          value={transferData.notes}
          onChange={(value) => setTransferData(prev => ({ ...prev, notes: value }))}
          placeholder="Add any notes about this transfer..."
          label="Transfer Notes"
          rows={3}
        />
      </div>
    </div>
  );

  return (
    <GlobalDocumentFlow
      documentType="stock-transfer"
      currentStep={currentStep}
      onStepChange={setCurrentStep}
      createContent={createContent}
      reviewContent={reviewContent}
      canProceedToReview={() => canReviewStockTransfer(transferData)}
      onSave={committedRef ? undefined : handlePrepare}
      isSaving={isPreparing || isCommitting}
      saveLabel={committedRef ? 'Transfer Posted' : 'Post Transfer'}
      onClose={onClose}
    />
  );
};

export default StockTransfer;
