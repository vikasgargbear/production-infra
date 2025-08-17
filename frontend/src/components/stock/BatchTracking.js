import React, { useState, useEffect } from 'react';
import { 
  Package, RefreshCw, AlertCircle, TrendingUp, TrendingDown, 
  Calendar, Filter, Search, Eye, Edit, Trash2, Plus,
  CheckCircle, XCircle, Clock, AlertTriangle, Loader2
} from 'lucide-react';
import { DataTable, StatusBadge, Button, ModuleHeader } from '../global/ui';
import { stockApi, batchesApi } from '../../services/api';
import offlineStorage from '../../services/offlineStorage';

const BatchTracking = ({ open, onClose }) => {
  const [batches, setBatches] = useState([]);
  const [batchMovements, setBatchMovements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedBatch, setSelectedBatch] = useState(null);
  const [showMovements, setShowMovements] = useState(false);
  const [filters, setFilters] = useState({
    status: 'all',
    expiryRange: 'all',
    search: ''
  });

  const [stats, setStats] = useState({
    expiringSoon: 0,
    nearExpiry: 0,
    expired: 0,
    outOfStock: 0,
    totalBatches: 0,
    totalValue: 0
  });

  // Load batches with offline fallback
  const loadBatches = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await batchesApi.getAll();
      
      if (response?.data && Array.isArray(response.data)) {
        const batchesData = response.data;
        setBatches(batchesData);
        
        // Store data offline for future use
        await offlineStorage.storeOffline('batches', batchesData, { 
          critical: true, 
          persistent: true 
        });
        
        // Calculate stats from real data
        calculateStats(batchesData);
      } else {
        setBatches([]);
        setStats({
          expiringSoon: 0,
          nearExpiry: 0,
          expired: 0,
          outOfStock: 0,
          totalBatches: 0,
          totalValue: 0
        });
      }
    } catch (error) {
      console.error('Error loading batches:', error);
      
      // Try to load from offline storage instead of using mock data
      const offlineData = await offlineStorage.getOffline('batches', { critical: true });
      
      if (offlineData && !offlineStorage.isDataStale(offlineData, 120)) { // 2 hours max
        console.log('📱 Using offline batch data');
        setBatches(offlineData.data);
        calculateStats(offlineData.data);
        
        // Show offline indicator
        setError('Currently using offline data. Some information may be outdated.');
      } else {
        // No offline data available - show proper error instead of mock data
        setError('Unable to load batch data. Please check your connection and try again.');
        setBatches([]);
        setStats({
          expiringSoon: 0,
          nearExpiry: 0,
          expired: 0,
          outOfStock: 0,
          totalBatches: 0,
          totalValue: 0
        });
      }
    } finally {
      setLoading(false);
    }
  };

  // Calculate stats from real data
  const calculateStats = (batchesData) => {
    if (!batchesData || batchesData.length === 0) {
      setStats({
        expiringSoon: 0,
        nearExpiry: 0,
        expired: 0,
        outOfStock: 0,
        totalBatches: 0,
        totalValue: 0
      });
      return;
    }

    const today = new Date();
    
    const expiringSoonBatches = batchesData.filter(batch => {
      if (!batch.expiry_date) return false;
      const days = Math.floor((new Date(batch.expiry_date) - today) / (1000 * 60 * 60 * 24));
      return days > 0 && days <= 30;
    });
    
    const nearExpiryBatches = batchesData.filter(batch => {
      if (!batch.expiry_date) return false;
      const days = Math.floor((new Date(batch.expiry_date) - today) / (1000 * 60 * 60 * 24));
      return days > 30 && days <= 60;
    });
    
    const expiredBatches = batchesData.filter(batch => {
      if (!batch.expiry_date) return false;
      return new Date(batch.expiry_date) < today;
    });
    
    const outOfStockBatches = batchesData.filter(batch => 
      (batch.quantity_available || 0) === 0
    );
    
    const totalValue = batchesData.reduce((sum, batch) => {
      return sum + ((batch.quantity_available || 0) * (batch.cost_price || 0));
    }, 0);

    setStats({
      expiringSoon: expiringSoonBatches.length,
      nearExpiry: nearExpiryBatches.length,
      expired: expiredBatches.length,
      outOfStock: outOfStockBatches.length,
      totalBatches: batchesData.length,
      totalValue: totalValue
    });
  };

  // Load batch movements with offline fallback
  const loadBatchMovements = async (batchId) => {
    try {
      const response = await stockApi.getBatchMovements(batchId);
      
      if (response?.data && Array.isArray(response.data)) {
        const movementsData = response.data;
        setBatchMovements(movementsData);
        
        // Store movements offline
        await offlineStorage.storeOffline(`batch_movements_${batchId}`, movementsData, { 
          persistent: true 
        });
      } else {
        setBatchMovements([]);
      }
    } catch (error) {
      console.error('Error loading batch movements:', error);
      
      // Try to load from offline storage
      const offlineData = await offlineStorage.getOffline(`batch_movements_${batchId}`, { persistent: true });
      
      if (offlineData && !offlineStorage.isDataStale(offlineData, 60)) { // 1 hour max for movements
        console.log('📱 Using offline movement data');
        setBatchMovements(offlineData.data);
      } else {
        setBatchMovements([]);
        setError('Unable to load movement data. Please check your connection and try again.');
      }
    }
  };

  // Refresh data
  const handleRefresh = async () => {
    setRefreshing(true);
    setError(null);
    
    try {
      await loadBatches();
      
      if (selectedBatch) {
        await loadBatchMovements(selectedBatch.batch_id);
      }
    } catch (error) {
      console.error('Error refreshing data:', error);
      setError('Failed to refresh data. Please try again.');
    } finally {
      setRefreshing(false);
    }
  };

  // Handle batch selection
  const handleBatchSelect = async (batch) => {
    setSelectedBatch(batch);
    setShowMovements(true);
    await loadBatchMovements(batch.batch_id);
  };

  // Filter batches
  const filteredBatches = batches.filter(batch => {
    if (filters.status !== 'all') {
      if (filters.status === 'expiring_soon') {
        const days = Math.floor((new Date(batch.expiry_date) - new Date()) / (1000 * 60 * 60 * 24));
        if (days <= 0 || days > 30) return false;
      } else if (filters.status === 'near_expiry') {
        const days = Math.floor((new Date(batch.expiry_date) - new Date()) / (1000 * 60 * 60 * 24));
        if (days <= 30 || days > 60) return false;
      } else if (filters.status === 'expired') {
        if (new Date(batch.expiry_date) >= new Date()) return false;
      } else if (filters.status === 'out_of_stock') {
        if ((batch.quantity_available || 0) > 0) return false;
      }
    }

    if (filters.search) {
      const searchLower = filters.search.toLowerCase();
      return (
        batch.batch_number?.toLowerCase().includes(searchLower) ||
        batch.product_name?.toLowerCase().includes(searchLower) ||
        batch.product_code?.toLowerCase().includes(searchLower) ||
        batch.supplier_name?.toLowerCase().includes(searchLower)
      );
    }

    return true;
  });

  // Get status color for batch
  const getBatchStatusColor = (batch) => {
    if (!batch.expiry_date) return 'gray';
    
    const days = Math.floor((new Date(batch.expiry_date) - new Date()) / (1000 * 60 * 60 * 24));
    
    if (days < 0) return 'red'; // Expired
    if (days <= 30) return 'orange'; // Expiring soon
    if (days <= 60) return 'yellow'; // Near expiry
    if ((batch.quantity_available || 0) === 0) return 'gray'; // Out of stock
    return 'green'; // Good
  };

  // Get status text for batch
  const getBatchStatusText = (batch) => {
    if (!batch.expiry_date) return 'Unknown';
    
    const days = Math.floor((new Date(batch.expiry_date) - new Date()) / (1000 * 60 * 60 * 24));
    
    if (days < 0) return 'Expired';
    if (days <= 30) return 'Expiring Soon';
    if (days <= 60) return 'Near Expiry';
    if ((batch.quantity_available || 0) === 0) return 'Out of Stock';
    return 'Good';
  };

  // Load data on component mount
  useEffect(() => {
    if (open) {
      loadBatches();
    }
  }, [open]);

  // Clear old offline data periodically
  useEffect(() => {
    const interval = setInterval(() => {
      offlineStorage.clearOldData(24); // Clear data older than 24 hours
    }, 60 * 60 * 1000); // Check every hour

    return () => clearInterval(interval);
  }, []);

  if (!open) return null;

  if (loading) {
    return (
      <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
        <div className="relative top-20 mx-auto p-5 border w-96 shadow-lg rounded-md bg-white">
          <div className="flex items-center justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
            <span className="ml-2 text-gray-600">Loading batch data...</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
      <div className="relative top-20 mx-auto p-5 border w-11/12 max-w-6xl shadow-lg rounded-md bg-white">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">Batch Tracking</h2>
            <p className="text-gray-600">Monitor product batches, expiry dates, and stock levels</p>
          </div>
          <div className="flex items-center space-x-2">
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="inline-flex items-center px-3 py-2 border border-gray-300 rounded-md bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <RefreshCw className={`h-4 w-4 mr-1 ${refreshing ? 'animate-spin' : ''}`} />
              {refreshing ? 'Refreshing...' : 'Refresh'}
            </button>
            <button
              onClick={onClose}
              className="inline-flex items-center px-3 py-2 border border-gray-300 rounded-md bg-white text-gray-700 hover:bg-gray-50"
            >
              Close
            </button>
          </div>
        </div>

        {/* Error Display */}
        {error && (
          <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <AlertCircle className="h-5 w-5 text-red-600 mr-2" />
                <span className="text-red-800">{error}</span>
              </div>
              <button
                onClick={() => setError(null)}
                className="text-sm text-red-600 hover:text-red-800 underline"
              >
                Dismiss
              </button>
            </div>
          </div>
        )}

        {/* Stats Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
            <div className="flex items-center">
              <AlertTriangle className="h-8 w-8 text-orange-600 mr-3" />
              <div>
                <p className="text-sm font-medium text-blue-600">Expiring Soon</p>
                <p className="text-2xl font-bold text-blue-900">{stats.expiringSoon}</p>
              </div>
            </div>
          </div>
          
          <div className="bg-yellow-50 p-4 rounded-lg border border-yellow-200">
            <div className="flex items-center">
              <Clock className="h-8 w-8 text-yellow-600 mr-3" />
              <div>
                <p className="text-sm font-medium text-yellow-600">Near Expiry</p>
                <p className="text-2xl font-bold text-yellow-900">{stats.nearExpiry}</p>
              </div>
            </div>
          </div>
          
          <div className="bg-red-50 p-4 rounded-lg border border-red-200">
            <div className="flex items-center">
              <XCircle className="h-8 w-8 text-red-600 mr-3" />
              <div>
                <p className="text-sm font-medium text-red-600">Expired</p>
                <p className="text-2xl font-bold text-red-900">{stats.expired}</p>
              </div>
            </div>
          </div>
          
          <div className="bg-gray-50 p-4 rounded-lg border border-gray-200">
            <div className="flex items-center">
              <Package className="h-8 w-8 text-gray-600 mr-3" />
              <div>
                <p className="text-sm font-medium text-gray-600">Total Batches</p>
                <p className="text-2xl font-bold text-gray-900">{stats.totalBatches}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-gray-50 p-4 rounded-lg mb-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Status Filter</label>
              <select
                value={filters.status}
                onChange={(e) => setFilters(prev => ({ ...prev, status: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">All Batches</option>
                <option value="expiring_soon">Expiring Soon (≤30 days)</option>
                <option value="near_expiry">Near Expiry (31-60 days)</option>
                <option value="expired">Expired</option>
                <option value="out_of_stock">Out of Stock</option>
              </select>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">Search</label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search batches..."
                  value={filters.search}
                  onChange={(e) => setFilters(prev => ({ ...prev, search: e.target.value }))}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
            
            <div className="flex items-end">
              <Button
                onClick={() => setFilters({ status: 'all', expiryRange: 'all', search: '' })}
                variant="outline"
                size="sm"
              >
                Clear Filters
              </Button>
            </div>
          </div>
        </div>

        {/* Batches Table */}
        <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200">
            <h3 className="text-lg font-medium text-gray-900">
              Batches ({filteredBatches.length})
            </h3>
          </div>
          
          {filteredBatches.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <Package className="h-12 w-12 mx-auto mb-2 text-gray-300" />
              <p>No batches found matching your criteria</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Batch Details
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Product
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Stock Levels
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Expiry
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {filteredBatches.map((batch) => (
                    <tr key={batch.batch_id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div>
                          <div className="text-sm font-medium text-gray-900">
                            {batch.batch_number}
                          </div>
                          <div className="text-sm text-gray-500">
                            {batch.supplier_name}
                          </div>
                        </div>
                      </td>
                      
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div>
                          <div className="text-sm font-medium text-gray-900">
                            {batch.product_name}
                          </div>
                          <div className="text-sm text-gray-500">
                            {batch.product_code}
                          </div>
                        </div>
                      </td>
                      
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">
                          <div>Available: {batch.quantity_available || 0}</div>
                          <div className="text-gray-500">
                            Sold: {batch.quantity_sold || 0}
                          </div>
                        </div>
                      </td>
                      
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">
                          <div>MFG: {new Date(batch.manufacturing_date).toLocaleDateString()}</div>
                          <div className="text-gray-500">
                            EXP: {new Date(batch.expiry_date).toLocaleDateString()}
                          </div>
                        </div>
                      </td>
                      
                      <td className="px-6 py-4 whitespace-nowrap">
                        <StatusBadge
                          status={getBatchStatusColor(batch)}
                          text={getBatchStatusText(batch)}
                        />
                      </td>
                      
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        <div className="flex items-center space-x-2">
                          <button
                            onClick={() => handleBatchSelect(batch)}
                            className="text-blue-600 hover:text-blue-900"
                            title="View Movements"
                          >
                            <Eye className="h-4 w-4" />
                          </button>
                          <button
                            className="text-gray-600 hover:text-gray-900"
                            title="Edit Batch"
                          >
                            <Edit className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Batch Movements Modal */}
        {showMovements && selectedBatch && (
          <div className="fixed inset-0 bg-gray-600 bg-opacity-50 overflow-y-auto h-full w-full z-50">
            <div className="relative top-20 mx-auto p-5 border w-11/12 max-w-4xl shadow-lg rounded-md bg-white">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h3 className="text-xl font-bold text-gray-900">
                    Batch Movements - {selectedBatch.batch_number}
                  </h3>
                  <p className="text-gray-600">{selectedBatch.product_name}</p>
                </div>
                <button
                  onClick={() => setShowMovements(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  Close
                </button>
              </div>
              
              {batchMovements.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  <Package className="h-12 w-12 mx-auto mb-2 text-gray-300" />
                  <p>No movement history found for this batch</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Date
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Type
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Quantity
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Reference
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          User
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {batchMovements.map((movement, index) => (
                        <tr key={index} className="hover:bg-gray-50">
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {new Date(movement.movement_date).toLocaleDateString()}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <StatusBadge
                              status={movement.movement_type === 'in' ? 'green' : 'red'}
                              text={movement.movement_type === 'in' ? 'In' : 'Out'}
                            />
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {movement.quantity}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {movement.reference_number || 'N/A'}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {movement.user_name || 'System'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default BatchTracking;