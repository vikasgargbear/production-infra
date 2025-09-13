import React, { useState, useEffect } from 'react';
import { X, Save, Package, Calendar, DollarSign, Percent, Hash, Gift, AlertCircle } from 'lucide-react';
import { MonthYearPicker } from '../../global';

/**
 * Modal for editing purchase item details - especially batch-specific information
 * Since each batch can have different pricing, expiry, etc.
 */
const PurchaseItemEditModal = ({ 
  isOpen, 
  onClose, 
  item, 
  onSave,
  title = "Add Purchase Item",
  isNewItem = false
}) => {
  const [editedItem, setEditedItem] = useState({});

  useEffect(() => {
    if (item) {
      setEditedItem({
        ...item,
        // Batch-specific fields
        batch_number: item.batch_number || item.batch_no || '',
        manufacturing_date: item.manufacturing_date || item.mfg_date || '',
        expiry_date: item.expiry_date || '',
        
        // Pricing (batch-specific)
        mrp: item.mrp || 0,
        purchase_price: item.purchase_price || item.cost_price || item.rate || 0,
        selling_price: item.selling_price || item.sale_price || item.mrp || 0,
        
        // Quantities
        quantity: item.quantity || '',
        free_quantity: item.free_quantity || '',
        
        // Pack configuration (batch-specific)
        pack_size: item.pack_size || '',
        units_per_pack: item.units_per_pack || '',
        pack_type: item.pack_type || 'STRIP',
        
        // Tax & Discounts
        tax_percent: item.tax_percent || item.gst_percent || 0,
        discount_percent: item.discount_percent || 0,
        scheme_discount: item.scheme_discount || 0
      });
    }
  }, [item]);

  if (!isOpen) return null;

  const handleFieldChange = (field, value) => {
    setEditedItem(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const calculateTotal = () => {
    const qty = parseFloat(editedItem.quantity || 0);
    const cost = parseFloat(editedItem.purchase_price || 0);
    const taxPercent = parseFloat(editedItem.tax_percent || 0);
    const discountPercent = parseFloat(editedItem.discount_percent || 0);
    
    const baseAmount = qty * cost;
    const discountAmount = baseAmount * (discountPercent / 100);
    const discountedAmount = baseAmount - discountAmount;
    const taxAmount = discountedAmount * (taxPercent / 100);
    
    return discountedAmount + taxAmount;
  };

  const generateBatchNumber = () => {
    // Generate batch number format: BATCH-YYYYMM-XXXX
    const date = new Date();
    const year = date.getFullYear();
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
    return `BATCH-${year}${month}-${random}`;
  };

  const handleSave = () => {
    // Remove expiry date requirement - some products don't expire
    // User can still set it if needed
    
    // Set default values for empty fields before saving
    const itemToSave = {
      ...editedItem,
      // Auto-generate batch number if not provided
      batch_number: editedItem.batch_number || generateBatchNumber(),
      quantity: editedItem.quantity || 1,
      free_quantity: editedItem.free_quantity || 0,
      pack_size: editedItem.pack_size || 1,
      units_per_pack: editedItem.units_per_pack || 1,
      mrp: editedItem.mrp || 0,
      purchase_price: editedItem.purchase_price || 0,
      selling_price: editedItem.selling_price || 0,
      discount_percent: editedItem.discount_percent || 0,
      scheme_discount: editedItem.scheme_discount || 0,
      // Explicitly include expiry_date
      expiry_date: editedItem.expiry_date || null,
      tax_percent: editedItem.tax_percent || 0
    };
    
    onSave(itemToSave);
    onClose();
  };

  const formatDate = (date) => {
    if (!date) return '';
    const d = new Date(date);
    return `${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getFullYear()}`;
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-3xl max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 bg-gradient-to-r from-blue-600 to-blue-700 text-white flex justify-between items-center">
          <h2 className="text-xl font-semibold">{title}</h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-white hover:bg-opacity-20 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[calc(90vh-8rem)]">
          {/* Product Info */}
          <div className="mb-6 p-4 bg-blue-50 rounded-lg">
            <h3 className="font-semibold text-lg mb-2">{editedItem.product_name || 'Product'}</h3>
            {editedItem.hsn_code && (
              <p className="text-sm text-gray-600">HSN: {editedItem.hsn_code}</p>
            )}
          </div>

          {/* Batch Information Section */}
          <div className="mb-6">
            <h4 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
              <Package className="w-4 h-4" />
              BATCH INFORMATION
            </h4>
            <div className="grid grid-cols-3 gap-4">
              {/* Batch Number - Optional, Auto-generates */}
              <div>
                <label className="flex items-center gap-1 text-sm font-medium text-gray-700 mb-2">
                  <Hash className="w-4 h-4" />
                  Batch Number
                  <span className="text-xs text-gray-500 ml-1">(auto)</span>
                </label>
                <input
                  type="text"
                  value={editedItem.batch_number || ''}
                  onChange={(e) => handleFieldChange('batch_number', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Auto-generates if empty"
                />
              </div>

              {/* Manufacturing Date */}
              <div>
                <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">
                  <Calendar className="w-4 h-4" />
                  Mfg Date
                </label>
                <MonthYearPicker
                  value={editedItem.manufacturing_date}
                  onChange={(date) => handleFieldChange('manufacturing_date', date)}
                  maxDate={new Date()}
                  className="w-full"
                  placeholder="MM/YYYY"
                />
              </div>

              {/* Expiry Date - Optional */}
              <div>
                <label className="flex items-center gap-1 text-sm font-medium text-gray-700 mb-2">
                  <Calendar className="w-4 h-4" />
                  Expiry Date
                </label>
                <MonthYearPicker
                  value={editedItem.expiry_date}
                  onChange={(date) => handleFieldChange('expiry_date', date)}
                  minDate={new Date()}
                  className="w-full"
                  placeholder="MM/YYYY"
                />
              </div>
            </div>
          </div>

          {/* Pack Configuration */}
          <div className="mb-6">
            <h4 className="text-sm font-semibold text-gray-700 mb-3">PACK CONFIGURATION</h4>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="text-sm font-medium text-gray-700 mb-2 block">
                  Pack Type
                </label>
                <select
                  value={editedItem.pack_type || 'STRIP'}
                  onChange={(e) => handleFieldChange('pack_type', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  <option value="STRIP">STRIP</option>
                  <option value="BOTTLE">BOTTLE</option>
                  <option value="VIAL">VIAL</option>
                  <option value="TUBE">TUBE</option>
                  <option value="SACHET">SACHET</option>
                  <option value="BOX">BOX</option>
                </select>
              </div>

              <div>
                <label className="text-sm font-medium text-gray-700 mb-2 block">
                  Pack Size
                </label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={editedItem.pack_size || ''}
                  onChange={(e) => handleFieldChange('pack_size', e.target.value === '' ? '' : parseFloat(e.target.value) || 0)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="1"
                />
              </div>

              <div>
                <label className="text-sm font-medium text-gray-700 mb-2 block">
                  Units/Pack
                </label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={editedItem.units_per_pack || ''}
                  onChange={(e) => handleFieldChange('units_per_pack', e.target.value === '' ? '' : parseFloat(e.target.value) || 0)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="1"
                />
              </div>
            </div>
          </div>

          {/* Quantities */}
          <div className="mb-6">
            <h4 className="text-sm font-semibold text-gray-700 mb-3">QUANTITIES</h4>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-gray-700 mb-2 block">
                  Purchase Quantity
                </label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={editedItem.quantity || ''}
                  onChange={(e) => handleFieldChange('quantity', e.target.value === '' ? '' : parseFloat(e.target.value) || 0)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="Enter quantity"
                />
              </div>

              <div>
                <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">
                  <Gift className="w-4 h-4" />
                  Free Quantity
                </label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={editedItem.free_quantity || ''}
                  onChange={(e) => handleFieldChange('free_quantity', e.target.value === '' ? '' : parseFloat(e.target.value) || 0)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="0"
                />
              </div>
            </div>
          </div>

          {/* Pricing Section */}
          <div className="mb-6">
            <h4 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
              <DollarSign className="w-4 h-4" />
              PRICING (Batch-Specific)
            </h4>
            <div className="grid grid-cols-3 gap-4">
              {/* MRP */}
              <div>
                <label className="text-sm font-medium text-gray-700 mb-2 block">
                  MRP
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500">₹</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={editedItem.mrp || ''}
                    onChange={(e) => handleFieldChange('mrp', e.target.value === '' ? '' : parseFloat(e.target.value) || 0)}
                    className="w-full pl-8 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    placeholder="0.00"
                  />
                </div>
              </div>

              {/* Purchase Price */}
              <div>
                <label className="text-sm font-medium text-gray-700 mb-2 block">
                  Purchase Price
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500">₹</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={editedItem.purchase_price || ''}
                    onChange={(e) => handleFieldChange('purchase_price', e.target.value === '' ? '' : parseFloat(e.target.value) || 0)}
                    className="w-full pl-8 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    placeholder="0.00"
                  />
                </div>
              </div>

              {/* Selling Price */}
              <div>
                <label className="text-sm font-medium text-gray-700 mb-2 block">
                  Selling Price
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500">₹</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={editedItem.selling_price || ''}
                    onChange={(e) => handleFieldChange('selling_price', e.target.value === '' ? '' : parseFloat(e.target.value) || 0)}
                    className="w-full pl-8 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    placeholder="0.00"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Tax & Discounts */}
          <div className="mb-6">
            <h4 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
              <Percent className="w-4 h-4" />
              TAX & DISCOUNTS
            </h4>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="text-sm font-medium text-gray-700 mb-2 block">
                  GST %
                </label>
                <select
                  value={editedItem.tax_percent || 0}
                  onChange={(e) => handleFieldChange('tax_percent', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  <option value="0">0%</option>
                  <option value="5">5%</option>
                  <option value="12">12%</option>
                  <option value="18">18%</option>
                  <option value="28">28%</option>
                </select>
              </div>

              <div>
                <label className="text-sm font-medium text-gray-700 mb-2 block">
                  Discount %
                </label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={editedItem.discount_percent || ''}
                  onChange={(e) => handleFieldChange('discount_percent', e.target.value === '' ? '' : parseFloat(e.target.value) || 0)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="0"
                />
              </div>

              <div>
                <label className="text-sm font-medium text-gray-700 mb-2 block">
                  Scheme Discount ₹
                </label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={editedItem.scheme_discount || ''}
                  onChange={(e) => handleFieldChange('scheme_discount', e.target.value === '' ? '' : parseFloat(e.target.value) || 0)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="0.00"
                />
              </div>
            </div>
          </div>

          {/* Total Calculation */}
          <div className="p-4 bg-gray-50 rounded-lg">
            <div className="flex justify-between items-center">
              <span className="text-sm font-medium text-gray-700">Total Amount</span>
              <span className="text-2xl font-bold text-blue-600">₹{calculateTotal().toFixed(2)}</span>
            </div>
            {parseFloat(editedItem.free_quantity) > 0 && (
              <div className="mt-2 text-sm text-green-600 flex items-center gap-1">
                <Gift className="w-4 h-4" />
                +{editedItem.free_quantity} free units included
              </div>
            )}
          </div>

          {/* Warning for expiry */}
          {editedItem.expiry_date && new Date(editedItem.expiry_date) < new Date(Date.now() + 90 * 24 * 60 * 60 * 1000) && (
            <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg flex items-start gap-2">
              <AlertCircle className="w-5 h-5 text-yellow-600 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-yellow-800">Short Expiry Warning</p>
                <p className="text-xs text-yellow-700 mt-1">This batch expires in less than 3 months</p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-gray-50 flex justify-end items-center">
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-100 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2"
            >
              <Save className="w-4 h-4" />
              {isNewItem ? 'Add Item' : 'Save Changes'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default PurchaseItemEditModal;