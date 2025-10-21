import React, { useState, useEffect } from 'react';
import { X, Package, Pill, Building2, Hash, Percent, IndianRupee, Shield, AlertTriangle, Thermometer, FileText } from 'lucide-react';
import { productAPI, productsApi } from '../../../services/api';
import PackTypeSelector from '../PackTypeSelector';
import MonthYearPicker from '../MonthYearPicker';
import DataTransformer from '../../../services/dataTransformer';
import { APP_CONFIG } from '../../../config/app.config';
import { useToast } from '../ui/feedback/Toast';
import { SlideInPanel } from '../ui/FullScreenModal';

const ProductCreationModal = ({ 
  show, 
  onClose, 
  onProductCreated,
  initialProductName = '' 
}) => {
  const toast = useToast();
  const [newProduct, setNewProduct] = useState({
    product_name: initialProductName,
    product_code: '',
    manufacturer: '',
    hsn_code: '3004',
    gst_percent: 12,
    mrp: '',  // No default - user must enter
    sale_price: '',  // No default - user must enter
    category: '',
    category_id: '',
    product_type: '',
    type_id: '',
    batch_number: '',
    mfg_date: '',
    expiry_date: '',
    quantity_available: '',  // No default - user must enter
    cost_price: '',  // No default - user must enter
    salt_composition: '',
    // NEW CRITICAL PHARMACEUTICAL FIELDS
    schedule_type: '',  // H, H1, X, G, J, or empty for OTC
    is_narcotic: false,  // Auto-set based on schedule_type
    prescription_required: false,  // Auto-set based on schedule_type
    storage_condition: 'room_temp',  // room_temp, cool, refrigerated, frozen
    generic_name: '',
    composition: ''
  });
  
  const [packConfig, setPackConfig] = useState({
    sale_unit: '', 
    qty_per_strip: 10,
    strips_per_box: 10,
    use_boxes: true,
    pack_type_input: '10*10', // Default to match qty_per_strip * strips_per_box
    pack_size: null,
    pack_unit: null
  });
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState([]);
  
  // Master data state
  const [categories, setCategories] = useState([]);
  const [productTypes, setProductTypes] = useState([]);
  const [loadingMasterData, setLoadingMasterData] = useState(true);
  
  // Custom input states
  const [showCustomCategory, setShowCustomCategory] = useState(false);
  const [showCustomType, setShowCustomType] = useState(false);
  const [customCategoryName, setCustomCategoryName] = useState('');
  const [customTypeName, setCustomTypeName] = useState('');

  // Load master data when component mounts
  useEffect(() => {
    const loadMasterData = async () => {
      try {
        setLoadingMasterData(true);
        
        // Load categories and product types in parallel
        const [categoriesResponse, typesResponse] = await Promise.all([
          productsApi.get('/products/master/categories'),
          productsApi.get('/products/master/types')
        ]);

        if (categoriesResponse.data?.success) {
          setCategories(categoriesResponse.data.data);
        }
        
        if (typesResponse.data?.success) {
          setProductTypes(typesResponse.data.data);
        }
        
      } catch (error) {
        setErrors(['Failed to load categories and product types']);
      } finally {
        setLoadingMasterData(false);
      }
    };

    if (show) {
      loadMasterData();
    }
  }, [show]);

  // Update product name when modal opens with initialProductName
  React.useEffect(() => {
    if (show && initialProductName) {
      setNewProduct(prev => ({
        ...prev,
        product_name: initialProductName
      }));
    }
  }, [show, initialProductName]);

  // Function to create new category
  const createNewCategory = async () => {
    if (!customCategoryName.trim()) return;
    
    try {
      const response = await productsApi.post('/products/master/categories', {
        category_name: customCategoryName.trim()
      });
      
      if (response.data?.success) {
        const newCategory = response.data.data;
        setCategories([...categories, newCategory]);
        setNewProduct({
          ...newProduct,
          category_id: newCategory.category_id.toString(),
          category: newCategory.category_name
        });
        setCustomCategoryName('');
        setShowCustomCategory(false);
      }
    } catch (error) {
      if (error.response?.data?.detail?.includes('already exists')) {
        setErrors(['Category already exists']);
      } else {
        setErrors(['Failed to create category']);
      }
    }
  };

  // Function to create new product type
  const createNewType = async () => {
    if (!customTypeName.trim()) return;
    
    try {
      const response = await productsApi.post('/products/master/types', {
        type_name: customTypeName.trim(),
        default_base_uom: 'Unit'
      });
      
      if (response.data?.success) {
        const newType = response.data.data;
        setProductTypes([...productTypes, newType]);
        setNewProduct({
          ...newProduct,
          type_id: newType.type_id.toString(),
          product_type: newType.type_name
        });
        setCustomTypeName('');
        setShowCustomType(false);
      }
    } catch (error) {
      if (error.response?.data?.detail?.includes('already exists')) {
        setErrors(['Product type already exists']);
      } else {
        setErrors(['Failed to create product type']);
      }
    }
  };

  const calculateExpiryDate = (mfgDate, monthsToAdd = 24) => {
    if (!mfgDate || !mfgDate.includes('-')) return '';
    const [year, month] = mfgDate.split('-');
    const date = new Date(parseInt(year), parseInt(month) - 1);
    date.setMonth(date.getMonth() + monthsToAdd);
    const expYear = date.getFullYear();
    const expMonth = String(date.getMonth() + 1).padStart(2, '0');
    return `${expYear}-${expMonth}`;
  };

  const handleMfgDateChange = (date) => {
    setNewProduct({
      ...newProduct,
      mfg_date: date,
      expiry_date: calculateExpiryDate(date)
    });
  };

  // Handle schedule type change and auto-set related fields
  const handleScheduleTypeChange = (scheduleType) => {
    const isNarcotic = scheduleType === 'X';
    const prescriptionRequired = ['H', 'H1', 'X'].includes(scheduleType);
    
    setNewProduct({
      ...newProduct,
      schedule_type: scheduleType,
      is_narcotic: isNarcotic,
      prescription_required: prescriptionRequired
    });
  };

  const saveProduct = async () => {
    setSaving(true);
    setErrors([]);
    
    // Basic validation
    const validationErrors = [];
    if (!newProduct.product_name.trim()) validationErrors.push('Product name is required');
    if (!newProduct.manufacturer.trim()) validationErrors.push('Manufacturer is required');
    // Category is now optional
    if (!newProduct.hsn_code.trim()) validationErrors.push('HSN code is required');
    if (!newProduct.mrp || parseFloat(newProduct.mrp) <= 0) validationErrors.push('Valid MRP is required');
    if (!newProduct.sale_price || parseFloat(newProduct.sale_price) <= 0) validationErrors.push('Valid sale price is required');
    if (!newProduct.cost_price || parseFloat(newProduct.cost_price) <= 0) validationErrors.push('Valid cost price is required');
    if (!newProduct.gst_percent && newProduct.gst_percent !== 0) validationErrors.push('GST percentage is required');
    if (!newProduct.quantity_available || parseInt(newProduct.quantity_available) <= 0) validationErrors.push('Valid quantity is required');
    if (!newProduct.expiry_date) validationErrors.push('Expiry date is required');
    
    if (validationErrors.length > 0) {
      setErrors(validationErrors);
      setSaving(false);
      return;
    }
    
    try {
      // Convert MM/YY format to proper date format for backend
      const formatDateForAPI = (monthYearString) => {
        if (!monthYearString) return null;
        // monthYearString is in format "YYYY-MM", convert to "YYYY-MM-01"
        return `${monthYearString}-01`;
      };

      // Create product data matching the schema WITH PRICING AND BATCH INFO
      const productData = {
        product_name: newProduct.product_name,
        product_code: newProduct.product_code || `PROD${Date.now().toString().slice(-6)}`,
        generic_name: newProduct.generic_name || newProduct.salt_composition,
        brand: newProduct.brand || newProduct.manufacturer,
        manufacturer: newProduct.manufacturer,
        category_id: newProduct.category_id ? parseInt(newProduct.category_id) : null,
        type_id: newProduct.type_id ? parseInt(newProduct.type_id) : null,
        product_class: 'medicine',
        composition: newProduct.salt_composition ? { active: newProduct.salt_composition } : {},
        strength: newProduct.strength || null,
        hsn_code: newProduct.hsn_code,
        gst_percentage: parseFloat(newProduct.gst_percent),
        barcode: newProduct.barcode || null,
        // Pack configuration - now sent as individual fields for batch creation
        pack_type: packConfig.sale_unit || 'STRIP',
        pack_size: packConfig.qty_per_strip || 1,
        pack_uom: packConfig.sale_unit || 'STRIP', 
        base_uom: packConfig.base_unit || 'TABLET',
        units_per_pack: packConfig.qty_per_strip || 1,
        strips_per_box: packConfig.use_boxes ? packConfig.strips_per_box : null,
        // IMPORTANT: Include pricing data that backend expects!
        mrp: parseFloat(newProduct.mrp) || 0,
        sale_price: parseFloat(newProduct.sale_price) || 0,
        cost_price: parseFloat(newProduct.cost_price) || 0,
        quantity_available: parseInt(newProduct.quantity_available) || 0,
        // Include batch info for backend to create initial batch
        batch_number: newProduct.batch_number || `BATCH${Date.now().toString().slice(-8)}`,
        manufacturing_date: formatDateForAPI(newProduct.mfg_date),
        expiry_date: formatDateForAPI(newProduct.expiry_date),
        // Inventory settings
        maintain_batch: true,
        maintain_expiry: true,
        is_active: true,
        is_saleable: true,
        is_purchasable: true
      };
      
      // Prepare batch data separately
      const batchData = {
        batch_number: newProduct.batch_number || `BATCH${Date.now().toString().slice(-8)}`,
        manufacturing_date: formatDateForAPI(newProduct.mfg_date),
        expiry_date: formatDateForAPI(newProduct.expiry_date),
        quantity_received: parseInt(newProduct.quantity_available) || 0,
        quantity_available: parseInt(newProduct.quantity_available) || 0,
        cost_per_unit: parseFloat(newProduct.cost_price) || 0,
        mrp_per_unit: parseFloat(newProduct.mrp) || 0,
        sale_price_per_unit: parseFloat(newProduct.sale_price) || 0
      };

      // Ensure pack fields are properly typed before sending
      const apiData = {
        ...productData,
        // Make sure ALL pack fields are included with correct mapping
        pack_input: productData.pack_input,
        units_per_pack: packConfig.qty_per_strip ? parseInt(packConfig.qty_per_strip) : null,
        packages_per_box: packConfig.strips_per_box ? parseInt(packConfig.strips_per_box) : null,
        pack_quantity: productData.pack_quantity ? parseInt(productData.pack_quantity) : null,
        pack_multiplier: productData.pack_multiplier ? parseInt(productData.pack_multiplier) : null,
        pack_unit_type: productData.pack_unit_type,
        unit_count: productData.unit_count ? parseInt(productData.unit_count) : null,
        unit_measurement: productData.unit_measurement
      };
      
      const productResponse = await productAPI.create(apiData);
      
      // API returns the product directly, not wrapped in data
      if (productResponse) {
        // Transform response data - productResponse is the product itself
        const transformedProduct = DataTransformer.transformProduct(productResponse, 'display');
        
        // Add batch info if needed
        const batchNumber = newProduct.batch_number || `BATCH${Date.now().toString().slice(-8)}`;
        transformedProduct.batch_number = batchNumber;
        transformedProduct.mfg_date = newProduct.mfg_date;
        transformedProduct.expiry_date = newProduct.expiry_date;
        transformedProduct.quantity_available = parseInt(newProduct.quantity_available) || 0;
        
        // Return transformed product with all pricing fields
        const createdProduct = {
          ...productResponse,  // productResponse is the product itself
          batch_number: batchNumber,
          mfg_date: newProduct.mfg_date, // Keep MM/YY format for frontend
          expiry_date: newProduct.expiry_date, // Keep MM/YY format for frontend
          available_quantity: parseInt(newProduct.quantity_available) || 0,
          quantity_available: parseInt(newProduct.quantity_available) || 0,
          quantity: 1,
          // IMPORTANT: Include pricing fields for invoice
          mrp: parseFloat(newProduct.mrp) || 0,
          sale_price: parseFloat(newProduct.sale_price) || 0,
          rate: parseFloat(newProduct.sale_price) || 0, // rate is same as sale_price for invoice
          cost_price: parseFloat(newProduct.cost_price) || 0,
          gst_percent: parseFloat(newProduct.gst_percentage) || 0,
          hsn_code: newProduct.hsn_code || '3004',
          // Include pack configuration for frontend use (individual fields)
          pack_type: packConfig.sale_unit || 'STRIP',
          pack_size: packConfig.qty_per_strip || 1,
          base_unit: packConfig.base_unit,
          sale_unit: packConfig.sale_unit,
          qty_per_strip: packConfig.qty_per_strip,
          strips_per_box: packConfig.use_boxes ? packConfig.strips_per_box : null
        };
        
        toast.created(`Product "${createdProduct.product_name}"`, 4000);
        
        if (createdProduct.quantity_available) {
          toast.info(`Stock: ${createdProduct.quantity_available} units available`, 3000);
        }
        
        onProductCreated(createdProduct);
        onClose();
      }
    } catch (error) {
      
      let errorMessages = [];
      
      if (error.response?.data?.detail) {
        if (Array.isArray(error.response.data.detail)) {
          errorMessages = error.response.data.detail.map(err => {
            if (typeof err === 'string') {
              return err;
            } else if (err.msg) {
              return err.loc ? `${err.loc.join('.')} - ${err.msg}` : err.msg;
            } else {
              return JSON.stringify(err);
            }
          });
        } else if (typeof error.response.data.detail === 'string') {
          errorMessages = [error.response.data.detail];
        } else {
          errorMessages = [JSON.stringify(error.response.data.detail)];
        }
      } else if (error.response?.data?.message) {
        errorMessages = [error.response.data.message];
      } else if (error.response?.status) {
        errorMessages = [`HTTP ${error.response.status}: ${error.response.statusText || 'Unknown error'}`];
      } else if (error.message) {
        errorMessages = [`Network Error: ${error.message}`];
      } else {
        errorMessages = ['Failed to save product - Unknown error'];
      }
      
      setErrors(errorMessages);
      toast.error('Failed to save product. Please check your data and try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <SlideInPanel
      isOpen={show}
      onClose={onClose}
      title="Add New Product"
      subtitle="Create a new product with batch - Use Tab/Enter to navigate"
      width="2xl"
      footer={
        <div className="flex justify-between items-center">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="px-6 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            Cancel (Esc)
          </button>
          <button
            onClick={saveProduct}
            disabled={saving}
            className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            {saving && <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />}
            {saving ? 'Saving...' : 'Save Product'}
          </button>
        </div>
      }
    >
      <div className="space-y-6">
        {/* Icon Header */}
        <div className="flex items-center space-x-3 pb-4 border-b border-gray-200">
          <div className="w-10 h-10 bg-green-100 rounded-xl flex items-center justify-center">
            <Package className="w-5 h-5 text-green-600" />
          </div>
          <div className="text-sm text-gray-600">
            Fill in product details below. Press <kbd className="px-2 py-1 bg-gray-100 border border-gray-300 rounded text-xs font-mono">Tab</kbd> or <kbd className="px-2 py-1 bg-gray-100 border border-gray-300 rounded text-xs font-mono">Enter</kbd> to navigate fields.
          </div>
        </div>

        <div className="flex items-center justify-between">
              <div className="w-10 h-10 bg-green-100 rounded-xl flex items-center justify-center">
                <Package className="w-5 h-5 text-green-600" />
              </div>
              <div>
                <h3 className="text-2xl font-semibold text-gray-900">Add New Product</h3>
                <p className="text-sm text-gray-500 mt-1">Create a new product with optional batch</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 rounded-xl transition-all duration-200 group"
            >
              <X className="w-5 h-5 text-gray-400 group-hover:text-gray-600" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-8 overflow-y-auto max-h-[calc(90vh-200px)]">
          <div className="space-y-6">
            {/* Product Details */}
            <div className="space-y-4">
              <h4 className="text-sm font-semibold text-gray-900 uppercase tracking-wider">Product Information</h4>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="md:col-span-3">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Product Name *
                  </label>
                  <div className="relative">
                    <Pill className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <input
                      type="text"
                      value={newProduct.product_name}
                      onChange={(e) => setNewProduct({ ...newProduct, product_name: e.target.value })}
                      className="w-full pl-10 pr-3 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all"
                      placeholder="Enter product name"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Product Code
                  </label>
                  <input
                    type="text"
                    value={newProduct.product_code}
                    onChange={(e) => setNewProduct({ ...newProduct, product_code: e.target.value })}
                    className="w-full px-3 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all"
                    placeholder="Auto-generated if empty"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Manufacturer *
                  </label>
                  <div className="relative">
                    <Building2 className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <input
                      type="text"
                      value={newProduct.manufacturer}
                      onChange={(e) => setNewProduct({ ...newProduct, manufacturer: e.target.value })}
                      className="w-full pl-10 pr-3 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all"
                      placeholder="Enter manufacturer name"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Category
                  </label>
                  {!showCustomCategory ? (
                    <div className="space-y-2">
                      <select
                        value={newProduct.category_id}
                        onChange={(e) => {
                          if (e.target.value === 'add_new') {
                            setShowCustomCategory(true);
                            return;
                          }
                          const selectedCategory = categories.find(cat => cat.category_id === parseInt(e.target.value));
                          setNewProduct({ 
                            ...newProduct, 
                            category_id: e.target.value,
                            category: selectedCategory ? selectedCategory.category_name : ''
                          });
                        }}
                        className="w-full px-3 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all"
                        disabled={loadingMasterData}
                      >
                        <option value="">
                          {loadingMasterData ? 'Loading categories...' : 'Select Category'}
                        </option>
                        {categories.map(category => (
                          <option key={category.category_id} value={category.category_id}>
                            {category.category_name}
                          </option>
                        ))}
                        <option value="add_new" className="font-medium text-green-600">
                          + Add New Category
                        </option>
                      </select>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="flex space-x-2">
                        <input
                          type="text"
                          value={customCategoryName}
                          onChange={(e) => setCustomCategoryName(e.target.value)}
                          placeholder="Enter new category name"
                          className="flex-1 px-3 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all"
                          onKeyPress={(e) => e.key === 'Enter' && createNewCategory()}
                        />
                        <button
                          onClick={createNewCategory}
                          disabled={!customCategoryName.trim()}
                          className="px-4 py-3 bg-green-600 text-white rounded-xl hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                        >
                          Add
                        </button>
                        <button
                          onClick={() => {
                            setShowCustomCategory(false);
                            setCustomCategoryName('');
                          }}
                          className="px-4 py-3 bg-gray-300 text-gray-700 rounded-xl hover:bg-gray-400 transition-all"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Product Type
                  </label>
                  {!showCustomType ? (
                    <div className="space-y-2">
                      <select
                        value={newProduct.type_id}
                        onChange={(e) => {
                          if (e.target.value === 'add_new') {
                            setShowCustomType(true);
                            return;
                          }
                          const selectedType = productTypes.find(type => type.type_id === parseInt(e.target.value));
                          setNewProduct({ 
                            ...newProduct, 
                            type_id: e.target.value,
                            product_type: selectedType ? selectedType.type_name : ''
                          });
                        }}
                        className="w-full px-3 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all"
                        disabled={loadingMasterData}
                      >
                        <option value="">
                          {loadingMasterData ? 'Loading types...' : 'Select Product Type'}
                        </option>
                        {productTypes.map(type => (
                          <option key={type.type_id} value={type.type_id}>
                            {type.type_name}
                          </option>
                        ))}
                        <option value="add_new" className="font-medium text-green-600">
                          + Add New Product Type
                        </option>
                      </select>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="flex space-x-2">
                        <input
                          type="text"
                          value={customTypeName}
                          onChange={(e) => setCustomTypeName(e.target.value)}
                          placeholder="Enter new product type"
                          className="flex-1 px-3 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all"
                          onKeyPress={(e) => e.key === 'Enter' && createNewType()}
                        />
                        <button
                          onClick={createNewType}
                          disabled={!customTypeName.trim()}
                          className="px-4 py-3 bg-green-600 text-white rounded-xl hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                        >
                          Add
                        </button>
                        <button
                          onClick={() => {
                            setShowCustomType(false);
                            setCustomTypeName('');
                          }}
                          className="px-4 py-3 bg-gray-300 text-gray-700 rounded-xl hover:bg-gray-400 transition-all"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>

                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Salt Composition
                  </label>
                  <input
                    type="text"
                    value={newProduct.salt_composition}
                    onChange={(e) => setNewProduct({ ...newProduct, salt_composition: e.target.value })}
                    className="w-full px-3 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all"
                    placeholder="e.g., Paracetamol 500mg + Caffeine 65mg"
                  />
                </div>
              </div>

              {/* Pack Configuration - Integrated */}
              <PackTypeSelector
                productType={newProduct.category}
                packData={packConfig}
                onChange={setPackConfig}
                compact={true}
              />
            </div>

            {/* Pharmaceutical Compliance - CRITICAL */}
            <div className="space-y-4">
              <h4 className="text-sm font-semibold text-gray-900 uppercase tracking-wider flex items-center">
                <Shield className="w-4 h-4 text-red-500 mr-2" />
                Pharmaceutical Compliance
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Drug Schedule Type *
                  </label>
                  <div className="relative">
                    <Shield className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <select
                      value={newProduct.schedule_type}
                      onChange={(e) => handleScheduleTypeChange(e.target.value)}
                      className="w-full pl-10 pr-3 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all"
                    >
                      <option value="">OTC (Over The Counter)</option>
                      <option value="H">Schedule H (Prescription Drug)</option>
                      <option value="H1">Schedule H1 (Prescription with Warning)</option>
                      <option value="X">Schedule X (Narcotic/Psychotropic)</option>
                      <option value="G">Schedule G (Hormonal Preparations)</option>
                      <option value="J">Schedule J (Specific Diseases)</option>
                    </select>
                  </div>
                  {newProduct.schedule_type === 'X' && (
                    <p className="text-xs text-red-600 mt-1 flex items-center">
                      <AlertTriangle className="w-3 h-3 mr-1" />
                      Requires narcotic register entry
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Storage Condition *
                  </label>
                  <div className="relative">
                    <Thermometer className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <select
                      value={newProduct.storage_condition}
                      onChange={(e) => setNewProduct({ ...newProduct, storage_condition: e.target.value })}
                      className="w-full pl-10 pr-3 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all"
                    >
                      <option value="room_temp">Room Temperature (15-30°C)</option>
                      <option value="cool">Cool & Dry (8-15°C)</option>
                      <option value="refrigerated">Refrigerated (2-8°C)</option>
                      <option value="frozen">Frozen (-20°C)</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Generic Name
                  </label>
                  <div className="relative">
                    <FileText className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <input
                      type="text"
                      value={newProduct.generic_name}
                      onChange={(e) => setNewProduct({ ...newProduct, generic_name: e.target.value })}
                      className="w-full pl-10 pr-3 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all"
                      placeholder="e.g., Paracetamol"
                    />
                  </div>
                </div>

                <div className="md:col-span-3">
                  <div className="flex items-center space-x-6">
                    <label className="flex items-center">
                      <input
                        type="checkbox"
                        checked={newProduct.prescription_required}
                        onChange={(e) => setNewProduct({ ...newProduct, prescription_required: e.target.checked })}
                        className="rounded border-gray-300 text-green-600 focus:ring-green-500"
                        disabled={['H', 'H1', 'X'].includes(newProduct.schedule_type)}
                      />
                      <span className="ml-2 text-sm text-gray-700">Prescription Required</span>
                    </label>

                    <label className="flex items-center">
                      <input
                        type="checkbox"
                        checked={newProduct.is_narcotic}
                        onChange={(e) => setNewProduct({ ...newProduct, is_narcotic: e.target.checked })}
                        className="rounded border-gray-300 text-red-600 focus:ring-red-500"
                        disabled={newProduct.schedule_type === 'X'}
                      />
                      <span className="ml-2 text-sm text-gray-700">Narcotic/Psychotropic Drug</span>
                    </label>
                  </div>
                </div>
              </div>
            </div>

            {/* Pricing Information */}
            <div className="space-y-4">
              <h4 className="text-sm font-semibold text-gray-900 uppercase tracking-wider">Pricing & Tax</h4>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    MRP *
                  </label>
                  <div className="relative">
                    <IndianRupee className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <input
                      type="number"
                      value={newProduct.mrp}
                      onChange={(e) => setNewProduct({ ...newProduct, mrp: e.target.value })}
                      className="w-full pl-10 pr-3 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      placeholder="0.00"
                      step="0.01"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Sale Price *
                  </label>
                  <div className="relative">
                    <IndianRupee className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <input
                      type="number"
                      value={newProduct.sale_price}
                      onChange={(e) => setNewProduct({ ...newProduct, sale_price: e.target.value })}
                      className="w-full pl-10 pr-3 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      placeholder="0.00"
                      step="0.01"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Cost Price *
                  </label>
                  <div className="relative">
                    <IndianRupee className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <input
                      type="number"
                      value={newProduct.cost_price}
                      onChange={(e) => setNewProduct({ ...newProduct, cost_price: e.target.value })}
                      className="w-full pl-10 pr-3 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                      placeholder="0.00"
                      step="0.01"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    HSN Code *
                  </label>
                  <div className="relative">
                    <Hash className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <input
                      type="text"
                      value={newProduct.hsn_code}
                      onChange={(e) => setNewProduct({ ...newProduct, hsn_code: e.target.value })}
                      className="w-full pl-10 pr-3 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all"
                      placeholder="Enter HSN code"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    GST % *
                  </label>
                  <div className="relative">
                    <Percent className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <select
                      value={newProduct.gst_percent}
                      onChange={(e) => setNewProduct({ ...newProduct, gst_percent: e.target.value })}
                      className="w-full pl-10 pr-3 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all"
                    >
                      <option value="0">0%</option>
                      <option value="5">5%</option>
                      <option value="12">12%</option>
                      <option value="18">18%</option>
                      <option value="28">28%</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>

            {/* Batch Details */}
            <div className="space-y-4">
              <h4 className="text-sm font-semibold text-gray-900 uppercase tracking-wider">Batch Details</h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Batch Number
                  </label>
                  <input
                    type="text"
                    value={newProduct.batch_number}
                    onChange={(e) => setNewProduct({ ...newProduct, batch_number: e.target.value })}
                    className="w-full px-3 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all"
                    placeholder="Auto-generated if empty"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Quantity Available *
                  </label>
                  <input
                    type="number"
                    value={newProduct.quantity_available}
                    onChange={(e) => setNewProduct({ ...newProduct, quantity_available: e.target.value })}
                    className="w-full px-3 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                    placeholder="Enter quantity"
                    min="0"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Manufacturing Date
                  </label>
                  <MonthYearPicker
                    value={newProduct.mfg_date}
                    onChange={(date) => handleMfgDateChange(date)}
                    placeholder="MM/YYYY"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Expiry Date *
                  </label>
                  <MonthYearPicker
                    value={newProduct.expiry_date}
                    onChange={(date) => setNewProduct({ ...newProduct, expiry_date: date })}
                    placeholder="MM/YYYY"
                    minDate={newProduct.mfg_date}
                  />
                </div>
              </div>
            </div>

            {/* Error Messages */}
            {errors.length > 0 && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-4">
                <div className="text-sm text-red-600 space-y-1">
                  {errors.map((error, index) => (
                    <div key={index} className="flex items-start">
                      <span className="block w-1 h-1 bg-red-600 rounded-full mt-2 mr-2 flex-shrink-0"></span>
                      <span>{error}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-8 py-6 bg-gray-50 border-t border-gray-100 flex justify-end space-x-3">
          <button
            onClick={onClose}
            className="px-6 py-3 border border-gray-200 text-gray-700 rounded-xl hover:bg-gray-100 transition-all duration-200 font-medium"
          >
            Cancel
          </button>
          <button
            onClick={saveProduct}
            disabled={saving || !newProduct.product_name || !newProduct.manufacturer || !newProduct.hsn_code || !newProduct.mrp || !newProduct.sale_price}
            className="px-6 py-3 bg-green-600 text-white rounded-xl hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 font-medium flex items-center space-x-2"
          >
            {saving ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                <span>Saving...</span>
              </>
            ) : (
              <span>Save Product</span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ProductCreationModal;