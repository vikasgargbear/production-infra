import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Plus, Search, Edit, Trash2, Package, Loader2 } from 'lucide-react';
import api from '../services/api';
import { productsApi } from '../services/api';

// Define the Products component with uncontrolled inputs for better typing performance
const Products = () => {
  const [products, setProducts] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(10);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  // Fetch products from API
  const fetchProducts = useCallback(async () => {
    try {
      setLoading(true);
      const response = await api.get('/products/');
      setProducts(response.data || []);
    } catch (err) {
      console.error("Error fetching products:", err);
      setError("Failed to load products. Please refresh the page.");
      setProducts([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  // Filter products based on search term
  const filteredProducts = products.filter(product => {
    const searchLower = searchTerm.toLowerCase();
    return (
      product.product_name.toLowerCase().includes(searchLower) ||
      (product.category && product.category.toLowerCase().includes(searchLower)) ||
      (product.manufacturer && product.manufacturer.toLowerCase().includes(searchLower))
    );
  });

  // Pagination
  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginatedProducts = filteredProducts.slice(startIndex, startIndex + itemsPerPage);

  const totalPages = Math.ceil(filteredProducts.length / itemsPerPage);

  // Using uncontrolled components with refs instead of controlled components
  // This approach is used by production applications like AWS, Zomato, and Google Forms
  const formRef = useRef(null);

  // Search handler
  const handleSearchChange = (e) => {
    setSearchTerm(e.target.value);
    setCurrentPage(1); // Reset to first page when searching
  };

  const handleSubmit = useCallback(async (e) => {
    e.preventDefault();
    
    if (submitting) return; // Prevent double submission

    setSubmitting(true);
    setError("");
    
    try {
      // Get form data directly from the form element
      const form = e.target;
      const formData = new FormData(form);
      const productData = {};
      
      // Convert FormData to a regular object
      for (let [key, value] of formData.entries()) {
        // Skip empty values
        if (value === '') continue;
        
        // Convert numeric fields to numbers
        if (['gst_percent', 'cgst_percent', 'sgst_percent', 'igst_percent', 'mrp', 'sale_price'].includes(key) && value !== '') {
          productData[key] = parseFloat(value);
        } else {
          productData[key] = value;
        }
      }
      
      // Ensure required fields are present
      if (!productData.product_name) {
        throw new Error('Product name is required');
      }
      
      console.log('Saving product with data:', productData);

      try {
        if (editingProduct) {
          // Use API service instead of direct axios calls
          console.log('Updating product with data:', productData);
          const response = await api.put(`/products/${editingProduct.product_id}`, productData);
          console.log('Update response:', response.data);
        } else {
          // Use API service instead of direct axios calls
          console.log('Creating product with data:', productData);
          const response = await api.post('/products/', productData);
          console.log('Create response:', response.data);
        }
      } catch (error) {
        console.error('API Error details:', error.response?.data || error.message);
        throw error; // Re-throw to be caught by the outer try/catch
      }

      // Reset form and close modal
      form.reset();
      setShowAddModal(false);
      setEditingProduct(null);
      
      // Refresh the products list
      await fetchProducts();
    } catch (err) {
      console.error("Error saving product:", err);
      setError("Failed to save product. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }, [editingProduct, fetchProducts, submitting]);

  const handleEdit = useCallback((product) => {
    setEditingProduct(product);
    setShowAddModal(true);
  }, []);

  const handleDelete = useCallback(async (productId) => {
    // Show a confirmation dialog with more details
    if (window.confirm("Are you sure you want to delete this product? This action cannot be undone.")) {
      try {
        setLoading(true);
        // Use the centralized API service instead of productsApi
        await api.delete(`/products/${productId}`);
        console.log('Product deleted successfully');
        await fetchProducts(); // Refresh the products list
      } catch (err) {
        console.error("Error deleting product:", err);
        setError("Failed to delete product. Please try again.");
      } finally {
        setLoading(false);
      }
    }
  }, [fetchProducts]);

  const handleModalClose = useCallback(() => {
    setShowAddModal(false);
    setEditingProduct(null);
  }, []);

  // Product Modal Component - using uncontrolled inputs like AWS, Zomato, and Google Forms
  const ProductModal = () => {
    // Use a ref for the form to access it directly
    const formRef = useRef(null);
    
    // When editing a product, populate the form fields after the component mounts
    useEffect(() => {
      if (editingProduct && formRef.current) {
        const form = formRef.current;
        
        // Set initial values for all fields when editing
        // Basic Information
        if (editingProduct.product_name) form.product_name.value = editingProduct.product_name;
        if (editingProduct.category) form.category.value = editingProduct.category;
        if (editingProduct.manufacturer) form.manufacturer.value = editingProduct.manufacturer;
        if (editingProduct.product_type) form.product_type.value = editingProduct.product_type;
        if (editingProduct.hsn_code) form.hsn_code.value = editingProduct.hsn_code;
        if (editingProduct.generic_name) form.generic_name.value = editingProduct.generic_name;
        
        // Pricing Information
        if (editingProduct.gst_percent) form.gst_percent.value = editingProduct.gst_percent;
        if (editingProduct.cgst_percent) form.cgst_percent.value = editingProduct.cgst_percent;
        if (editingProduct.sgst_percent) form.sgst_percent.value = editingProduct.sgst_percent;
        if (editingProduct.igst_percent) form.igst_percent.value = editingProduct.igst_percent;
        if (editingProduct.mrp) form.mrp.value = editingProduct.mrp;
        if (editingProduct.sale_price) form.sale_price.value = editingProduct.sale_price;
        
        // Pharmaceutical Information
        if (editingProduct.drug_schedule) form.drug_schedule.value = editingProduct.drug_schedule;
        if (editingProduct.requires_prescription) form.requires_prescription.checked = editingProduct.requires_prescription;
        if (editingProduct.controlled_substance) form.controlled_substance.checked = editingProduct.controlled_substance;
        if (editingProduct.composition) form.composition.value = editingProduct.composition;
        if (editingProduct.dosage_instructions) form.dosage_instructions.value = editingProduct.dosage_instructions;
        if (editingProduct.storage_instructions) form.storage_instructions.value = editingProduct.storage_instructions;
        
        // Product Physical Details
        if (editingProduct.packer) form.packer.value = editingProduct.packer;
        if (editingProduct.country_of_origin) form.country_of_origin.value = editingProduct.country_of_origin;
        if (editingProduct.model_number) form.model_number.value = editingProduct.model_number;
        if (editingProduct.dimensions) form.dimensions.value = editingProduct.dimensions;
        if (editingProduct.weight) form.weight.value = editingProduct.weight;
        if (editingProduct.weight_unit) form.weight_unit.value = editingProduct.weight_unit;
        if (editingProduct.pack_quantity) form.pack_quantity.value = editingProduct.pack_quantity;
        if (editingProduct.pack_form) form.pack_form.value = editingProduct.pack_form;
        if (editingProduct.color) form.color.value = editingProduct.color;
        if (editingProduct.asin) form.asin.value = editingProduct.asin;
        if (editingProduct.is_discontinued) form.is_discontinued.checked = editingProduct.is_discontinued;
      }
    }, [editingProduct]);
    
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
        <div className="bg-white rounded-lg shadow-lg max-w-5xl w-full max-h-[90vh] overflow-y-auto transform transition-all">
          <div className="sticky top-0 bg-white border-b border-gray-100 px-6 py-4 rounded-t-lg">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold text-gray-900">
                {editingProduct ? "Edit Product" : "Add New Product"}
              </h2>
              <button
                onClick={handleModalClose}
                className="text-gray-400 hover:text-gray-600 transition-colors p-2 rounded hover:bg-gray-100"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
          
          <form ref={formRef} onSubmit={handleSubmit} className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Basic Product Information */}
              <div className="col-span-2">
                <h3 className="text-lg font-medium text-gray-900 mb-3 border-b pb-2">Basic Information</h3>
              </div>
              
              <div>
                <label htmlFor="product_name" className="block text-sm font-medium text-gray-700 mb-2">
                  Product Name *
                </label>
                <input
                  type="text"
                  id="product_name"
                  name="product_name"
                  required
                  className="w-full px-4 py-3 text-base border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent transition-all"
                />
              </div>

              <div>
                <label htmlFor="category" className="block text-sm font-medium text-gray-700 mb-2">
                  Category
                </label>
                <input
                  type="text"
                  id="category"
                  name="category"
                  className="w-full px-4 py-3 text-base border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent transition-all"
                />
              </div>

              <div>
                <label htmlFor="manufacturer" className="block text-sm font-medium text-gray-700 mb-2">
                  Manufacturer
                </label>
                <input
                  type="text"
                  id="manufacturer"
                  name="manufacturer"
                  className="w-full px-4 py-3 text-base border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent transition-all"
                />
              </div>

              <div>
                <label htmlFor="product_type" className="block text-sm font-medium text-gray-700 mb-2">
                  Product Type
                </label>
                <input
                  type="text"
                  id="product_type"
                  name="product_type"
                  className="w-full px-4 py-3 text-base border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent transition-all"
                />
              </div>

              <div>
                <label htmlFor="hsn_code" className="block text-sm font-medium text-gray-700 mb-2">
                  HSN Code
                </label>
                <input
                  type="text"
                  id="hsn_code"
                  name="hsn_code"
                  className="w-full px-4 py-3 text-base border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent transition-all"
                />
              </div>

              <div>
                <label htmlFor="generic_name" className="block text-sm font-medium text-gray-700 mb-2">
                  Generic Name
                </label>
                <input
                  type="text"
                  id="generic_name"
                  name="generic_name"
                  className="w-full px-4 py-3 text-base border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent transition-all"
                />
              </div>

              {/* Pricing Information */}
              <div className="col-span-2 mt-4">
                <h3 className="text-lg font-medium text-gray-900 mb-3 border-b pb-2">Pricing Information</h3>
              </div>

              <div>
                <label htmlFor="gst_percent" className="block text-sm font-medium text-gray-700 mb-2">
                  GST %
                </label>
                <input
                  type="number"
                  id="gst_percent"
                  name="gst_percent"
                  className="w-full px-4 py-3 text-base border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent transition-all"
                />
              </div>

              <div>
                <label htmlFor="cgst_percent" className="block text-sm font-medium text-gray-700 mb-2">
                  CGST %
                </label>
                <input
                  type="number"
                  id="cgst_percent"
                  name="cgst_percent"
                  className="w-full px-4 py-3 text-base border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent transition-all"
                />
              </div>

              <div>
                <label htmlFor="sgst_percent" className="block text-sm font-medium text-gray-700 mb-2">
                  SGST %
                </label>
                <input
                  type="number"
                  id="sgst_percent"
                  name="sgst_percent"
                  className="w-full px-4 py-3 text-base border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent transition-all"
                />
              </div>

              <div>
                <label htmlFor="igst_percent" className="block text-sm font-medium text-gray-700 mb-2">
                  IGST %
                </label>
                <input
                  type="number"
                  id="igst_percent"
                  name="igst_percent"
                  className="w-full px-4 py-3 text-base border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent transition-all"
                />
              </div>

              <div>
                <label htmlFor="mrp" className="block text-sm font-medium text-gray-700 mb-2">
                  MRP
                </label>
                <input
                  type="number"
                  id="mrp"
                  name="mrp"
                  className="w-full px-4 py-3 text-base border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent transition-all"
                />
              </div>

              <div>
                <label htmlFor="sale_price" className="block text-sm font-medium text-gray-700 mb-2">
                  Sale Price
                </label>
                <input
                  type="number"
                  id="sale_price"
                  name="sale_price"
                  className="w-full px-4 py-3 text-base border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent transition-all"
                />
              </div>
              
              {/* Drug Schedule Information */}
              <div className="col-span-2 mt-4">
                <h3 className="text-lg font-medium text-gray-900 mb-3 border-b pb-2">Pharmaceutical Information</h3>
              </div>
              
              <div>
                <label htmlFor="drug_schedule" className="block text-sm font-medium text-gray-700 mb-2">
                  Drug Schedule
                </label>
                <select
                  id="drug_schedule"
                  name="drug_schedule"
                  className="w-full px-4 py-3 text-base border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent transition-all"
                >
                  <option value="">Select Schedule</option>
                  <option value="G">Schedule G</option>
                  <option value="H">Schedule H</option>
                  <option value="H1">Schedule H1</option>
                  <option value="X">Schedule X</option>
                  <option value="OTC">OTC (No Schedule)</option>
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Requires Prescription
                </label>
                <div className="flex items-center mt-2">
                  <input
                    type="checkbox"
                    id="requires_prescription"
                    name="requires_prescription"
                    className="h-5 w-5 text-red-600 focus:ring-red-500 border-gray-300 rounded"
                  />
                  <label htmlFor="requires_prescription" className="ml-2 block text-sm text-gray-700">
                    Yes, prescription required
                  </label>
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Controlled Substance
                </label>
                <div className="flex items-center mt-2">
                  <input
                    type="checkbox"
                    id="controlled_substance"
                    name="controlled_substance"
                    className="h-5 w-5 text-red-600 focus:ring-red-500 border-gray-300 rounded"
                  />
                  <label htmlFor="controlled_substance" className="ml-2 block text-sm text-gray-700">
                    Yes, this is a controlled substance
                  </label>
                </div>
              </div>
              
              <div>
                <label htmlFor="composition" className="block text-sm font-medium text-gray-700 mb-2">
                  Composition
                </label>
                <textarea
                  id="composition"
                  name="composition"
                  rows="3"
                  className="w-full px-4 py-3 text-base border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent transition-all"
                  placeholder="E.g., Each tablet contains: Paracetamol IP 500mg"
                ></textarea>
              </div>
              
              <div>
                <label htmlFor="dosage_instructions" className="block text-sm font-medium text-gray-700 mb-2">
                  Dosage Instructions
                </label>
                <textarea
                  id="dosage_instructions"
                  name="dosage_instructions"
                  rows="3"
                  className="w-full px-4 py-3 text-base border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent transition-all"
                  placeholder="E.g., As directed by the physician"
                ></textarea>
              </div>
              
              <div>
                <label htmlFor="storage_instructions" className="block text-sm font-medium text-gray-700 mb-2">
                  Storage Instructions
                </label>
                <input
                  type="text"
                  id="storage_instructions"
                  name="storage_instructions"
                  className="w-full px-4 py-3 text-base border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent transition-all"
                  placeholder="E.g., Store below 30°C in a dry place"
                />
              </div>
              
              {/* Product Physical Details */}
              <div className="col-span-2 mt-4">
                <h3 className="text-lg font-medium text-gray-900 mb-3 border-b pb-2">Product Physical Details</h3>
              </div>
              
              <div>
                <label htmlFor="packer" className="block text-sm font-medium text-gray-700 mb-2">
                  Packer
                </label>
                <input
                  type="text"
                  id="packer"
                  name="packer"
                  className="w-full px-4 py-3 text-base border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent transition-all"
                />
              </div>
              
              <div>
                <label htmlFor="country_of_origin" className="block text-sm font-medium text-gray-700 mb-2">
                  Country of Origin
                </label>
                <input
                  type="text"
                  id="country_of_origin"
                  name="country_of_origin"
                  className="w-full px-4 py-3 text-base border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent transition-all"
                  defaultValue="India"
                />
              </div>
              
              <div>
                <label htmlFor="model_number" className="block text-sm font-medium text-gray-700 mb-2">
                  Model Number
                </label>
                <input
                  type="text"
                  id="model_number"
                  name="model_number"
                  className="w-full px-4 py-3 text-base border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent transition-all"
                />
              </div>
              
              <div>
                <label htmlFor="dimensions" className="block text-sm font-medium text-gray-700 mb-2">
                  Dimensions
                </label>
                <input
                  type="text"
                  id="dimensions"
                  name="dimensions"
                  className="w-full px-4 py-3 text-base border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent transition-all"
                  placeholder="E.g., 15 x 5 x 1 cm"
                />
              </div>
              
              <div>
                <label htmlFor="weight" className="block text-sm font-medium text-gray-700 mb-2">
                  Weight
                </label>
                <div className="flex">
                  <input
                    type="number"
                    id="weight"
                    name="weight"
                    className="w-full px-4 py-3 text-base border border-gray-300 rounded-l-md focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent transition-all"
                  />
                  <select
                    id="weight_unit"
                    name="weight_unit"
                    className="px-4 py-3 text-base border border-gray-300 rounded-r-md focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent transition-all"
                  >
                    <option value="g">g</option>
                    <option value="kg">kg</option>
                    <option value="mg">mg</option>
                  </select>
                </div>
              </div>
              
              <div>
                <label htmlFor="pack_quantity" className="block text-sm font-medium text-gray-700 mb-2">
                  Pack Quantity
                </label>
                <input
                  type="number"
                  id="pack_quantity"
                  name="pack_quantity"
                  className="w-full px-4 py-3 text-base border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent transition-all"
                />
              </div>
              
              <div>
                <label htmlFor="pack_form" className="block text-sm font-medium text-gray-700 mb-2">
                  Pack Form
                </label>
                <input
                  type="text"
                  id="pack_form"
                  name="pack_form"
                  className="w-full px-4 py-3 text-base border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent transition-all"
                  placeholder="E.g., Tablets, Capsules, Syrup"
                />
              </div>
              
              <div>
                <label htmlFor="color" className="block text-sm font-medium text-gray-700 mb-2">
                  Color
                </label>
                <input
                  type="text"
                  id="color"
                  name="color"
                  className="w-full px-4 py-3 text-base border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent transition-all"
                />
              </div>
              
              <div>
                <label htmlFor="asin" className="block text-sm font-medium text-gray-700 mb-2">
                  ASIN
                </label>
                <input
                  type="text"
                  id="asin"
                  name="asin"
                  className="w-full px-4 py-3 text-base border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent transition-all"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Discontinued
                </label>
                <div className="flex items-center mt-2">
                  <input
                    type="checkbox"
                    id="is_discontinued"
                    name="is_discontinued"
                    className="h-5 w-5 text-red-600 focus:ring-red-500 border-gray-300 rounded"
                  />
                  <label htmlFor="is_discontinued" className="ml-2 block text-sm text-gray-700">
                    Yes, this product is discontinued
                  </label>
                </div>
              </div>
            </div>
            
            <div className="mt-8 flex justify-end">
              <button
                type="button"
                onClick={handleModalClose}
                className="mr-4 px-6 py-3 text-base font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 transition-all"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="px-6 py-3 text-base font-medium text-white bg-red-600 rounded-md hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-red-500 focus:ring-offset-2 transition-all flex items-center"
              >
                {submitting ? (
                  <>
                    <Loader2 className="animate-spin -ml-1 mr-2 h-5 w-5 text-white" />
                    Saving...
                  </>
                ) : (
                  <>Save Product</>
                )}
              </button>
            </div>
            {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
          </form>
        </div>
      </div>
    );
  }
  
  return (
    <div className="min-h-screen bg-gray-50 p-4">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-white shadow-sm">
        <div className="px-6 py-4 flex items-center justify-between">
          <h1 className="text-2xl font-bold text-gray-900">Products</h1>
          <button
            onClick={() => setShowAddModal(true)}
            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
          >
            <Plus className="h-5 w-5 mr-2" />
            Add Product
          </button>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="px-6 py-4">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between">
          <div className="relative w-full md:w-64 mb-4 md:mb-0">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search className="h-5 w-5 text-gray-400" />
            </div>
            <input
              type="text"
              placeholder="Search products..."
              value={searchTerm}
              onChange={handleSearchChange}
              className="pl-10 pr-4 py-2 w-full border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
            />
          </div>
        </div>
      </div>

      <div className="px-6 py-4">
        {loading ? (
          <div className="flex justify-center items-center h-64">
            <Loader2 className="h-8 w-8 text-red-600 animate-spin" />
          </div>
        ) : error ? (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded relative" role="alert">
            <span className="block sm:inline">{error}</span>
          </div>
        ) : (
          <>
            {/* Products Table */}
            <div className="bg-white shadow overflow-hidden sm:rounded-md">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Product
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Category
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Manufacturer
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Sale Price
                    </th>
                    <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {paginatedProducts.length > 0 ? (
                    paginatedProducts.map((product) => (
                      <tr key={product.product_id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex items-center">
                            <div className="flex-shrink-0 h-10 w-10 bg-gray-100 rounded-full flex items-center justify-center">
                              <Package className="h-5 w-5 text-gray-500" />
                            </div>
                            <div className="ml-4">
                              <div className="text-sm font-medium text-gray-900">{product.product_name}</div>
                              <div className="text-sm text-gray-500">{product.product_type || "N/A"}</div>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm text-gray-900">{product.category || "N/A"}</div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm text-gray-900">{product.manufacturer || "N/A"}</div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm text-gray-900">₹{product.sale_price?.toFixed(2) || "0.00"}</div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                          <button
                            onClick={() => handleEdit(product)}
                            className="text-indigo-600 hover:text-indigo-900 mr-4"
                          >
                            <Edit className="h-5 w-5" />
                          </button>
                          <button
                            onClick={() => handleDelete(product.product_id)}
                            className="text-red-600 hover:text-red-900"
                          >
                            <Trash2 className="h-5 w-5" />
                          </button>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan="5" className="px-6 py-4 text-center text-sm text-gray-500">
                        No products found. {searchTerm && "Try a different search term."}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-4">
                <div>
                  <p className="text-sm text-gray-700">
                    Showing <span className="font-medium">{startIndex + 1}</span> to{" "}
                    <span className="font-medium">
                      {Math.min(startIndex + itemsPerPage, filteredProducts.length)}
                    </span>{" "}
                    of <span className="font-medium">{filteredProducts.length}</span> products
                  </p>
                </div>
                <div className="flex space-x-2">
                  <button
                    onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                    disabled={currentPage === 1}
                    className="px-3 py-1 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Previous
                  </button>
                  <button
                    onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                    disabled={currentPage === totalPages}
                    className="px-3 py-1 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* Product Modal */}
      {showAddModal && <ProductModal />}
    </div>
  );
}

export default Products;
