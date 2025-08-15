import React, { useState, useEffect, useCallback } from 'react';
import { 
  Package, Plus, Search, Edit2, Trash2, Upload, Download, 
  Filter, BarChart3, AlertTriangle, TrendingUp, Grid,
  List, ChevronLeft, ChevronRight, CheckCircle, XCircle,
  Box, DollarSign, Calendar, Building
} from 'lucide-react';
import { productsApi, batchesApi } from '../../services/api';
import { ModuleHeader, DataTable, StatusBadge, SearchBar } from '../global';
import { ProductCreationModal } from '../global';
import { exportToExcel } from '../../utils/exportHelpers';

const ProductManagementV2 = () => {
  const [products, setProducts] = useState([]);
  const [filteredProducts, setFilteredProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedProducts, setSelectedProducts] = useState([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [viewMode, setViewMode] = useState('grid'); // grid or list
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(viewMode === 'grid' ? 12 : 20);
  const [sortBy, setSortBy] = useState('product_name');
  const [sortOrder, setSortOrder] = useState('asc');
  const [filterCategory, setFilterCategory] = useState('all');
  const [filterStock, setFilterStock] = useState('all');
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState('');
  const [showBatchModal, setShowBatchModal] = useState(false);
  const [selectedProductForBatch, setSelectedProductForBatch] = useState(null);

  // Summary stats
  const [stats, setStats] = useState({
    totalProducts: 0,
    activeProducts: 0,
    lowStock: 0,
    outOfStock: 0,
    totalValue: 0,
    expiringBatches: 0
  });

  // Fetch products
  const fetchProducts = useCallback(async () => {
    setLoading(true);
    try {
      const response = await productsApi.getAll();
      const productData = response.data || [];
      setProducts(productData);
      setFilteredProducts(productData);
      calculateStats(productData);
    } catch (error) {
      console.error('Error fetching products:', error);
      setMessage('Failed to load products');
      setMessageType('error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProducts();
  }, [fetchProducts]);

  // Calculate statistics
  const calculateStats = async (productData) => {
    const stats = productData.reduce((acc, product) => {
      acc.totalProducts++;
      if (product.is_active) acc.activeProducts++;
      if (product.current_stock <= product.min_stock_level) acc.lowStock++;
      if (product.current_stock === 0) acc.outOfStock++;
      acc.totalValue += (product.current_stock * product.mrp) || 0;
      return acc;
    }, { 
      totalProducts: 0, 
      activeProducts: 0, 
      lowStock: 0, 
      outOfStock: 0, 
      totalValue: 0,
      expiringBatches: 0 
    });
    
    // Get expiring batches count
    try {
      const thirtyDaysFromNow = new Date();
      thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
      
      // This would need an API endpoint to get expiring batches
      // For now, we'll just set it to 0
      stats.expiringBatches = 0;
    } catch (error) {
      console.error('Error fetching expiring batches:', error);
    }
    
    setStats(stats);
  };

  // Search and filter
  useEffect(() => {
    let filtered = [...products];

    // Apply search
    if (searchQuery) {
      filtered = filtered.filter(product => 
        product.product_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        product.product_code?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        product.hsn_code?.includes(searchQuery) ||
        product.manufacturer?.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    // Apply category filter
    if (filterCategory !== 'all') {
      filtered = filtered.filter(product => product.category === filterCategory);
    }

    // Apply stock filter
    if (filterStock === 'low') {
      filtered = filtered.filter(product => 
        product.current_stock > 0 && product.current_stock <= product.min_stock_level
      );
    } else if (filterStock === 'out') {
      filtered = filtered.filter(product => product.current_stock === 0);
    } else if (filterStock === 'available') {
      filtered = filtered.filter(product => product.current_stock > product.min_stock_level);
    }

    // Apply sorting
    filtered.sort((a, b) => {
      let aVal = a[sortBy];
      let bVal = b[sortBy];
      
      if (typeof aVal === 'string') {
        aVal = aVal?.toLowerCase() || '';
        bVal = bVal?.toLowerCase() || '';
      }
      
      if (sortOrder === 'asc') {
        return aVal > bVal ? 1 : -1;
      } else {
        return aVal < bVal ? 1 : -1;
      }
    });

    setFilteredProducts(filtered);
    setCurrentPage(1);
  }, [searchQuery, filterCategory, filterStock, sortBy, sortOrder, products]);

  // Pagination
  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentProducts = filteredProducts.slice(indexOfFirstItem, indexOfLastItem);
  const totalPages = Math.ceil(filteredProducts.length / itemsPerPage);

  // Handle actions
  const handleEdit = (product) => {
    setEditingProduct(product);
    setShowCreateModal(true);
  };

  const handleDelete = async (productId) => {
    if (window.confirm('Are you sure you want to delete this product?')) {
      try {
        await productsApi.delete(productId);
        setMessage('Product deleted successfully');
        setMessageType('success');
        fetchProducts();
      } catch (error) {
        console.error('Error deleting product:', error);
        setMessage('Failed to delete product');
        setMessageType('error');
      }
    }
  };

  const handleViewBatches = (product) => {
    setSelectedProductForBatch(product);
    setShowBatchModal(true);
  };

  const handleExport = () => {
    const exportData = filteredProducts.map(product => ({
      'Product Code': product.product_code,
      'Product Name': product.product_name,
      'Category': product.category,
      'Manufacturer': product.manufacturer,
      'HSN Code': product.hsn_code,
      'GST %': product.gst_percent,
      'MRP': product.mrp,
      'Sale Price': product.sale_price,
      'Purchase Price': product.purchase_price,
      'Current Stock': product.current_stock,
      'Min Stock Level': product.min_stock_level,
      'Unit': product.unit,
      'Pack Size': product.pack_size,
      'Status': product.is_active ? 'Active' : 'Inactive'
    }));
    
    exportToExcel(exportData, 'products');
  };

  const handleBulkAction = (action) => {
    if (selectedProducts.length === 0) {
      setMessage('Please select products first');
      setMessageType('error');
      return;
    }

    switch (action) {
      case 'delete':
        if (window.confirm(`Delete ${selectedProducts.length} products?`)) {
          // Implement bulk delete
          console.log('Bulk delete:', selectedProducts);
        }
        break;
      case 'export':
        const selectedData = products.filter(p => selectedProducts.includes(p.product_id));
        exportToExcel(selectedData, 'selected_products');
        break;
      case 'deactivate':
        // Implement bulk deactivate
        console.log('Bulk deactivate:', selectedProducts);
        break;
      default:
        break;
    }
  };

  const getStockStatus = (product) => {
    if (product.current_stock === 0) {
      return { color: 'text-red-600 bg-red-50', text: 'Out of Stock' };
    } else if (product.current_stock <= product.min_stock_level) {
      return { color: 'text-orange-600 bg-orange-50', text: 'Low Stock' };
    }
    return { color: 'text-green-600 bg-green-50', text: 'In Stock' };
  };

  return (
    <div className="h-full flex flex-col bg-gray-50">
      {/* Header */}
      <ModuleHeader
        title="Product Management"
        icon={Package}
        iconColor="text-purple-600"
        actions={[
          {
            label: "Add Product",
            onClick: () => setShowCreateModal(true),
            icon: Plus,
            variant: "primary"
          },
          {
            label: "Import",
            onClick: () => console.log('Import products'),
            icon: Upload,
            variant: "default"
          },
          {
            label: "Export",
            onClick: handleExport,
            icon: Download,
            variant: "default"
          }
        ]}
      />

      {/* Stats Cards */}
      <div className="px-6 py-4">
        <div className="grid grid-cols-6 gap-4">
          <div className="bg-white rounded-lg p-4 border border-gray-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Total Products</p>
                <p className="text-2xl font-bold text-gray-900">{stats.totalProducts}</p>
              </div>
              <Package className="w-8 h-8 text-gray-400" />
            </div>
          </div>
          
          <div className="bg-white rounded-lg p-4 border border-gray-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Active</p>
                <p className="text-2xl font-bold text-green-600">{stats.activeProducts}</p>
              </div>
              <CheckCircle className="w-8 h-8 text-green-400" />
            </div>
          </div>
          
          <div className="bg-white rounded-lg p-4 border border-gray-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Low Stock</p>
                <p className="text-2xl font-bold text-orange-600">{stats.lowStock}</p>
              </div>
              <AlertTriangle className="w-8 h-8 text-orange-400" />
            </div>
          </div>
          
          <div className="bg-white rounded-lg p-4 border border-gray-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Out of Stock</p>
                <p className="text-2xl font-bold text-red-600">{stats.outOfStock}</p>
              </div>
              <XCircle className="w-8 h-8 text-red-400" />
            </div>
          </div>
          
          <div className="bg-white rounded-lg p-4 border border-gray-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Stock Value</p>
                <p className="text-xl font-bold text-blue-600">₹{(stats.totalValue / 100000).toFixed(1)}L</p>
              </div>
              <DollarSign className="w-8 h-8 text-blue-400" />
            </div>
          </div>
          
          <div className="bg-white rounded-lg p-4 border border-gray-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Expiring Soon</p>
                <p className="text-2xl font-bold text-purple-600">{stats.expiringBatches}</p>
              </div>
              <Calendar className="w-8 h-8 text-purple-400" />
            </div>
          </div>
        </div>
      </div>

      {/* Filters and Search */}
      <div className="px-6 pb-4">
        <div className="bg-white rounded-lg p-4 border border-gray-200">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-4 flex-1">
              {/* Search */}
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search by name, code, HSN, or manufacturer..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
                />
              </div>

              {/* Category Filter */}
              <select
                value={filterCategory}
                onChange={(e) => setFilterCategory(e.target.value)}
                className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
              >
                <option value="all">All Categories</option>
                <option value="tablets">Tablets</option>
                <option value="capsules">Capsules</option>
                <option value="syrup">Syrup</option>
                <option value="injection">Injection</option>
                <option value="ointment">Ointment</option>
                <option value="drops">Drops</option>
              </select>

              {/* Stock Filter */}
              <select
                value={filterStock}
                onChange={(e) => setFilterStock(e.target.value)}
                className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
              >
                <option value="all">All Stock</option>
                <option value="available">Available</option>
                <option value="low">Low Stock</option>
                <option value="out">Out of Stock</option>
              </select>

              {/* Sort */}
              <select
                value={`${sortBy}-${sortOrder}`}
                onChange={(e) => {
                  const [field, order] = e.target.value.split('-');
                  setSortBy(field);
                  setSortOrder(order);
                }}
                className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500"
              >
                <option value="product_name-asc">Name (A-Z)</option>
                <option value="product_name-desc">Name (Z-A)</option>
                <option value="current_stock-asc">Stock (Low to High)</option>
                <option value="current_stock-desc">Stock (High to Low)</option>
                <option value="mrp-desc">MRP (High to Low)</option>
                <option value="created_at-desc">Newest First</option>
              </select>

              {/* View Mode Toggle */}
              <div className="flex items-center gap-2 border border-gray-300 rounded-lg p-1">
                <button
                  onClick={() => setViewMode('grid')}
                  className={`p-1.5 rounded ${viewMode === 'grid' ? 'bg-purple-100 text-purple-600' : 'text-gray-600'}`}
                >
                  <Grid className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setViewMode('list')}
                  className={`p-1.5 rounded ${viewMode === 'list' ? 'bg-purple-100 text-purple-600' : 'text-gray-600'}`}
                >
                  <List className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Bulk Actions */}
            {selectedProducts.length > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-600">{selectedProducts.length} selected</span>
                <button
                  onClick={() => handleBulkAction('export')}
                  className="px-3 py-1.5 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg"
                >
                  Export
                </button>
                <button
                  onClick={() => handleBulkAction('deactivate')}
                  className="px-3 py-1.5 text-sm bg-orange-100 hover:bg-orange-200 text-orange-600 rounded-lg"
                >
                  Deactivate
                </button>
                <button
                  onClick={() => handleBulkAction('delete')}
                  className="px-3 py-1.5 text-sm bg-red-100 hover:bg-red-200 text-red-600 rounded-lg"
                >
                  Delete
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Message Display */}
      {message && (
        <div className="px-6 pb-4">
          <div className={`p-3 rounded-lg flex items-center ${
            messageType === 'success' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
          }`}>
            {messageType === 'success' ? <CheckCircle className="w-4 h-4 mr-2" /> : <AlertTriangle className="w-4 h-4 mr-2" />}
            {message}
          </div>
        </div>
      )}

      {/* Product Display */}
      <div className="flex-1 overflow-hidden px-6">
        <div className="h-full">
          {loading ? (
            <div className="bg-white rounded-lg border border-gray-200 h-full flex items-center justify-center">
              <div className="text-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600 mx-auto"></div>
                <p className="mt-4 text-gray-600">Loading products...</p>
              </div>
            </div>
          ) : currentProducts.length === 0 ? (
            <div className="bg-white rounded-lg border border-gray-200 h-full flex items-center justify-center">
              <div className="text-center">
                <Package className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-600">No products found</p>
                <button
                  onClick={() => setShowCreateModal(true)}
                  className="mt-4 px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700"
                >
                  Add First Product
                </button>
              </div>
            </div>
          ) : viewMode === 'grid' ? (
            // Grid View
            <div className="grid grid-cols-3 gap-4 h-full overflow-auto pb-4">
              {currentProducts.map((product) => {
                const stockStatus = getStockStatus(product);
                return (
                  <div
                    key={product.product_id}
                    className="bg-white rounded-lg border border-gray-200 p-4 hover:shadow-lg transition-shadow"
                  >
                    <div className="flex justify-between items-start mb-3">
                      <div className="flex-1">
                        <h3 className="font-medium text-gray-900 line-clamp-1">{product.product_name}</h3>
                        <p className="text-sm text-gray-500">{product.product_code}</p>
                      </div>
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
                        className="ml-2"
                      />
                    </div>

                    <div className="space-y-2 mb-4">
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">Category</span>
                        <span className="font-medium">{product.category}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">HSN</span>
                        <span className="font-medium">{product.hsn_code}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">MRP</span>
                        <span className="font-medium">₹{product.mrp}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">Stock</span>
                        <span className={`font-medium px-2 py-0.5 rounded-full text-xs ${stockStatus.color}`}>
                          {product.current_stock} {product.unit}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleEdit(product)}
                        className="flex-1 px-3 py-1.5 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleViewBatches(product)}
                        className="flex-1 px-3 py-1.5 text-sm bg-purple-100 hover:bg-purple-200 text-purple-600 rounded-lg"
                      >
                        Batches
                      </button>
                      <button
                        onClick={() => handleDelete(product.product_id)}
                        className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            // List View
            <div className="bg-white rounded-lg border border-gray-200 h-full flex flex-col">
              <div className="flex-1 overflow-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr>
                      <th className="px-4 py-3 text-left">
                        <input
                          type="checkbox"
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedProducts(currentProducts.map(p => p.product_id));
                            } else {
                              setSelectedProducts([]);
                            }
                          }}
                          checked={selectedProducts.length === currentProducts.length && currentProducts.length > 0}
                        />
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Product</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Category</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Manufacturer</th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">HSN</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">MRP</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Sale Price</th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Stock</th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Status</th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {currentProducts.map((product) => {
                      const stockStatus = getStockStatus(product);
                      return (
                        <tr key={product.product_id} className="hover:bg-gray-50">
                          <td className="px-4 py-3">
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
                            />
                          </td>
                          <td className="px-4 py-3">
                            <div>
                              <div className="text-sm font-medium text-gray-900">{product.product_name}</div>
                              <div className="text-xs text-gray-500">{product.product_code}</div>
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <span className="text-sm text-gray-600">{product.category}</span>
                          </td>
                          <td className="px-4 py-3">
                            <span className="text-sm text-gray-600">{product.manufacturer}</span>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span className="text-sm font-mono">{product.hsn_code}</span>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <span className="text-sm font-medium">₹{product.mrp}</span>
                          </td>
                          <td className="px-4 py-3 text-right">
                            <span className="text-sm">₹{product.sale_price}</span>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${stockStatus.color}`}>
                              {product.current_stock} {product.unit}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <StatusBadge 
                              status={product.is_active ? 'active' : 'inactive'} 
                              type="product"
                            />
                          </td>
                          <td className="px-4 py-3 text-center">
                            <div className="flex items-center justify-center gap-2">
                              <button
                                onClick={() => handleEdit(product)}
                                className="p-1 text-gray-600 hover:text-purple-600 hover:bg-purple-50 rounded"
                                title="Edit"
                              >
                                <Edit2 className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => handleViewBatches(product)}
                                className="p-1 text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded"
                                title="View Batches"
                              >
                                <Box className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => handleDelete(product.product_id)}
                                className="p-1 text-gray-600 hover:text-red-600 hover:bg-red-50 rounded"
                                title="Delete"
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

              {/* Pagination */}
              <div className="px-6 py-4 border-t border-gray-200">
                <div className="flex items-center justify-between">
                  <div className="text-sm text-gray-700">
                    Showing {indexOfFirstItem + 1} to {Math.min(indexOfLastItem, filteredProducts.length)} of {filteredProducts.length} products
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                      disabled={currentPage === 1}
                      className="px-3 py-1 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    
                    {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                      const pageNum = currentPage <= 3 ? i + 1 : currentPage + i - 2;
                      if (pageNum > totalPages) return null;
                      return (
                        <button
                          key={pageNum}
                          onClick={() => setCurrentPage(pageNum)}
                          className={`px-3 py-1 rounded-lg ${
                            currentPage === pageNum
                              ? 'bg-purple-600 text-white'
                              : 'border border-gray-300 hover:bg-gray-50'
                          }`}
                        >
                          {pageNum}
                        </button>
                      );
                    })}
                    
                    <button
                      onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                      disabled={currentPage === totalPages}
                      className="px-3 py-1 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Product Creation/Edit Modal */}
      {showCreateModal && (
        <ProductCreationModal
          show={showCreateModal}
          onClose={() => {
            setShowCreateModal(false);
            setEditingProduct(null);
          }}
          onProductCreated={(product) => {
            setShowCreateModal(false);
            setEditingProduct(null);
            fetchProducts();
            setMessage(editingProduct ? 'Product updated successfully' : 'Product created successfully');
            setMessageType('success');
          }}
          editingProduct={editingProduct}
        />
      )}

      {/* Batch Management Modal would go here */}
      {/* {showBatchModal && selectedProductForBatch && (
        <BatchManagementModal
          product={selectedProductForBatch}
          onClose={() => {
            setShowBatchModal(false);
            setSelectedProductForBatch(null);
          }}
        />
      )} */}
    </div>
  );
};

export default ProductManagementV2;