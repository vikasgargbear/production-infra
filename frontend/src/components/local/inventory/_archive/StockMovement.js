import React, { useState, useEffect, useRef } from 'react';
import { 
  X, Package, ArrowDownToLine, ArrowUpFromLine, 
  Calendar, Search, Save, AlertCircle, CheckCircle,
  Building2, Truck, FileText, Hash
} from 'lucide-react';
import { productsApi, batchesApi } from '../../services/api';
import { searchCache, smartSearch } from '../../utils/searchCache';
import ProductSearchInput from '../common/ProductSearchInput';

const StockMovement = ({ open = true, onClose }) => {
  const [movement, setMovement] = useState({
    type: 'receive', // 'receive' or 'issue'
    date: new Date().toISOString().split('T')[0],
    reference_no: '',
    reason: '',
    source_destination: '',
    items: [],
    total_quantity: 0,
    notes: ''
  });

  const [selectedProduct, setSelectedProduct] = useState(null);
  const [selectedBatch, setSelectedBatch] = useState(null);
  const [quantity, setQuantity] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [batches, setBatches] = useState([]);
  const [loadingBatches, setLoadingBatches] = useState(false);

  // Reasons for stock movement
  const receiveReasons = [
    { value: 'gift', label: 'Gift/Free Sample' },
    { value: 'transfer_in', label: 'Transfer from Branch' },
    { value: 'return_customer', label: 'Customer Return' },
    { value: 'found', label: 'Stock Found' },
    { value: 'adjustment', label: 'Stock Adjustment' },
    { value: 'other', label: 'Other' }
  ];

  const issueReasons = [
    { value: 'damaged', label: 'Damaged Goods' },
    { value: 'expired', label: 'Expired Products' },
    { value: 'sample', label: 'Free Sample/Testing' },
    { value: 'transfer_out', label: 'Transfer to Branch' },
    { value: 'loss', label: 'Stock Loss/Theft' },
    { value: 'adjustment', label: 'Stock Adjustment' },
    { value: 'other', label: 'Other' }
  ];

  // Generate reference number
  useEffect(() => {
    const prefix = movement.type === 'receive' ? 'SR' : 'SI';
    setMovement(prev => ({
      ...prev,
      reference_no: `${prefix}-${Date.now().toString().slice(-6)}`
    }));
  }, [movement.type]);

  // Load batches when product is selected
  const loadBatches = async (product) => {
    if (!product) return;
    
    setLoadingBatches(true);
    try {
      // Mock batch data - replace with actual API call
      const mockBatches = [
        {
          batch_id: 'b1',
          batch_no: 'B001',
          product_id: product.product_id,
          expiry_date: '2025-12-31',
          quantity_available: movement.type === 'issue' ? 50 : 999,
          mrp: 100
        },
        {
          batch_id: 'b2',
          batch_no: 'B002',
          product_id: product.product_id,
          expiry_date: '2025-10-31',
          quantity_available: movement.type === 'issue' ? 30 : 999,
          mrp: 100
        }
      ];
      
      // Filter and sort batches
      const filteredBatches = mockBatches
        .filter(batch => movement.type === 'receive' || batch.quantity_available > 0)
        .sort((a, b) => {
          // For issue, show near-expiry first
          if (movement.type === 'issue') {
            return new Date(a.expiry_date) - new Date(b.expiry_date);
          }
          // For receive, show latest expiry first
          return new Date(b.expiry_date) - new Date(a.expiry_date);
        });
      
      setBatches(filteredBatches);
    } catch (error) {
      console.error('Error loading batches:', error);
      setMessage('❌ Error loading batches');
    } finally {
      setLoadingBatches(false);
    }
  };

  // Handle product selection
  const handleProductSelect = (product) => {
    setSelectedProduct(product);
    setSelectedBatch(null);
    setQuantity('');
    loadBatches(product);
  };

  // Handle batch selection
  const handleBatchSelect = (batch) => {
    setSelectedBatch(batch);
    
    // Check near expiry warning
    const expiryDate = new Date(batch.expiry_date);
    const daysToExpiry = Math.floor((expiryDate - new Date()) / (1000 * 60 * 60 * 24));
    
    if (daysToExpiry <= 90) {
      setMessage(`⚠️ Warning: This batch expires in ${daysToExpiry} days`);
    }
  };

  // Add item to movement
  const addItem = () => {
    if (!selectedProduct || !selectedBatch || !quantity) {
      setMessage('⚠️ Please select product, batch and enter quantity');
      return;
    }

    const qty = parseInt(quantity);
    
    // Validate quantity for issue
    if (movement.type === 'issue' && qty > selectedBatch.quantity_available) {
      setMessage(`⚠️ Cannot issue more than available quantity (${selectedBatch.quantity_available})`);
      return;
    }

    const newItem = {
      id: Date.now(),
      product_id: selectedProduct.product_id,
      product_name: selectedProduct.product_name,
      batch_id: selectedBatch.batch_id,
      batch_no: selectedBatch.batch_no,
      expiry_date: selectedBatch.expiry_date,
      quantity: qty,
      current_stock: selectedBatch.quantity_available
    };

    setMovement(prev => ({
      ...prev,
      items: [...prev.items, newItem],
      total_quantity: prev.total_quantity + qty
    }));

    // Reset selection
    setSelectedProduct(null);
    setSelectedBatch(null);
    setQuantity('');
    setBatches([]);
    setMessage('');
  };

  // Remove item
  const removeItem = (itemId) => {
    setMovement(prev => {
      const item = prev.items.find(i => i.id === itemId);
      const newItems = prev.items.filter(i => i.id !== itemId);
      return {
        ...prev,
        items: newItems,
        total_quantity: prev.total_quantity - (item?.quantity || 0)
      };
    });
  };

  // Process stock movement
  const processMovement = async () => {
    // Validate
    if (movement.items.length === 0) {
      setMessage('⚠️ Please add at least one item');
      return;
    }

    if (!movement.reason) {
      setMessage('⚠️ Please select a reason');
      return;
    }

    setSaving(true);
    try {
      const movementData = {
        type: movement.type,
        date: movement.date,
        reference_no: movement.reference_no,
        reason: movement.reason,
        source_destination: movement.source_destination,
        items: movement.items.map(item => ({
          product_id: item.product_id,
          batch_id: item.batch_id,
          quantity: item.quantity
        })),
        total_quantity: movement.total_quantity,
        notes: movement.notes
      };

      console.log('Processing stock movement:', movementData);
      
      // Mock success - replace with actual API call
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      setMessage(`✅ Stock ${movement.type} processed successfully!`);
      
      // Reset form after success
      setTimeout(() => {
        resetForm();
      }, 2000);
      
    } catch (error) {
      console.error('Error processing movement:', error);
      setMessage('❌ Failed to process stock movement. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const resetForm = () => {
    setMovement({
      type: movement.type,
      date: new Date().toISOString().split('T')[0],
      reference_no: movement.type === 'receive' ? 'SR-' + Date.now().toString().slice(-6) : 'SI-' + Date.now().toString().slice(-6),
      reason: '',
      source_destination: '',
      items: [],
      total_quantity: 0,
      notes: ''
    });
    setSelectedProduct(null);
    setSelectedBatch(null);
    setQuantity('');
    setBatches([]);
    setMessage('');
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg w-full max-w-5xl h-[90vh] flex flex-col">
        
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
              movement.type === 'receive' ? 'bg-green-100' : 'bg-red-100'
            }`}>
              {movement.type === 'receive' ? (
                <ArrowDownToLine className="w-6 h-6 text-green-600" />
              ) : (
                <ArrowUpFromLine className="w-6 h-6 text-red-600" />
              )}
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">
                Stock {movement.type === 'receive' ? 'Receive' : 'Issue'}
              </h1>
              <p className="text-sm text-gray-500">Ref: {movement.reference_no}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setMovement({ ...movement, type: movement.type === 'receive' ? 'issue' : 'receive' })}
              className={`px-4 py-2 rounded-lg transition-colors flex items-center gap-2 ${
                movement.type === 'receive' 
                  ? 'bg-red-100 text-red-700 hover:bg-red-200' 
                  : 'bg-green-100 text-green-700 hover:bg-green-200'
              }`}
            >
              {movement.type === 'receive' ? (
                <>
                  <ArrowUpFromLine className="w-4 h-4" />
                  Switch to Issue
                </>
              ) : (
                <>
                  <ArrowDownToLine className="w-4 h-4" />
                  Switch to Receive
                </>
              )}
            </button>
            <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg">
              <X className="w-5 h-5 text-gray-500" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          
          {message && (
            <div className={`p-4 rounded-lg mb-6 ${
              message.includes('✅') ? 'bg-green-50 text-green-800 border border-green-200' : 
              message.includes('⚠️') ? 'bg-yellow-50 text-yellow-800 border border-yellow-200' : 
              'bg-red-50 text-red-800 border border-red-200'
            }`}>
              {message}
            </div>
          )}

          {/* Movement Details */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Movement Date
              </label>
              <div className="relative">
                <Calendar className="absolute left-3 top-3 w-5 h-5 text-gray-400" />
                <input
                  type="date"
                  value={movement.date}
                  onChange={(e) => setMovement({ ...movement, date: e.target.value })}
                  className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Reason *
              </label>
              <select
                value={movement.reason}
                onChange={(e) => setMovement({ ...movement, reason: e.target.value })}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Select reason...</option>
                {(movement.type === 'receive' ? receiveReasons : issueReasons).map(reason => (
                  <option key={reason.value} value={reason.value}>
                    {reason.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {movement.type === 'receive' ? 'Source' : 'Destination'} (Optional)
              </label>
              <div className="relative">
                <Building2 className="absolute left-3 top-3 w-5 h-5 text-gray-400" />
                <input
                  type="text"
                  value={movement.source_destination}
                  onChange={(e) => setMovement({ ...movement, source_destination: e.target.value })}
                  placeholder={movement.type === 'receive' ? 'e.g., Main Warehouse' : 'e.g., Branch Store'}
                  className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
          </div>

          {/* Add Items Section */}
          <div className="bg-gray-50 rounded-lg p-6 mb-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Add Items</h3>
            
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Product
                </label>
                <ProductSearchInput
                  value={selectedProduct}
                  onChange={handleProductSelect}
                  placeholder="Search products..."
                  showQuantity={movement.type === 'issue'}
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Batch
                </label>
                <select
                  value={selectedBatch?.batch_id || ''}
                  onChange={(e) => {
                    const batch = batches.find(b => b.batch_id === e.target.value);
                    handleBatchSelect(batch);
                  }}
                  disabled={!selectedProduct || loadingBatches}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
                >
                  <option value="">Select batch...</option>
                  {batches.map(batch => (
                    <option key={batch.batch_id} value={batch.batch_id}>
                      {batch.batch_no} 
                      {movement.type === 'issue' && ` (${batch.quantity_available} available)`}
                      {` - Exp: ${new Date(batch.expiry_date).toLocaleDateString()}`}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Quantity
                </label>
                <input
                  type="number"
                  min="1"
                  max={movement.type === 'issue' && selectedBatch ? selectedBatch.quantity_available : undefined}
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  placeholder="0"
                  disabled={!selectedBatch}
                  className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
                />
              </div>
            </div>

            <button
              onClick={addItem}
              disabled={!selectedProduct || !selectedBatch || !quantity}
              className="mt-4 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
            >
              Add Item
            </button>
          </div>

          {/* Items List */}
          {movement.items.length > 0 && (
            <div className="mb-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">
                Items ({movement.items.length})
              </h3>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Product</th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Batch</th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Expiry</th>
                      {movement.type === 'issue' && (
                        <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Current Stock</th>
                      )}
                      <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Quantity</th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {movement.items.map(item => {
                      const expiryDate = new Date(item.expiry_date);
                      const daysToExpiry = Math.floor((expiryDate - new Date()) / (1000 * 60 * 60 * 24));
                      const isNearExpiry = daysToExpiry <= 90;
                      
                      return (
                        <tr key={item.id} className={isNearExpiry ? 'bg-yellow-50' : ''}>
                          <td className="px-4 py-3">
                            <p className="font-medium text-gray-900">{item.product_name}</p>
                          </td>
                          <td className="px-4 py-3 text-center">
                            {item.batch_no}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span className={`text-sm ${isNearExpiry ? 'text-red-600 font-medium' : 'text-gray-600'}`}>
                              {expiryDate.toLocaleDateString()}
                            </span>
                          </td>
                          {movement.type === 'issue' && (
                            <td className="px-4 py-3 text-center">
                              {item.current_stock}
                            </td>
                          )}
                          <td className="px-4 py-3 text-center font-medium">
                            {item.quantity}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <button
                              onClick={() => removeItem(item.id)}
                              className="text-red-600 hover:text-red-800"
                            >
                              Remove
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot className="bg-gray-50">
                    <tr>
                      <td colSpan={movement.type === 'issue' ? 4 : 3} className="px-4 py-3 text-right font-semibold">
                        Total Quantity:
                      </td>
                      <td className="px-4 py-3 text-center font-bold text-lg">
                        {movement.total_quantity}
                      </td>
                      <td></td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          )}

          {/* Notes */}
          <div className="mb-6">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Additional Notes
            </label>
            <textarea
              value={movement.notes}
              onChange={(e) => setMovement({ ...movement, notes: e.target.value })}
              placeholder="Enter any additional notes..."
              rows={3}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 resize-none"
            />
          </div>

          {/* Actions */}
          <div className="flex gap-4">
            <button
              onClick={processMovement}
              disabled={saving || movement.items.length === 0 || !movement.reason}
              className={`flex-1 px-6 py-3 text-white rounded-lg transition-colors flex items-center justify-center gap-2 ${
                movement.type === 'receive'
                  ? 'bg-green-600 hover:bg-green-700'
                  : 'bg-red-600 hover:bg-red-700'
              } disabled:bg-gray-400 disabled:cursor-not-allowed`}
            >
              {saving ? (
                <>
                  <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white"></div>
                  Processing...
                </>
              ) : (
                <>
                  <CheckCircle className="w-5 h-5" />
                  Process Stock {movement.type === 'receive' ? 'Receive' : 'Issue'}
                </>
              )}
            </button>
            <button
              onClick={resetForm}
              className="px-6 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
            >
              Clear
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default StockMovement;