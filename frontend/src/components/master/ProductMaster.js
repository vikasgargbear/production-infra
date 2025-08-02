import React, { useState, useEffect } from 'react';
import { 
  Package, Search, Plus, Edit2, Trash2, 
  Download, Upload, AlertCircle, Check, Loader2
} from 'lucide-react';
import { productsApi } from '../../services/api';
import { ProductEditModal } from '../global/modals';

const ProductMaster = ({ open, onClose }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCategory, setFilterCategory] = useState('all');
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [selectedProducts, setSelectedProducts] = useState([]);
  const [products, setProducts] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [successMessage, setSuccessMessage] = useState('');
  const [categories, setCategories] = useState([]);
  
  // Load products on component mount
  useEffect(() => {
    if (open) {
      loadProducts();
    }
  }, [open]);
  
  // Load categories after products are loaded
  useEffect(() => {
    if (products.length > 0) {
      loadCategories();
    }
  }, [products]);
  
  // Load products from API
  const loadProducts = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const response = await productsApi.getAll();
      console.log('Products API Response:', response);
      console.log('First product:', response.data?.[0]);
      setProducts(response.data || []);
    } catch (err) {
      console.error('Error loading products:', err);
      setError('Failed to load products. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };
  
  // Load categories from API
  const loadCategories = async () => {
    try {
      // TODO: Implement categories endpoint
      // const response = await productsApi.getCategories();
      // setCategories(response.data || []);
      
      // For now, extract unique categories from products
      const uniqueCategories = [...new Set(products.map(p => p.category).filter(Boolean))];
      setCategories(['All', ...uniqueCategories]);
    } catch (err) {
      console.error('Error loading categories:', err);
    }
  };
  
  // Search products
  const searchProducts = async (query) => {
    if (!query.trim()) {
      loadProducts();
      return;
    }
    
    try {
      setIsLoading(true);
      const response = await productsApi.search(query);
      setProducts(response.data || []);
    } catch (err) {
      console.error('Error searching products:', err);
      setError('Failed to search products.');
    } finally {
      setIsLoading(false);
    }
  };
  
  // Handle search with debounce
  useEffect(() => {
    const timer = setTimeout(() => {
      searchProducts(searchTerm);
    }, 300);
    
    return () => clearTimeout(timer);
  }, [searchTerm]);
  
  // Filter products based on search and category
  const filteredProducts = products.filter(product => {
    const matchesSearch = searchTerm === '' || 
      product.product_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      product.generic_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      product.product_code?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      product.hsn_code?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      product.barcode?.includes(searchTerm);
    
    const matchesCategory = filterCategory === 'all' || 
      product.category?.toLowerCase() === filterCategory.toLowerCase();
    
    return matchesSearch && matchesCategory;
  });
  
  const handleEdit = (product) => {
    setEditingProduct(product);
    setShowAddModal(true);
  };

  const handleDelete = async (id) => {
    if (window.confirm('Are you sure you want to delete this product?')) {
      try {
        await productsApi.delete(id);
        setSuccessMessage('Product deleted successfully!');
        await loadProducts();
        
        // Clear success message after 3 seconds
        setTimeout(() => setSuccessMessage(''), 3000);
      } catch (err) {
        console.error('Error deleting product:', err);
        setError(err.response?.data?.message || 'Failed to delete product.');
      }
    }
  };

  const handleCloseModal = () => {
    setShowAddModal(false);
    setEditingProduct(null);
  };

  const handleExport = () => {
    // TODO: Implement export functionality
    alert('Export functionality coming soon!');
  };

  const handleImport = () => {
    // TODO: Implement import functionality
    alert('Import functionality coming soon!');
  };

  const getStockStatus = (current, min, max) => {
    if (current <= min) return { color: 'red', text: 'Low Stock' };
    if (current >= max * 0.9) return { color: 'yellow', text: 'Near Max' };
    return { color: 'green', text: 'Optimal' };
  };

  return (
    <div className="flex-1 flex flex-col bg-gray-50 h-full overflow-hidden">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <Package className="w-6 h-6 text-gray-700" />
            <h1 className="text-2xl font-bold text-gray-900">Product Master</h1>
            <span className="text-sm text-gray-500">({products.length} products)</span>
          </div>
          <div className="flex items-center space-x-3">
            <button
              onClick={handleImport}
              className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 flex items-center space-x-2"
            >
              <Upload className="w-4 h-4" />
              <span>Import</span>
            </button>
            <button
              onClick={handleExport}
              className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 flex items-center space-x-2"
            >
              <Download className="w-4 h-4" />
              <span>Export</span>
            </button>
            <button
              onClick={() => setShowAddModal(true)}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center space-x-2"
            >
              <Plus className="w-4 h-4" />
              <span>Add Product</span>
            </button>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white border-b border-gray-200 px-6 py-3">
        <div className="flex items-center space-x-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Search by name, SKU, or HSN..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <select
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
          >
            {categories.map(cat => (
              <option key={cat} value={cat.toLowerCase()}>
                {cat}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Messages */}
      {error && (
        <div className="mx-6 mt-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg flex items-center">
          <AlertCircle className="w-5 h-5 mr-2" />
          {error}
        </div>
      )}
      
      {successMessage && (
        <div className="mx-6 mt-4 bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg flex items-center">
          <Check className="w-5 h-5 mr-2" />
          {successMessage}
        </div>
      )}

      {/* Products Table */}
      <div className="flex-1 overflow-y-auto p-6 min-h-0">
        {isLoading ? (
          <div className="flex items-center justify-center h-64">
            <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
            <span className="ml-2 text-gray-600">Loading products...</span>
          </div>
        ) : (
          <div className="bg-white rounded-lg border border-gray-200 h-full flex flex-col">
            <div className="flex-1 overflow-auto">
              <table className="w-full">
              <thead className="bg-gray-50 sticky top-0 z-10">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    <input
                      type="checkbox"
                      className="rounded border-gray-300"
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedProducts(filteredProducts.map(p => p.product_id));
                        } else {
                          setSelectedProducts([]);
                        }
                      }}
                    />
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Product Details</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Category</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Pack</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Pricing</th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Stock</th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">GST %</th>
                  <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredProducts.map((product) => {
                  const stockStatus = getStockStatus(product.total_stock || 0, product.minimum_stock_level || 0, product.maximum_stock_level || 1000);
                  return (
                    <tr key={product.product_id} className="hover:bg-gray-50">
                      <td className="px-6 py-4">
                        <input
                          type="checkbox"
                          checked={selectedProducts.includes(product.product_id)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedProducts([...selectedProducts, product.product_id]);
                            } else {
                              setSelectedProducts(selectedProducts.filter(id => id !== product.product_id));
                            }
                          }}
                          className="rounded border-gray-300"
                        />
                      </td>
                      <td className="px-6 py-4">
                        <div>
                          <p className="text-sm font-medium text-gray-900">{product.product_name || product.generic_name}</p>
                          <p className="text-xs text-gray-500">SKU: {product.product_code} | HSN: {product.hsn_code || '-'}</p>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div>
                          <p className="text-sm text-gray-900">{product.category || '-'}</p>
                          <p className="text-xs text-gray-500">{product.sub_category || '-'}</p>
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div>
                          <p className="text-sm text-gray-900">{product.pack_type || '-'}</p>
                          <p className="text-xs text-gray-500">{product.unit || '-'}</p>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div>
                          <p className="text-sm font-medium text-gray-900">MRP: ₹{product.mrp || 0}</p>
                          <p className="text-xs text-gray-500">
                            Buy: ₹{product.purchase_price || 0} | Sell: ₹{product.sale_price || 0}
                          </p>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <div>
                          <p className="text-sm font-medium text-gray-900">{product.total_stock || 0}</p>
                          <span className={`text-xs px-2 py-0.5 rounded-full bg-${stockStatus.color}-100 text-${stockStatus.color}-800`}>
                            {stockStatus.text}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <span className="text-sm text-gray-900">{product.gst_percent || 0}%</span>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <div className="flex items-center justify-center space-x-2">
                          <button
                            onClick={() => handleEdit(product)}
                            className="p-1 text-blue-600 hover:bg-blue-50 rounded"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDelete(product.product_id)}
                            className="p-1 text-red-600 hover:bg-red-50 rounded"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
        )}
      </div>

      {/* Global Product Edit Modal */}
      <ProductEditModal 
        isOpen={showAddModal}
        onClose={handleCloseModal}
        product={editingProduct}
        onSave={() => {
          loadProducts();
          setSuccessMessage(editingProduct ? 'Product updated successfully!' : 'Product added successfully!');
          setTimeout(() => setSuccessMessage(''), 3000);
        }}
        mode={editingProduct ? 'edit' : 'create'}
      />
    </div>
  );
};

export default ProductMaster;