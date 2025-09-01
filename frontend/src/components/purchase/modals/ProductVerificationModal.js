import React, { useState, useEffect } from 'react';
import { 
  Package, Search, CheckCircle, AlertCircle, ChevronLeft, 
  ChevronRight, Calendar, Hash, DollarSign, Percent, Info,
  SkipForward, Save, AlertTriangle, Plus, Trash2
} from 'lucide-react';
import { purchasesApi } from '../../../services/api/modules/purchases.api';
import { debounce } from 'lodash';

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
  const [searchTerm, setSearchTerm] = useState(product?.product_name || '');
  const [searchResults, setSearchResults] = useState([]);
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [searching, setSearching] = useState(false);
  const [mode, setMode] = useState('search'); // 'search', 'selected', 'new'
  
  // Editable product data
  const [productData, setProductData] = useState({
    product_id: product?.product_id || null,
    product_name: product?.product_name || '',
    batch_number: product?.batch_number || '',
    expiry_date: product?.expiry_date || '',
    quantity: product?.quantity || '',
    cost_price: product?.cost_price || product?.rate || '',
    mrp: product?.mrp || '',
    selling_price: product?.selling_price || '',
    tax_percent: product?.tax_percent || 12,
    hsn_code: product?.hsn_code || '',
    free_quantity: product?.free_quantity || 0,
    discount_percent: product?.discount_percent || 0
  });

  const [validationErrors, setValidationErrors] = useState([]);
  const [validationWarnings, setValidationWarnings] = useState([]);

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
      console.error('Error parsing date:', e);
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
        product_name: product.product_name,
        batch_number: product.batch_number,
        expiry_date: formatDateForInput(product.expiry_date),
        quantity: product.quantity,
        cost_price: product.cost_price,
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
        product_name: product?.product_name || '',
        batch_number: product?.batch_number || '',
        expiry_date: formatDateForInput(product?.expiry_date),
        quantity: product?.quantity || '',
        cost_price: product?.cost_price || product?.rate || '',
        mrp: product?.mrp || '',
        selling_price: product?.selling_price || '',
        tax_percent: product?.tax_percent || 12,
        hsn_code: product?.hsn_code || '',
        free_quantity: product?.free_quantity || 0,
        discount_percent: product?.discount_percent || 0
      });
      
      setMode('search');
      
      // Search for the new product only if not verified
      if (product?.product_name) {
        searchProduct(product.product_name);
      }
    }
    
    // Reset common state
    setSearchTerm(product?.product_name || '');
    setSelectedProduct(null);
    setValidationErrors([]);
    setValidationWarnings([]);
  }, [product, productIndex]); // Add productIndex to ensure updates when switching

  // Search products - removed useCallback to avoid stale closure
  const searchProduct = debounce(async (term) => {
    if (!term || term.length < 2) return;

    setSearching(true);
    try {
      const response = await purchasesApi.searchProducts({ 
        product_name: term 
      });
      if (response && response.data) {
        setSearchResults(response.data.products || []);
        
        // Auto-select if exact match found
        const exactMatch = response.data.products?.find(p => p.is_exact_match);
        if (exactMatch) {
          selectProduct(exactMatch);
        }
      }
    } catch (error) {
      console.error('Search error:', error);
    } finally {
      setSearching(false);
    }
  }, 300);

  // Select existing product
  const selectProduct = (existingProduct) => {
    setSelectedProduct(existingProduct);
    setMode('selected');
    
    // Update product data with existing product info
    setProductData(prev => ({
      ...prev,
      product_id: existingProduct.product_id,
      product_name: existingProduct.product_name,
      hsn_code: existingProduct.hsn_code || prev.hsn_code,
      // Suggest last pricing but keep extracted values if available
      cost_price: prev.cost_price || existingProduct.last_cost || '',
      mrp: prev.mrp || existingProduct.last_mrp || ''
    }));

    // Auto-calculate selling price if not set
    if (!productData.selling_price && productData.mrp) {
      setProductData(prev => ({
        ...prev,
        selling_price: (parseFloat(prev.mrp) * 0.9).toFixed(2)
      }));
    }
  };

  // Create new product
  const createNewProduct = () => {
    setMode('new');
    setSelectedProduct(null);
    setProductData(prev => ({
      ...prev,
      product_id: null
    }));
  };

  // Auto-calculate prices
  useEffect(() => {
    if (productData.cost_price && (!productData.mrp || productData.mrp === '')) {
      const cost = parseFloat(productData.cost_price);
      if (!isNaN(cost) && cost > 0) {
        setProductData(prev => ({
          ...prev,
          mrp: (cost * 1.5).toFixed(2)
        }));
      }
    }
  }, [productData.cost_price]);

  useEffect(() => {
    if (productData.mrp && (!productData.selling_price || productData.selling_price === '')) {
      const mrp = parseFloat(productData.mrp);
      if (!isNaN(mrp) && mrp > 0) {
        setProductData(prev => ({
          ...prev,
          selling_price: (mrp * 0.9).toFixed(2)
        }));
      }
    }
  }, [productData.mrp]);

  // Generate batch number if not provided
  const generateBatchNumber = () => {
    const date = new Date();
    const year = date.getFullYear().toString().slice(-2);
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
    return `B${year}${month}${random}`;
  };

  // Validate product data
  const validateProduct = () => {
    const errors = [];
    const warnings = [];

    // Required fields
    if (!productData.product_name) errors.push('Product name is required');
    if (!productData.quantity || productData.quantity <= 0) errors.push('Quantity must be greater than 0');
    if (!productData.cost_price || productData.cost_price <= 0) errors.push('Cost price must be greater than 0');
    // Batch number is NOT required - will be auto-generated if missing
    if (!productData.expiry_date) errors.push('Expiry date is required');

    // Price logic
    if (productData.mrp && productData.cost_price) {
      if (parseFloat(productData.mrp) < parseFloat(productData.cost_price)) {
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
      const monthsUntilExpiry = (expiry - today) / (1000 * 60 * 60 * 24 * 30);
      
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

    // Auto-generate batch number if not provided
    // Auto-calculate selling price if not provided
    const finalProductData = {
      ...productData,
      batch_number: productData.batch_number || generateBatchNumber(),
      selling_price: productData.selling_price || (productData.mrp ? (parseFloat(productData.mrp) * 0.9).toFixed(2) : '0')
    };

    onVerified({
      ...finalProductData,
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
              className={`w-2 h-2 rounded-full ${
                i === productIndex ? 'bg-indigo-600' : 
                i < productIndex ? 'bg-green-500' : 'bg-gray-300'
              }`}
            />
          ))}
        </div>
      </div>

      {/* Search Section - Improved visualization */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
        <label className="block text-xs font-medium text-blue-700 mb-2 uppercase tracking-wider">
          Product Search
        </label>
        <div className="flex items-center space-x-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-blue-500" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                searchProduct(e.target.value);
              }}
              placeholder="Type to search existing products or create new..."
              className="w-full pl-10 pr-3 py-2 border-2 border-blue-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
            />
          </div>
          {searching && (
            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-indigo-600"></div>
          )}
        </div>

        {/* Search Results */}
        {searchResults.length > 0 && mode === 'search' && (
          <div className="space-y-2 max-h-40 overflow-y-auto">
            {searchResults.map((result) => (
              <div
                key={result.product_id}
                onClick={() => selectProduct(result)}
                className="p-2 bg-white rounded border hover:bg-indigo-50 hover:border-indigo-300 cursor-pointer"
              >
                <div className="flex items-center justify-between">
                  <div className="flex-1">
                    <p className="text-sm font-medium">{result.product_name}</p>
                    <p className="text-xs text-gray-500">
                      {result.last_batch && `Last: Batch ${result.last_batch}`}
                      {result.last_mrp && ` • MRP ₹${result.last_mrp}`}
                    </p>
                  </div>
                  {result.is_exact_match && (
                    <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded">
                      Exact Match
                    </span>
                  )}
                </div>
              </div>
            ))}
            <button
              onClick={createNewProduct}
              className="w-full p-2 text-center text-sm text-indigo-600 hover:bg-indigo-50 rounded"
            >
              + Create as new product
            </button>
          </div>
        )}

        {/* Selected/New Product Indicator */}
        {mode === 'selected' && selectedProduct && (
          <div className="mt-3 p-2 bg-green-50 rounded-lg flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <CheckCircle className="w-4 h-4 text-green-600" />
              <span className="text-sm text-green-700">
                Using existing product (ID: {selectedProduct.product_id})
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

        {mode === 'new' && (
          <div className="mt-3 p-2 bg-blue-50 rounded-lg flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Info className="w-4 h-4 text-blue-600" />
              <span className="text-sm text-blue-700">
                New product will be created
              </span>
            </div>
            <button
              onClick={() => setMode('search')}
              className="text-xs text-blue-600 hover:text-blue-700"
            >
              Search Again
            </button>
          </div>
        )}
      </div>

      {/* Product Details Form - Reduced whitespace */}
      <div className="bg-white border rounded-lg p-4">
        <div className="flex items-center justify-between mb-3">
          <h4 className="font-medium text-gray-700">Product Details</h4>
          <div className="flex gap-2">
            <button
              onClick={() => {
                // Clear all fields for new product
                setProductData({
                  product_id: null,
                  product_name: '',
                  batch_number: '',
                  expiry_date: '',
                  quantity: '',
                  cost_price: '',
                  mrp: '',
                  selling_price: '',
                  tax_percent: 12,
                  hsn_code: '',
                  free_quantity: 0,
                  discount_percent: 0
                });
                setMode('new');
                setSearchTerm('');
                setSelectedProduct(null);
              }}
              className="p-1.5 text-green-600 hover:bg-green-50 rounded transition-colors"
              title="Add new product"
            >
              <Plus className="w-4 h-4" />
            </button>
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
                  placeholder="Auto-generate if empty"
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
                  type="number"
                  value={productData.quantity}
                  onChange={(e) => setProductData(prev => ({ 
                    ...prev, 
                    quantity: e.target.value 
                  }))}
                  min="0"
                  className="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-indigo-500 bg-white font-semibold"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Free Qty
                </label>
                <input
                  type="number"
                  value={productData.free_quantity}
                  onChange={(e) => setProductData(prev => ({ 
                    ...prev, 
                    free_quantity: e.target.value 
                  }))}
                  min="0"
                  className="w-full px-3 py-2 border rounded-md focus:ring-2 focus:ring-indigo-500 bg-white"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  Total Qty
                </label>
                <input
                  type="text"
                  value={(parseFloat(productData.quantity || 0) + parseFloat(productData.free_quantity || 0))}
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
                    type="number"
                    value={productData.cost_price}
                    onChange={(e) => setProductData(prev => ({ 
                      ...prev, 
                      cost_price: e.target.value 
                    }))}
                    min="0"
                    step="0.01"
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
                    type="number"
                    value={productData.mrp}
                    onChange={(e) => setProductData(prev => ({ 
                      ...prev, 
                      mrp: e.target.value 
                    }))}
                    min="0"
                    step="0.01"
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
                    type="number"
                    value={productData.selling_price}
                    onChange={(e) => setProductData(prev => ({ 
                      ...prev, 
                      selling_price: e.target.value 
                    }))}
                    min="0"
                    step="0.01"
                    placeholder="Auto"
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
                  type="number"
                  value={productData.discount_percent}
                  onChange={(e) => setProductData(prev => ({ 
                    ...prev, 
                    discount_percent: e.target.value 
                  }))}
                  min="0"
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