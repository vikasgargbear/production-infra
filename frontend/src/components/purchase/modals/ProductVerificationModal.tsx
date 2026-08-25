import React, { useState, useEffect, useRef } from 'react';
import {
  Package, CheckCircle, AlertCircle, ChevronLeft,
  Calendar, DollarSign, Percent,
  Save, AlertTriangle, Trash2
} from 'lucide-react';
import { PurchaseProductSearch } from '../../global';

/**
 * ProductVerificationModal - Verify single product with search and validation
 */
const ProductVerificationModal = ({
  product,
  productIndex,
  totalProducts,
  onVerified,
  onSkip,
  onPrevious,
  onNext
}) => {
  const [selectedProduct, setSelectedProduct] = useState<any>(null);
  const [mode, setMode] = useState('search'); // 'search', 'selected', 'new'
  const productSearchRef = useRef(null);

  // Editable product data
  const [productData, setProductData] = useState({
    product_id: product?.product_id || null,
    uom_conversion_id: product?.uom_conversion_id || '',
    product_name: product?.product_name || '',
    batch_number: product?.batch_number || '',
    expiry_date: product?.expiry_date || '',
    quantity: product?.quantity ?? '',
    unit_price: product?.unit_price ?? '',
    mrp: product?.mrp ?? '',
    selling_price: product?.selling_price ?? '',
    tax_percent: product?.tax_percent ?? '',
    hsn_code: product?.hsn_code || '',
    free_quantity: product?.free_quantity ?? '',
    discount_percent: product?.discount_percent ?? ''
  });

  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [validationWarnings, setValidationWarnings] = useState<string[]>([]);

  // Update product data when product prop changes (switching between products)
  // Helper function to format date for input[type="date"]
  const formatDateForInput = (dateStr) => {
    if (!dateStr) return '';

    // If already in YYYY-MM-DD format, return as is
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
      return dateStr;
    }

    // Try to parse various date formats
    try {
      const date = new Date(dateStr);
      if (!isNaN(date.getTime())) {
        return date.toISOString().split('T')[0];
      }
    } catch (e) {
    }

    return dateStr;
  };

  useEffect(() => {
    // If product has been verified already, keep the verified data
    // Otherwise, use the extracted data
    if (product?.verified) {
      // Product was already verified, use the saved values
      setProductData({
        product_id: product.product_id,
        uom_conversion_id: product.uom_conversion_id || '',
        product_name: product.product_name,
        batch_number: product.batch_number,
        expiry_date: formatDateForInput(product.expiry_date),
        quantity: product.quantity,
        unit_price: product.unit_price,
        mrp: product.mrp,
        selling_price: product.selling_price,
        tax_percent: product.tax_percent,
        hsn_code: product.hsn_code,
        free_quantity: product.free_quantity,
        discount_percent: product.discount_percent
      });

      // Also set the mode based on whether it's a new product
      if (product.isNewProduct) {
        setMode('new');
      } else if (product.product_id) {
        setMode('selected');
        // You might want to set selectedProduct here too if needed
      }
    } else {
      // Product not verified yet, use extracted/original data
      setProductData({
        product_id: product?.product_id || null,
        uom_conversion_id: product?.uom_conversion_id || '',
        product_name: product?.product_name || '',
        batch_number: product?.batch_number || '',
        expiry_date: formatDateForInput(product?.expiry_date),
        quantity: product?.quantity ?? '',
        unit_price: product?.unit_price ?? '',
        mrp: product?.mrp ?? '',
        selling_price: product?.selling_price ?? '',
        tax_percent: product?.tax_percent ?? '',
        hsn_code: product?.hsn_code || '',
        free_quantity: product?.free_quantity ?? '',
        discount_percent: product?.discount_percent ?? ''
      });

      setMode('search');
    }

    // Reset common state
    setSelectedProduct(null);
    setValidationErrors([]);
    setValidationWarnings([]);
  }, [product, productIndex]); // Add productIndex to ensure updates when switching

  // Handle product selection from global search
  const handleProductSelect = (selectedProd) => {
    // Map the selected product to our format
    const mappedProduct = {
      product_id: selectedProd.product_id || null,
      uom_conversion_id: selectedProd.uom_conversion_id || '',
      product_name: selectedProd.product_name || selectedProd.name,
      hsn_code: selectedProd.hsn_code || selectedProd.hsn,
      mrp: selectedProd.mrp ?? productData.mrp,
      selling_price: productData.selling_price || selectedProd.selling_price || selectedProd.ptr || '',
      unit_price: productData.unit_price || selectedProd.unit_price || '',
      tax_percent: selectedProd.tax_percent ?? selectedProd.gst_percent ?? productData.tax_percent,
      // Keep extracted values for these
      quantity: productData.quantity,
      free_quantity: productData.free_quantity,
      discount_percent: productData.discount_percent,
      batch_number: productData.batch_number || '',
      expiry_date: productData.expiry_date || ''
    };

    setProductData(mappedProduct);
    setSelectedProduct(selectedProd);
    setMode('selected');
  };

  // Validate product data
  const validateProduct = () => {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Required fields
    if (!productData.product_id || !productData.uom_conversion_id) {
      errors.push('Select an existing canonical product with UOM identity');
    }
    if (!productData.product_name) errors.push('Product name is required');
    if (!productData.quantity || Number(productData.quantity) <= 0) errors.push('Quantity must be greater than 0');
    if (!productData.unit_price || Number(productData.unit_price) <= 0) errors.push('Cost price must be greater than 0');
    if (!productData.mrp || Number(productData.mrp) <= 0) errors.push('MRP must be greater than 0');
    if (productData.free_quantity === '' || productData.free_quantity === null || productData.free_quantity === undefined) {
      errors.push('Free quantity must be explicit (zero is allowed)');
    } else if (!Number.isFinite(Number(productData.free_quantity)) || Number(productData.free_quantity) < 0) {
      errors.push('Free quantity cannot be negative');
    }
    if (productData.discount_percent === '' || productData.discount_percent === null || productData.discount_percent === undefined) {
      errors.push('Discount must be explicit (zero is allowed)');
    } else if (!Number.isFinite(Number(productData.discount_percent)) || Number(productData.discount_percent) < 0 || Number(productData.discount_percent) > 100) {
      errors.push('Discount must be between 0% and 100%');
    }
    if (!productData.batch_number?.trim()) errors.push('Authoritative batch number is required');
    if (!productData.expiry_date) errors.push('Expiry date is required');
    if (productData.tax_percent === '' || productData.tax_percent === null || productData.tax_percent === undefined) {
      errors.push('GST rate must be selected from authoritative product or invoice data');
    } else if (!Number.isFinite(Number(productData.tax_percent)) || Number(productData.tax_percent) < 0 || Number(productData.tax_percent) > 100) {
      errors.push('GST rate must be between 0% and 100%');
    }

    // Price logic
    if (productData.mrp && productData.unit_price) {
      if (parseFloat(productData.mrp) < parseFloat(productData.unit_price)) {
        errors.push('MRP cannot be less than cost price');
      }
    }

    if (productData.selling_price && productData.mrp) {
      if (parseFloat(productData.selling_price) > parseFloat(productData.mrp)) {
        errors.push('Selling price cannot be greater than MRP');
      }
    }

    // Expiry warning
    if (productData.expiry_date) {
      const expiry = new Date(productData.expiry_date);
      const today = new Date();
      const monthsUntilExpiry = (expiry.getTime() - today.getTime()) / (1000 * 60 * 60 * 24 * 30);

      if (monthsUntilExpiry < 3) {
        warnings.push('Product expires in less than 3 months');
      }
      if (monthsUntilExpiry < 0) {
        errors.push('Product is already expired');
      }
    }

    setValidationErrors(errors);
    setValidationWarnings(warnings);

    return errors.length === 0;
  };

  // Handle save
  const handleSave = () => {
    if (!validateProduct()) {
      return;
    }

    onVerified({
      ...productData,
      isNewProduct: mode === 'new',
      verified: true
    });
  };

  return (
    <div className="space-y-4">
      {/* Progress indicator */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-3">
          <h3 className="text-lg font-medium">
            Product {productIndex + 1} of {totalProducts}
          </h3>
          {product?.verified && (
            <span className="px-2 py-1 bg-green-100 text-green-700 text-xs rounded-full flex items-center">
              <CheckCircle className="w-3 h-3 mr-1" />
              Verified
            </span>
          )}
        </div>
        <div className="flex items-center space-x-2">
          {Array.from({ length: totalProducts }, (_, i) => (
            <div
              key={i}
              className={`w-2 h-2 rounded-full ${i === productIndex ? 'bg-indigo-600' :
                i < productIndex ? 'bg-green-500' : 'bg-gray-300'
                }`}
            />
          ))}
        </div>
      </div>

      {/* Search Section - Using Global Component */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
        <label className="block text-xs font-medium text-blue-700 mb-2 uppercase tracking-wider">
          Product Search
        </label>
        <PurchaseProductSearch
          ref={productSearchRef}
          onAddItem={handleProductSelect}
          requireBatch={false}
          placeholder="Search an existing canonical product..."
          className="w-full"
        />

        {/* Selected/New Product Indicator */}
        {mode === 'selected' && selectedProduct && (
          <div className="mt-3 p-2 bg-green-50 rounded-lg flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <CheckCircle className="w-4 h-4 text-green-600" />
              <span className="text-sm text-green-700">
                Using existing product (ID: {selectedProduct?.product_id})
              </span>
            </div>
            <button
              onClick={() => setMode('search')}
              className="text-xs text-green-600 hover:text-green-700"
            >
              Change
            </button>
          </div>
        )}

        <p className="mt-2 text-xs text-blue-700">
          Create missing products in Product Master first; purchase verification never invents product or UOM identity.
        </p>
      </div>

      {/* Product Details Form - Reduced whitespace */}
      <div className="bg-white border rounded-lg p-4">
        <div className="flex items-center justify-between mb-3">
          <h4 className="font-medium text-gray-700">Product Details</h4>
          <div className="flex gap-2">
            <button
              onClick={onSkip}
              className="p-1.5 text-red-600 hover:bg-red-50 rounded transition-colors"
              title="Delete this product"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>
        {/* All Sections */}
        <div className="space-y-3">
          {/* Product Identification Section */}
          <div className="bg-slate-50 p-3 rounded-lg border border-slate-200">
            <h5 className="text-xs font-semibold text-gray-700 mb-2 flex items-center">
              <Package className="w-3 h-3 mr-1" />
              PRODUCT IDENTIFICATION
            </h5>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">
                Product Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={productData.product_name}
                onChange={(e) => setProductData(prev => ({
                  ...prev,
                  product_name: e.target.value
                }))}
                className="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-indigo-500 bg-white"
                disabled={mode === 'selected'}
                placeholder="Enter product name"
              />
            </div>
          </div>

          {/* Batch & Expiry Section */}
          <div className="bg-blue-50 p-3 rounded-lg border border-blue-200">
            <h5 className="text-xs font-semibold text-gray-700 mb-2 flex items-center">
              <Calendar className="w-3 h-3 mr-1" />
              BATCH & EXPIRY
            </h5>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Batch Number
                </label>
                <input
                  type="text"
                  value={productData.batch_number}
                  onChange={(e) => setProductData(prev => ({
                    ...prev,
                    batch_number: e.target.value
                  }))}
                  placeholder="Enter authoritative batch number"
                  className="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-indigo-500 bg-white"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Expiry Date <span className="text-red-500">*</span>
                </label>
                <input
                  type="date"
                  value={productData.expiry_date}
                  onChange={(e) => setProductData(prev => ({
                    ...prev,
                    expiry_date: e.target.value
                  }))}
                  min={new Date().toISOString().split('T')[0]}
                  className="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-indigo-500 bg-white"
                />
              </div>
            </div>
          </div>

          {/* Quantity Section */}
          <div className="bg-green-50 p-3 rounded-lg border border-green-200">
            <h5 className="text-xs font-semibold text-gray-700 mb-2 flex items-center">
              <Package className="w-3 h-3 mr-1" />
              QUANTITY
            </h5>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Purchase Qty <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={productData.quantity}
                  onChange={(e) => setProductData(prev => ({
                    ...prev,
                    quantity: e.target.value
                  }))}
                  className="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-indigo-500 bg-white font-semibold"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Free Qty
                </label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={productData.free_quantity}
                  onChange={(e) => setProductData(prev => ({
                    ...prev,
                    free_quantity: e.target.value
                  }))}
                  className="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-indigo-500 bg-white"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Total Qty
                </label>
                <input
                  type="text"
                  value={productData.quantity === '' || productData.free_quantity === ''
                    ? ''
                    : `${productData.quantity} + ${productData.free_quantity}`}
                  disabled
                  className="w-full px-3 py-2 border rounded-md bg-gray-100 font-semibold text-green-700"
                />
              </div>
            </div>
          </div>

          {/* Pricing Section */}
          <div className="bg-amber-50 p-3 rounded-lg border border-amber-200">
            <h5 className="text-xs font-semibold text-gray-700 mb-2 flex items-center">
              <DollarSign className="w-3 h-3 mr-1" />
              PRICING
            </h5>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Cost Price <span className="text-red-500">*</span>
                </label>
                <div className="relative">
                  <span className="absolute left-2 top-1/2 transform -translate-y-1/2 text-gray-500">₹</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={productData.unit_price}
                    onChange={(e) => setProductData(prev => ({
                      ...prev,
                      unit_price: e.target.value
                    }))}
                    className="w-full pl-7 pr-2 py-2 border rounded-md focus:ring-2 focus:ring-indigo-500 bg-white font-semibold"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  MRP
                </label>
                <div className="relative">
                  <span className="absolute left-2 top-1/2 transform -translate-y-1/2 text-gray-500">₹</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={productData.mrp}
                    onChange={(e) => setProductData(prev => ({
                      ...prev,
                      mrp: e.target.value
                    }))}
                    className="w-full pl-7 pr-2 py-2 border rounded-md focus:ring-2 focus:ring-indigo-500 bg-white"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Selling Price (PTR)
                </label>
                <div className="relative">
                  <span className="absolute left-2 top-1/2 transform -translate-y-1/2 text-gray-500">₹</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={productData.selling_price}
                    onChange={(e) => setProductData(prev => ({
                      ...prev,
                      selling_price: e.target.value
                    }))}
                    placeholder="Enter explicit selling price when applicable"
                    className="w-full pl-7 pr-2 py-2 border rounded-md focus:ring-2 focus:ring-indigo-500 bg-white"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Tax & Compliance Section */}
          <div className="bg-purple-50 p-3 rounded-lg border border-purple-200">
            <h5 className="text-xs font-semibold text-gray-700 mb-2 flex items-center">
              <Percent className="w-3 h-3 mr-1" />
              TAX & COMPLIANCE
            </h5>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  GST Rate
                </label>
                <select
                  value={productData.tax_percent}
                  onChange={(e) => setProductData(prev => ({
                    ...prev,
                    tax_percent: e.target.value
                  }))}
                  className="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-indigo-500 bg-white"
                >
                  <option value="">Select authoritative GST rate</option>
                  <option value="0">0% (Exempt)</option>
                  <option value="5">5%</option>
                  <option value="12">12%</option>
                  <option value="18">18%</option>
                  <option value="28">28%</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  HSN Code
                </label>
                <input
                  type="text"
                  value={productData.hsn_code}
                  onChange={(e) => setProductData(prev => ({
                    ...prev,
                    hsn_code: e.target.value
                  }))}
                  placeholder="Optional"
                  className="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-indigo-500 bg-white"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Discount %
                </label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={productData.discount_percent}
                  onChange={(e) => setProductData(prev => ({
                    ...prev,
                    discount_percent: e.target.value
                  }))}
                  max="100"
                  placeholder="0"
                  className="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-indigo-500 bg-white"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Validation Messages */}
        {validationErrors.length > 0 && (
          <div className="p-3 bg-red-50 rounded-lg">
            <div className="flex items-start space-x-2">
              <AlertCircle className="w-4 h-4 text-red-600 mt-0.5" />
              <div className="text-sm text-red-700">
                <p className="font-medium mb-1">Please fix the following errors:</p>
                <ul className="list-disc list-inside space-y-1">
                  {validationErrors.map((error, i) => (
                    <li key={i}>{error}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        )}

        {validationWarnings.length > 0 && (
          <div className="p-3 bg-yellow-50 rounded-lg">
            <div className="flex items-start space-x-2">
              <AlertTriangle className="w-4 h-4 text-yellow-600 mt-0.5" />
              <div className="text-sm text-yellow-700">
                <p className="font-medium mb-1">Warnings:</p>
                <ul className="list-disc list-inside space-y-1">
                  {validationWarnings.map((warning, i) => (
                    <li key={i}>{warning}</li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Action Buttons */}
      <div className="flex justify-between items-center pt-3 border-t">
        <button
          onClick={onPrevious}
          disabled={productIndex === 0}
          className="px-4 py-2 text-gray-600 hover:text-gray-800 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
        >
          <ChevronLeft className="w-5 h-5" />
          <span className="font-medium">Previous</span>
        </button>

        <div className="flex space-x-3">
          <button
            onClick={onSkip}
            className="px-4 py-2 border border-red-300 text-red-700 rounded-lg hover:bg-red-50 flex items-center gap-2"
          >
            <Trash2 className="w-4 h-4" />
            <span>Skip</span>
          </button>

          <button
            onClick={handleSave}
            className="px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 flex items-center gap-2"
          >
            <Save className="w-4 h-4" />
            <span>
              {productIndex < totalProducts - 1 ? 'Save & Next' : 'Save & Review'}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default ProductVerificationModal;
