import React, { useState, useEffect, useCallback } from 'react';
import { 
  Package, Search, TrendingUp, TrendingDown, AlertTriangle, 
  Calendar, DollarSign, Box, BarChart3, Filter, Download,
  RefreshCw, Clock, ChevronLeft, ChevronRight, CheckCircle,
  XCircle, ArrowUpDown, Building, Truck, FileText
} from 'lucide-react';
import { batchesApi, productsApi } from '../../services/api';
import { ModuleHeader, DataTable, StatusBadge } from '../global';
import { exportToExcel } from '../../utils/exportHelpers';

const InventoryManagementV2 = () => {
  const [batches, setBatches] = useState([]);
  const [filteredBatches, setFilteredBatches] = useState([]);
  const [products, setProducts] = useState({});
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState('overview'); // overview, batches, movements, expiry
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage] = useState(20);
  const [sortBy, setSortBy] = useState('expiry_date');
  const [sortOrder, setSortOrder] = useState('asc');
  const [filterExpiry, setFilterExpiry] = useState('all');
  const [filterStock, setFilterStock] = useState('all');
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState('');

  // Summary stats
  const [stats, setStats] = useState({
    totalProducts: 0,
    totalBatches: 0,
    totalValue: 0,
    lowStockItems: 0,
    expiringBatches: 0,
    expiredBatches: 0,
    movements: {
      inward: 0,
      outward: 0,
      adjustments: 0
    }
  });

  // Fetch inventory data
  const fetchInventoryData = useCallback(async () => {
    setLoading(true);
    try {
      // Fetch batches
      const batchResponse = await batchesApi.getAll();
      const batchData = batchResponse.data || [];
      setBatches(batchData);
      setFilteredBatches(batchData);

      // Fetch products for mapping
      const productResponse = await productsApi.getAll();
      const productMap = {};
      productResponse.data.forEach(product => {
        productMap[product.product_id] = product;
      });
      setProducts(productMap);

      // Calculate stats
      calculateStats(batchData, productMap);
    } catch (error) {
      console.error('Error fetching inventory data:', error);
      setMessage('Failed to load inventory data');
      setMessageType('error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchInventoryData();
  }, [fetchInventoryData]);

  // Calculate statistics
  const calculateStats = (batchData, productMap) => {
    const now = new Date();
    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
    
    const stats = batchData.reduce((acc, batch) => {
      const expiryDate = new Date(batch.expiry_date);
      const product = productMap[batch.product_id];
      
      acc.totalBatches++;
      acc.totalValue += (batch.quantity_available * (batch.mrp || 0));
      
      if (batch.quantity_available <= (product?.min_stock_level || 10)) {
        acc.lowStockItems++;
      }
      
      if (expiryDate <= now) {
        acc.expiredBatches++;
      } else if (expiryDate <= thirtyDaysFromNow) {
        acc.expiringBatches++;
      }
      
      return acc;
    }, {
      totalProducts: Object.keys(productMap).length,
      totalBatches: 0,
      totalValue: 0,
      lowStockItems: 0,
      expiringBatches: 0,
      expiredBatches: 0
    });
    
    // Mock movement data - in real app, fetch from API
    stats.movements = {
      inward: 45,
      outward: 128,
      adjustments: 12
    };
    
    setStats(stats);
  };

  // Search and filter
  useEffect(() => {
    let filtered = [...batches];

    // Apply search
    if (searchQuery) {
      filtered = filtered.filter(batch => {
        const product = products[batch.product_id];
        return (
          product?.product_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
          product?.product_code?.toLowerCase().includes(searchQuery.toLowerCase()) ||
          batch.batch_number?.toLowerCase().includes(searchQuery.toLowerCase())
        );
      });
    }

    // Apply expiry filter
    const now = new Date();
    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
    
    if (filterExpiry === 'expired') {
      filtered = filtered.filter(batch => new Date(batch.expiry_date) <= now);
    } else if (filterExpiry === 'expiring') {
      filtered = filtered.filter(batch => {
        const expiryDate = new Date(batch.expiry_date);
        return expiryDate > now && expiryDate <= thirtyDaysFromNow;
      });
    } else if (filterExpiry === 'valid') {
      filtered = filtered.filter(batch => new Date(batch.expiry_date) > thirtyDaysFromNow);
    }

    // Apply stock filter
    if (filterStock === 'low') {
      filtered = filtered.filter(batch => {
        const product = products[batch.product_id];
        return batch.quantity_available <= (product?.min_stock_level || 10);
      });
    } else if (filterStock === 'out') {
      filtered = filtered.filter(batch => batch.quantity_available === 0);
    } else if (filterStock === 'available') {
      filtered = filtered.filter(batch => batch.quantity_available > 0);
    }

    // Apply sorting
    filtered.sort((a, b) => {
      let aVal = a[sortBy];
      let bVal = b[sortBy];
      
      // Special handling for product name sorting
      if (sortBy === 'product_name') {
        aVal = products[a.product_id]?.product_name || '';
        bVal = products[b.product_id]?.product_name || '';
      }
      
      if (typeof aVal === 'string') {
        aVal = aVal.toLowerCase();
        bVal = bVal.toLowerCase();
      }
      
      if (sortOrder === 'asc') {
        return aVal > bVal ? 1 : -1;
      } else {
        return aVal < bVal ? 1 : -1;
      }
    });

    setFilteredBatches(filtered);
    setCurrentPage(1);
  }, [searchQuery, filterExpiry, filterStock, sortBy, sortOrder, batches, products]);

  // Pagination
  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  const currentBatches = filteredBatches.slice(indexOfFirstItem, indexOfLastItem);
  const totalPages = Math.ceil(filteredBatches.length / itemsPerPage);

  // Handle actions
  const handleExport = () => {
    const exportData = filteredBatches.map(batch => {
      const product = products[batch.product_id];
      return {
        'Product Name': product?.product_name || 'Unknown',
        'Product Code': product?.product_code || '',
        'Batch Number': batch.batch_number,
        'Expiry Date': new Date(batch.expiry_date).toLocaleDateString(),
        'Available Quantity': batch.quantity_available,
        'Unit': product?.unit || '',
        'MRP': batch.mrp,
        'Purchase Price': batch.purchase_price,
        'Total Value': batch.quantity_available * batch.mrp,
        'Location': batch.location || 'Main Store',
        'Status': getExpiryStatus(batch.expiry_date).text
      };
    });
    
    exportToExcel(exportData, `inventory_${activeTab}`);
  };

  const getExpiryStatus = (expiryDate) => {
    const now = new Date();
    const expiry = new Date(expiryDate);
    const thirtyDaysFromNow = new Date();
    thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
    
    if (expiry <= now) {
      return { color: 'text-red-600 bg-red-50', text: 'Expired' };
    } else if (expiry <= thirtyDaysFromNow) {
      return { color: 'text-orange-600 bg-orange-50', text: 'Expiring Soon' };
    }
    return { color: 'text-green-600 bg-green-50', text: 'Valid' };
  };

  const getStockStatus = (batch) => {
    const product = products[batch.product_id];
    const minStock = product?.min_stock_level || 10;
    
    if (batch.quantity_available === 0) {
      return { color: 'text-red-600 bg-red-50', text: 'Out of Stock' };
    } else if (batch.quantity_available <= minStock) {
      return { color: 'text-orange-600 bg-orange-50', text: 'Low Stock' };
    }
    return { color: 'text-green-600 bg-green-50', text: 'In Stock' };
  };

  const renderOverviewTab = () => (
    <div className="grid grid-cols-2 gap-6">
      {/* Stock Overview Chart */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Stock Overview</h3>
        <div className="space-y-4">
          <div>
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm text-gray-600">In Stock</span>
              <span className="text-sm font-medium">{stats.totalBatches - stats.expiredBatches}</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div 
                className="bg-green-500 h-2 rounded-full" 
                style={{ width: `${((stats.totalBatches - stats.expiredBatches) / stats.totalBatches) * 100}%` }}
              />
            </div>
          </div>
          <div>
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm text-gray-600">Low Stock</span>
              <span className="text-sm font-medium">{stats.lowStockItems}</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div 
                className="bg-orange-500 h-2 rounded-full" 
                style={{ width: `${(stats.lowStockItems / stats.totalBatches) * 100}%` }}
              />
            </div>
          </div>
          <div>
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm text-gray-600">Expired</span>
              <span className="text-sm font-medium">{stats.expiredBatches}</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div 
                className="bg-red-500 h-2 rounded-full" 
                style={{ width: `${(stats.expiredBatches / stats.totalBatches) * 100}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Recent Movements */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Recent Movements</h3>
        <div className="space-y-3">
          <div className="flex items-center justify-between p-3 bg-green-50 rounded-lg">
            <div className="flex items-center gap-3">
              <TrendingUp className="w-5 h-5 text-green-600" />
              <div>
                <p className="text-sm font-medium text-gray-900">Inward</p>
                <p className="text-xs text-gray-600">Last 7 days</p>
              </div>
            </div>
            <span className="text-lg font-bold text-green-600">+{stats.movements.inward}</span>
          </div>
          <div className="flex items-center justify-between p-3 bg-red-50 rounded-lg">
            <div className="flex items-center gap-3">
              <TrendingDown className="w-5 h-5 text-red-600" />
              <div>
                <p className="text-sm font-medium text-gray-900">Outward</p>
                <p className="text-xs text-gray-600">Last 7 days</p>
              </div>
            </div>
            <span className="text-lg font-bold text-red-600">-{stats.movements.outward}</span>
          </div>
          <div className="flex items-center justify-between p-3 bg-blue-50 rounded-lg">
            <div className="flex items-center gap-3">
              <RefreshCw className="w-5 h-5 text-blue-600" />
              <div>
                <p className="text-sm font-medium text-gray-900">Adjustments</p>
                <p className="text-xs text-gray-600">Last 7 days</p>
              </div>
            </div>
            <span className="text-lg font-bold text-blue-600">{stats.movements.adjustments}</span>
          </div>
        </div>
      </div>

      {/* Top Products by Value */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Top Products by Value</h3>
        <div className="space-y-3">
          {Object.entries(products)
            .map(([id, product]) => {
              const productBatches = batches.filter(b => b.product_id === parseInt(id));
              const totalValue = productBatches.reduce((sum, b) => sum + (b.quantity_available * b.mrp), 0);
              return { product, totalValue };
            })
            .sort((a, b) => b.totalValue - a.totalValue)
            .slice(0, 5)
            .map(({ product, totalValue }, index) => (
              <div key={product.product_id} className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-sm font-medium text-gray-500">#{index + 1}</span>
                  <div>
                    <p className="text-sm font-medium text-gray-900">{product.product_name}</p>
                    <p className="text-xs text-gray-500">{product.category}</p>
                  </div>
                </div>
                <span className="text-sm font-bold text-gray-900">₹{(totalValue / 1000).toFixed(1)}K</span>
              </div>
            ))}
        </div>
      </div>

      {/* Expiry Alert */}
      <div className="bg-white rounded-lg border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Expiry Alerts</h3>
        <div className="space-y-3">
          {filteredBatches
            .filter(batch => {
              const expiryDate = new Date(batch.expiry_date);
              const thirtyDaysFromNow = new Date();
              thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
              return expiryDate <= thirtyDaysFromNow;
            })
            .sort((a, b) => new Date(a.expiry_date) - new Date(b.expiry_date))
            .slice(0, 5)
            .map(batch => {
              const product = products[batch.product_id];
              const expiryStatus = getExpiryStatus(batch.expiry_date);
              return (
                <div key={batch.batch_id} className="flex items-center justify-between">
                  <div className="flex-1">
                    <p className="text-sm font-medium text-gray-900">{product?.product_name}</p>
                    <p className="text-xs text-gray-500">Batch: {batch.batch_number}</p>
                  </div>
                  <div className="text-right">
                    <p className={`text-xs font-medium px-2 py-1 rounded-full ${expiryStatus.color}`}>
                      {expiryStatus.text}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      {new Date(batch.expiry_date).toLocaleDateString()}
                    </p>
                  </div>
                </div>
              );
            })}
        </div>
      </div>
    </div>
  );

  const renderBatchesTab = () => (
    <div className="bg-white rounded-lg border border-gray-200 h-full flex flex-col">
      <div className="flex-1 overflow-auto">
        <table className="w-full">
          <thead className="bg-gray-50 sticky top-0">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Product</th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Batch</th>
              <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Expiry</th>
              <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Available</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">MRP</th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Value</th>
              <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Location</th>
              <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {currentBatches.map((batch) => {
              const product = products[batch.product_id];
              const expiryStatus = getExpiryStatus(batch.expiry_date);
              const stockStatus = getStockStatus(batch);
              
              return (
                <tr key={batch.batch_id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <div>
                      <div className="text-sm font-medium text-gray-900">{product?.product_name}</div>
                      <div className="text-xs text-gray-500">{product?.product_code}</div>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-sm font-mono">{batch.batch_number}</span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <div>
                      <p className="text-sm">{new Date(batch.expiry_date).toLocaleDateString()}</p>
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${expiryStatus.color}`}>
                        {expiryStatus.text}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <div>
                      <p className="text-sm font-medium">{batch.quantity_available} {product?.unit}</p>
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${stockStatus.color}`}>
                        {stockStatus.text}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className="text-sm">₹{batch.mrp}</span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className="text-sm font-medium">₹{(batch.quantity_available * batch.mrp).toFixed(0)}</span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <span className="text-sm text-gray-600">{batch.location || 'Main Store'}</span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    <StatusBadge 
                      status={batch.is_active ? 'active' : 'inactive'} 
                      type="batch"
                    />
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
            Showing {indexOfFirstItem + 1} to {Math.min(indexOfLastItem, filteredBatches.length)} of {filteredBatches.length} batches
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
                      ? 'bg-blue-600 text-white'
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
  );

  return (
    <div className="h-full flex flex-col bg-gray-50">
      {/* Header */}
      <ModuleHeader
        title="Inventory Management"
        icon={Box}
        iconColor="text-blue-600"
        actions={[
          {
            label: "Stock Adjustment",
            onClick: () => console.log('Stock adjustment'),
            icon: RefreshCw,
            variant: "primary"
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
                <p className="text-sm text-gray-600">Total Batches</p>
                <p className="text-2xl font-bold text-blue-600">{stats.totalBatches}</p>
              </div>
              <Box className="w-8 h-8 text-blue-400" />
            </div>
          </div>
          
          <div className="bg-white rounded-lg p-4 border border-gray-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Stock Value</p>
                <p className="text-xl font-bold text-green-600">₹{(stats.totalValue / 100000).toFixed(1)}L</p>
              </div>
              <DollarSign className="w-8 h-8 text-green-400" />
            </div>
          </div>
          
          <div className="bg-white rounded-lg p-4 border border-gray-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Low Stock</p>
                <p className="text-2xl font-bold text-orange-600">{stats.lowStockItems}</p>
              </div>
              <AlertTriangle className="w-8 h-8 text-orange-400" />
            </div>
          </div>
          
          <div className="bg-white rounded-lg p-4 border border-gray-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Expiring</p>
                <p className="text-2xl font-bold text-yellow-600">{stats.expiringBatches}</p>
              </div>
              <Clock className="w-8 h-8 text-yellow-400" />
            </div>
          </div>
          
          <div className="bg-white rounded-lg p-4 border border-gray-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Expired</p>
                <p className="text-2xl font-bold text-red-600">{stats.expiredBatches}</p>
              </div>
              <XCircle className="w-8 h-8 text-red-400" />
            </div>
          </div>
        </div>
      </div>

      {/* Tabs and Filters */}
      <div className="px-6 pb-4">
        <div className="bg-white rounded-lg border border-gray-200">
          {/* Tabs */}
          <div className="border-b border-gray-200">
            <nav className="flex">
              <button
                onClick={() => setActiveTab('overview')}
                className={`px-6 py-3 text-sm font-medium border-b-2 ${
                  activeTab === 'overview'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                Overview
              </button>
              <button
                onClick={() => setActiveTab('batches')}
                className={`px-6 py-3 text-sm font-medium border-b-2 ${
                  activeTab === 'batches'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                Batch Details
              </button>
              <button
                onClick={() => setActiveTab('movements')}
                className={`px-6 py-3 text-sm font-medium border-b-2 ${
                  activeTab === 'movements'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                Stock Movements
              </button>
              <button
                onClick={() => setActiveTab('expiry')}
                className={`px-6 py-3 text-sm font-medium border-b-2 ${
                  activeTab === 'expiry'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700'
                }`}
              >
                Expiry Management
              </button>
            </nav>
          </div>

          {/* Filters */}
          {activeTab !== 'overview' && (
            <div className="p-4 flex items-center gap-4">
              {/* Search */}
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search by product name, code, or batch..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Expiry Filter */}
              <select
                value={filterExpiry}
                onChange={(e) => setFilterExpiry(e.target.value)}
                className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">All Expiry</option>
                <option value="valid">Valid</option>
                <option value="expiring">Expiring Soon</option>
                <option value="expired">Expired</option>
              </select>

              {/* Stock Filter */}
              <select
                value={filterStock}
                onChange={(e) => setFilterStock(e.target.value)}
                className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
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
                className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              >
                <option value="expiry_date-asc">Expiry (Earliest First)</option>
                <option value="expiry_date-desc">Expiry (Latest First)</option>
                <option value="product_name-asc">Product (A-Z)</option>
                <option value="quantity_available-asc">Quantity (Low to High)</option>
                <option value="quantity_available-desc">Quantity (High to Low)</option>
              </select>
            </div>
          )}
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

      {/* Content Area */}
      <div className="flex-1 overflow-hidden px-6">
        {loading ? (
          <div className="bg-white rounded-lg border border-gray-200 h-full flex items-center justify-center">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
              <p className="mt-4 text-gray-600">Loading inventory data...</p>
            </div>
          </div>
        ) : (
          <>
            {activeTab === 'overview' && renderOverviewTab()}
            {activeTab === 'batches' && renderBatchesTab()}
            {activeTab === 'movements' && (
              <div className="bg-white rounded-lg border border-gray-200 h-full flex items-center justify-center">
                <div className="text-center">
                  <ArrowUpDown className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-600">Stock movements feature coming soon</p>
                </div>
              </div>
            )}
            {activeTab === 'expiry' && (
              <div className="bg-white rounded-lg border border-gray-200 h-full flex items-center justify-center">
                <div className="text-center">
                  <Calendar className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-600">Expiry management feature coming soon</p>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};

export default InventoryManagementV2;