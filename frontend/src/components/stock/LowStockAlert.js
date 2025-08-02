import React, { useState, useEffect } from 'react';
import {
  AlertTriangle, Package, ShoppingCart, TrendingDown,
  Clock, Filter, Download, Bell, Settings, Edit2, X
} from 'lucide-react';
import { stockApi } from '../../services/api';
import { formatCurrency } from '../../utils/formatters';
import { DataTable, StatusBadge, Select } from '../global';

const LowStockAlert = ({ open = true, onClose }) => {
  const [loading, setLoading] = useState(true);
  const [alerts, setAlerts] = useState([]);
  const [filteredAlerts, setFilteredAlerts] = useState([]);
  const [filterType, setFilterType] = useState('all');
  const [alertSettings, setAlertSettings] = useState({
    enableNotifications: true,
    lowStockThreshold: 20,
    criticalStockThreshold: 10,
    expiryAlertDays: 90
  });
  const [showSettings, setShowSettings] = useState(false);
  const [stats, setStats] = useState({
    criticalItems: 0,
    lowStockItems: 0,
    expiringItems: 0,
    outOfStock: 0
  });

  useEffect(() => {
    loadAlerts();
  }, []);

  useEffect(() => {
    filterAlerts();
  }, [alerts, filterType]);

  const loadAlerts = async () => {
    setLoading(true);
    try {
      const [stockResponse, alertResponse] = await Promise.all([
        stockApi.getCurrentStock({ include_batches: true }),
        stockApi.getStockAlerts()
      ]);

      const stockData = stockResponse.data || [];
      const alertData = alertResponse.data || {};

      // Process stock data to identify alerts
      const processedAlerts = [];
      let criticalCount = 0;
      let lowStockCount = 0;
      let expiringCount = 0;
      let outOfStockCount = 0;

      stockData.forEach(item => {
        const alerts = [];
        let priority = 'low';

        // Check for out of stock
        if (item.current_stock === 0) {
          alerts.push('Out of Stock');
          priority = 'critical';
          outOfStockCount++;
        }
        // Check for critical stock
        else if (item.current_stock <= alertSettings.criticalStockThreshold) {
          alerts.push('Critical Stock');
          priority = 'critical';
          criticalCount++;
        }
        // Check for low stock
        else if (item.current_stock <= (item.reorder_level || alertSettings.lowStockThreshold)) {
          alerts.push('Low Stock');
          priority = 'high';
          lowStockCount++;
        }

        // Check for expiring items
        if (item.batches && item.batches.length > 0) {
          const today = new Date();
          const hasExpiring = item.batches.some(batch => {
            if (!batch.expiry_date) return false;
            const expiryDate = new Date(batch.expiry_date);
            const daysToExpiry = Math.floor((expiryDate - today) / (1000 * 60 * 60 * 24));
            return daysToExpiry <= alertSettings.expiryAlertDays;
          });
          
          if (hasExpiring) {
            alerts.push('Expiring Soon');
            priority = priority === 'critical' ? 'critical' : 'high';
            expiringCount++;
          }
        }

        if (alerts.length > 0) {
          processedAlerts.push({
            ...item,
            alert_types: alerts,
            priority: priority,
            days_of_stock: item.current_stock > 0 && item.daily_usage > 0
              ? Math.floor(item.current_stock / item.daily_usage)
              : null
          });
        }
      });

      // Sort by priority
      processedAlerts.sort((a, b) => {
        const priorityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
        return priorityOrder[a.priority] - priorityOrder[b.priority];
      });

      setAlerts(processedAlerts);
      setStats({
        criticalItems: criticalCount,
        lowStockItems: lowStockCount,
        expiringItems: expiringCount,
        outOfStock: outOfStockCount
      });
    } catch (error) {
      console.error('Error loading alerts:', error);
      setAlerts([]);
    } finally {
      setLoading(false);
    }
  };

  const filterAlerts = () => {
    let filtered = [...alerts];

    switch (filterType) {
      case 'critical':
        filtered = filtered.filter(item => item.priority === 'critical');
        break;
      case 'low-stock':
        filtered = filtered.filter(item => item.alert_types.includes('Low Stock'));
        break;
      case 'expiring':
        filtered = filtered.filter(item => item.alert_types.includes('Expiring Soon'));
        break;
      case 'out-of-stock':
        filtered = filtered.filter(item => item.alert_types.includes('Out of Stock'));
        break;
    }

    setFilteredAlerts(filtered);
  };

  const handleCreatePurchaseOrder = (product) => {
    // Navigate to purchase order creation with pre-filled product
    console.log('Create PO for:', product);
    
    // Calculate suggested order quantity based on reorder level and current usage
    const suggestedQty = Math.max(
      (product.reorder_level || alertSettings.lowStockThreshold) * 2,
      product.daily_usage ? Math.ceil(product.daily_usage * 30) : 100
    );
    
    const prefilledData = {
      supplier_id: product.preferred_supplier_id,
      supplier_name: product.preferred_supplier,
      items: [{
        product_id: product.product_id,
        product_name: product.product_name,
        product_code: product.product_code,
        quantity: suggestedQty,
        unit: product.unit,
        rate: product.last_purchase_price || 0,
        current_stock: product.current_stock,
        reorder_level: product.reorder_level || alertSettings.lowStockThreshold
      }],
      reference_no: `LOW-STOCK-${product.product_code}`
    };
    
    // In a real implementation, this would navigate to PurchaseOrderFlow
    // For now, we'll show what would happen
    alert(`Creating PO for ${product.product_name}\nSuggested Qty: ${suggestedQty} ${product.unit}\nSupplier: ${product.preferred_supplier || 'To be selected'}`);
  };
  
  const handleCreateBulkPO = () => {
    const selectedItems = filteredAlerts.filter(item => 
      item.alert_types.includes('Low Stock') || 
      item.alert_types.includes('Critical Stock') || 
      item.alert_types.includes('Out of Stock')
    );
    
    if (selectedItems.length === 0) {
      alert('No items available for bulk PO creation');
      return;
    }
    
    // Group items by supplier
    const supplierGroups = {};
    selectedItems.forEach(item => {
      const supplier = item.preferred_supplier || 'Unknown Supplier';
      if (!supplierGroups[supplier]) {
        supplierGroups[supplier] = [];
      }
      
      const suggestedQty = Math.max(
        (item.reorder_level || alertSettings.lowStockThreshold) * 2,
        item.daily_usage ? Math.ceil(item.daily_usage * 30) : 100
      );
      
      supplierGroups[supplier].push({
        product_id: item.product_id,
        product_name: item.product_name,
        product_code: item.product_code,
        quantity: suggestedQty,
        unit: item.unit,
        rate: item.last_purchase_price || 0,
        current_stock: item.current_stock,
        reorder_level: item.reorder_level || alertSettings.lowStockThreshold
      });
    });
    
    const supplierCount = Object.keys(supplierGroups).length;
    const totalItems = selectedItems.length;
    
    // In a real implementation, this would create multiple POs or a bulk PO flow
    alert(`Bulk PO Creation:\n${totalItems} items across ${supplierCount} suppliers\n\nSuppliers: ${Object.keys(supplierGroups).join(', ')}`);
    
    console.log('Bulk PO Data:', supplierGroups);
  };

  const handleUpdateReorderLevel = async (productId, newLevel) => {
    try {
      await stockApi.updateProductProperties(productId, {
        minimum_stock_level: newLevel
      });
      
      // Reload alerts
      loadAlerts();
    } catch (error) {
      console.error('Error updating reorder level:', error);
      alert('Failed to update reorder level');
    }
  };

  const columns = [
    {
      header: 'Product',
      field: 'product_name',
      render: (row) => (
        <div>
          <div className="font-medium text-gray-900">{row.product_name}</div>
          <div className="text-sm text-gray-500">{row.product_code}</div>
          <div className="flex flex-wrap gap-1 mt-1">
            {row.alert_types.map((alert, index) => (
              <span
                key={index}
                className={`px-1.5 py-0.5 text-xs font-medium rounded ${
                  alert === 'Out of Stock' ? 'bg-red-100 text-red-800' :
                  alert === 'Critical Stock' ? 'bg-orange-100 text-orange-800' :
                  alert === 'Low Stock' ? 'bg-yellow-100 text-yellow-800' :
                  'bg-purple-100 text-purple-800'
                }`}
              >
                {alert}
              </span>
            ))}
          </div>
        </div>
      )
    },
    {
      header: 'Current Stock',
      field: 'current_stock',
      render: (row) => (
        <div className={`font-medium ${
          row.current_stock === 0 ? 'text-red-600' :
          row.current_stock <= alertSettings.criticalStockThreshold ? 'text-orange-600' :
          'text-gray-900'
        }`}>
          {row.current_stock} {row.unit || 'Units'}
          {row.days_of_stock && (
            <div className="text-xs text-gray-500">
              ~{row.days_of_stock} days left
            </div>
          )}
        </div>
      )
    },
    {
      header: 'Reorder Level',
      field: 'reorder_level',
      render: (row) => (
        <div className="flex items-center space-x-2">
          <span>{row.reorder_level || alertSettings.lowStockThreshold} {row.unit}</span>
          <button
            onClick={() => {
              const newLevel = prompt('Enter new reorder level:', row.reorder_level || alertSettings.lowStockThreshold);
              if (newLevel && !isNaN(newLevel)) {
                handleUpdateReorderLevel(row.product_id, parseInt(newLevel));
              }
            }}
            className="p-1 text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded"
          >
            <Edit2 className="w-3 h-3" />
          </button>
        </div>
      )
    },
    {
      header: 'Last Purchase',
      field: 'last_purchase_date',
      render: (row) => (
        <div className="text-sm">
          {row.last_purchase_date ? (
            <>
              <div>{new Date(row.last_purchase_date).toLocaleDateString()}</div>
              <div className="text-gray-500">
                {row.last_purchase_quantity} {row.unit} @ {formatCurrency(row.last_purchase_price)}
              </div>
            </>
          ) : (
            <span className="text-gray-500">No recent purchase</span>
          )}
        </div>
      )
    },
    {
      header: 'Supplier',
      field: 'preferred_supplier',
      render: (row) => (
        <div className="text-sm">
          {row.preferred_supplier ? (
            <>
              <div className="font-medium">{row.preferred_supplier}</div>
              <div className="text-gray-500">{row.supplier_phone}</div>
            </>
          ) : (
            <span className="text-gray-500">No preferred supplier</span>
          )}
        </div>
      )
    },
    {
      header: 'Priority',
      field: 'priority',
      render: (row) => {
        const colors = {
          critical: 'red',
          high: 'orange',
          medium: 'yellow',
          low: 'gray'
        };
        
        return (
          <StatusBadge
            status={row.priority.toUpperCase()}
            color={colors[row.priority]}
          />
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
              <h1 className="text-2xl font-bold text-gray-900">Stock Alerts</h1>
              <p className="text-sm text-gray-600">Monitor low stock and reorder management</p>
            </div>
            <div className="flex items-center space-x-3">
              <button
                onClick={() => setShowSettings(!showSettings)}
                className="p-2 text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg"
                title="Alert Settings"
              >
                <Settings className="w-5 h-5" />
              </button>
              <button 
                onClick={handleCreateBulkPO}
                className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                <ShoppingCart className="w-4 h-4" />
                <span>Create Bulk PO</span>
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

      {/* Content */}
      <div className="flex-1 overflow-y-auto bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          {/* Alert Settings */}
          {showSettings && (
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
              <h3 className="text-lg font-medium text-gray-900 mb-4">Alert Settings</h3>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Low Stock Threshold
                  </label>
                  <input
                    type="number"
                    value={alertSettings.lowStockThreshold}
                    onChange={(e) => setAlertSettings({...alertSettings, lowStockThreshold: parseInt(e.target.value) || 0})}
                    min="0"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Enter threshold"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Critical Stock Threshold
                  </label>
                  <input
                    type="number"
                    value={alertSettings.criticalStockThreshold}
                    onChange={(e) => setAlertSettings({...alertSettings, criticalStockThreshold: parseInt(e.target.value) || 0})}
                    min="0"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Enter threshold"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Expiry Alert Days
                  </label>
                  <input
                    type="number"
                    value={alertSettings.expiryAlertDays}
                    onChange={(e) => setAlertSettings({...alertSettings, expiryAlertDays: parseInt(e.target.value) || 0})}
                    min="1"
                    max="365"
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="Enter days"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Notifications
                  </label>
                  <label className="flex items-center space-x-2 mt-2">
                    <input
                      type="checkbox"
                      checked={alertSettings.enableNotifications}
                      onChange={(e) => setAlertSettings({...alertSettings, enableNotifications: e.target.checked})}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="text-sm text-gray-700">Enable email alerts</span>
                  </label>
                </div>
              </div>
            </div>
          )}

          {/* Summary Stats */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <div 
              onClick={() => setFilterType('out-of-stock')}
              className={`bg-white rounded-lg shadow-sm border p-4 cursor-pointer transition-colors ${
                filterType === 'out-of-stock' ? 'border-red-300 bg-red-50' : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Out of Stock</p>
                  <p className="text-2xl font-bold text-red-600">{stats.outOfStock}</p>
                </div>
                <div className="p-3 bg-red-100 rounded-full">
                  <Package className="w-6 h-6 text-red-600" />
                </div>
              </div>
            </div>

            <div 
              onClick={() => setFilterType('critical')}
              className={`bg-white rounded-lg shadow-sm border p-4 cursor-pointer transition-colors ${
                filterType === 'critical' ? 'border-orange-300 bg-orange-50' : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Critical Stock</p>
                  <p className="text-2xl font-bold text-orange-600">{stats.criticalItems}</p>
                </div>
                <div className="p-3 bg-orange-100 rounded-full">
                  <AlertTriangle className="w-6 h-6 text-orange-600" />
                </div>
              </div>
            </div>

            <div 
              onClick={() => setFilterType('low-stock')}
              className={`bg-white rounded-lg shadow-sm border p-4 cursor-pointer transition-colors ${
                filterType === 'low-stock' ? 'border-yellow-300 bg-yellow-50' : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Low Stock</p>
                  <p className="text-2xl font-bold text-yellow-600">{stats.lowStockItems}</p>
                </div>
                <div className="p-3 bg-yellow-100 rounded-full">
                  <TrendingDown className="w-6 h-6 text-yellow-600" />
                </div>
              </div>
            </div>

            <div 
              onClick={() => setFilterType('expiring')}
              className={`bg-white rounded-lg shadow-sm border p-4 cursor-pointer transition-colors ${
                filterType === 'expiring' ? 'border-purple-300 bg-purple-50' : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-600">Expiring Soon</p>
                  <p className="text-2xl font-bold text-purple-600">{stats.expiringItems}</p>
                </div>
                <div className="p-3 bg-purple-100 rounded-full">
                  <Clock className="w-6 h-6 text-purple-600" />
                </div>
              </div>
            </div>
          </div>

          {/* Alert Filter Tabs */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-6">
            <div className="flex items-center space-x-4">
              <button
                onClick={() => setFilterType('all')}
                className={`px-4 py-2 rounded-lg transition-colors ${
                  filterType === 'all'
                    ? 'bg-blue-50 text-blue-700 border border-blue-300'
                    : 'text-gray-700 hover:bg-gray-50'
                }`}
              >
                All Alerts ({alerts.length})
              </button>
              <div className="h-6 w-px bg-gray-300" />
              <span className="text-sm text-gray-500">
                Click on summary cards above to filter
              </span>
            </div>
          </div>

          {/* Alerts Table */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200">
            {loading ? (
              <div className="flex items-center justify-center h-64">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
              </div>
            ) : filteredAlerts.length > 0 ? (
              <DataTable
                columns={columns}
                data={filteredAlerts}
                actions={(row) => (
                  <button
                    onClick={() => handleCreatePurchaseOrder(row)}
                    className="px-3 py-1 text-sm text-white bg-blue-600 rounded hover:bg-blue-700"
                  >
                    Create PO
                  </button>
                )}
              />
            ) : (
              <div className="text-center py-12">
                <Bell className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                <p className="text-gray-600">No alerts found</p>
                <p className="text-sm text-gray-500 mt-1">
                  {filterType === 'all' ? 'All stock levels are healthy' : 'No items match this filter'}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default LowStockAlert;