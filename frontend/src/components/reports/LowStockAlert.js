import React, { useState, useEffect } from 'react';
import { 
  AlertTriangle, 
  Package, 
  Download, 
  X,
  Search,
  Filter,
  ShoppingCart,
  TrendingDown,
  Clock,
  CheckCircle
} from 'lucide-react';
import { productsApi, batchesApi, suppliersApi } from '../../services/api';
import * as XLSX from 'xlsx';

const LowStockAlert = ({ open, onClose }) => {
  const [loading, setLoading] = useState(false);
  const [products, setProducts] = useState([]);
  const [batches, setBatches] = useState([]);
  const [suppliers, setSuppliers] = useState({});
  const [lowStockItems, setLowStockItems] = useState([]);
  const [criticalItems, setCriticalItems] = useState([]);
  const [expiringItems, setExpiringItems] = useState([]);
  const [filters, setFilters] = useState({
    search: '',
    category: 'all', // all, critical, low, expiring
    supplier: ''
  });
  const [selectedItems, setSelectedItems] = useState([]);

  useEffect(() => {
    if (open) {
      loadStockData();
    }
  }, [open]);

  const loadStockData = async () => {
    setLoading(true);
    try {
      const [productsResponse, batchesResponse, suppliersResponse] = await Promise.all([
        productsApi.getAll(),
        batchesApi.getAll(),
        suppliersApi.getAll()
      ]);

      // Create supplier lookup
      const supplierMap = {};
      suppliersResponse.data.forEach(s => {
        supplierMap[s.supplier_id] = s;
      });
      setSuppliers(supplierMap);

      // Process products and batches
      const productMap = {};
      productsResponse.data.forEach(product => {
        productMap[product.product_id] = {
          ...product,
          currentStock: 0,
          batches: [],
          nearestExpiry: null
        };
      });

      // Aggregate batch data
      batchesResponse.data.forEach(batch => {
        if (productMap[batch.product_id]) {
          productMap[batch.product_id].currentStock += batch.quantity || 0;
          productMap[batch.product_id].batches.push(batch);
          
          // Track nearest expiry
          if (batch.expiry_date && batch.quantity > 0) {
            const expiryDate = new Date(batch.expiry_date);
            if (!productMap[batch.product_id].nearestExpiry || 
                expiryDate < productMap[batch.product_id].nearestExpiry) {
              productMap[batch.product_id].nearestExpiry = expiryDate;
            }
          }
        }
      });

      const allProducts = Object.values(productMap);
      setProducts(allProducts);

      // Categorize items
      const low = [];
      const critical = [];
      const expiring = [];
      const today = new Date();
      const thirtyDaysFromNow = new Date(today.getTime() + (30 * 24 * 60 * 60 * 1000));

      allProducts.forEach(product => {
        const reorderLevel = product.reorder_level || 50;
        const minStock = product.min_stock || 20;
        
        // Check stock levels
        if (product.currentStock <= minStock) {
          critical.push({
            ...product,
            stockStatus: 'critical',
            stockPercentage: (product.currentStock / reorderLevel) * 100
          });
        } else if (product.currentStock <= reorderLevel) {
          low.push({
            ...product,
            stockStatus: 'low',
            stockPercentage: (product.currentStock / reorderLevel) * 100
          });
        }

        // Check expiring batches
        product.batches.forEach(batch => {
          if (batch.expiry_date && batch.quantity > 0) {
            const expiryDate = new Date(batch.expiry_date);
            if (expiryDate <= thirtyDaysFromNow) {
              const daysToExpiry = Math.ceil((expiryDate - today) / (1000 * 60 * 60 * 24));
              expiring.push({
                ...product,
                batch: batch,
                daysToExpiry: daysToExpiry,
                expiryDate: expiryDate,
                stockStatus: daysToExpiry <= 7 ? 'critical' : 'warning'
              });
            }
          }
        });
      });

      setLowStockItems(low);
      setCriticalItems(critical);
      setExpiringItems(expiring);
    } catch (error) {
      console.error('Error loading stock data:', error);
    } finally {
      setLoading(false);
    }
  };

  const getFilteredItems = () => {
    let items = [];
    
    switch (filters.category) {
      case 'critical':
        items = criticalItems;
        break;
      case 'low':
        items = lowStockItems;
        break;
      case 'expiring':
        items = expiringItems;
        break;
      default:
        items = [...criticalItems, ...lowStockItems];
    }

    // Apply search filter
    if (filters.search) {
      items = items.filter(item => 
        item.product_name.toLowerCase().includes(filters.search.toLowerCase()) ||
        item.sku?.toLowerCase().includes(filters.search.toLowerCase())
      );
    }

    // Apply supplier filter
    if (filters.supplier) {
      items = items.filter(item => item.supplier_id === filters.supplier);
    }

    return items;
  };

  const exportToExcel = () => {
    const wb = XLSX.utils.book_new();

    // Low Stock Items Sheet
    if (criticalItems.length > 0 || lowStockItems.length > 0) {
      const stockData = [...criticalItems, ...lowStockItems].map(item => ({
        'Product Name': item.product_name,
        'SKU': item.sku || '',
        'Current Stock': item.currentStock,
        'Reorder Level': item.reorder_level || 50,
        'Min Stock': item.min_stock || 20,
        'Status': item.stockStatus === 'critical' ? 'Critical' : 'Low Stock',
        'Supplier': suppliers[item.supplier_id]?.supplier_name || 'N/A',
        'Last Purchase Price': item.purchase_price || 0,
        'Estimated Order Qty': Math.max(0, (item.reorder_level || 50) * 2 - item.currentStock)
      }));

      const stockSheet = XLSX.utils.json_to_sheet(stockData);
      XLSX.utils.book_append_sheet(wb, stockSheet, 'Low Stock Items');
    }

    // Expiring Items Sheet
    if (expiringItems.length > 0) {
      const expiryData = expiringItems.map(item => ({
        'Product Name': item.product_name,
        'Batch Number': item.batch.batch_number,
        'Quantity': item.batch.quantity,
        'Expiry Date': new Date(item.expiryDate).toLocaleDateString('en-IN'),
        'Days to Expiry': item.daysToExpiry,
        'Status': item.stockStatus === 'critical' ? 'Critical' : 'Warning',
        'MRP': item.batch.mrp || 0,
        'Total Value': (item.batch.quantity * (item.batch.mrp || 0))
      }));

      const expirySheet = XLSX.utils.json_to_sheet(expiryData);
      XLSX.utils.book_append_sheet(wb, expirySheet, 'Expiring Items');
    }

    const filename = `Stock_Alerts_${new Date().toISOString().split('T')[0]}.xlsx`;
    XLSX.writeFile(wb, filename);
  };

  const generatePurchaseOrder = () => {
    if (selectedItems.length === 0) {
      alert('Please select items to generate purchase order');
      return;
    }
    
    // Group by supplier
    const ordersBySupplier = {};
    selectedItems.forEach(itemId => {
      const item = [...criticalItems, ...lowStockItems].find(i => i.product_id === itemId);
      if (item) {
        const supplierId = item.supplier_id || 'unknown';
        if (!ordersBySupplier[supplierId]) {
          ordersBySupplier[supplierId] = [];
        }
        ordersBySupplier[supplierId].push({
          ...item,
          orderQty: Math.max(0, (item.reorder_level || 50) * 2 - item.currentStock)
        });
      }
    });

    console.log('Purchase orders to be generated:', ordersBySupplier);
    alert('Purchase order generation would be implemented here');
  };

  const filteredItems = getFilteredItems();

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-7xl m-4 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="px-8 py-6 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Low Stock Alert</h1>
              <p className="text-gray-600 mt-1">Monitor inventory levels and expiring products</p>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <X className="w-5 h-5 text-gray-500" />
            </button>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="px-8 py-6 border-b border-gray-200 bg-gray-50">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-red-50 rounded-lg p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-red-600 font-medium">Critical Stock</p>
                  <p className="text-2xl font-bold text-red-900 mt-1">{criticalItems.length}</p>
                  <p className="text-xs text-red-600 mt-1">Below minimum level</p>
                </div>
                <AlertTriangle className="w-8 h-8 text-red-500" />
              </div>
            </div>
            <div className="bg-yellow-50 rounded-lg p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-yellow-600 font-medium">Low Stock</p>
                  <p className="text-2xl font-bold text-yellow-900 mt-1">{lowStockItems.length}</p>
                  <p className="text-xs text-yellow-600 mt-1">Below reorder level</p>
                </div>
                <TrendingDown className="w-8 h-8 text-yellow-500" />
              </div>
            </div>
            <div className="bg-orange-50 rounded-lg p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-orange-600 font-medium">Expiring Soon</p>
                  <p className="text-2xl font-bold text-orange-900 mt-1">{expiringItems.length}</p>
                  <p className="text-xs text-orange-600 mt-1">Within 30 days</p>
                </div>
                <Clock className="w-8 h-8 text-orange-500" />
              </div>
            </div>
            <div className="bg-blue-50 rounded-lg p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-blue-600 font-medium">Total Products</p>
                  <p className="text-2xl font-bold text-blue-900 mt-1">{products.length}</p>
                  <p className="text-xs text-blue-600 mt-1">In inventory</p>
                </div>
                <Package className="w-8 h-8 text-blue-500" />
              </div>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="px-8 py-4 border-b border-gray-200">
          <div className="flex items-center space-x-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                placeholder="Search products..."
                value={filters.search}
                onChange={(e) => setFilters({ ...filters, search: e.target.value })}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <select
              value={filters.category}
              onChange={(e) => setFilters({ ...filters, category: e.target.value })}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All Alerts</option>
              <option value="critical">Critical Only</option>
              <option value="low">Low Stock Only</option>
              <option value="expiring">Expiring Soon</option>
            </select>
            <button
              onClick={exportToExcel}
              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center space-x-2"
            >
              <Download className="w-4 h-4" />
              <span>Export</span>
            </button>
            {selectedItems.length > 0 && (
              <button
                onClick={generatePurchaseOrder}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center space-x-2"
              >
                <ShoppingCart className="w-4 h-4" />
                <span>Generate PO ({selectedItems.length})</span>
              </button>
            )}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-8">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
          ) : filteredItems.length === 0 ? (
            <div className="text-center py-12">
              <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
              <h3 className="text-lg font-semibold text-gray-900">All Good!</h3>
              <p className="text-gray-600 mt-2">No stock alerts at the moment</p>
            </div>
          ) : (
            <div className="space-y-4">
              {filteredItems.map((item, index) => {
                const isExpiring = item.batch !== undefined;
                const isSelected = selectedItems.includes(item.product_id);
                
                return (
                  <div
                    key={`${item.product_id}-${index}`}
                    className={`bg-white rounded-lg border ${
                      item.stockStatus === 'critical' 
                        ? 'border-red-300 bg-red-50' 
                        : item.stockStatus === 'warning'
                        ? 'border-orange-300 bg-orange-50'
                        : 'border-yellow-300 bg-yellow-50'
                    } p-6`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center space-x-3">
                          {!isExpiring && (
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setSelectedItems([...selectedItems, item.product_id]);
                                } else {
                                  setSelectedItems(selectedItems.filter(id => id !== item.product_id));
                                }
                              }}
                              className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                            />
                          )}
                          <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                            item.stockStatus === 'critical' 
                              ? 'bg-red-200' 
                              : item.stockStatus === 'warning'
                              ? 'bg-orange-200'
                              : 'bg-yellow-200'
                          }`}>
                            {isExpiring ? (
                              <Clock className={`w-5 h-5 ${
                                item.stockStatus === 'critical' 
                                  ? 'text-red-600' 
                                  : 'text-orange-600'
                              }`} />
                            ) : (
                              <Package className={`w-5 h-5 ${
                                item.stockStatus === 'critical' 
                                  ? 'text-red-600' 
                                  : 'text-yellow-600'
                              }`} />
                            )}
                          </div>
                          <div>
                            <h3 className="text-lg font-semibold text-gray-900">{item.product_name}</h3>
                            <p className="text-sm text-gray-600">
                              {item.sku && `SKU: ${item.sku} | `}
                              {suppliers[item.supplier_id]?.supplier_name || 'No supplier'}
                            </p>
                          </div>
                        </div>
                        
                        <div className="mt-4 grid grid-cols-1 md:grid-cols-4 gap-4">
                          {isExpiring ? (
                            <>
                              <div>
                                <p className="text-sm text-gray-600">Batch Number</p>
                                <p className="font-medium">{item.batch.batch_number}</p>
                              </div>
                              <div>
                                <p className="text-sm text-gray-600">Quantity</p>
                                <p className="font-medium">{item.batch.quantity}</p>
                              </div>
                              <div>
                                <p className="text-sm text-gray-600">Expiry Date</p>
                                <p className="font-medium text-red-600">
                                  {new Date(item.expiryDate).toLocaleDateString('en-IN')}
                                </p>
                              </div>
                              <div>
                                <p className="text-sm text-gray-600">Days to Expiry</p>
                                <p className={`font-medium ${
                                  item.daysToExpiry <= 7 ? 'text-red-600' : 'text-orange-600'
                                }`}>
                                  {item.daysToExpiry} days
                                </p>
                              </div>
                            </>
                          ) : (
                            <>
                              <div>
                                <p className="text-sm text-gray-600">Current Stock</p>
                                <p className={`font-medium ${
                                  item.stockStatus === 'critical' ? 'text-red-600' : 'text-yellow-600'
                                }`}>
                                  {item.currentStock}
                                </p>
                              </div>
                              <div>
                                <p className="text-sm text-gray-600">Reorder Level</p>
                                <p className="font-medium">{item.reorder_level || 50}</p>
                              </div>
                              <div>
                                <p className="text-sm text-gray-600">Min Stock</p>
                                <p className="font-medium">{item.min_stock || 20}</p>
                              </div>
                              <div>
                                <p className="text-sm text-gray-600">Stock Status</p>
                                <div className="mt-1">
                                  <div className="w-full bg-gray-200 rounded-full h-2">
                                    <div 
                                      className={`h-2 rounded-full ${
                                        item.stockStatus === 'critical' 
                                          ? 'bg-red-600' 
                                          : 'bg-yellow-600'
                                      }`}
                                      style={{ width: `${Math.min(100, item.stockPercentage)}%` }}
                                    />
                                  </div>
                                  <p className="text-xs mt-1">{item.stockPercentage.toFixed(0)}% of reorder level</p>
                                </div>
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                      
                      {!isExpiring && (
                        <div className="ml-4 text-right">
                          <p className="text-sm text-gray-600">Suggested Order</p>
                          <p className="text-lg font-semibold text-gray-900">
                            {Math.max(0, (item.reorder_level || 50) * 2 - item.currentStock)} units
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default LowStockAlert;