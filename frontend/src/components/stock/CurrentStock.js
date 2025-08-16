import React, { useState, useEffect } from 'react';
import {
  Package, Search, Filter, Download, Eye,
  AlertTriangle, CheckCircle, Clock, MoreVertical,
  TrendingUp, TrendingDown, ArrowUpDown, Edit2, X,
  HelpCircle
} from 'lucide-react';
import { stockApi, productAPI, batchesApi } from '../../services/api';
import { formatCurrency } from '../../utils/formatters';
import { DataTable, ModuleHeader } from '../global';

// Enterprise-grade data validation and transformation utilities
const ProductDataValidator = {
  /**
   * Validates that a product object has all required fields for stock display
   */
  validateProductData(product) {
    if (!product || typeof product !== 'object') {
      console.error('Invalid product: not an object', product);
      return false;
    }
    
    if (!product.product_id || typeof product.product_id !== 'number') {
      console.error('Invalid product: missing or invalid product_id', product);
      return false;
    }
    
    if (!product.product_name || typeof product.product_name !== 'string') {
      console.error('Invalid product: missing or invalid product_name', product);
      return false;
    }
    
    return true;
  },

  /**
   * Transforms a raw product object from API to standardized stock item format
   * Uses actual API field names based on backend response
   */
  transformProductToStockItem(product) {
    const currentStock = Number(product.current_stock || 0);
    const reorderLevel = Number(product.reorder_level || 0);
    const minStockLevel = Number(product.min_stock_quantity || 0);
    const effectiveReorderLevel = reorderLevel || minStockLevel;
    
    return {
      // Core identification
      product_id: product.product_id,
      product_name: product.product_name,
      product_code: product.product_code || `PROD-${product.product_id}`,
      generic_name: product.generic_name || '',
      
      // Category - now read from batch-level data
      category: product.category_name || product.category || 'General', 
      manufacturer: product.manufacturer || '',
      brand: product.brand || '',
      product_type: product.product_type || 'standard',
      product_class: product.product_class || 'medicine',
      
      // Regulatory & Compliance
      hsn_code: product.hsn_code || '',
      drug_schedule: product.drug_schedule || '',
      prescription_required: Boolean(product.requires_prescription),
      is_narcotic: Boolean(product.is_narcotic),
      is_controlled_substance: Boolean(product.is_controlled_substance),
      
      // Stock & Inventory
      current_stock: currentStock,
      available_stock: currentStock, // Assuming available = current for now
      reserved_stock: 0, // Would need separate API call for reservations
      reorder_level: effectiveReorderLevel,
      minimum_stock_level: minStockLevel,
      maximum_stock_level: Number(product.max_stock_quantity || 0),
      
      // Pricing
      mrp: Number(product.mrp || 0),
      purchase_rate: Number(product.cost_price || 0),
      selling_rate: Number(product.selling_price || 0),
      stock_value: currentStock * Number(product.cost_price || 0),
      
      // Units & Measurements - Now from batch-level data
      unit: product.base_uom || product.base_uom_id || 'Units',
      pack_size: Number(product.pack_size || product.pack_config?.pack_size || 1),
      pack_type: product.pack_type || product.pack_unit || product.pack_config?.pack_type || '',
      pack_unit_quantity: Number(product.units_per_pack || product.pack_config?.pack_unit_quantity || 1),
      sub_unit_quantity: Number(product.tablets_per_strip || product.packs_per_box || product.pack_config?.sub_unit_quantity || 1),
      purchase_unit: product.pack_uom || product.box_unit || product.pack_config?.purchase_unit || '',
      sale_unit: product.base_uom || product.pack_config?.sale_unit || product.unit || 'Units',
      
      // Tax Information
      gst_percentage: Number(product.gst_percentage || 0),
      cess_percentage: Number(product.cess_percentage || 0),
      
      // Status & Alerts
      is_active: Boolean(product.is_active),
      low_stock: currentStock <= effectiveReorderLevel && effectiveReorderLevel > 0,
      out_of_stock: currentStock === 0,
      stock_status: currentStock === 0 ? 'out_of_stock' : 
                   (currentStock <= effectiveReorderLevel && effectiveReorderLevel > 0) ? 'low_stock' : 'normal',
      expiry_alert: false, // Would be calculated from batches
      
      // Storage & Handling
      storage_conditions: product.storage_conditions || '',
      requires_cold_chain: Boolean(product.requires_cold_chain),
      
      // Metadata
      created_at: product.created_at,
      updated_at: product.updated_at,
      last_updated: product.updated_at,
      
      // Related data
      batches: product.batches || [],
      batch_count: Number(product.batch_count || 0)
    };
  }
};

