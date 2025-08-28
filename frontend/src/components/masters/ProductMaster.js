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
  
  // Comprehensive form data matching database schema
  const [formData, setFormData] = useState({
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
    
    // Packaging Configuration
    pack_config: {
      base_unit: '',
      base_units_per_pack: 1,
      pack_uom: '',
      packs_per_box: 1,
      box_uom: '',
      boxes_per_case: 1,
      case_uom: ''
    },
    base_uom_id: '',
    pack_type: '',
    
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
      min: null,
      max: null,
      unit: 'C'
    },
    
    // Inventory Management
    maintain_batch: true,
    maintain_expiry: true,
    allow_negative_stock: false,
    minimum_stock_level: 0,
    reorder_level: 0,
    reorder_quantity: 0,
    maximum_stock_level: 0,
    critical_stock_level: 0,
    
    // Product Status
    product_status: 'active',
    is_active: true,
    is_saleable: true,
    is_purchasable: true,
    launch_date: '',
    discontinuation_date: '',
    
    // Search & Tags
    search_keywords: [],
    tags: [],
    
    // Media & Documents
    product_images: [],
    documents: [],
    
    // Additional
    description: '',
    notes: ''
  });

  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState(null);
  const [activeSection, setActiveSection] = useState('basic');
  const [categories, setCategories] = useState([]);
  const [uomList, setUomList] = useState([]);
  const [newKeyword, setNewKeyword] = useState('');
  const [newTag, setNewTag] = useState('');
  const [compositionEntry, setCompositionEntry] = useState({ name: '', quantity: '', unit: '' });

  // Product types from schema
  const productTypes = [
    'Tablet', 'Capsule', 'Syrup', 'Injection', 'Powder', 
    'Cream', 'Ointment', 'Drops', 'Lotion', 'Gel',
    'Solution', 'Suspension', 'Inhaler', 'Spray', 'Patch',
    'Suppository', 'Implant', 'Device', 'Equipment', 'Other'
  ];

  // Product classes
  const productClasses = [
    'Allopathic', 'Ayurvedic', 'Homeopathic', 'Unani', 
    'Siddha', 'Nutraceutical', 'Cosmetic', 'Medical Device',
    'Surgical', 'Diagnostic', 'OTC', 'Generic', 'Branded'
  ];

  // Drug schedules
  const drugSchedules = [
    { value: '', label: 'Not Scheduled' },
    { value: 'H', label: 'Schedule H' },
    { value: 'H1', label: 'Schedule H1' },
    { value: 'X', label: 'Schedule X' },
    { value: 'G', label: 'Schedule G' },
    { value: 'J', label: 'Schedule J' },
    { value: 'K', label: 'Schedule K' }
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
    { value: 'discontinued', label: 'Discontinued', color: 'red' },
    { value: 'phase_out', label: 'Phase Out', color: 'orange' },
    { value: 'new_launch', label: 'New Launch', color: 'blue' }
  ];

  useEffect(() => {
    loadMetadata();
    if (product) {
      loadProductData();
    }
  }, [product]);

  const loadMetadata = async () => {
    try {
      // Load categories
      const catResponse = await metadataApi.getProductCategories();
      setCategories(catResponse.data || []);
      
      // Load units of measure
      const uomResponse = await metadataApi.getUnitsOfMeasure();
      setUomList(uomResponse.data || []);
    } catch (error) {
      console.error('Error loading metadata:', error);
    }
  };

  const loadProductData = () => {
    setFormData({
      ...formData,
      ...product,
      composition: product.composition || {},
      pack_config: product.pack_config || formData.pack_config,
      temperature_range: product.temperature_range || formData.temperature_range,
      search_keywords: product.search_keywords || [],
      tags: product.tags || [],
      product_images: product.product_images || [],
      documents: product.documents || []
    });
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

  const addComposition = () => {
    if (compositionEntry.name && compositionEntry.quantity) {
      setFormData(prev => ({
        ...prev,
        composition: {
          ...prev.composition,
          [compositionEntry.name]: {
            quantity: compositionEntry.quantity,
            unit: compositionEntry.unit
          }
        }
      }));
      setCompositionEntry({ name: '', quantity: '', unit: '' });
    }
  };

  const removeComposition = (name) => {
    const newComposition = { ...formData.composition };
    delete newComposition[name];
    setFormData(prev => ({ ...prev, composition: newComposition }));
  };

  const addKeyword = () => {
    if (newKeyword && !formData.search_keywords.includes(newKeyword)) {
      setFormData(prev => ({
        ...prev,
        search_keywords: [...prev.search_keywords, newKeyword]
      }));
      setNewKeyword('');
    }
  };

  const removeKeyword = (keyword) => {
    setFormData(prev => ({
      ...prev,
      search_keywords: prev.search_keywords.filter(k => k !== keyword)
    }));
  };

  const addTag = () => {
    if (newTag && !formData.tags.includes(newTag)) {
      setFormData(prev => ({
        ...prev,
        tags: [...prev.tags, newTag]
      }));
      setNewTag('');
    }
  };

  const removeTag = (tag) => {
    setFormData(prev => ({
      ...prev,
      tags: prev.tags.filter(t => t !== tag)
    }));
  };

  const validateForm = () => {
    if (!formData.product_name.trim()) {
      setError('Product name is required');
      return false;
    }
    if (!formData.product_code.trim()) {
      setError('Product code is required');
      return false;
    }
    if (formData.hsn_code && !/^\d{4,8}$/.test(formData.hsn_code)) {
      setError('HSN code must be 4-8 digits');
      return false;
    }
    if (formData.requires_cold_chain && (!formData.temperature_range.min || !formData.temperature_range.max)) {
      setError('Temperature range is required for cold chain products');
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
      
      const dataToSave = {
        ...formData,
        // Convert arrays to proper format
        search_keywords: formData.search_keywords.filter(k => k),
        tags: formData.tags.filter(t => t),
        // Ensure JSONBs are objects
        composition: Object.keys(formData.composition).length > 0 ? formData.composition : null,
        pack_config: formData.pack_config,
        product_images: formData.product_images.length > 0 ? formData.product_images : null,
        documents: formData.documents.length > 0 ? formData.documents : null
      };
      
      if (product) {
        await productsApi.update(product.product_id, dataToSave);
        toast.success('Product updated successfully');
      } else {
        await productsApi.create(dataToSave);
        toast.success('Product created successfully');
      }
      
      if (onSave) {
        onSave();
      }
      
      onClose();
    } catch (err) {
      console.error('Error saving product:', err);
      setError(err.response?.data?.message || 'Failed to save product');
    } finally {
      setIsSaving(false);
    }
  };

  const sections = [
    { id: 'basic', label: 'Basic Information', icon: Package },
    { id: 'classification', label: 'Classification', icon: Tag },
    { id: 'pharma', label: 'Pharmaceutical', icon: Pill },
    { id: 'packaging', label: 'Packaging', icon: Box },
    { id: 'pricing', label: 'Pricing & Tax', icon: DollarSign },
    { id: 'storage', label: 'Storage', icon: Thermometer },
    { id: 'inventory', label: 'Inventory', icon: Database },
    { id: 'status', label: 'Status & Availability', icon: CheckCircle },
    { id: 'search', label: 'Search & Tags', icon: Search },
    { id: 'media', label: 'Media & Documents', icon: Image }
  ];

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl m-4 max-h-[90vh] flex flex-col">
        <form onSubmit={handleSubmit} className="flex flex-col h-full">
          {/* Header */}
          <div className="px-6 py-4 border-b border-gray-200">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold text-gray-900">
                {mode === 'create' ? 'Create Product Master' : mode === 'view' ? 'View Product Master' : 'Edit Product Master'}
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
              {/* Basic Information Section */}
              {activeSection === 'basic' && (
                <div className="space-y-6">
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
                        value={formData.product_name}
                        onChange={(e) => handleInputChange('product_name', e.target.value)}
                        disabled={mode === 'view'}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Product Code <span className="text-red-500">*</span>
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
                      <label className="block text-sm font-medium text-gray-700 mb-1">Brand</label>
                      <input
                        type="text"
                        value={formData.brand}
                        onChange={(e) => handleInputChange('brand', e.target.value)}
                        disabled={mode === 'view'}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Manufacturer</label>
                      <input
                        type="text"
                        value={formData.manufacturer}
                        onChange={(e) => handleInputChange('manufacturer', e.target.value)}
                        disabled={mode === 'view'}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Manufacturer Code</label>
                      <input
                        type="text"
                        value={formData.manufacturer_code}
                        onChange={(e) => handleInputChange('manufacturer_code', e.target.value)}
                        disabled={mode === 'view'}
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
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                    <textarea
                      value={formData.description}
                      onChange={(e) => handleInputChange('description', e.target.value)}
                      disabled={mode === 'view'}
                      rows={4}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
                    />
                  </div>
                </div>
              )}

              {/* Classification Section */}
              {activeSection === 'classification' && (
                <div className="space-y-6">
                  <h3 className="text-lg font-medium text-gray-900 mb-4 flex items-center">
                    <Tag className="w-5 h-5 mr-2" />
                    Classification
                  </h3>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                      <select
                        value={formData.category_id}
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
                        value={formData.product_type}
                        onChange={(e) => handleInputChange('product_type', e.target.value)}
                        disabled={mode === 'view'}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
                      >
                        <option value="">Select Type</option>
                        {productTypes.map(type => (
                          <option key={type} value={type}>{type}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Product Class</label>
                      <select
                        value={formData.product_class}
                        onChange={(e) => handleInputChange('product_class', e.target.value)}
                        disabled={mode === 'view'}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
                      >
                        <option value="">Select Class</option>
                        {productClasses.map(cls => (
                          <option key={cls} value={cls}>{cls}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              )}

              {/* Pharmaceutical Section */}
              {activeSection === 'pharma' && (
                <div className="space-y-6">
                  <h3 className="text-lg font-medium text-gray-900 mb-4 flex items-center">
                    <Pill className="w-5 h-5 mr-2" />
                    Pharmaceutical Details
                  </h3>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Strength</label>
                      <input
                        type="text"
                        value={formData.strength}
                        onChange={(e) => handleInputChange('strength', e.target.value)}
                        disabled={mode === 'view'}
                        placeholder="e.g., 500mg, 10ml"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Drug Schedule</label>
                      <select
                        value={formData.drug_schedule}
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

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Composition</label>
                    <div className="space-y-2">
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={compositionEntry.name}
                          onChange={(e) => setCompositionEntry({...compositionEntry, name: e.target.value})}
                          placeholder="Component name"
                          disabled={mode === 'view'}
                          className="flex-1 px-3 py-2 border border-gray-300 rounded-lg"
                        />
                        <input
                          type="text"
                          value={compositionEntry.quantity}
                          onChange={(e) => setCompositionEntry({...compositionEntry, quantity: e.target.value})}
                          placeholder="Quantity"
                          disabled={mode === 'view'}
                          className="w-32 px-3 py-2 border border-gray-300 rounded-lg"
                        />
                        <input
                          type="text"
                          value={compositionEntry.unit}
                          onChange={(e) => setCompositionEntry({...compositionEntry, unit: e.target.value})}
                          placeholder="Unit"
                          disabled={mode === 'view'}
                          className="w-24 px-3 py-2 border border-gray-300 rounded-lg"
                        />
                        {mode !== 'view' && (
                          <button
                            type="button"
                            onClick={addComposition}
                            className="px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                          >
                            <Plus className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                      
                      {Object.entries(formData.composition).map(([name, details]) => (
                        <div key={name} className="flex items-center justify-between bg-gray-50 px-3 py-2 rounded">
                          <span>{name}: {details.quantity} {details.unit}</span>
                          {mode !== 'view' && (
                            <button
                              type="button"
                              onClick={() => removeComposition(name)}
                              className="text-red-600 hover:text-red-700"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-3">
                    <label className="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        checked={formData.requires_prescription}
                        onChange={(e) => handleInputChange('requires_prescription', e.target.checked)}
                        disabled={mode === 'view'}
                        className="rounded border-gray-300"
                      />
                      <span className="text-sm text-gray-700">Requires Prescription</span>
                    </label>

                    <label className="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        checked={formData.is_narcotic}
                        onChange={(e) => handleInputChange('is_narcotic', e.target.checked)}
                        disabled={mode === 'view'}
                        className="rounded border-gray-300"
                      />
                      <span className="text-sm text-gray-700">Is Narcotic</span>
                      {formData.is_narcotic && <AlertTriangle className="w-4 h-4 text-orange-500" />}
                    </label>

                    <label className="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        checked={formData.is_controlled_substance}
                        onChange={(e) => handleInputChange('is_controlled_substance', e.target.checked)}
                        disabled={mode === 'view'}
                        className="rounded border-gray-300"
                      />
                      <span className="text-sm text-gray-700">Is Controlled Substance</span>
                      {formData.is_controlled_substance && <Shield className="w-4 h-4 text-red-500" />}
                    </label>
                  </div>
                </div>
              )}

              {/* Packaging Section */}
              {activeSection === 'packaging' && (
                <div className="space-y-6">
                  <h3 className="text-lg font-medium text-gray-900 mb-4 flex items-center">
                    <Box className="w-5 h-5 mr-2" />
                    Packaging Configuration
                  </h3>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Base Unit</label>
                      <select
                        value={formData.pack_config.base_unit}
                        onChange={(e) => handleInputChange('base_unit', e.target.value, 'pack_config')}
                        disabled={mode === 'view'}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
                      >
                        <option value="">Select Unit</option>
                        {uomList.map(uom => (
                          <option key={uom.uom_id} value={uom.uom_code}>
                            {uom.uom_name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Units per Pack</label>
                      <input
                        type="number"
                        value={formData.pack_config.base_units_per_pack}
                        onChange={(e) => handleInputChange('base_units_per_pack', parseInt(e.target.value) || 1, 'pack_config')}
                        disabled={mode === 'view'}
                        min={1}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Pack UOM</label>
                      <input
                        type="text"
                        value={formData.pack_config.pack_uom}
                        onChange={(e) => handleInputChange('pack_uom', e.target.value, 'pack_config')}
                        disabled={mode === 'view'}
                        placeholder="e.g., Strip, Bottle"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Packs per Box</label>
                      <input
                        type="number"
                        value={formData.pack_config.packs_per_box}
                        onChange={(e) => handleInputChange('packs_per_box', parseInt(e.target.value) || 1, 'pack_config')}
                        disabled={mode === 'view'}
                        min={1}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Box UOM</label>
                      <input
                        type="text"
                        value={formData.pack_config.box_uom}
                        onChange={(e) => handleInputChange('box_uom', e.target.value, 'pack_config')}
                        disabled={mode === 'view'}
                        placeholder="e.g., Box"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Boxes per Case</label>
                      <input
                        type="number"
                        value={formData.pack_config.boxes_per_case}
                        onChange={(e) => handleInputChange('boxes_per_case', parseInt(e.target.value) || 1, 'pack_config')}
                        disabled={mode === 'view'}
                        min={1}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Pricing & Tax Section */}
              {activeSection === 'pricing' && (
                <div className="space-y-6">
                  <h3 className="text-lg font-medium text-gray-900 mb-4 flex items-center">
                    <DollarSign className="w-5 h-5 mr-2" />
                    Pricing & Taxation
                  </h3>
                  
                  <div className="grid grid-cols-2 gap-4">
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
                      <label className="block text-sm font-medium text-gray-700 mb-1">GST Rate (%)</label>
                      <select
                        value={formData.gst_percentage}
                        onChange={(e) => handleInputChange('gst_percentage', parseFloat(e.target.value))}
                        disabled={mode === 'view'}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
                      >
                        {gstRates.map(rate => (
                          <option key={rate.value} value={rate.value}>{rate.label}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">CESS (%)</label>
                      <input
                        type="number"
                        value={formData.cess_percentage}
                        onChange={(e) => handleInputChange('cess_percentage', parseFloat(e.target.value) || 0)}
                        disabled={mode === 'view'}
                        min={0}
                        max={100}
                        step={0.01}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
                      />
                    </div>
                  </div>

                  {/* Price Analysis */}
                  {formData.mrp > 0 && formData.purchase_price > 0 && (
                    <div className="bg-gray-50 p-4 rounded-lg">
                      <h4 className="text-sm font-medium text-gray-700 mb-2">Price Analysis</h4>
                      <div className="grid grid-cols-3 gap-4 text-sm">
                        <div>
                          <span className="text-gray-500">Margin:</span>
                          <span className="ml-2 font-medium">
                            {((formData.sale_price - formData.purchase_price) / formData.purchase_price * 100).toFixed(2)}%
                          </span>
                        </div>
                        <div>
                          <span className="text-gray-500">Discount from MRP:</span>
                          <span className="ml-2 font-medium">
                            {((formData.mrp - formData.sale_price) / formData.mrp * 100).toFixed(2)}%
                          </span>
                        </div>
                        <div>
                          <span className="text-gray-500">Total Tax:</span>
                          <span className="ml-2 font-medium">
                            {(formData.gst_percentage + formData.cess_percentage).toFixed(2)}%
                          </span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Storage Section */}
              {activeSection === 'storage' && (
                <div className="space-y-6">
                  <h3 className="text-lg font-medium text-gray-900 mb-4 flex items-center">
                    <Thermometer className="w-5 h-5 mr-2" />
                    Storage & Handling
                  </h3>
                  
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Storage Conditions</label>
                      <input
                        type="text"
                        value={formData.storage_conditions}
                        onChange={(e) => handleInputChange('storage_conditions', e.target.value)}
                        disabled={mode === 'view'}
                        placeholder="e.g., Cool and dry place, Below 25°C"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Storage Instructions</label>
                      <textarea
                        value={formData.storage_instructions}
                        onChange={(e) => handleInputChange('storage_instructions', e.target.value)}
                        disabled={mode === 'view'}
                        rows={3}
                        placeholder="Detailed storage and handling instructions..."
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
                      />
                    </div>

                    <div>
                      <label className="flex items-center space-x-2 mb-3">
                        <input
                          type="checkbox"
                          checked={formData.requires_cold_chain}
                          onChange={(e) => handleInputChange('requires_cold_chain', e.target.checked)}
                          disabled={mode === 'view'}
                          className="rounded border-gray-300"
                        />
                        <span className="text-sm text-gray-700">Requires Cold Chain</span>
                        <Thermometer className="w-4 h-4 text-blue-500" />
                      </label>

                      {formData.requires_cold_chain && (
                        <div className="grid grid-cols-3 gap-4 ml-6">
                          <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">Min Temp</label>
                            <input
                              type="number"
                              value={formData.temperature_range.min}
                              onChange={(e) => handleInputChange('min', parseFloat(e.target.value), 'temperature_range')}
                              disabled={mode === 'view'}
                              className="w-full px-2 py-1 border border-gray-300 rounded"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">Max Temp</label>
                            <input
                              type="number"
                              value={formData.temperature_range.max}
                              onChange={(e) => handleInputChange('max', parseFloat(e.target.value), 'temperature_range')}
                              disabled={mode === 'view'}
                              className="w-full px-2 py-1 border border-gray-300 rounded"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1">Unit</label>
                            <select
                              value={formData.temperature_range.unit}
                              onChange={(e) => handleInputChange('unit', e.target.value, 'temperature_range')}
                              disabled={mode === 'view'}
                              className="w-full px-2 py-1 border border-gray-300 rounded"
                            >
                              <option value="C">°C</option>
                              <option value="F">°F</option>
                            </select>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Inventory Section */}
              {activeSection === 'inventory' && (
                <div className="space-y-6">
                  <h3 className="text-lg font-medium text-gray-900 mb-4 flex items-center">
                    <Database className="w-5 h-5 mr-2" />
                    Inventory Management
                  </h3>
                  
                  <div className="space-y-4">
                    <div className="grid grid-cols-3 gap-4">
                      <label className="flex items-center space-x-2">
                        <input
                          type="checkbox"
                          checked={formData.maintain_batch}
                          onChange={(e) => handleInputChange('maintain_batch', e.target.checked)}
                          disabled={mode === 'view'}
                          className="rounded border-gray-300"
                        />
                        <span className="text-sm text-gray-700">Maintain Batch</span>
                      </label>

                      <label className="flex items-center space-x-2">
                        <input
                          type="checkbox"
                          checked={formData.maintain_expiry}
                          onChange={(e) => handleInputChange('maintain_expiry', e.target.checked)}
                          disabled={mode === 'view'}
                          className="rounded border-gray-300"
                        />
                        <span className="text-sm text-gray-700">Maintain Expiry</span>
                      </label>

                      <label className="flex items-center space-x-2">
                        <input
                          type="checkbox"
                          checked={formData.allow_negative_stock}
                          onChange={(e) => handleInputChange('allow_negative_stock', e.target.checked)}
                          disabled={mode === 'view'}
                          className="rounded border-gray-300"
                        />
                        <span className="text-sm text-gray-700">Allow Negative Stock</span>
                      </label>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
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
                        <label className="block text-sm font-medium text-gray-700 mb-1">Reorder Level</label>
                        <input
                          type="number"
                          value={formData.reorder_level}
                          onChange={(e) => handleInputChange('reorder_level', parseInt(e.target.value) || 0)}
                          disabled={mode === 'view'}
                          min={0}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Reorder Quantity</label>
                        <input
                          type="number"
                          value={formData.reorder_quantity}
                          onChange={(e) => handleInputChange('reorder_quantity', parseInt(e.target.value) || 0)}
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

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">Critical Stock Level</label>
                        <input
                          type="number"
                          value={formData.critical_stock_level}
                          onChange={(e) => handleInputChange('critical_stock_level', parseInt(e.target.value) || 0)}
                          disabled={mode === 'view'}
                          min={0}
                          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Status Section */}
              {activeSection === 'status' && (
                <div className="space-y-6">
                  <h3 className="text-lg font-medium text-gray-900 mb-4 flex items-center">
                    <CheckCircle className="w-5 h-5 mr-2" />
                    Status & Availability
                  </h3>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Product Status</label>
                      <select
                        value={formData.product_status}
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

                    <div className="space-y-2">
                      <label className="flex items-center space-x-2">
                        <input
                          type="checkbox"
                          checked={formData.is_active}
                          onChange={(e) => handleInputChange('is_active', e.target.checked)}
                          disabled={mode === 'view'}
                          className="rounded border-gray-300"
                        />
                        <span className="text-sm text-gray-700">Is Active</span>
                      </label>

                      <label className="flex items-center space-x-2">
                        <input
                          type="checkbox"
                          checked={formData.is_saleable}
                          onChange={(e) => handleInputChange('is_saleable', e.target.checked)}
                          disabled={mode === 'view'}
                          className="rounded border-gray-300"
                        />
                        <span className="text-sm text-gray-700">Is Saleable</span>
                      </label>

                      <label className="flex items-center space-x-2">
                        <input
                          type="checkbox"
                          checked={formData.is_purchasable}
                          onChange={(e) => handleInputChange('is_purchasable', e.target.checked)}
                          disabled={mode === 'view'}
                          className="rounded border-gray-300"
                        />
                        <span className="text-sm text-gray-700">Is Purchasable</span>
                      </label>
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Launch Date</label>
                      <input
                        type="date"
                        value={formData.launch_date}
                        onChange={(e) => handleInputChange('launch_date', e.target.value)}
                        disabled={mode === 'view'}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Discontinuation Date</label>
                      <input
                        type="date"
                        value={formData.discontinuation_date}
                        onChange={(e) => handleInputChange('discontinuation_date', e.target.value)}
                        disabled={mode === 'view'}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Search & Tags Section */}
              {activeSection === 'search' && (
                <div className="space-y-6">
                  <h3 className="text-lg font-medium text-gray-900 mb-4 flex items-center">
                    <Search className="w-5 h-5 mr-2" />
                    Search & Tags
                  </h3>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Search Keywords</label>
                    <div className="flex gap-2 mb-2">
                      <input
                        type="text"
                        value={newKeyword}
                        onChange={(e) => setNewKeyword(e.target.value)}
                        onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addKeyword())}
                        disabled={mode === 'view'}
                        placeholder="Add search keyword..."
                        className="flex-1 px-3 py-2 border border-gray-300 rounded-lg"
                      />
                      {mode !== 'view' && (
                        <button
                          type="button"
                          onClick={addKeyword}
                          className="px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                        >
                          Add
                        </button>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {formData.search_keywords.map(keyword => (
                        <span key={keyword} className="inline-flex items-center px-3 py-1 rounded-full text-sm bg-blue-100 text-blue-700">
                          {keyword}
                          {mode !== 'view' && (
                            <button
                              type="button"
                              onClick={() => removeKeyword(keyword)}
                              className="ml-2 text-blue-500 hover:text-blue-700"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          )}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Tags</label>
                    <div className="flex gap-2 mb-2">
                      <input
                        type="text"
                        value={newTag}
                        onChange={(e) => setNewTag(e.target.value)}
                        onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addTag())}
                        disabled={mode === 'view'}
                        placeholder="Add tag..."
                        className="flex-1 px-3 py-2 border border-gray-300 rounded-lg"
                      />
                      {mode !== 'view' && (
                        <button
                          type="button"
                          onClick={addTag}
                          className="px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
                        >
                          Add
                        </button>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {formData.tags.map(tag => (
                        <span key={tag} className="inline-flex items-center px-3 py-1 rounded-full text-sm bg-green-100 text-green-700">
                          {tag}
                          {mode !== 'view' && (
                            <button
                              type="button"
                              onClick={() => removeTag(tag)}
                              className="ml-2 text-green-500 hover:text-green-700"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          )}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Media Section */}
              {activeSection === 'media' && (
                <div className="space-y-6">
                  <h3 className="text-lg font-medium text-gray-900 mb-4 flex items-center">
                    <Image className="w-5 h-5 mr-2" />
                    Media & Documents
                  </h3>
                  
                  <div className="text-center py-8 border-2 border-dashed border-gray-300 rounded-lg">
                    <Image className="w-12 h-12 mx-auto mb-3 text-gray-400" />
                    <p className="text-sm text-gray-600">Media upload functionality coming soon</p>
                    <p className="text-xs text-gray-500 mt-1">Product images and documents can be managed here</p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-between bg-gray-50">
            <div className="text-sm text-gray-500">
              {product ? `Product ID: ${product.product_id}` : 'New Product'}
            </div>
            <div className="flex items-center space-x-3">
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
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center space-x-2 disabled:opacity-50"
                >
                  {isSaving ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Saving...</span>
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4" />
                      <span>{product ? 'Update Product' : 'Create Product'}</span>
                    </>
                  )}
                </button>
              )}
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};

export default ProductMaster;