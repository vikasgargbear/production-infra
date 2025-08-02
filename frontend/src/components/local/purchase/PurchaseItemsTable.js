import React, { useState, useRef } from 'react';
import { Plus, X, Package, Calendar, Search, Trash2 } from 'lucide-react';
import { usePurchase } from '../../../contexts/PurchaseContext';
import { PURCHASE_CONFIG, calculateDefaultExpiryDate } from '../../../config/purchase.config';
import { ProductCreationModal, MonthYearPicker, PurchaseProductSearch } from '../../global';
import { validateItem } from '../../../utils/purchaseValidation';

const PurchaseItemsTable = () => {
  console.log('PurchaseItemsTable rendered - Fixed HSN, Cost, Product Name - v5');
  const { 
    purchase = { items: [] }, 
    addItem, 
    updateItem, 
    removeItem,
    setError,
    clearError,
    errors = {},
    calculateTotals 
  } = usePurchase();
  
  const [showProductModal, setShowProductModal] = useState(false);
  const searchInputRef = useRef(null);

  const handleAddProduct = (productWithBatch) => {
    console.log('Adding product to purchase:', productWithBatch);
    
    // Check if this is from batch selection (has selectedBatch) or direct add
    const product = productWithBatch.selectedBatch ? productWithBatch : productWithBatch;
    const batch = productWithBatch.selectedBatch || {};
    
    // Create item with all product details
    const itemData = {
      product_id: product.product_id || product.id,
      product_name: product.product_name || product.name || '',
      hsn_code: product.hsn_code || product.hsn || '',
      pack_size: product.pack_size || '1x10',
      mrp: parseFloat(batch.mrp || product.mrp || 0).toFixed(2),
      tax_percent: product.gst_percent || product.tax_rate || PURCHASE_CONFIG.DEFAULTS.TAX_RATE,
      purchase_price: parseFloat(batch.ptr || product.cost_price || product.ptr || (product.mrp || 0) * 0.7).toFixed(2),
      expiry_date: batch.expiry_date || calculateDefaultExpiryDate(),
      quantity: productWithBatch.quantity || 1,
      free_quantity: 0,
      batch_number: batch.batch_number || '',
      discount_percent: 0
    };
    
    // Add item with all data
    addItem(itemData);
    
    // Calculate totals after adding item
    if (calculateTotals) {
      setTimeout(() => calculateTotals(), 100);
    }
    
    // Clear the input field directly
    if (searchInputRef.current && searchInputRef.current.focus) {
      searchInputRef.current.focus();
    }
    
    // Focus batch field after adding product if no batch was selected
    if (!batch.batch_number) {
      setTimeout(() => {
        const lastItem = purchase.items[purchase.items.length - 1];
        if (lastItem) {
          const batchInput = document.querySelector(`#batch-${lastItem.id}`);
          if (batchInput) batchInput.focus();
        }
      }, 200);
    }
  };
  
  const handleItemFieldChange = (itemId, field, value) => {
    updateItem(itemId, field, value);
    
    // Validate item field
    const item = purchase.items && purchase.items.find(i => i.id === itemId);
    if (item) {
      const updatedItem = { ...item, [field]: value };
      const validationResult = validateItem(updatedItem);
      
      if (validationResult.isValid || !validationResult.errors[field]) {
        clearError(`items.${itemId}.${field}`);
      } else {
        setError(`items.${itemId}.${field}`, validationResult.getFieldError(field));
      }
    }
    
    // Recalculate totals if relevant fields change
    if (['quantity', 'purchase_price', 'discount_percent', 'tax_percent'].includes(field)) {
      if (calculateTotals) {
        setTimeout(() => calculateTotals(), 100);
      }
    }
  };
  
  
  const calculateItemAmount = (item) => {
    const quantity = parseFloat(item.quantity) || 0;
    const rate = parseFloat(item.purchase_price) || 0;
    const discountPercent = parseFloat(item.discount_percent) || 0;
    const subtotal = quantity * rate;
    const discountAmount = (subtotal * discountPercent) / 100;
    const taxableAmount = subtotal - discountAmount;
    const taxAmount = (taxableAmount * (parseFloat(item.tax_percent) || 0)) / 100;
    return taxableAmount + taxAmount;
  };
  
  const formatCurrency = (amount) => {
    return `₹${(amount || 0).toFixed(2)}`;
  };
  
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-6 mb-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900">Purchase Items</h3>
      </div>
      
      {/* Product Search Section - Custom for Purchase Entry (NO BATCH SELECTION) */}
      <div className="mb-4 bg-gray-50 rounded-lg p-4">
        <h4 className="text-sm font-medium text-gray-700 mb-3 flex items-center">
          <Search className="w-4 h-4 mr-2" />
          Add Products to Purchase
        </h4>
        
        <PurchaseProductSearch
          ref={searchInputRef}
          onAddItem={handleAddProduct}
          onCreateProduct={() => setShowProductModal(true)}
          requireBatch={false}
          placeholder="Search products by name, code, or HSN..."
        />
        
        <p className="text-xs text-gray-500 mt-2">
          Search and select products, then choose batch details for purchase entry
        </p>
      </div>
      
      {!purchase.items || purchase.items.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 rounded-lg">
          <Package className="w-12 h-12 text-gray-400 mx-auto mb-3" />
          <p className="text-gray-600">No items added yet</p>
          <p className="text-sm text-gray-500 mt-2">Search for products above to add them to this purchase</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full table-fixed">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="w-10 px-2 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">#</th>
                <th className="w-48 px-2 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Product</th>
                <th className="w-16 px-2 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">HSN</th>
                <th className="w-20 px-2 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Pack</th>
                <th className="w-32 px-2 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Batch</th>
                <th className="w-32 px-2 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Expiry</th>
                <th className="w-16 px-2 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Qty</th>
                <th className="w-16 px-2 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Free</th>
                <th className="w-24 px-2 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">MRP</th>
                <th className="w-24 px-2 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Cost</th>
                <th className="w-16 px-2 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Disc%</th>
                <th className="w-20 px-2 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">GST%</th>
                <th className="w-24 px-2 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Amount</th>
                <th className="w-10 px-2 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider"></th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {purchase.items && purchase.items.map((item, index) => (
                <tr key={item.id} className="hover:bg-gray-50">
                  {/* Serial Number */}
                  <td className="px-2 py-2 text-sm text-gray-900">
                    {index + 1}
                  </td>
                  
                  {/* Product */}
                  <td className="px-2 py-2 min-w-[200px]">
                    <div className="text-sm font-medium text-gray-900" title={item.product_name}>
                      {item.product_name || 'Select a product'}
                    </div>
                  </td>
                  
                  {/* HSN Code */}
                  <td className="px-2 py-2">
                    <div className="text-sm text-gray-700">
                      {item.hsn_code || '-'}
                    </div>
                  </td>
                  
                  {/* Pack Size */}
                  <td className="px-2 py-2">
                    <input
                      type="text"
                      value={item.pack_size || ''}
                      onChange={(e) => handleItemFieldChange(item.id, 'pack_size', e.target.value)}
                      className="w-20 px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500"
                      placeholder="1x10"
                    />
                  </td>
                  
                  {/* Batch */}
                  <td className="px-2 py-2">
                    <input
                      id={`batch-${item.id}`}
                      type="text"
                      value={item.batch_number || ''}
                      onChange={(e) => handleItemFieldChange(item.id, 'batch_number', e.target.value)}
                      className="w-32 px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500"
                      placeholder="Batch"
                    />
                  </td>
                  
                  {/* Expiry */}
                  <td className="px-2 py-2">
                    <MonthYearPicker
                      value={item.expiry_date ? item.expiry_date.substring(0, 7) : ''}
                      onChange={(date) => handleItemFieldChange(item.id, 'expiry_date', date ? `${date}-01` : '')}
                      placeholder="MM/YYYY"
                      className="w-full"
                      minDate={new Date()}
                    />
                  </td>
                  
                  {/* Quantity */}
                  <td className="px-2 py-2">
                    <input
                      type="number"
                      value={item.quantity}
                      onChange={(e) => handleItemFieldChange(item.id, 'quantity', parseInt(e.target.value) || 0)}
                      className={`w-16 text-center px-2 py-1.5 text-sm border rounded focus:ring-1 focus:ring-blue-500 ${
                        errors[`items.${item.id}.quantity`] ? 'border-red-300' : 'border-gray-300'
                      }`}
                      min="1"
                    />
                  </td>
                  
                  {/* Free Quantity */}
                  <td className="px-2 py-2">
                    <input
                      type="number"
                      value={item.free_quantity || 0}
                      onChange={(e) => handleItemFieldChange(item.id, 'free_quantity', parseInt(e.target.value) || 0)}
                      className="w-16 text-center px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500"
                      min="0"
                    />
                  </td>
                  
                  {/* MRP */}
                  <td className="px-2 py-2">
                    <input
                      type="number"
                      value={item.mrp || ''}
                      onChange={(e) => handleItemFieldChange(item.id, 'mrp', parseFloat(e.target.value) || 0)}
                      className={`w-full text-right px-2 py-1.5 text-sm border rounded focus:ring-1 focus:ring-blue-500 ${
                        errors[`items.${item.id}.mrp`] ? 'border-red-300' : 'border-gray-300'
                      }`}
                      min="0.01"
                      step="0.01"
                    />
                  </td>
                  
                  {/* Cost */}
                  <td className="px-2 py-2">
                    <input
                      type="number"
                      value={item.purchase_price || ''}
                      onChange={(e) => handleItemFieldChange(item.id, 'purchase_price', parseFloat(e.target.value) || 0)}
                      className={`w-full text-right px-2 py-1.5 text-sm border rounded focus:ring-1 focus:ring-blue-500 ${
                        errors[`items.${item.id}.purchase_price`] ? 'border-red-300' : 'border-gray-300'
                      }`}
                      min="0.01"
                      step="0.01"
                    />
                  </td>
                  
                  {/* Discount % */}
                  <td className="px-2 py-2">
                    <input
                      type="number"
                      value={item.discount_percent || 0}
                      onChange={(e) => handleItemFieldChange(item.id, 'discount_percent', parseFloat(e.target.value) || 0)}
                      className="w-16 text-center px-2 py-1.5 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500"
                      min="0"
                      max="100"
                      step="0.1"
                    />
                  </td>
                  
                  {/* GST % */}
                  <td className="px-2 py-2">
                    <select
                      value={item.tax_percent || PURCHASE_CONFIG.DEFAULTS.TAX_RATE}
                      onChange={(e) => handleItemFieldChange(item.id, 'tax_percent', parseFloat(e.target.value))}
                      className="w-full text-center px-1 py-1.5 text-sm border border-gray-300 rounded focus:ring-1 focus:ring-blue-500"
                    >
                      {(PURCHASE_CONFIG.GST_RATES || []).map(rate => (
                        <option key={rate.value} value={rate.value}>{rate.label}</option>
                      ))}
                    </select>
                  </td>
                  
                  {/* Amount */}
                  <td className="px-2 py-2 text-right">
                    <span className="text-sm font-medium text-gray-900">
                      {formatCurrency(calculateItemAmount(item))}
                    </span>
                  </td>
                  
                  {/* Actions */}
                  <td className="px-2 py-2 text-center">
                    <button
                      onClick={() => removeItem(item.id)}
                      className="text-red-600 hover:text-red-900 hover:bg-red-50 p-1 rounded transition-colors"
                      title="Remove item"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      
      {/* Totals Section */}
      {purchase.items && purchase.items.length > 0 && (
        <div className="px-4 py-3 bg-gray-50 border-t border-gray-200">
          <div className="flex items-center justify-end gap-8">
            <span className="text-sm text-gray-600">
              Items: {purchase.items.length}
            </span>
            <span className="text-sm text-gray-600">
              Qty: {purchase.items.reduce((sum, item) => sum + (parseInt(item.quantity) || 0) + (parseInt(item.free_quantity) || 0), 0)}
            </span>
            <span className="text-sm font-medium text-gray-900">
              Total: {formatCurrency(purchase.items.reduce((sum, item) => sum + calculateItemAmount(item), 0))}
            </span>
          </div>
        </div>
      )}
      
      {/* Validation Errors */}
      {errors && Object.keys(errors).some(key => key.startsWith('items.')) && (
        <div className="mt-4 p-3 bg-red-50 rounded-lg">
          <p className="text-sm text-red-600 font-medium">Please fix the highlighted errors in items</p>
        </div>
      )}
      
      {/* Product Creation Modal */}
      <ProductCreationModal
        show={showProductModal}
        onClose={() => setShowProductModal(false)}
        onProductCreated={(product) => {
          console.log('Product created:', product);
          handleAddProduct(product);
          setShowProductModal(false);
        }}
      />
    </div>
  );
};

export default PurchaseItemsTable;