import React, { useState, useEffect } from 'react';
import { 
  Package, RefreshCw, AlertCircle, TrendingUp, TrendingDown, 
  Calendar, Filter, Search, Eye, Edit, Trash2, Plus, Download, Printer, MessageCircle,
  CheckCircle, XCircle, Clock, AlertTriangle, Loader2, ChevronDown, ChevronRight
} from 'lucide-react';
import { DataTable, StatusBadge, Button, ModuleHeader } from '../global';
import { stockApi, batchesApi } from '../../services/api';
import { formatCurrency } from '../../utils/formatters';
import offlineStorage from '../../services/offlineStorage';
import jsPDF from 'jspdf';

const BatchTracking = ({ open = true, onClose }) => {
  const [batches, setBatches] = useState([]);
  const [batchMovements, setBatchMovements] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedBatch, setSelectedBatch] = useState(null);
  const [showMovements, setShowMovements] = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('all');
  const [showMoreFilters, setShowMoreFilters] = useState(false);
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
      
      // Try to load from offline storage instead of using mock data
      const offlineData = await offlineStorage.getOffline('batches', { critical: true });
      
      if (offlineData && !offlineStorage.isDataStale(offlineData, 120)) { // 2 hours max
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
      
      // Try to load from offline storage
      const offlineData = await offlineStorage.getOffline(`batch_movements_${batchId}`, { persistent: true });
      
      if (offlineData && !offlineStorage.isDataStale(offlineData, 60)) { // 1 hour max for movements
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
    // Search filter
    if (searchQuery) {
      const searchLower = searchQuery.toLowerCase();
      const matchesSearch = 
        batch.batch_number?.toLowerCase().includes(searchLower) ||
        batch.product_name?.toLowerCase().includes(searchLower) ||
        batch.product_code?.toLowerCase().includes(searchLower) ||
        batch.supplier_name?.toLowerCase().includes(searchLower);
      if (!matchesSearch) return false;
    }

    // Status filter
    if (selectedStatus !== 'all') {
      if (selectedStatus === 'expiring_soon') {
        const days = Math.floor((new Date(batch.expiry_date) - new Date()) / (1000 * 60 * 60 * 24));
        if (days <= 0 || days > 30) return false;
      } else if (selectedStatus === 'near_expiry') {
        const days = Math.floor((new Date(batch.expiry_date) - new Date()) / (1000 * 60 * 60 * 24));
        if (days <= 30 || days > 60) return false;
      } else if (selectedStatus === 'expired') {
        if (new Date(batch.expiry_date) >= new Date()) return false;
      } else if (selectedStatus === 'out_of_stock') {
        if ((batch.quantity_available || 0) > 0) return false;
      }
    }

    return true;
  });

  // Multi-select functionality
  const isAllSelected = filteredBatches.length > 0 && filteredBatches.every(item => selectedIds.has(item.batch_id || item.id));
  const selectedCount = Array.from(selectedIds).filter(id => filteredBatches.some(f => (f.batch_id || f.id) === id)).length;

  const toggleSelect = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (isAllSelected) {
      setSelectedIds(prev => {
        const next = new Set(prev);
        filteredBatches.forEach(item => next.delete(item.batch_id || item.id));
        return next;
      });
    } else {
      setSelectedIds(prev => {
        const next = new Set(prev);
        filteredBatches.forEach(item => next.add(item.batch_id || item.id));
        return next;
      });
    }
  };

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

  // Export functionality
  const exportSelectedPDF = () => {
    const itemsToExport = selectedIds.size > 0 
      ? filteredBatches.filter(item => selectedIds.has(item.batch_id || item.id))
      : filteredBatches;
    
    if (itemsToExport.length === 0) return;

    try {
      const autoTable = require('jspdf-autotable');
      
      const doc = new jsPDF();
      doc.setFontSize(16);
      doc.text('Batch Tracking Report', 20, 20);
      
      const tableData = itemsToExport.map(item => [
        item.batch_number || 'N/A',
        item.product_name || 'N/A',
        item.quantity_available || 0,
        new Date(item.expiry_date).toLocaleDateString(),
        getBatchStatusText(item),
        formatCurrency((item.quantity_available || 0) * (item.cost_price || 0))
      ]);

      doc.autoTable({
        head: [['Batch #', 'Product', 'Available', 'Expiry Date', 'Status', 'Value']],
        body: tableData,
        startY: 30,
        styles: { fontSize: 9 },
        headStyles: { fillColor: [59, 130, 246] }
      });

      doc.save('batch-tracking-export.pdf');
    } catch (error) {
      
      const doc = new jsPDF();
      doc.setFontSize(16);
      doc.text('Batch Tracking Report', 20, 20);
      
      let yPos = 40;
      doc.setFontSize(10);
      doc.text('Batch # | Product | Available | Expiry | Status | Value', 20, yPos);
      yPos += 10;
      
      itemsToExport.forEach(item => {
        const rowText = `${item.batch_number} | ${item.product_name} | ${item.quantity_available} | ${new Date(item.expiry_date).toLocaleDateString()} | ${getBatchStatusText(item)} | ${formatCurrency((item.quantity_available || 0) * (item.cost_price || 0))}`;
        doc.text(rowText, 20, yPos);
        yPos += 8;
        
        if (yPos > 270) {
          doc.addPage();
          yPos = 20;
        }
      });
      
      doc.save('batch-tracking-export.pdf');
    }
  };

  const printSelected = () => {
    const itemsToPrint = selectedIds.size > 0 
      ? filteredBatches.filter(item => selectedIds.has(item.batch_id || item.id))
      : filteredBatches;
      
    const html = `<!DOCTYPE html><html><head><title>Print Batch Tracking</title>
      <style>body{font-family:Arial,sans-serif;padding:24px;} table{width:100%;border-collapse:collapse;} th,td{padding:8px;border-bottom:1px solid #ddd;text-align:left;} th{background:#f5f5f5;}</style>
      </head><body>
      <h2>Batch Tracking Report</h2>
      <table><thead><tr><th>Batch #</th><th>Product</th><th>Available</th><th>Expiry Date</th><th>Status</th><th>Value</th></tr></thead>
      <tbody>
      ${itemsToPrint.map(item => `<tr><td>${item.batch_number}</td><td>${item.product_name}</td><td>${item.quantity_available}</td><td>${new Date(item.expiry_date).toLocaleDateString()}</td><td>${getBatchStatusText(item)}</td><td>${formatCurrency((item.quantity_available || 0) * (item.cost_price || 0))}</td></tr>`).join('')}
      </tbody></table>
      </body></html>`;
    const w = window.open('', '_blank');
    if (!w) return;
    w.document.write(html);
    w.document.close();
    w.focus();
    w.print();
  };

  const whatsappSelected = () => {
    const itemsToSend = selectedIds.size > 0 
      ? filteredBatches.filter(item => selectedIds.has(item.batch_id || item.id))
      : filteredBatches;
      
    if (itemsToSend.length === 0) return;
    
    const message = encodeURIComponent(
      `Batch Tracking Report:\n\n${itemsToSend.map(item => 
        `${item.batch_number} - ${item.product_name} - Available: ${item.quantity_available} - Expires: ${new Date(item.expiry_date).toLocaleDateString()} - Status: ${getBatchStatusText(item)}`
      ).join('\n')}`
    );
    
    window.open(`https://wa.me/?text=${message}`, '_blank');
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

  // Define columns for DataTable
  const columns = [
    {
      header: (
        <input
          type="checkbox"
          checked={isAllSelected}
          onChange={toggleSelectAll}
          className="w-4 h-4 rounded border-gray-300"
        />
      ),
      key: 'select',
      render: (value, row) => (
        <input
          type="checkbox"
          checked={selectedIds.has(row.batch_id || row.id)}
          onChange={() => toggleSelect(row.batch_id || row.id)}
          className="w-4 h-4 rounded border-gray-300"
        />
      ),
      width: '50px',
    },
    {
      header: 'Expiry Date',
      key: 'expiry_date',
      sortable: true,
      render: (value) => new Date(value).toLocaleDateString(),
    },
    {
      header: 'Batch Details',
      key: 'batch_number',
      sortable: true,
      render: (value, batch) => (
        <div>
          <div className="font-medium text-gray-900">{batch.batch_number}</div>
          <div className="text-sm text-gray-500">{batch.supplier_name}</div>
        </div>
      ),
    },
    {
      header: 'Product',
      key: 'product_name',
      sortable: true,
      render: (value, batch) => (
        <div>
          <div className="text-gray-900">{value}</div>
          <div className="text-sm text-gray-500">{batch.product_code}</div>
        </div>
      ),
    },
    {
      header: 'Available Stock',
      key: 'quantity_available',
      align: 'center',
      sortable: true,
      render: (value, batch) => (
        <div>
          <div className="font-medium">{value || 0}</div>
          <div className="text-sm text-gray-500">Sold: {batch.quantity_sold || 0}</div>
        </div>
      ),
    },
    {
      header: 'Value',
      key: 'total_value',
      align: 'right',
      sortable: true,
      render: (value, batch) => formatCurrency((batch.quantity_available || 0) * (batch.cost_price || 0)),
    },
    {
      header: 'Days to Expiry',
      key: 'days_to_expiry',
      align: 'center',
      sortable: true,
      render: (value, batch) => {
        const days = Math.floor((new Date(batch.expiry_date) - new Date()) / (1000 * 60 * 60 * 24));
        return (
          <span className={`font-medium ${
            days < 0 ? 'text-red-600' : 
            days <= 30 ? 'text-orange-600' : 
            days <= 60 ? 'text-yellow-600' : 'text-green-600'
          }`}>
            {days < 0 ? 'Expired' : `${days} days`}
          </span>
        );
      },
    },
    {
      header: 'Status',
      key: 'status',
      align: 'center',
      render: (value, batch) => (
        <StatusBadge
          status={getBatchStatusColor(batch)}
          text={getBatchStatusText(batch)}
        />
      ),
    },
    {
      header: 'Actions',
      key: 'actions',
      align: 'center',
      sortable: false,
      render: (_, batch) => (
        <div className="flex items-center space-x-1">
          <button
            onClick={() => handleBatchSelect(batch)}
            className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
            title="View Movements"
          >
            <Eye className="w-4 h-4" />
          </button>
          
          <button
            onClick={() => {
              setSelectedIds(new Set([batch.batch_id || batch.id]));
              setTimeout(() => printSelected(), 0);
            }}
            className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
            title="Print"
          >
            <Printer className="w-4 h-4" />
          </button>

          <button
            onClick={() => {
              setSelectedIds(new Set([batch.batch_id || batch.id]));
              setTimeout(() => exportSelectedPDF(), 0);
            }}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
            title="Download PDF"
          >
            <Download className="w-4 h-4" />
          </button>
          
          <button
            onClick={() => {
              setSelectedIds(new Set([batch.batch_id || batch.id]));
              setTimeout(() => whatsappSelected(), 0);
            }}
            className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
            title="Send WhatsApp"
          >
            <MessageCircle className="w-4 h-4" />
          </button>
          
          <button
            className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
            title="Edit"
          >
            <Edit className="w-4 h-4" />
          </button>
        </div>
      ),
      width: '180px',
    }
  ];

  if (!open) return null;

  return (
    <div className="h-full bg-blue-50">
      <div className="h-full flex flex-col">
        
        {/* Header - Using Global ModuleHeader */}
        <ModuleHeader
          title="Batch Tracking"
          subtitle="Monitor product batches, expiry dates, and stock levels"
          icon={Package}
          iconColor="text-purple-600"
          onClose={onClose}
          historyType="batch"
          additionalActions={[
            {
              label: "Refresh",
              onClick: handleRefresh,
              variant: "default",
              icon: refreshing ? Loader2 : RefreshCw,
              disabled: refreshing
            }
          ]}
        />

        {/* Keyboard Shortcuts Help */}
        <div className="bg-blue-50 px-4 py-2 text-xs text-blue-700 border-b border-blue-200">
          Keyboard shortcuts: <strong>Ctrl+F</strong> - Search | <strong>Esc</strong> - Close
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-6xl mx-auto px-6 py-6">

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

            {/* Enhanced Filter Bar */}
            <div className="mb-6 border border-gray-200 rounded-lg bg-gray-50 p-4">
              <div className="flex items-center space-x-4">
                {/* Select All */}
                <label className="inline-flex items-center space-x-2">
                  <input
                    type="checkbox"
                    checked={isAllSelected}
                    onChange={toggleSelectAll}
                    className="w-4 h-4 rounded border-gray-300"
                  />
                  <span className="text-sm text-gray-600">Select All</span>
                </label>

                {/* Search */}
                <div className="flex-1 relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search batches by number, product, or supplier..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                  />
                </div>

                {/* Status Filter */}
                <div className="relative">
                  <select
                    value={selectedStatus}
                    onChange={(e) => setSelectedStatus(e.target.value)}
                    className="appearance-none pl-3 pr-8 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm bg-white"
                  >
                    <option value="all">Status: All</option>
                    <option value="expiring_soon">Expiring Soon</option>
                    <option value="near_expiry">Near Expiry</option>
                    <option value="expired">Expired</option>
                    <option value="out_of_stock">Out of Stock</option>
                  </select>
                  <ChevronDown className="absolute right-2 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                </div>

                {/* Bulk Actions */}
                {selectedCount > 0 ? (
                  <div className="flex items-center space-x-2">
                    <span className="text-sm text-gray-700 mr-1">Selected: {selectedCount}</span>
                    <button 
                      onClick={exportSelectedPDF} 
                      className="px-3 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-700 text-sm flex items-center space-x-2"
                    >
                      <Download className="w-4 h-4" />
                      <span>PDF</span>
                    </button>
                    <button 
                      onClick={printSelected} 
                      className="px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm flex items-center space-x-1"
                    >
                      <Printer className="w-4 h-4" />
                      <span>Print</span>
                    </button>
                    <button 
                      onClick={whatsappSelected} 
                      className="px-3 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm flex items-center space-x-1"
                    >
                      <MessageCircle className="w-4 h-4" />
                      <span>WhatsApp</span>
                    </button>
                  </div>
                ) : (
                  <button 
                    onClick={exportSelectedPDF}
                    className="px-4 py-2 bg-gray-800 text-white rounded-lg hover:bg-gray-700 transition-colors text-sm flex items-center space-x-2"
                  >
                    <Download className="w-4 h-4" />
                    <span>Export PDF</span>
                  </button>
                )}
              </div>
              
              {/* Summary Stats */}
              <div className="flex items-center justify-end gap-4 text-sm mt-2 pt-2 border-t border-gray-200">
                <div>
                  <span className="text-gray-500">Total Value:</span>
                  <span className="ml-1 font-semibold">
                    {formatCurrency(filteredBatches.reduce((sum, item) => sum + ((item.quantity_available || 0) * (item.cost_price || 0)), 0))}
                  </span>
                </div>
                <div>
                  <span className="text-gray-500">Batches:</span>
                  <span className="ml-1 font-semibold">{filteredBatches.length}</span>
                </div>
              </div>
            </div>

            {/* Loading State */}
            {loading && (
              <div className="bg-white rounded-lg shadow-sm border border-blue-200 p-8 mb-6">
                <div className="text-center">
                  <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4 text-blue-600" />
                  <p className="text-gray-600">Loading batch data...</p>
                </div>
              </div>
            )}

            {/* Batches Table */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200">
              {filteredBatches.length === 0 && !loading ? (
                <div className="text-center py-12">
                  <Package className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                  <p className="text-gray-600">No batch data found</p>
                </div>
              ) : (
                <DataTable
                  columns={columns}
                  data={filteredBatches}
                  keyField="batch_id"
                  loading={loading}
                  emptyMessage="No batches found"
                  emptyIcon={<Package className="w-12 h-12 text-gray-400" />}
                  hoverable={true}
                  striped={true}
                  paginated={true}
                  pageSize={20}
                  searchable={false}
                />
              )}
            </div>
          </div>
        </div>
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
  );
};

export default BatchTracking;