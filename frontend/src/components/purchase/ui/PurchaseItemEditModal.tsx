import React, { useState, useEffect } from 'react';
import { X, Save, Package, Calendar, DollarSign, Percent, Hash, Gift } from 'lucide-react';
import { MonthYearPicker } from '../../global';
import { toast } from 'react-toastify';
import { getPurchaseItemErrors } from './purchaseItemValidation';

// ==================== TYPE DEFINITIONS ====================

interface EditedItem {
  product_name?: string;
  hsn_code?: string;
  batch_number?: string;
  manufacturing_date?: string;
  expiry_date?: string;
  mrp?: number | string;
  unit_price?: number | string;
  selling_price?: number | string;
  sale_price?: number | string;
  quantity?: number | string;
  free_quantity?: number | string;
  pack_size?: number | string;
  units_per_pack?: number | string;
  pack_type?: string;
  tax_percent?: number | string;
  discount_percent?: number | string;
  scheme_discount?: number | string;
  [key: string]: unknown;
}

interface PurchaseItemEditModalProps {
  isOpen: boolean;
  onClose: () => void;
  item: EditedItem | null;
  onSave: (item: EditedItem) => void;
  title?: string;
  isNewItem?: boolean;
}

/**
 * Modal for editing purchase item details - especially batch-specific information
 * Since each batch can have different pricing, expiry, etc.
 */
const PurchaseItemEditModal: React.FC<PurchaseItemEditModalProps> = ({
  isOpen,
  onClose,
  item,
  onSave,
  title = "Add Purchase Item",
  isNewItem = false
}) => {
  const [editedItem, setEditedItem] = useState<EditedItem>({});

  useEffect(() => {
    if (item) {
      setEditedItem({
        ...item,
        // Batch-specific fields
        batch_number: item.batch_number ?? '',
        manufacturing_date: item.manufacturing_date ?? '',
        expiry_date: item.expiry_date ?? '',

        // Pricing (batch-specific)
        mrp: item.mrp ?? '',
        unit_price: item.unit_price ?? '',
        selling_price: item.selling_price ?? item.sale_price ?? '',

        // Quantities
        quantity: item.quantity ?? '',
        free_quantity: item.free_quantity ?? '',

        // Pack configuration (batch-specific)
        pack_size: item.pack_size ?? '',
        units_per_pack: item.units_per_pack ?? '',
        pack_type: item.pack_type ?? '',

        // Tax & Discounts
        tax_percent: item.tax_percent ?? '',
        discount_percent: item.discount_percent ?? '',
        scheme_discount: item.scheme_discount ?? ''
      });
    } else {
      setEditedItem({});
    }
  }, [item]);

  if (!isOpen) return null;

  const handleFieldChange = (field, value) => {
    setEditedItem(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const validationErrors = getPurchaseItemErrors(editedItem);

  const handleSave = () => {
    // Validate required fields
    if (validationErrors.length > 0) {
      toast.error(`Required fields missing: ${validationErrors.join(', ')}`);
      return;
    }

    onSave(editedItem);
    onClose();
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
              {/* Batch Number */}
              <div>
                <label className="flex items-center gap-1 text-sm font-medium text-gray-700 mb-2">
                  <Hash className="w-4 h-4" />
                  Batch Number <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={editedItem.batch_number ?? ''}
                  onChange={(e) => handleFieldChange('batch_number', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  placeholder="Enter authoritative batch number"
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
                  className="w-full"
                  placeholder="MM/YYYY"
                />
              </div>

              {/* Expiry Date - REQUIRED */}
              <div>
                <label className="flex items-center gap-1 text-sm font-medium text-gray-700 mb-2">
                  <Calendar className="w-4 h-4" />
                  Expiry Date <span className="text-red-500">*</span>
                </label>
                <MonthYearPicker
                  value={editedItem.expiry_date}
                  onChange={(date) => handleFieldChange('expiry_date', date)}
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
                  value={editedItem.pack_type ?? ''}
                  onChange={(e) => handleFieldChange('pack_type', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">Select pack type</option>
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
                  value={editedItem.pack_size ?? ''}
                  onChange={(e) => handleFieldChange('pack_size', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="Enter pack size"
                />
              </div>

              <div>
                <label className="text-sm font-medium text-gray-700 mb-2 block">
                  Units/Pack
                </label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={editedItem.units_per_pack ?? ''}
                  onChange={(e) => handleFieldChange('units_per_pack', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="Enter units per pack"
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
                  Purchase Quantity <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={editedItem.quantity ?? ''}
                  onChange={(e) => handleFieldChange('quantity', e.target.value)}
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
                  value={editedItem.free_quantity ?? ''}
                  onChange={(e) => handleFieldChange('free_quantity', e.target.value)}
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
                  MRP <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500">₹</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={editedItem.mrp ?? ''}
                    onChange={(e) => handleFieldChange('mrp', e.target.value)}
                    className="w-full pl-8 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    placeholder="0.00"
                  />
                </div>
              </div>

              {/* Purchase Price */}
              <div>
                <label className="text-sm font-medium text-gray-700 mb-2 block">
                  Purchase Price <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500">₹</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={editedItem.unit_price ?? ''}
                    onChange={(e) => handleFieldChange('unit_price', e.target.value)}
                    className="w-full pl-8 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    placeholder="0.00"
                  />
                </div>
              </div>

              {/* Selling Price */}
              <div>
                <label className="text-sm font-medium text-gray-700 mb-2 block">
                  Selling Price <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-500">₹</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={editedItem.selling_price ?? ''}
                    onChange={(e) => handleFieldChange('selling_price', e.target.value)}
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
                  GST % <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={editedItem.tax_percent ?? ''}
                  readOnly
                  placeholder="Unavailable"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-gray-100 text-gray-800"
                />
              </div>

              <div>
                <label className="text-sm font-medium text-gray-700 mb-2 block">
                  Discount %
                </label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={editedItem.discount_percent ?? ''}
                  onChange={(e) => handleFieldChange('discount_percent', e.target.value)}
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
                  value={editedItem.scheme_discount ?? ''}
                  onChange={(e) => handleFieldChange('scheme_discount', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="0.00"
                />
              </div>
            </div>
          </div>

          {/* Authoritative calculation boundary */}
          <div className="p-4 bg-gray-50 rounded-lg">
            <p className="text-sm text-gray-700">Line taxable value, GST and total are calculated by the live purchase calculation API after every required fact is explicit.</p>
            {editedItem.free_quantity !== ''
              && editedItem.free_quantity !== null
              && editedItem.free_quantity !== undefined
              && Number(editedItem.free_quantity) > 0 && (
              <div className="mt-2 text-sm text-green-600 flex items-center gap-1">
                <Gift className="w-4 h-4" />
                +{editedItem.free_quantity} free units included
              </div>
            )}
          </div>

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
              disabled={validationErrors.length > 0}
              aria-describedby={validationErrors.length > 0 ? 'purchase-item-validation' : undefined}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors flex items-center gap-2 disabled:bg-gray-300 disabled:text-gray-600 disabled:cursor-not-allowed"
            >
              <Save className="w-4 h-4" />
              {isNewItem ? 'Add Item' : 'Save Changes'}
            </button>
          </div>
          {validationErrors.length > 0 && (
            <span id="purchase-item-validation" className="sr-only">
              Complete required fields: {validationErrors.join(', ')}
            </span>
          )}
        </div>
      </div>
    </div>
  );
};

export default PurchaseItemEditModal;
