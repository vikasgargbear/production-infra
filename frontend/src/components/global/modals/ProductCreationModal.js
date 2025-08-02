import React, { useState } from 'react';
import { X, Package, Pill, Building2, Hash, Percent, IndianRupee } from 'lucide-react';
import { productsApi } from '../../../services/api';
import PackTypeSelector from '../PackTypeSelector';
import MonthYearPicker from '../MonthYearPicker';

const ProductCreationModal = ({ 
  show, 
  onClose, 
  onProductCreated,
  initialProductName = '' 
}) => {
  const [newProduct, setNewProduct] = useState({
    product_name: initialProductName,
    product_code: '',
    manufacturer: '',
    hsn_code: '',
    gst_percent: 12,
    mrp: '',
    sale_price: '',
    category: '',
    batch_number: '',
    mfg_date: '',
    expiry_date: '',
    quantity_available: '',
    cost_price: '',
    salt_composition: ''
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

  // Update product name when modal opens with initialProductName
  React.useEffect(() => {
    if (show && initialProductName) {
      setNewProduct(prev => ({
        ...prev,
        product_name: initialProductName
      }));
    }
  }, [show, initialProductName]);

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

      // Create product
      const productData = {
        org_id: '12de5e22-eee7-4d25-b3a7-d16d01c6170f',
        product_name: newProduct.product_name,
        product_code: newProduct.product_code || `PRD${Date.now().toString().slice(-6)}`,
        manufacturer: newProduct.manufacturer,
        hsn_code: newProduct.hsn_code,
        gst_percent: parseFloat(newProduct.gst_percent),
        mrp: parseFloat(newProduct.mrp),
        sale_price: parseFloat(newProduct.sale_price),
        category: newProduct.category || 'Other',
        salt_composition: newProduct.salt_composition || null,
        quantity_received: parseInt(newProduct.quantity_available) || 0,
        cost_price: parseFloat(newProduct.cost_price) || 0,
        expiry_date: formatDateForAPI(newProduct.expiry_date),
        
        // Unit configuration
        base_unit: newProduct.category === 'Tablet' ? 'Tablet' : 
                   newProduct.category === 'Capsule' ? 'Capsule' :
                   newProduct.category === 'Syrup' ? 'ML' :
                   newProduct.category === 'Injection' ? 'ML' :
                   newProduct.category === 'Cream' ? 'Gm' :
                   newProduct.category === 'Drops' ? 'ML' :
                   newProduct.category === 'Powder' ? 'Gm' : 'Unit',
        sale_unit: packConfig.sale_unit || 'Unit',
        
        // Pack configuration - new clear structure
        pack_input: packConfig.pack_type_input || (packConfig.use_boxes 
          ? `${packConfig.qty_per_strip}*${packConfig.strips_per_box}` 
          : `${packConfig.qty_per_strip}`), // User's raw input
        
        // For units with suffix (ML, GM), qty_per_strip is the size, strips_per_box is the count
        // For tablets without suffix, qty_per_strip is qty per strip, strips_per_box is strips per box
        pack_quantity: packConfig.pack_unit 
          ? parseInt(packConfig.strips_per_box) || 1  // Number of containers for ML/GM
          : parseInt(packConfig.qty_per_strip) || 1,  // Qty per strip for tablets
        
        pack_multiplier: packConfig.pack_unit
          ? parseInt(packConfig.pack_size) || parseInt(packConfig.qty_per_strip) // Size per container for ML/GM
          : (packConfig.use_boxes ? parseInt(packConfig.strips_per_box) : null), // Strips per box for tablets
          
        pack_unit_type: packConfig.pack_unit || null, // Unit suffix
        
        // Structured fields
        unit_count: packConfig.pack_unit
          ? parseInt(packConfig.pack_size) || parseInt(packConfig.qty_per_strip) // Size for ML/GM products
          : parseInt(packConfig.qty_per_strip) || 1, // Qty per strip for tablets
          
        unit_measurement: packConfig.pack_unit && packConfig.pack_size 
          ? `${packConfig.pack_size}${packConfig.pack_unit}` 
          : null,
          
        packages_per_box: packConfig.pack_unit
          ? parseInt(packConfig.strips_per_box) // Number of bottles/sachets
          : (packConfig.use_boxes ? parseInt(packConfig.strips_per_box) : null), // Strips per box
        
        // Legacy fields for backward compatibility (remove once backend is updated)
        pack_type: packConfig.pack_type_input || (packConfig.use_boxes 
          ? `${packConfig.qty_per_strip}*${packConfig.strips_per_box}` 
          : `${packConfig.qty_per_strip}`),
        pack_size: packConfig.pack_type_input || (packConfig.use_boxes 
          ? `${packConfig.qty_per_strip}*${packConfig.strips_per_box}` 
          : `${packConfig.qty_per_strip}`)
      };

      console.log('Pack Config state:', packConfig);
      console.log('Pack fields being sent:');
      console.log('  pack_input:', productData.pack_input);
      console.log('  pack_quantity:', productData.pack_quantity);
      console.log('  pack_multiplier:', productData.pack_multiplier);
      console.log('  pack_unit_type:', productData.pack_unit_type);
      console.log('Sending product data to API:', productData);
      console.log('Products API:', productsApi);
      
      // Ensure pack fields are properly typed before sending
      const apiData = {
        ...productData,
        // Make sure ALL pack fields are included
        pack_input: productData.pack_input,
        pack_quantity: productData.pack_quantity ? parseInt(productData.pack_quantity) : null,
        pack_multiplier: productData.pack_multiplier ? parseInt(productData.pack_multiplier) : null,
        pack_unit_type: productData.pack_unit_type,
        unit_count: productData.unit_count ? parseInt(productData.unit_count) : null,
        unit_measurement: productData.unit_measurement,
        packages_per_box: productData.packages_per_box ? parseInt(productData.packages_per_box) : null
      };
      
      const productResponse = await productsApi.create(apiData);
      console.log('Product creation response:', productResponse);
      
      if (productResponse.data) {
        // Always create a batch (auto-generate batch number if not provided)
        const batchNumber = newProduct.batch_number || `BATCH${Date.now().toString().slice(-8)}`;
        const batchData = {
          org_id: '12de5e22-eee7-4d25-b3a7-d16d01c6170f',
          product_id: productResponse.data.product_id,
          batch_number: batchNumber,
          mfg_date: formatDateForAPI(newProduct.mfg_date),
          expiry_date: formatDateForAPI(newProduct.expiry_date),
          quantity_available: parseInt(newProduct.quantity_available) || 0,
          mrp: parseFloat(newProduct.mrp),
          sale_price: parseFloat(newProduct.sale_price)
        };

        // Note: Batch creation will be handled by the backend or as a separate feature
        // await api.batches.create(batchData);
        
        // Return product with batch info
        const createdProduct = {
          ...productResponse.data,
          batch_number: batchNumber,
          mfg_date: newProduct.mfg_date, // Keep MM/YY format for frontend
          expiry_date: newProduct.expiry_date, // Keep MM/YY format for frontend
          available_quantity: parseInt(newProduct.quantity_available) || 0,
          quantity: 1,
          // Include pack configuration for frontend use
          pack_config: packConfig,
          base_unit: packConfig.base_unit,
          sale_unit: packConfig.sale_unit,
          qty_per_strip: packConfig.qty_per_strip,
          strips_per_box: packConfig.use_boxes ? packConfig.strips_per_box : null
        };
        
        onProductCreated(createdProduct);
        
        // Reset form
        setNewProduct({
          product_name: '',
          product_code: '',
          manufacturer: '',
          hsn_code: '',
          gst_percent: 12,
          mrp: '',
          sale_price: '',
          category: '',
          batch_number: '',
          mfg_date: '',
          expiry_date: '',
          quantity_available: '',
          cost_price: '',
          salt_composition: ''
        });
        
        setPackConfig({
          sale_unit: '', 
          qty_per_strip: 10,
          strips_per_box: 10,
          use_boxes: true,
          pack_type_input: '',
          pack_size: null,
          pack_unit: null
        });
        
        onClose();
      }
    } catch (error) {
      console.error('Error saving product:', error);
      console.error('Error response:', error.response);
      console.error('Error data:', error.response?.data);
      
      let errorMessages = [];
      
      if (error.response?.data?.detail) {
        if (Array.isArray(error.response.data.detail)) {
          errorMessages = error.response.data.detail.map(err => 
            `${err.loc?.join('.')} - ${err.msg}`
          );
        } else {
          errorMessages = [error.response.data.detail];
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
    } finally {
      setSaving(false);
    }
  };

  if (!show) return null;

  return (
    <div className="fixed inset-0 bg-black/30 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-5xl mx-4 max-h-[90vh] overflow-hidden transform transition-all animate-slide-up">
        {/* Header */}
        <div className="bg-gradient-to-r from-gray-50 to-white px-8 py-6 border-b border-gray-100">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
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
                  <select
                    value={newProduct.category}
                    onChange={(e) => setNewProduct({ ...newProduct, category: e.target.value })}
                    className="w-full px-3 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-green-500 focus:border-transparent transition-all"
                  >
                    <option value="">Select Category</option>
                    <option value="Tablet">Tablet</option>
                    <option value="Capsule">Capsule</option>
                    <option value="Syrup">Syrup</option>
                    <option value="Injection">Injection</option>
                    <option value="Cream">Cream</option>
                    <option value="Drops">Drops</option>
                    <option value="Powder">Powder</option>
                    <option value="Other">Other</option>
                  </select>
                </div>

                <div className="md:col-span-3">
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