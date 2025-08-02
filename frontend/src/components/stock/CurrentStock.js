import React, { useState, useEffect } from 'react';
import {
  Package, Search, Filter, Download, Eye,
  AlertTriangle, CheckCircle, Clock, MoreVertical,
  TrendingUp, TrendingDown, ArrowUpDown, Edit2, X,
  HelpCircle
} from 'lucide-react';
import { stockApi, productsApi, batchesApi } from '../../services/api';
import { formatCurrency } from '../../utils/formatters';
import { DataTable } from '../global';

const CurrentStock = ({ open = true, onClose }) => {
  const [loading, setLoading] = useState(true);
  const [stockData, setStockData] = useState([]);
  const [filteredData, setFilteredData] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedLocation, setSelectedLocation] = useState('all');
  const [showLowStock, setShowLowStock] = useState(false);
  const [showExpiring, setShowExpiring] = useState(false);
  const [sortConfig, setSortConfig] = useState({ key: 'product_name', direction: 'asc' });
  const [selectedProduct, setSelectedProduct] = useState(null);
  const [showDetails, setShowDetails] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [showMoreFilters, setShowMoreFilters] = useState(false);
  const [showHelpModal, setShowHelpModal] = useState(false);
  const [moreFilters, setMoreFilters] = useState({
    stockStatus: 'all',
    expiryPeriod: 'all',
    packType: 'all'
  });
  const [editForm, setEditForm] = useState({
    category: '',
    pack_type: '',
    pack_size: '',
    minimum_stock_level: '',
    pack_unit_quantity: '',
    sub_unit_quantity: '',
    purchase_unit: '',
    sale_unit: ''
  });

  useEffect(() => {
    loadStockData();
  }, []);

  useEffect(() => {
    filterData();
  }, [stockData, searchQuery, selectedCategory, selectedLocation, showLowStock, showExpiring, moreFilters]);

  const loadStockData = async () => {
    setLoading(true);
    try {
      console.log('Fetching current stock data...');
      
      // Try multiple endpoints to get stock data
      let response;
      let data = [];
      
      // Try getCurrentStock endpoint which should now work without auth
      try {
        response = await stockApi.getCurrentStock({
          include_batches: true,
          include_valuation: true
        });
        console.log('getCurrentStock response:', response);
        data = response?.data || [];
      } catch (error) {
        console.log('getCurrentStock failed:', error.message);
        
        // Fallback to products API if stock endpoint fails
        try {
          const productsResponse = await productsApi.getAll({
            include_stock: true,
            limit: 100
          });
          console.log('Products API response:', productsResponse);
          
          const products = productsResponse?.data || [];
          console.log('Raw products data:', products[0]); // Debug first product
          
          if (Array.isArray(products) && products.length > 0) {
            // Transform product data to stock format
            data = products.map(product => ({
              product_id: product.product_id,
              product_name: product.product_name,
              product_code: product.product_code || product.sku,
              category: product.category,
              current_stock: product.current_stock || product.stock_quantity || 0,
              available_stock: product.available_stock || product.current_stock || 0,
              reserved_stock: product.reserved_stock || 0,
              reorder_level: product.reorder_level || product.minimum_stock_level || 0,
              unit: product.unit || product.uom || 'Units',
              mrp: product.mrp || product.price || 0,
              stock_value: product.stock_value || ((product.current_stock || 0) * (product.mrp || 0)),
              expiry_alert: false,
              low_stock: (product.current_stock || 0) <= (product.reorder_level || 0),
              batches: product.batches || []
            }));
          }
        } catch (productsError) {
          console.log('Products API also failed:', productsError.message);
        }
      }
      
      if (Array.isArray(data) && data.length > 0) {
        console.log('Received stock data:', data.length, 'items');
        console.log('Sample data item:', data[0]);
        
        // Transform data if needed to match our component structure
        const transformedData = data.map(item => ({
          product_id: item.product_id || item.id,
          product_name: item.product_name || item.name,
          product_code: item.product_code || item.code || item.sku,
          category: item.category || item.product_category || 'Uncategorized',
          current_stock: item.current_stock || item.quantity || 0,
          available_stock: item.available_stock || item.available_quantity || item.current_stock || 0,
          reserved_stock: item.reserved_stock || item.reserved_quantity || 0,
          reorder_level: item.reorder_level || item.min_stock || 0,
          unit: item.unit || item.uom || 'Units',
          mrp: item.mrp || item.price || 0,
          stock_value: item.stock_value || (item.current_stock * (item.mrp || 0)),
          expiry_alert: item.expiry_alert || false,
          low_stock: item.low_stock || (item.current_stock <= item.reorder_level),
          batches: item.batches || []
        }));
        
        console.log('Transformed data sample:', transformedData[0]);
        setStockData(transformedData);
      } else {
        console.log('No stock data received from any API');
        setStockData([]);
      }
    } catch (error) {
      console.error('Error loading stock data:', error);
      console.error('Error details:', error.response);
      
      // Show error message to user
      if (error.response?.status !== 404) {
        console.log(`Failed to load stock data: ${error.message || 'Unknown error'}`);
      }
      
      setStockData([]);
    } finally {
      setLoading(false);
    }
  };

  const filterData = () => {
    console.log('Filtering data. Stock data length:', stockData.length);
    console.log('Filters - Search:', searchQuery, 'Category:', selectedCategory, 'Low Stock:', showLowStock, 'Expiring:', showExpiring);
    
    let filtered = [...stockData];

    // Search filter
    if (searchQuery) {
      filtered = filtered.filter(item =>
        item.product_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.product_code.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    // Category filter
    if (selectedCategory !== 'all') {
      filtered = filtered.filter(item => item.category === selectedCategory);
    }

    // Low stock filter
    if (showLowStock) {
      filtered = filtered.filter(item => item.low_stock);
    }

    // Expiring filter
    if (showExpiring) {
      filtered = filtered.filter(item => item.expiry_alert);
    }

    // Apply more filters
    if (moreFilters.stockStatus !== 'all') {
      switch (moreFilters.stockStatus) {
        case 'in-stock':
          filtered = filtered.filter(item => item.current_stock > 0);
          break;
        case 'out-of-stock':
          filtered = filtered.filter(item => item.current_stock === 0);
          break;
        case 'low-stock':
          filtered = filtered.filter(item => item.low_stock);
          break;
      }
    }

    if (moreFilters.expiryPeriod !== 'all') {
      const today = new Date();
      filtered = filtered.filter(item => {
        if (!item.batches || item.batches.length === 0) return false;
        
        return item.batches.some(batch => {
          if (!batch.expiry_date) return false;
          const expiryDate = new Date(batch.expiry_date);
          const daysToExpiry = Math.floor((expiryDate - today) / (1000 * 60 * 60 * 24));
          
          switch (moreFilters.expiryPeriod) {
            case '30':
              return daysToExpiry <= 30 && daysToExpiry > 0;
            case '60':
              return daysToExpiry <= 60 && daysToExpiry > 0;
            case '90':
              return daysToExpiry <= 90 && daysToExpiry > 0;
            case 'expired':
              return daysToExpiry <= 0;
            default:
              return true;
          }
        });
      });
    }

    if (moreFilters.packType !== 'all') {
      filtered = filtered.filter(item => 
        item.pack_type && item.pack_type.toLowerCase() === moreFilters.packType.toLowerCase()
      );
    }

    // Sort
    filtered.sort((a, b) => {
      const aValue = a[sortConfig.key];
      const bValue = b[sortConfig.key];
      
      if (sortConfig.direction === 'asc') {
        return aValue > bValue ? 1 : -1;
      } else {
        return aValue < bValue ? 1 : -1;
      }
    });

    console.log('Filtered data length:', filtered.length);
    setFilteredData(filtered);
  };

  const handleSort = (key) => {
    setSortConfig(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

  const handleExport = () => {
    try {
      // Prepare CSV data
      const csvHeaders = [
        'Product Name',
        'Product Code', 
        'Category',
        'Current Stock',
        'Available Stock',
        'Reserved Stock',
        'Reorder Level',
        'Unit',
        'MRP',
        'Stock Value',
        'Status'
      ];

      const csvData = filteredData.map(item => [
        item.product_name || '',
        item.product_code || '',
        item.category || '',
        item.current_stock || 0,
        item.available_stock || 0,
        item.reserved_stock || 0,
        item.reorder_level || 0,
        item.unit || 'Units',
        item.mrp || 0,
        item.stock_value || 0,
        item.low_stock ? 'Low Stock' : item.current_stock === 0 ? 'Out of Stock' : 'In Stock'
      ]);

      // Convert to CSV format
      const csvContent = [
        csvHeaders.join(','),
        ...csvData.map(row => row.map(cell => `"${cell}"`).join(','))
      ].join('\\n');

      // Create and download file
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', `current_stock_${new Date().toISOString().split('T')[0]}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      alert(`Successfully exported ${filteredData.length} items to CSV`);
    } catch (error) {
      console.error('Export error:', error);
      alert('Failed to export data. Please try again.');
    }
  };

  const getStockStatus = (item) => {
    if (item.current_stock === 0) {
      return { color: 'red', text: 'Out of Stock', icon: AlertTriangle };
    } else if (item.low_stock) {
      return { color: 'orange', text: 'Low Stock', icon: TrendingDown };
    } else {
      return { color: 'green', text: 'In Stock', icon: CheckCircle };
    }
  };

  const handleViewDetails = (product) => {
    setSelectedProduct(product);
    setShowDetails(true);
  };

  const handleEdit = (product) => {
    setEditingProduct(product);
    setEditForm({
      category: product.category || '',
      pack_type: product.pack_type || '',
      pack_size: product.pack_size || '',
      minimum_stock_level: product.reorder_level || '',
      pack_unit_quantity: product.pack_unit_quantity || '',
      sub_unit_quantity: product.sub_unit_quantity || '',
      purchase_unit: product.purchase_unit || '',
      sale_unit: product.sale_unit || ''
    });
    setShowEditModal(true);
  };

  const handleSaveEdit = async () => {
    try {
      const response = await stockApi.updateProductProperties(editingProduct.product_id, editForm);
      console.log('Product updated:', response);
      
      // Reload stock data to show updated values
      await loadStockData();
      
      setShowEditModal(false);
      setEditingProduct(null);
    } catch (error) {
      console.error('Error updating product:', error);
      alert('Failed to update product properties');
    }
  };

  const columns = [
    {
      header: 'Product',
      field: 'product_name',
      sortable: true,
      render: (row) => (
        <div>
          <div className="font-medium text-gray-900">{row.product_name}</div>
          <div className="text-sm text-gray-500">{row.product_code}</div>
        </div>
      )
    },
    {
      header: 'Category',
      field: 'category',
      sortable: true,
      render: (row) => (
        <div>
          <span className="px-2 py-1 text-xs font-medium bg-gray-100 text-gray-700 rounded">
            {row.category || 'Uncategorized'}
          </span>
          {(row.pack_type || row.pack_size) && (
            <div className="text-xs text-gray-500 mt-1">
              {row.pack_type} {row.pack_size && `- ${row.pack_size}`}
            </div>
          )}
        </div>
      )
    },
    {
      header: 'Current Stock',
      field: 'current_stock',
      sortable: true,
      render: (row) => {
        const status = getStockStatus(row);
        const StatusIcon = status.icon;
        const totalUnits = row.current_stock;
        const packQty = row.pack_unit_quantity || 1;
        const subQty = row.sub_unit_quantity || 1;
        const boxes = Math.floor(totalUnits / (packQty * subQty));
        const remainingAfterBoxes = totalUnits % (packQty * subQty);
        const subBoxes = Math.floor(remainingAfterBoxes / subQty);
        const strips = remainingAfterBoxes % subQty;
        
        return (
          <div className="flex items-center space-x-2">
            <StatusIcon className={`w-4 h-4 text-${status.color}-500`} />
            <div>
              <div className="font-medium">{row.current_stock} {row.sale_unit || row.unit}</div>
              {(packQty > 1 || subQty > 1) && (
                <div className="text-xs text-gray-500">
                  {boxes > 0 && `${boxes} ${row.purchase_unit || 'Box'}${boxes > 1 ? 'es' : ''}`}
                  {boxes > 0 && subBoxes > 0 && ', '}
                  {subBoxes > 0 && `${subBoxes} Sub-${row.purchase_unit || 'Box'}${subBoxes > 1 ? 'es' : ''}`}
                  {(boxes > 0 || subBoxes > 0) && strips > 0 && ', '}
                  {strips > 0 && `${strips} ${row.sale_unit || 'Strip'}${strips > 1 ? 's' : ''}`}
                </div>
              )}
              <div className="text-xs text-gray-500">
                Available: {row.available_stock}
              </div>
            </div>
          </div>
        );
      }
    },
    {
      header: 'Reorder Level',
      field: 'reorder_level',
      sortable: true,
      render: (row) => (
        <div className={row.low_stock ? 'text-orange-600 font-medium' : ''}>
          {row.reorder_level} {row.unit}
        </div>
      )
    },
    {
      header: 'Stock Value',
      field: 'stock_value',
      sortable: true,
      render: (row) => formatCurrency(row.stock_value)
    },
    {
      header: 'Status',
      field: 'status',
      render: (row) => {
        const status = getStockStatus(row);
        return (
          <div className="flex items-center space-x-2">
            <span className={`px-2 py-1 text-xs font-medium bg-${status.color}-100 text-${status.color}-800 rounded`}>
              {status.text}
            </span>
            {row.expiry_alert && (
              <span className="px-2 py-1 text-xs font-medium bg-orange-100 text-orange-800 rounded">
                Expiring Soon
              </span>
            )}
          </div>
        );
      }
    }
  ];

  if (!open) return null;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="bg-white shadow-sm border-b border-gray-200 flex-shrink-0">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between py-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Current Stock</h1>
              <p className="text-sm text-gray-600">Monitor and manage inventory levels</p>
            </div>
            <div className="flex items-center space-x-3">
              <button
                onClick={() => setShowLowStock(!showLowStock)}
                className={`flex items-center space-x-2 px-4 py-2 border rounded-lg transition-colors ${
                  showLowStock
                    ? 'bg-orange-50 border-orange-300 text-orange-700'
                    : 'bg-white border-gray-300 hover:bg-gray-50'
                }`}
              >
                <AlertTriangle className="w-4 h-4" />
                <span>Low Stock</span>
              </button>
              <button
                onClick={() => setShowExpiring(!showExpiring)}
                className={`flex items-center space-x-2 px-4 py-2 border rounded-lg transition-colors ${
                  showExpiring
                    ? 'bg-orange-50 border-orange-300 text-orange-700'
                    : 'bg-white border-gray-300 hover:bg-gray-50'
                }`}
              >
                <Clock className="w-4 h-4" />
                <span>Expiring</span>
              </button>
              <button 
                onClick={handleExport}
                className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                <Download className="w-4 h-4" />
                <span>Export</span>
              </button>
              <button
                onClick={() => setShowHelpModal(true)}
                className="p-2 text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg"
                title="Help"
              >
                <HelpCircle className="w-5 h-5" />
              </button>
              <button
                onClick={onClose}
                className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Scrollable Content Area */}
      <div className="flex-1 overflow-y-auto bg-gray-50">
        {/* Search and Filters */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
          <div className="flex items-center space-x-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
              <input
                type="text"
                placeholder="Search products..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All Categories</option>
              <option value="Tablets">Tablets</option>
              <option value="Capsules">Capsules</option>
              <option value="Syrups">Syrups</option>
              <option value="Injections">Injections</option>
            </select>
            <button 
              onClick={() => setShowMoreFilters(!showMoreFilters)}
              className={`flex items-center space-x-2 px-4 py-2 border rounded-lg transition-colors ${
                showMoreFilters 
                  ? 'bg-blue-50 border-blue-300 text-blue-700' 
                  : 'bg-white border-gray-300 hover:bg-gray-50'
              }`}
            >
              <Filter className="w-4 h-4" />
              <span>More Filters</span>
            </button>
          </div>
          
          {/* More Filters Panel */}
          {showMoreFilters && (
            <div className="mt-4 p-4 bg-gray-50 rounded-lg border border-gray-200">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Stock Status
                  </label>
                  <select 
                    value={moreFilters.stockStatus}
                    onChange={(e) => setMoreFilters({...moreFilters, stockStatus: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="all">All Stock</option>
                    <option value="in-stock">In Stock Only</option>
                    <option value="out-of-stock">Out of Stock</option>
                    <option value="low-stock">Low Stock</option>
                  </select>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Expiry Period
                  </label>
                  <select 
                    value={moreFilters.expiryPeriod}
                    onChange={(e) => setMoreFilters({...moreFilters, expiryPeriod: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="all">All Products</option>
                    <option value="30">Expiring in 30 days</option>
                    <option value="60">Expiring in 60 days</option>
                    <option value="90">Expiring in 90 days</option>
                    <option value="expired">Already Expired</option>
                  </select>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Pack Type
                  </label>
                  <select 
                    value={moreFilters.packType}
                    onChange={(e) => setMoreFilters({...moreFilters, packType: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="all">All Types</option>
                    <option value="strip">Strip</option>
                    <option value="bottle">Bottle</option>
                    <option value="tube">Tube</option>
                    <option value="vial">Vial</option>
                    <option value="sachet">Sachet</option>
                  </select>
                </div>
              </div>
              
              <div className="mt-4 flex justify-end space-x-2">
                <button 
                  onClick={() => {
                    setMoreFilters({
                      stockStatus: 'all',
                      expiryPeriod: 'all',
                      packType: 'all'
                    });
                  }}
                  className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  Clear Filters
                </button>
                <button 
                  onClick={() => setShowMoreFilters(false)}
                  className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  Close
                </button>
                <button 
                  onClick={() => setShowMoreFilters(false)}
                  className="px-4 py-2 text-white bg-blue-600 rounded-lg hover:bg-blue-700"
                >
                  Apply
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Stock Table */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-8">
        <div className="bg-white rounded-lg shadow-sm border border-gray-200">
          {loading ? (
            <div className="flex items-center justify-center h-64">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
            </div>
          ) : filteredData.length > 0 ? (
            <DataTable
              columns={columns}
              data={filteredData}
              actions={(row) => (
                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => handleEdit(row)}
                    className="p-1 text-gray-600 hover:text-green-600 hover:bg-green-50 rounded"
                    title="Edit Properties"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleViewDetails(row)}
                    className="p-1 text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded"
                    title="View Details"
                  >
                    <Eye className="w-4 h-4" />
                  </button>
                  <button
                    className="p-1 text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded"
                    title="More Options"
                  >
                    <MoreVertical className="w-4 h-4" />
                  </button>
                </div>
              )}
            />
          ) : (
            <div className="text-center py-12">
              <Package className="w-12 h-12 text-gray-400 mx-auto mb-3" />
              <p className="text-gray-600">No stock data found</p>
            </div>
          )}
        </div>
      </div>
      </div>

      {/* Product Details Modal */}
      {showDetails && selectedProduct && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-hidden">
            <div className="p-6 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold text-gray-900">Stock Details</h2>
                <button
                  onClick={() => setShowDetails(false)}
                  className="text-gray-500 hover:text-gray-700"
                >
                  ×
                </button>
              </div>
            </div>
            <div className="p-6 overflow-y-auto max-h-[calc(90vh-120px)]">
              <div className="space-y-6">
                <div>
                  <h3 className="text-lg font-medium text-gray-900">{selectedProduct.product_name}</h3>
                  <p className="text-sm text-gray-500">{selectedProduct.product_code}</p>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-gray-600">Current Stock</p>
                    <p className="text-lg font-medium">{selectedProduct.current_stock} {selectedProduct.unit}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Stock Value</p>
                    <p className="text-lg font-medium">{formatCurrency(selectedProduct.stock_value)}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Available</p>
                    <p className="text-lg font-medium">{selectedProduct.available_stock} {selectedProduct.unit}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Reserved</p>
                    <p className="text-lg font-medium">{selectedProduct.reserved_stock} {selectedProduct.unit}</p>
                  </div>
                </div>

                <div>
                  <h4 className="font-medium text-gray-900 mb-2">Batch Details</h4>
                  <div className="space-y-2">
                    {selectedProduct.batches?.map((batch, index) => (
                      <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                        <div>
                          <p className="font-medium">{batch.batch_no}</p>
                          <p className="text-sm text-gray-600">Expires: {new Date(batch.expiry_date).toLocaleDateString()}</p>
                        </div>
                        <p className="font-medium">{batch.quantity} {selectedProduct.unit}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Product Modal */}
      {showEditModal && editingProduct && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-hidden">
            <div className="p-6 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold text-gray-900">Edit Product Properties</h2>
                <button
                  onClick={() => setShowEditModal(false)}
                  className="text-gray-500 hover:text-gray-700"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
            <div className="p-6 overflow-y-auto max-h-[calc(90vh-80px)]">
              <div className="space-y-4">
                <div>
                  <h3 className="font-medium text-gray-900">{editingProduct.product_name}</h3>
                  <p className="text-sm text-gray-500">{editingProduct.product_code}</p>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Category
                  </label>
                  <select
                    value={editForm.category}
                    onChange={(e) => setEditForm({...editForm, category: e.target.value})}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="">Select Category</option>
                    <option value="Tablet">Tablet</option>
                    <option value="Capsule">Capsule</option>
                    <option value="Syrup">Syrup</option>
                    <option value="Injection">Injection</option>
                    <option value="Powder">Powder</option>
                    <option value="Cream">Cream</option>
                    <option value="Drops">Drops</option>
                  </select>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Pack Type
                  </label>
                  <input
                    type="text"
                    value={editForm.pack_type}
                    onChange={(e) => setEditForm({...editForm, pack_type: e.target.value})}
                    placeholder="e.g., Strip, Bottle, Tube"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Pack Size
                  </label>
                  <input
                    type="text"
                    value={editForm.pack_size}
                    onChange={(e) => setEditForm({...editForm, pack_size: e.target.value})}
                    placeholder="e.g., 10 Tablets, 200ml, 30g"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Reorder Level
                  </label>
                  <input
                    type="number"
                    value={editForm.minimum_stock_level}
                    onChange={(e) => setEditForm({...editForm, minimum_stock_level: e.target.value})}
                    placeholder="Minimum stock level"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                
                <div className="border-t pt-4 mt-4">
                  <h4 className="text-sm font-medium text-gray-700 mb-3">Unit Conversion Settings</h4>
                  
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Purchase Unit
                      </label>
                      <input
                        type="text"
                        value={editForm.purchase_unit}
                        onChange={(e) => setEditForm({...editForm, purchase_unit: e.target.value})}
                        placeholder="e.g., Box"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      />
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Box Contains
                      </label>
                      <input
                        type="number"
                        value={editForm.pack_unit_quantity}
                        onChange={(e) => setEditForm({...editForm, pack_unit_quantity: e.target.value})}
                        placeholder="e.g., 10"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      />
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Sale Unit
                      </label>
                      <input
                        type="text"
                        value={editForm.sale_unit}
                        onChange={(e) => setEditForm({...editForm, sale_unit: e.target.value})}
                        placeholder="e.g., Strip"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      />
                    </div>
                    
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Sub-box Contains
                      </label>
                      <input
                        type="number"
                        value={editForm.sub_unit_quantity}
                        onChange={(e) => setEditForm({...editForm, sub_unit_quantity: e.target.value})}
                        placeholder="e.g., 10"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      />
                    </div>
                  </div>
                  
                  {editForm.pack_unit_quantity && editForm.sub_unit_quantity && (
                    <div className="mt-2 text-xs text-gray-600 bg-gray-50 p-2 rounded">
                      1 {editForm.purchase_unit || 'Box'} = {editForm.pack_unit_quantity} sub-boxes = {editForm.pack_unit_quantity * editForm.sub_unit_quantity} {editForm.sale_unit || 'strips'}
                    </div>
                  )}
                </div>
              </div>
              
              <div className="flex items-center justify-end space-x-3 mt-6">
                <button
                  onClick={() => setShowEditModal(false)}
                  className="px-4 py-2 text-gray-700 bg-gray-100 hover:bg-gray-200 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveEdit}
                  className="px-4 py-2 text-white bg-blue-600 hover:bg-blue-700 rounded-lg"
                >
                  Save Changes
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Help Modal */}
      {showHelpModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-hidden">
            <div className="p-6 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-semibold text-gray-900">Stock Management Help</h2>
                <button
                  onClick={() => setShowHelpModal(false)}
                  className="text-gray-500 hover:text-gray-700"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
            <div className="p-6 overflow-y-auto max-h-[calc(90vh-80px)]">
              <div className="space-y-6">
                <div>
                  <h3 className="text-lg font-medium text-gray-900 mb-2">Low Stock Definition</h3>
                  <div className="bg-blue-50 p-4 rounded-lg">
                    <p className="text-gray-700">
                      A product is considered <strong>Low Stock</strong> when:
                    </p>
                    <ul className="mt-2 space-y-1 list-disc list-inside text-gray-600">
                      <li>Current stock quantity falls below or equals the Reorder Level</li>
                      <li>The Reorder Level is set per product based on your sales velocity</li>
                      <li>You can update the Reorder Level by clicking the Edit button on any product</li>
                    </ul>
                    <p className="mt-3 text-sm text-gray-600">
                      <strong>Example:</strong> If a product has a Reorder Level of 50 units and current stock is 45 units, 
                      it will be marked as Low Stock.
                    </p>
                  </div>
                </div>

                <div>
                  <h3 className="text-lg font-medium text-gray-900 mb-2">Expiring Products</h3>
                  <div className="bg-orange-50 p-4 rounded-lg">
                    <p className="text-gray-700">
                      A product is marked as <strong>Expiring</strong> when:
                    </p>
                    <ul className="mt-2 space-y-1 list-disc list-inside text-gray-600">
                      <li>Any batch has an expiry date within the next 90 days</li>
                      <li>The system checks each batch's expiry date individually</li>
                      <li>Products with already expired batches are highlighted separately</li>
                    </ul>
                    <p className="mt-3 text-sm text-gray-600">
                      <strong>Note:</strong> The expiry alert helps prevent selling expired medicines and allows 
                      timely returns to suppliers.
                    </p>
                  </div>
                </div>

                <div>
                  <h3 className="text-lg font-medium text-gray-900 mb-2">Stock Calculations</h3>
                  <div className="bg-gray-50 p-4 rounded-lg">
                    <dl className="space-y-2">
                      <div>
                        <dt className="font-medium text-gray-700">Current Stock:</dt>
                        <dd className="text-gray-600">Total quantity available across all active batches</dd>
                      </div>
                      <div>
                        <dt className="font-medium text-gray-700">Available Stock:</dt>
                        <dd className="text-gray-600">Quantity that can be sold (excludes reserved/damaged)</dd>
                      </div>
                      <div>
                        <dt className="font-medium text-gray-700">Stock Value:</dt>
                        <dd className="text-gray-600">Calculated as: Quantity × Selling Price (not MRP)</dd>
                      </div>
                    </dl>
                  </div>
                </div>

                <div>
                  <h3 className="text-lg font-medium text-gray-900 mb-2">Unit Conversion</h3>
                  <div className="bg-green-50 p-4 rounded-lg">
                    <p className="text-gray-700">
                      The system supports multi-level unit conversion:
                    </p>
                    <ul className="mt-2 space-y-1 list-disc list-inside text-gray-600">
                      <li><strong>Purchase Unit:</strong> How you buy (e.g., Box)</li>
                      <li><strong>Sale Unit:</strong> How you sell (e.g., Strip)</li>
                      <li><strong>Conversion:</strong> 1 Box = X Sub-boxes = Y Strips</li>
                    </ul>
                    <p className="mt-3 text-sm text-gray-600">
                      Configure these in the Edit dialog for accurate inventory tracking.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CurrentStock;