const CurrentStock = ({ open = true, onClose }) => {
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
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
  const [currentPage, setCurrentPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [allProducts, setAllProducts] = useState([]);
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
    loadStockData(0, true);
  }, []);

  useEffect(() => {
    filterData();
  }, [stockData, searchQuery, selectedCategory, selectedLocation, showLowStock, showExpiring, moreFilters]);

  const loadMoreData = () => {
    if (!loadingMore && hasMore) {
      const nextPage = Math.floor(allProducts.length / 20);
      setCurrentPage(nextPage);
      loadStockData(nextPage, false);
    }
  };

  // Infinite scroll handler
  const handleScroll = (e) => {
    const { scrollTop, scrollHeight, clientHeight } = e.target;
    const bottom = scrollHeight - scrollTop <= clientHeight + 100; // Trigger 100px before bottom
    
    if (bottom && !loadingMore && hasMore) {
      loadMoreData();
    }
  };

  const loadStockData = async (page = 0, reset = true) => {
    if (page === 0) {
      setLoading(true);
    } else {
      setLoadingMore(true);
    }
    
    try {
      // Check if getAll method exists
      if (!productAPI || typeof productAPI.getAll !== 'function') {
        throw new Error('productAPI.getAll is not available. Available methods: ' + Object.keys(productAPI || {}));
      }
      
      // Use products API with pagination - load 20 items per page
      const response = await productAPI.getAll({
        limit: 20,
        skip: page * 20
      });
      
      // Handle different response formats from productAPI.getAll()
      let products = [];
      if (response?.success && response?.data) {
        products = response.data;
      } else if (response?.data?.products) {
        products = response.data.products;
      } else if (response?.data && Array.isArray(response.data)) {
        products = response.data;
      } else if (Array.isArray(response)) {
        products = response;
      } else {
        console.warn('Unexpected API response format:', response);
        products = [];
      }
      
      // Set hasMore based on whether we got fewer items than requested
      setHasMore(products.length === 20);
      
      // Enterprise-grade data validation and transformation
      console.log('Raw products from API:', products.length);
      const validProducts = products.filter(ProductDataValidator.validateProductData);
      console.log('Valid products after validation:', validProducts.length);
      const transformedData = validProducts.map(ProductDataValidator.transformProductToStockItem);
      console.log('Transformed data items:', transformedData.length);
      
      if (reset || page === 0) {
        setAllProducts(transformedData);
        setStockData(transformedData);
      } else {
        setAllProducts(prev => [...prev, ...transformedData]);
        setStockData(prev => [...prev, ...transformedData]);
      }
      
    } catch (error) {
      console.error('Error loading stock data:', error);
      if (page === 0) {
        setStockData([]);
        setAllProducts([]);
      }
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  const filterData = () => {
    
    // First filter out any null/undefined items with comprehensive validation
    let filtered = stockData.filter(item => {
      if (!item || typeof item !== 'object') {
        console.warn('Filtering out invalid item (not object):', item);
        return false;
      }
      if (!item.product_name || typeof item.product_name !== 'string') {
        console.warn('Filtering out item with invalid product_name:', item);
        return false;
      }
      if (!item.product_id) {
        console.warn('Filtering out item with missing product_id:', item);
        return false;
      }
      return true;
    });

    // Search filter
    if (searchQuery) {
      filtered = filtered.filter(item =>
        (item.product_name && item.product_name.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (item.product_code && item.product_code.toLowerCase().includes(searchQuery.toLowerCase()))
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

    // Sort with safety checks
    filtered.sort((a, b) => {
      if (!a || !b) {
        console.warn('Undefined items in sort:', { a, b });
        return 0;
      }
      
      const aValue = a[sortConfig.key];
      const bValue = b[sortConfig.key];
      
      if (sortConfig.direction === 'asc') {
        return aValue > bValue ? 1 : -1;
      } else {
        return aValue < bValue ? 1 : -1;
      }
    });

    // Final safety check before setting data
    const safeFiltered = filtered.filter(item => item && item.product_name);
    
    console.log('Filtered data length:', safeFiltered.length);
    setFilteredData(safeFiltered);
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
      // Exclude category from the update for now - requires proper category management
      const { category, ...updateData } = editForm;
      const response = await stockApi.updateProductProperties(editingProduct.product_id, updateData);
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
      key: 'product_name',
      sortable: true,
      render: (value, row) => {
        if (!row || !row.product_name) {
          console.error('Invalid row data in product column:', row);
          return <div className="text-red-500">Invalid Product Data</div>;
        }
        return (
          <div>
            <div className="font-medium text-gray-900">{row.product_name}</div>
            <div className="text-sm text-gray-500">{row.product_code || 'No Code'}</div>
          </div>
        );
      }
    },
    {
      header: 'Category',
      key: 'category',
      sortable: true,
      render: (value, row) => {
        if (!row) {
          console.error('Invalid row data in category column:', row);
          return <div className="text-red-500">Invalid Data</div>;
        }
        
        return (
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
        );
      }
    },
    {
      header: 'Current Stock',
      key: 'current_stock',
      sortable: true,
      render: (value, row) => {
        if (!row || typeof row.current_stock === 'undefined') {
          console.error('Invalid row data in stock column:', row);
          return <div className="text-red-500">Invalid Stock Data</div>;
        }
        
        const status = getStockStatus(row);
        const StatusIcon = status.icon;
        const totalUnits = row.current_stock || 0;
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
      key: 'reorder_level',
      sortable: true,
      render: (value, row) => (
        <div className={row.low_stock ? 'text-orange-600 font-medium' : ''}>
          {row.reorder_level} {row.unit}
        </div>
      )
    },
    {
      header: 'Stock Value',
      key: 'stock_value',
      sortable: true,
      render: (value, row) => formatCurrency(row.stock_value)
    },
    {
      header: 'Status',
      key: 'status',
      render: (value, row) => {
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
    <div className="h-full bg-blue-50">
      <div className="h-full flex flex-col">
        
        {/* Header - Using Global ModuleHeader */}
        <ModuleHeader
          title="Current Stock"
          subtitle="Monitor and manage inventory levels"
          icon={Package}
          iconColor="text-blue-600"
          onClose={onClose}
          historyType="stock"
          additionalActions={[
            {
              label: showLowStock ? "Hide Low Stock" : "Low Stock",
              onClick: () => setShowLowStock(!showLowStock),
              variant: showLowStock ? "primary" : "default",
              icon: AlertTriangle
            },
            {
              label: showExpiring ? "Hide Expiring" : "Expiring",
              onClick: () => setShowExpiring(!showExpiring),
              variant: showExpiring ? "primary" : "default",
              icon: Clock
            },
            {
              label: "Export",
              onClick: handleExport,
              variant: "default",
              icon: Download
            },
            {
              label: "Help",
              onClick: () => setShowHelpModal(true),
              variant: "default",
              icon: HelpCircle
            }
          ]}
        />

        {/* Keyboard Shortcuts Help */}
        <div className="bg-blue-50 px-4 py-2 text-xs text-blue-700 border-b border-blue-200">
          Keyboard shortcuts: <strong>Ctrl+F</strong> - Search | <strong>Ctrl+E</strong> - Export | <strong>Esc</strong> - Close
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto" onScroll={handleScroll}>
          <div className="max-w-6xl mx-auto px-6 py-6">
            
            {/* Search and Filters */}
            <div className="bg-white rounded-lg shadow-sm border border-blue-200 p-4 mb-6">
          <div className="flex items-center space-x-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
              <input
                type="text"
                placeholder="Search products..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
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
            <div className="mt-4 p-4 bg-blue-50 rounded-lg border border-blue-200">
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

            {/* Stock Table */}
            <div className="bg-white rounded-lg shadow-sm border border-blue-200">
          {loading ? (
            <div className="flex items-center justify-center h-64">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
            </div>
          ) : filteredData.length > 0 ? (
            <DataTable
              columns={[...columns, {
                header: 'Actions',
                key: 'actions',
                render: (value, row) => (
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
                )
              }]}
              data={filteredData}
              keyField="product_id"
            />
          ) : (
            <div className="text-center py-12">
              <Package className="w-12 h-12 text-gray-400 mx-auto mb-3" />
              <p className="text-gray-600">No stock data found</p>
            </div>
          )}
          
          {/* Load More Indicator */}
          {loadingMore && (
            <div className="flex items-center justify-center py-4">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              <span className="ml-2 text-blue-600">Loading more products...</span>
            </div>
          )}
          
          {/* No More Data Indicator */}
          {!hasMore && allProducts.length > 0 && (
            <div className="text-center py-4 text-gray-500 text-sm">
              No more products to load ({allProducts.length} total)
            </div>
          )}
            </div>
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