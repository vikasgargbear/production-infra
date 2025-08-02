import React, { useState, useEffect } from 'react';
import { 
  Package, Search, Plus, Edit2, Trash2, 
  Download, Upload, AlertCircle, Check, Loader2
} from 'lucide-react';
import { productsApi } from '../../services/api';
import { ProductEditModal } from '../global/modals';

interface Product {
  id: string;
  product_name: string;
  generic_name?: string;
  product_code?: string;
  category?: string;
  hsn_code?: string;
  brand?: string;
  manufacturer?: string;
  mrp?: number;
  cost_price?: number;
  pack_size?: string;
  unit?: string;
  tax_rate?: number;
  status?: string;
  is_active?: boolean;
  [key: string]: any;
}

interface ProductMasterProps {
  open: boolean;
  onClose: () => void;
}

const ProductMaster: React.FC<ProductMasterProps> = ({ open, onClose }) => {
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [filterCategory, setFilterCategory] = useState<string>('all');
  const [showAddModal, setShowAddModal] = useState<boolean>(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [selectedProducts, setSelectedProducts] = useState<string[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string>('');
  const [categories, setCategories] = useState<string[]>([]);
  
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
  const loadProducts = async (): Promise<void> => {
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
  const loadCategories = async (): Promise<void> => {
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
  const searchProducts = async (query: string): Promise<void> => {
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
  const filteredProducts = products.filter((product: Product) => {
    const matchesSearch = searchTerm === '' || 
      product.product_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      product.generic_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      product.product_code?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      product.hsn_code?.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesCategory = filterCategory === 'all' || 
      product.category === filterCategory;
    
    return matchesSearch && matchesCategory;
  });

  const handleEditProduct = (product: Product): void => {
    setEditingProduct(product);
  };

  const handleDeleteProduct = async (productId: string): Promise<void> => {
    if (!window.confirm('Are you sure you want to delete this product?')) {
      return;
    }

    try {
      await productsApi.delete(productId);
      setSuccessMessage('Product deleted successfully');
      loadProducts();
      setTimeout(() => setSuccessMessage(''), 3000);
    } catch (err) {
      console.error('Error deleting product:', err);
      setError('Failed to delete product.');
    }
  };

  const handleProductSaved = (): void => {
    setEditingProduct(null);
    setShowAddModal(false);
    loadProducts();
    setSuccessMessage('Product saved successfully');
    setTimeout(() => setSuccessMessage(''), 3000);
  };

  const handleBulkDelete = async (): Promise<void> => {
    if (selectedProducts.length === 0) return;
    
    if (!window.confirm(`Are you sure you want to delete ${selectedProducts.length} products?`)) {
      return;
    }

    try {
      await Promise.all(selectedProducts.map(id => productsApi.delete(id)));
      setSuccessMessage(`${selectedProducts.length} products deleted successfully`);
      setSelectedProducts([]);
      loadProducts();
      setTimeout(() => setSuccessMessage(''), 3000);
    } catch (err) {
      console.error('Error bulk deleting products:', err);
      setError('Failed to delete some products.');
    }
  };

  const toggleProductSelection = (productId: string): void => {
    setSelectedProducts(prev => 
      prev.includes(productId) 
        ? prev.filter(id => id !== productId)
        : [...prev, productId]
    );
  };

  const toggleAllSelection = (): void => {
    if (selectedProducts.length === filteredProducts.length) {
      setSelectedProducts([]);
    } else {
      setSelectedProducts(filteredProducts.map(p => p.id));
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-7xl mx-4 h-[90vh] flex flex-col">
        {/* Header */}
        <div className="bg-white border-b border-gray-200 px-6 py-4 rounded-t-lg">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <Package className="w-6 h-6 text-gray-700" />
              <h1 className="text-2xl font-bold text-gray-900">Product Master</h1>
            </div>
            <div className="flex items-center space-x-2">
              <button
                onClick={() => setShowAddModal(true)}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center space-x-2"
              >
                <Plus className="w-4 h-4" />
                <span>Add Product</span>
              </button>
              <button
                onClick={onClose}
                className="px-4 py-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600"
              >
                Close
              </button>
            </div>
          </div>
        </div>

        {/* Success/Error Messages */}
        {successMessage && (
          <div className="mx-6 mt-4 p-3 bg-green-50 border border-green-200 rounded-lg flex items-center space-x-2">
            <Check className="w-5 h-5 text-green-600" />
            <span className="text-green-800">{successMessage}</span>
          </div>
        )}

        {error && (
          <div className="mx-6 mt-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center space-x-2">
            <AlertCircle className="w-5 h-5 text-red-600" />
            <span className="text-red-800">{error}</span>
          </div>
        )}

        {/* Filters */}
        <div className="px-6 py-4 border-b border-gray-200">
          <div className="flex items-center space-x-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
              <input
                type="text"
                placeholder="Search products by name, code, HSN..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <select
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All Categories</option>
              {categories.map(category => (
                <option key={category} value={category}>{category}</option>
              ))}
            </select>
            {selectedProducts.length > 0 && (
              <button
                onClick={handleBulkDelete}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 flex items-center space-x-2"
              >
                <Trash2 className="w-4 h-4" />
                <span>Delete ({selectedProducts.length})</span>
              </button>
            )}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden">
          {isLoading ? (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <Loader2 className="w-8 h-8 animate-spin text-blue-600 mx-auto mb-4" />
                <p className="text-gray-600">Loading products...</p>
              </div>
            </div>
          ) : (
            <div className="h-full overflow-auto">
              <table className="w-full">
                <thead className="bg-gray-50 sticky top-0">
                  <tr>
                    <th className="px-6 py-3 text-left">
                      <input
                        type="checkbox"
                        checked={selectedProducts.length === filteredProducts.length && filteredProducts.length > 0}
                        onChange={toggleAllSelection}
                        className="rounded border-gray-300"
                      />
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Product</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Code/HSN</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Category</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Pack Size</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">MRP</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Cost</th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {filteredProducts.map((product) => (
                    <tr key={product.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4">
                        <input
                          type="checkbox"
                          checked={selectedProducts.includes(product.id)}
                          onChange={() => toggleProductSelection(product.id)}
                          className="rounded border-gray-300"
                        />
                      </td>
                      <td className="px-6 py-4">
                        <div>
                          <div className="text-sm font-medium text-gray-900">{product.product_name}</div>
                          {product.generic_name && (
                            <div className="text-sm text-gray-500">{product.generic_name}</div>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4">
                        <div className="text-sm text-gray-900">{product.product_code}</div>
                        <div className="text-sm text-gray-500">HSN: {product.hsn_code}</div>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-900">{product.category}</td>
                      <td className="px-6 py-4 text-sm text-gray-900">{product.pack_size}</td>
                      <td className="px-6 py-4 text-sm text-right text-gray-900">₹{product.mrp?.toFixed(2)}</td>
                      <td className="px-6 py-4 text-sm text-right text-gray-900">₹{product.cost_price?.toFixed(2)}</td>
                      <td className="px-6 py-4 text-center">
                        <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                          product.is_active ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                        }`}>
                          {product.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <div className="flex items-center justify-center space-x-2">
                          <button
                            onClick={() => handleEditProduct(product)}
                            className="text-blue-600 hover:text-blue-700"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDeleteProduct(product.id)}
                            className="text-red-600 hover:text-red-700"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {filteredProducts.length === 0 && !isLoading && (
                <div className="text-center py-12">
                  <Package className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-600">No products found</p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Product Edit/Add Modal */}
      {(showAddModal || editingProduct) && (
        <ProductEditModal
          isOpen={true}
          onClose={() => {
            setShowAddModal(false);
            setEditingProduct(null);
          }}
          onSave={handleProductSaved}
          product={editingProduct}
        />
      )}
    </div>
  );
};

export default ProductMaster;