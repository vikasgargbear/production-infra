import React, { useState, useEffect } from 'react';
import { 
  X, Save, Loader2, Package, Tag, Percent, BarChart3, DollarSign, 
  Settings, Factory, Shield, AlertTriangle, Calendar, Image, 
  FileText, Search, Plus, Trash2, Edit, Eye, ChevronDown, ChevronUp,
  Thermometer, Pill, Box, Database, CheckCircle, XCircle
} from 'lucide-react';
import { productsApi, metadataApi } from '../../services/api';
import { useToast } from '../global';

const ProductMaster = ({ 
  isOpen, 
  onClose, 
  product = null,
  onSave,
  mode = 'edit' // 'edit' | 'create' | 'view'
}) => {
  const toast = useToast();
  
  // Initialize form data with default values to avoid null warnings
  const getInitialFormData = () => ({
    // Basic Information
    product_name: '',
    product_code: '',
    generic_name: '',
    brand: '',
    manufacturer: '',
    manufacturer_code: '',
    barcode: '',
    
    // Classification
    category_id: '',
    product_type: '',
    product_class: '',
    hsn_code: '',
    
    // Pharmaceutical Details
    composition: {},
    strength: '',
    drug_schedule: '',
    requires_prescription: false,
    is_narcotic: false,
    is_controlled_substance: false,
    
    // Pricing & Taxation
    mrp: 0,
    purchase_price: 0,
    sale_price: 0,
    gst_percentage: 12,
    cess_percentage: 0,
    
    // Storage & Handling
    storage_conditions: '',
    storage_instructions: '',
    requires_cold_chain: false,
    temperature_range: {
      min: 0,
      max: 0,
      unit: 'C'
    },
    
    // Inventory Management
    maintain_batch: true,
    maintain_expiry: true,
    allow_negative_stock: false,
    min_stock_quantity: 0,
    reorder_level: 0,
    reorder_quantity: 0,
    max_stock_quantity: 0,
    critical_stock_level: 0,
    
    // Product Status
    product_status: 'active',
    is_active: true,
    is_saleable: true,
    is_purchasable: true,
    launch_date: '',
    discontinuation_date: '',
    
    // Additional
    description: '',
    notes: '',
    search_keywords: [],
    tags: []
  });

  const [formData, setFormData] = useState(getInitialFormData());
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState(null);
  const [activeSection, setActiveSection] = useState('basic');
  const [categories, setCategories] = useState([]);
  const [productTypes, setProductTypes] = useState([]);
  const [productClasses, setProductClasses] = useState([]);

  // Drug schedules
  const drugSchedules = [
    { value: '', label: 'Not Scheduled' },
    { value: 'H', label: 'Schedule H' },
    { value: 'H1', label: 'Schedule H1' },
    { value: 'X', label: 'Schedule X' },
    { value: 'G', label: 'Schedule G' }
  ];

  // GST rates
  const gstRates = [
    { value: 0, label: '0% (Exempt)' },
    { value: 5, label: '5%' },
    { value: 12, label: '12%' },
    { value: 18, label: '18%' },
    { value: 28, label: '28%' }
  ];

  // Product status options
  const productStatuses = [
    { value: 'active', label: 'Active', color: 'green' },
    { value: 'inactive', label: 'Inactive', color: 'gray' },
    { value: 'discontinued', label: 'Discontinued', color: 'red' }
  ];

  const sections = [
    { id: 'basic', label: 'Basic & Classification', icon: Package },
    { id: 'product_details', label: 'Product Details', icon: Pill },
    { id: 'pricing_inventory', label: 'Pricing & Inventory', icon: DollarSign },
    { id: 'storage_compliance', label: 'Storage & Compliance', icon: Shield },
    { id: 'additional', label: 'Additional Info', icon: FileText }
  ];

  useEffect(() => {
    loadMetadata();
    if (product) {
      loadProductData();
    }
  }, [product]);

  const loadMetadata = async () => {
    try {
      // Load categories from backend
      try {
        const catResponse = await productsApi.getCategories();
        setCategories(catResponse.data || []);
      } catch (e) {
        console.log('Using default categories');
        setCategories([]);
      }
      
      // Load product types from backend
      try {
        const typeResponse = await productsApi.getProductTypes();
        setProductTypes(typeResponse.data || []);
      } catch (e) {
        // Fallback product types
        setProductTypes([
          { type_id: 1, type_name: 'Tablet' },
          { type_id: 2, type_name: 'Capsule' },
          { type_id: 3, type_name: 'Syrup' },
          { type_id: 4, type_name: 'Injection' },
          { type_id: 5, type_name: 'Cream' }
        ]);
      }

      // Load product classes
      try {
        const classResponse = await productsApi.getProductClasses();
        setProductClasses(classResponse.data || []);
      } catch (e) {
        // Fallback classes
        setProductClasses([
          { class_id: 1, class_name: 'Allopathic' },
          { class_id: 2, class_name: 'Ayurvedic' },
          { class_id: 3, class_name: 'Generic' },
          { class_id: 4, class_name: 'OTC' }
        ]);
      }
    } catch (error) {
      console.error('Error loading metadata:', error);
    }
  };

  const loadProductData = () => {
    // Merge product data with defaults to avoid null values
    setFormData(prev => ({
      ...prev,
      ...product,
      // Ensure nested objects have defaults
      temperature_range: product.temperature_range || prev.temperature_range,
      composition: product.composition || {},
      search_keywords: product.search_keywords || [],
      tags: product.tags || []
    }));
  };

  const handleInputChange = (field, value, nested = null) => {
    if (nested) {
      setFormData(prev => ({
        ...prev,
        [nested]: {
          ...prev[nested],
          [field]: value
        }
      }));
    } else {
      setFormData(prev => ({
        ...prev,
        [field]: value
      }));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setIsSaving(true);
    setError(null);

    try {
      const response = product 
        ? await productsApi.update(product.product_id, formData)
        : await productsApi.create(formData);
      
      if (response.success) {
        toast.success(product ? 'Product updated successfully' : 'Product created successfully');
        onSave && onSave(response.data);
        onClose();
      }
    } catch (err) {
      setError(err.message || 'Failed to save product');
      toast.error('Failed to save product');
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl m-4 max-h-[90vh] flex flex-col">
        <form onSubmit={handleSubmit} className="flex flex-col h-full">
          {/* Header */}
          <div className="px-6 py-4 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold text-gray-900">
                {mode === 'create' ? 'Create Product' : mode === 'view' ? 'View Product' : 'Edit Product'}
              </h2>
              <button type="button" onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            {error && (
              <div className="mt-2 text-sm text-red-600 bg-red-50 p-2 rounded">
                {error}
              </div>
            )}
          </div>

          {/* Body with Sidebar */}
          <div className="flex flex-1 overflow-hidden">
            {/* Sidebar Navigation */}
            <div className="w-56 bg-gray-50 p-4 border-r border-gray-200 overflow-y-auto">
              <nav className="space-y-1">
                {sections.map((section) => {
                  const Icon = section.icon;
                  return (
                    <button
                      key={section.id}
                      type="button"
                      onClick={() => setActiveSection(section.id)}
                      className={`w-full text-left px-3 py-2 rounded-lg flex items-center space-x-2 transition-colors ${
                        activeSection === section.id
                          ? 'bg-blue-100 text-blue-700'
                          : 'text-gray-700 hover:bg-gray-100'
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                      <span className="text-sm font-medium">{section.label}</span>
                    </button>
                  );
                })}
              </nav>
            </div>

            {/* Content Area */}
            <div className="flex-1 overflow-y-auto p-6">
              {/* Basic & Classification Section */}
              {activeSection === 'basic' && (
                <div className="space-y-6">
                  <div>
                    <h3 className="text-lg font-medium text-gray-900 mb-4 flex items-center">
                      <Package className="w-5 h-5 mr-2" />
                      Basic Information
                    </h3>
                    
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Product Name <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="text"
                          required
                          value={formData.product_name || ''}
                          onChange={(e) => handleInputChange('product_name', e.target.value)}
                          disabled={mode === 'view'}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Product Code
                        </label>
                        <input
                          type="text"
                          value={formData.product_code || ''}
                          onChange={(e) => handleInputChange('product_code', e.target.value)}
                          disabled={mode === 'view'}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Generic Name</label>
                        <input
                          type="text"
                          value={formData.generic_name || ''}
                          onChange={(e) => handleInputChange('generic_name', e.target.value)}
                          disabled={mode === 'view'}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">HSN Code</label>
                        <input
                          type="text"
                          value={formData.hsn_code || ''}
                          onChange={(e) => handleInputChange('hsn_code', e.target.value)}
                          disabled={mode === 'view'}
                          placeholder="e.g., 3004"
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Brand</label>
                        <input
                          type="text"
                          value={formData.brand || ''}
                          onChange={(e) => handleInputChange('brand', e.target.value)}
                          disabled={mode === 'view'}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Manufacturer</label>
                        <input
                          type="text"
                          value={formData.manufacturer || ''}
                          onChange={(e) => handleInputChange('manufacturer', e.target.value)}
                          disabled={mode === 'view'}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Classification */}
                  <div className="border-t pt-4">
                    <h4 className="text-md font-medium text-gray-800 mb-3 flex items-center">
                      <Tag className="w-4 h-4 mr-2" />
                      Classification
                    </h4>
                    <div className="grid grid-cols-3 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                        <select
                          value={formData.category_id || ''}
                          onChange={(e) => handleInputChange('category_id', e.target.value)}
                          disabled={mode === 'view'}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
                        >
                          <option value="">Select Category</option>
                          {categories.map(cat => (
                            <option key={cat.category_id} value={cat.category_id}>
                              {cat.category_name}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Product Type</label>
                        <select
                          value={formData.product_type || ''}
                          onChange={(e) => handleInputChange('product_type', e.target.value)}
                          disabled={mode === 'view'}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
                        >
                          <option value="">Select Type</option>
                          {productTypes.map(type => (
                            <option key={type.type_id || type.type_name} value={type.type_name}>
                              {type.type_name}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Product Class</label>
                        <select
                          value={formData.product_class || ''}
                          onChange={(e) => handleInputChange('product_class', e.target.value)}
                          disabled={mode === 'view'}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
                        >
                          <option value="">Select Class</option>
                          {productClasses.map(cls => (
                            <option key={cls.class_id || cls.class_name} value={cls.class_name}>
                              {cls.class_name}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Product Details Section */}
              {activeSection === 'product_details' && (
                <div className="space-y-6">
                  <h3 className="text-lg font-medium text-gray-900 mb-4 flex items-center">
                    <Pill className="w-5 h-5 mr-2" />
                    Product Details
                  </h3>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Strength</label>
                      <input
                        type="text"
                        value={formData.strength || ''}
                        onChange={(e) => handleInputChange('strength', e.target.value)}
                        disabled={mode === 'view'}
                        placeholder="e.g., 500mg, 10ml"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Drug Schedule</label>
                      <select
                        value={formData.drug_schedule || ''}
                        onChange={(e) => handleInputChange('drug_schedule', e.target.value)}
                        disabled={mode === 'view'}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
                      >
                        {drugSchedules.map(schedule => (
                          <option key={schedule.value} value={schedule.value}>
                            {schedule.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <label className="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        checked={formData.requires_prescription}
                        onChange={(e) => handleInputChange('requires_prescription', e.target.checked)}
                        disabled={mode === 'view'}
                        className="rounded"
                      />
                      <span className="text-sm text-gray-700">Requires Prescription</span>
                    </label>

                    <label className="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        checked={formData.is_narcotic}
                        onChange={(e) => handleInputChange('is_narcotic', e.target.checked)}
                        disabled={mode === 'view'}
                        className="rounded"
                      />
                      <span className="text-sm text-gray-700">Narcotic Drug</span>
                    </label>

                    <label className="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        checked={formData.is_controlled_substance}
                        onChange={(e) => handleInputChange('is_controlled_substance', e.target.checked)}
                        disabled={mode === 'view'}
                        className="rounded"
                      />
                      <span className="text-sm text-gray-700">Controlled Substance</span>
                    </label>
                  </div>
                </div>
              )}

              {/* Pricing & Inventory Section */}
              {activeSection === 'pricing_inventory' && (
                <div className="space-y-6">
                  <div>
                    <h3 className="text-lg font-medium text-gray-900 mb-4 flex items-center">
                      <DollarSign className="w-5 h-5 mr-2" />
                      Pricing & Tax
                    </h3>
                    
                    <div className="grid grid-cols-3 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">MRP</label>
                        <input
                          type="number"
                          value={formData.mrp || 0}
                          onChange={(e) => handleInputChange('mrp', parseFloat(e.target.value) || 0)}
                          disabled={mode === 'view'}
                          step="0.01"
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Purchase Price</label>
                        <input
                          type="number"
                          value={formData.purchase_price || 0}
                          onChange={(e) => handleInputChange('purchase_price', parseFloat(e.target.value) || 0)}
                          disabled={mode === 'view'}
                          step="0.01"
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Sale Price</label>
                        <input
                          type="number"
                          value={formData.sale_price || 0}
                          onChange={(e) => handleInputChange('sale_price', parseFloat(e.target.value) || 0)}
                          disabled={mode === 'view'}
                          step="0.01"
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">GST %</label>
                        <select
                          value={formData.gst_percentage || 12}
                          onChange={(e) => handleInputChange('gst_percentage', parseFloat(e.target.value))}
                          disabled={mode === 'view'}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
                        >
                          {gstRates.map(rate => (
                            <option key={rate.value} value={rate.value}>
                              {rate.label}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>

                  <div className="border-t pt-4">
                    <h4 className="text-md font-medium text-gray-800 mb-3 flex items-center">
                      <Database className="w-4 h-4 mr-2" />
                      Inventory Settings
                    </h4>
                    
                    <div className="grid grid-cols-3 gap-4">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Min Stock</label>
                        <input
                          type="number"
                          value={formData.min_stock_quantity || 0}
                          onChange={(e) => handleInputChange('min_stock_quantity', parseInt(e.target.value) || 0)}
                          disabled={mode === 'view'}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Reorder Level</label>
                        <input
                          type="number"
                          value={formData.reorder_level || 0}
                          onChange={(e) => handleInputChange('reorder_level', parseInt(e.target.value) || 0)}
                          disabled={mode === 'view'}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Reorder Quantity</label>
                        <input
                          type="number"
                          value={formData.reorder_quantity || 0}
                          onChange={(e) => handleInputChange('reorder_quantity', parseInt(e.target.value) || 0)}
                          disabled={mode === 'view'}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
                        />
                      </div>
                    </div>

                    <div className="mt-4 space-y-3">
                      <label className="flex items-center space-x-2">
                        <input
                          type="checkbox"
                          checked={formData.maintain_batch}
                          onChange={(e) => handleInputChange('maintain_batch', e.target.checked)}
                          disabled={mode === 'view'}
                          className="rounded"
                        />
                        <span className="text-sm text-gray-700">Maintain Batch</span>
                      </label>

                      <label className="flex items-center space-x-2">
                        <input
                          type="checkbox"
                          checked={formData.maintain_expiry}
                          onChange={(e) => handleInputChange('maintain_expiry', e.target.checked)}
                          disabled={mode === 'view'}
                          className="rounded"
                        />
                        <span className="text-sm text-gray-700">Maintain Expiry Date</span>
                      </label>

                      <label className="flex items-center space-x-2">
                        <input
                          type="checkbox"
                          checked={formData.allow_negative_stock}
                          onChange={(e) => handleInputChange('allow_negative_stock', e.target.checked)}
                          disabled={mode === 'view'}
                          className="rounded"
                        />
                        <span className="text-sm text-gray-700">Allow Negative Stock</span>
                      </label>
                    </div>
                  </div>
                </div>
              )}

              {/* Storage & Compliance Section */}
              {activeSection === 'storage_compliance' && (
                <div className="space-y-6">
                  <h3 className="text-lg font-medium text-gray-900 mb-4 flex items-center">
                    <Shield className="w-5 h-5 mr-2" />
                    Storage & Compliance
                  </h3>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Storage Conditions</label>
                      <input
                        type="text"
                        value={formData.storage_conditions || ''}
                        onChange={(e) => handleInputChange('storage_conditions', e.target.value)}
                        disabled={mode === 'view'}
                        placeholder="e.g., Cool, dry place"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Storage Instructions</label>
                      <input
                        type="text"
                        value={formData.storage_instructions || ''}
                        onChange={(e) => handleInputChange('storage_instructions', e.target.value)}
                        disabled={mode === 'view'}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
                      />
                    </div>
                  </div>

                  <div className="space-y-3">
                    <label className="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        checked={formData.requires_cold_chain}
                        onChange={(e) => handleInputChange('requires_cold_chain', e.target.checked)}
                        disabled={mode === 'view'}
                        className="rounded"
                      />
                      <span className="text-sm text-gray-700">Requires Cold Chain Storage</span>
                    </label>
                  </div>

                  {formData.requires_cold_chain && (
                    <div className="grid grid-cols-3 gap-4 p-4 bg-blue-50 rounded-lg">
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Min Temp</label>
                        <input
                          type="number"
                          value={formData.temperature_range?.min || 0}
                          onChange={(e) => handleInputChange('min', parseFloat(e.target.value) || 0, 'temperature_range')}
                          disabled={mode === 'view'}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Max Temp</label>
                        <input
                          type="number"
                          value={formData.temperature_range?.max || 0}
                          onChange={(e) => handleInputChange('max', parseFloat(e.target.value) || 0, 'temperature_range')}
                          disabled={mode === 'view'}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
                        />
                      </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Unit</label>
                        <select
                          value={formData.temperature_range?.unit || 'C'}
                          onChange={(e) => handleInputChange('unit', e.target.value, 'temperature_range')}
                          disabled={mode === 'view'}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
                        >
                          <option value="C">°C</option>
                          <option value="F">°F</option>
                        </select>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Additional Info Section */}
              {activeSection === 'additional' && (
                <div className="space-y-6">
                  <h3 className="text-lg font-medium text-gray-900 mb-4 flex items-center">
                    <FileText className="w-5 h-5 mr-2" />
                    Additional Information
                  </h3>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                    <textarea
                      value={formData.description || ''}
                      onChange={(e) => handleInputChange('description', e.target.value)}
                      disabled={mode === 'view'}
                      rows={4}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Internal Notes</label>
                    <textarea
                      value={formData.notes || ''}
                      onChange={(e) => handleInputChange('notes', e.target.value)}
                      disabled={mode === 'view'}
                      rows={3}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Product Status</label>
                      <select
                        value={formData.product_status || 'active'}
                        onChange={(e) => handleInputChange('product_status', e.target.value)}
                        disabled={mode === 'view'}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
                      >
                        {productStatuses.map(status => (
                          <option key={status.value} value={status.value}>
                            {status.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <label className="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        checked={formData.is_active}
                        onChange={(e) => handleInputChange('is_active', e.target.checked)}
                        disabled={mode === 'view'}
                        className="rounded"
                      />
                      <span className="text-sm text-gray-700">Active</span>
                    </label>

                    <label className="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        checked={formData.is_saleable}
                        onChange={(e) => handleInputChange('is_saleable', e.target.checked)}
                        disabled={mode === 'view'}
                        className="rounded"
                      />
                      <span className="text-sm text-gray-700">Available for Sale</span>
                    </label>

                    <label className="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        checked={formData.is_purchasable}
                        onChange={(e) => handleInputChange('is_purchasable', e.target.checked)}
                        disabled={mode === 'view'}
                        className="rounded"
                      />
                      <span className="text-sm text-gray-700">Available for Purchase</span>
                    </label>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-gray-200 flex justify-end space-x-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
            >
              Cancel
            </button>
            {mode !== 'view' && (
              <button
                type="submit"
                disabled={isSaving}
                className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center space-x-2 disabled:opacity-50"
              >
                {isSaving ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Saving...</span>
                  </>
                ) : (
                  <>
                    <Save className="w-4 h-4" />
                    <span>Save</span>
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

export default ProductMaster;