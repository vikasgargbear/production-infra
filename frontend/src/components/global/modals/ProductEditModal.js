import React, { useState, useEffect } from 'react';
import { 
  X, Save, Loader2, Package, Tag, Percent, BarChart3,
  DollarSign, Settings, Factory
} from 'lucide-react';
import { productAPI, productsApi, customerAPI, supplierAPI, batchAPI } from '../../../services/api';

const ProductEditModal = ({ 
  isOpen, 
  onClose, 
  product = null,
  onSave,
  mode = 'edit' // 'edit' | 'create' | 'view'
}) => {
  const [formData, setFormData] = useState({
    product_name: '',
    product_code: '',
    generic_name: '',
    hsn_code: '',
    category: '',
    subcategory: '',
    pack_type: '',
    base_unit: 'TAB',
    mrp: 0,
    purchase_price: 0,
    sale_price: 0,
    gst_percent: 12,
    is_active: true,
    minimum_stock_level: 0,
    maximum_stock_level: 0,
    manufacturer: '',
    barcode: '',
    description: '',
    storage_instructions: ''
  });

  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState(null);

  const categories = [
    'Tablet', 'Syrup', 'Injection', 'Powder', 'Cream', 
    'Ointment', 'Drops', 'Capsule', 'Lotion', 'Gel',
    'Solution', 'Suspension', 'Inhaler', 'Spray'
  ];

  const units = [
    { value: 'TAB', label: 'Tablet' },
    { value: 'BOTTLE', label: 'Bottle' },
    { value: 'STRIP', label: 'Strip' },
    { value: 'VIAL', label: 'Vial' },
    { value: 'TUBE', label: 'Tube' },
    { value: 'SACHET', label: 'Sachet' },
    { value: 'BOX', label: 'Box' },
    { value: 'PACKET', label: 'Packet' },
    { value: 'KG', label: 'Kilogram' },
    { value: 'ML', label: 'Milliliter' },
    { value: 'NOS', label: 'Numbers' }
  ];

  const gstRates = [
    { value: 0, label: '0% (Exempt)' },
    { value: 5, label: '5%' },
    { value: 12, label: '12%' },
    { value: 18, label: '18%' },
    { value: 28, label: '28%' }
  ];

  useEffect(() => {
    if (product) {
      setFormData({
        product_name: product.product_name || '',
        product_code: product.product_code || '',
        generic_name: product.generic_name || '',
        hsn_code: product.hsn_code || '',
        category: product.category || '',
        subcategory: product.subcategory || '',
        pack_type: product.pack_type || '',
        base_unit: product.base_unit || 'TAB',
        mrp: product.mrp || 0,
        purchase_price: product.purchase_price || 0,
        sale_price: product.sale_price || 0,
        gst_percent: product.gst_percent || 12,
        is_active: product.is_active !== false,
        minimum_stock_level: product.minimum_stock_level || 0,
        maximum_stock_level: product.maximum_stock_level || 0,
        manufacturer: product.manufacturer || '',
        barcode: product.barcode || '',
        description: product.description || '',
        storage_instructions: product.storage_instructions || ''
      });
    }
  }, [product]);

  const handleInputChange = (field, value) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const validateForm = () => {
    if (!formData.product_name.trim()) {
      setError('Product name is required');
      return false;
    }
    if (!formData.product_code.trim()) {
      setError('Product code/SKU is required');
      return false;
    }
    if (formData.hsn_code && !/^\d{4,8}$/.test(formData.hsn_code)) {
      setError('HSN code must be 4-8 digits');
      return false;
    }
    if (formData.mrp < 0 || formData.purchase_price < 0 || formData.sale_price < 0) {
      setError('Prices cannot be negative');
      return false;
    }
    if (formData.sale_price > formData.mrp) {
      setError('Sale price cannot exceed MRP');
      return false;
    }
    return true;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (mode === 'view') {
      onClose();
      return;
    }

    if (!validateForm()) return;

    try {
      setIsSaving(true);
      setError(null);
      
      if (product) {
        // Update existing product
        await productsApi.update(product.product_id, formData);
      } else {
        // Create new product
        await productsApi.create(formData);
      }
      
      if (onSave) {
        onSave();
      }
      
      onClose();
    } catch (err) {
      console.error('Error saving product:', err);
      setError(err.response?.data?.message || 'Failed to save product. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl m-4 max-h-[90vh] overflow-y-auto">
        <form onSubmit={handleSubmit}>
          {/* Header */}
          <div className="px-6 py-4 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold text-gray-900">
                {mode === 'create' ? 'Add New Product' : mode === 'view' ? 'View Product' : 'Edit Product'}
              </h2>
              <button
                type="button"
                onClick={onClose}
                className="p-2 hover:bg-gray-100 rounded-lg"
              >
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            {error && (
              <div className="mt-2 text-sm text-red-600 bg-red-50 p-2 rounded">
                {error}
              </div>
            )}
          </div>

          {/* Body */}
          <div className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Basic Details */}
              <div className="md:col-span-2">
                <h3 className="text-lg font-medium text-gray-900 mb-4 flex items-center">
                  <Package className="w-5 h-5 mr-2" />
                  Basic Information
                </h3>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Product Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={formData.product_name}
                  onChange={(e) => handleInputChange('product_name', e.target.value)}
                  disabled={mode === 'view'}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Product Code/SKU <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={formData.product_code}
                  onChange={(e) => handleInputChange('product_code', e.target.value)}
                  disabled={mode === 'view'}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Generic Name</label>
                <input
                  type="text"
                  value={formData.generic_name}
                  onChange={(e) => handleInputChange('generic_name', e.target.value)}
                  disabled={mode === 'view'}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">HSN Code</label>
                <input
                  type="text"
                  value={formData.hsn_code}
                  onChange={(e) => handleInputChange('hsn_code', e.target.value)}
                  disabled={mode === 'view'}
                  placeholder="e.g., 3004"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Barcode</label>
                <input
                  type="text"
                  value={formData.barcode}
                  onChange={(e) => handleInputChange('barcode', e.target.value)}
                  disabled={mode === 'view'}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  <Factory className="w-4 h-4 inline mr-1" />
                  Manufacturer
                </label>
                <input
                  type="text"
                  value={formData.manufacturer}
                  onChange={(e) => handleInputChange('manufacturer', e.target.value)}
                  disabled={mode === 'view'}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
                />
              </div>

              {/* Category & Packing */}
              <div className="md:col-span-2">
                <h3 className="text-lg font-medium text-gray-900 mb-4 flex items-center">
                  <Tag className="w-5 h-5 mr-2" />
                  Category & Packing
                </h3>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                <select
                  value={formData.category}
                  onChange={(e) => handleInputChange('category', e.target.value)}
                  disabled={mode === 'view'}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
                >
                  <option value="">Select Category</option>
                  {categories.map(cat => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Sub Category</label>
                <input
                  type="text"
                  value={formData.subcategory}
                  onChange={(e) => handleInputChange('subcategory', e.target.value)}
                  disabled={mode === 'view'}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Pack Type</label>
                <input
                  type="text"
                  value={formData.pack_type}
                  onChange={(e) => handleInputChange('pack_type', e.target.value)}
                  disabled={mode === 'view'}
                  placeholder="e.g., 10*10, 60ML"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Base Unit</label>
                <select
                  value={formData.base_unit}
                  onChange={(e) => handleInputChange('base_unit', e.target.value)}
                  disabled={mode === 'view'}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
                >
                  {units.map(unit => (
                    <option key={unit.value} value={unit.value}>{unit.label}</option>
                  ))}
                </select>
              </div>

              {/* Pricing & Tax */}
              <div className="md:col-span-2">
                <h3 className="text-lg font-medium text-gray-900 mb-4 flex items-center">
                  <DollarSign className="w-5 h-5 mr-2" />
                  Pricing & Tax
                </h3>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">MRP (₹)</label>
                <input
                  type="number"
                  value={formData.mrp}
                  onChange={(e) => handleInputChange('mrp', parseFloat(e.target.value) || 0)}
                  disabled={mode === 'view'}
                  min={0}
                  step={0.01}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Purchase Price (₹)</label>
                <input
                  type="number"
                  value={formData.purchase_price}
                  onChange={(e) => handleInputChange('purchase_price', parseFloat(e.target.value) || 0)}
                  disabled={mode === 'view'}
                  min={0}
                  step={0.01}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Sale Price (₹)</label>
                <input
                  type="number"
                  value={formData.sale_price}
                  onChange={(e) => handleInputChange('sale_price', parseFloat(e.target.value) || 0)}
                  disabled={mode === 'view'}
                  min={0}
                  step={0.01}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center">
                  <Percent className="w-4 h-4 mr-1" />
                  GST Rate
                </label>
                <select
                  value={formData.gst_percent}
                  onChange={(e) => handleInputChange('gst_percent', parseFloat(e.target.value))}
                  disabled={mode === 'view'}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
                >
                  {gstRates.map(rate => (
                    <option key={rate.value} value={rate.value}>{rate.label}</option>
                  ))}
                </select>
              </div>

              {/* Stock Settings */}
              <div className="md:col-span-2">
                <h3 className="text-lg font-medium text-gray-900 mb-4 flex items-center">
                  <BarChart3 className="w-5 h-5 mr-2" />
                  Stock Settings
                </h3>
              </div>

              <div className="md:col-span-2">
                <label className="flex items-center space-x-2 mb-4">
                  <input
                    type="checkbox"
                    checked={formData.is_active}
                    onChange={(e) => handleInputChange('is_active', e.target.checked)}
                    disabled={mode === 'view'}
                    className="rounded border-gray-300"
                  />
                  <span className="text-sm text-gray-700">Active Product (Track Stock)</span>
                </label>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Minimum Stock Level</label>
                <input
                  type="number"
                  value={formData.minimum_stock_level}
                  onChange={(e) => handleInputChange('minimum_stock_level', parseInt(e.target.value) || 0)}
                  disabled={mode === 'view'}
                  min={0}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Maximum Stock Level</label>
                <input
                  type="number"
                  value={formData.maximum_stock_level}
                  onChange={(e) => handleInputChange('maximum_stock_level', parseInt(e.target.value) || 0)}
                  disabled={mode === 'view'}
                  min={0}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
                />
              </div>

              {/* Additional Details */}
              <div className="md:col-span-2">
                <h3 className="text-lg font-medium text-gray-900 mb-4 flex items-center">
                  <Settings className="w-5 h-5 mr-2" />
                  Additional Details
                </h3>
              </div>

              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => handleInputChange('description', e.target.value)}
                  disabled={mode === 'view'}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
                  placeholder="Product description, usage, composition..."
                />
              </div>

              <div className="md:col-span-2">
                <label className="block text-sm font-medium text-gray-700 mb-1">Storage Instructions</label>
                <textarea
                  value={formData.storage_instructions}
                  onChange={(e) => handleInputChange('storage_instructions', e.target.value)}
                  disabled={mode === 'view'}
                  rows={2}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
                  placeholder="e.g., Store in a cool, dry place. Keep away from sunlight."
                />
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-end space-x-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
            >
              {mode === 'view' ? 'Close' : 'Cancel'}
            </button>
            {mode !== 'view' && (
              <button
                type="submit"
                disabled={isSaving}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSaving ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Saving...</span>
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    <span>{product ? 'Update Product' : 'Add Product'}</span>
                  </>
                )}
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
};

export default ProductEditModal;