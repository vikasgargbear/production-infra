import React, { useState, useEffect } from 'react';
import {
  ArrowDownToLine, Search, Filter, Download, Eye, Printer, MessageCircle,
  ArrowUpFromLine, ArrowRightLeft, Package, ChevronDown, ChevronRight,
  Calendar, AlertCircle, CheckCircle, Clock, RefreshCw, Loader2
} from 'lucide-react';
import { stockApi } from '../../services/api';
import { formatCurrency } from '../../utils/formatters';
import { DataTable, ModuleHeader } from '../global';
import jsPDF from 'jspdf';

const StockMovement = ({ open = true, onClose }) => {
  const [movements, setMovements] = useState([]);
  const [filteredMovements, setFilteredMovements] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedType, setSelectedType] = useState('all');
  const [selectedStatus, setSelectedStatus] = useState('all');
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [showMoreFilters, setShowMoreFilters] = useState(false);
  const [dateFilter, setDateFilter] = useState('all');
  const [currentPage, setCurrentPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);

  useEffect(() => {
    loadStockMovements();
  }, []);

  useEffect(() => {
    filterMovements();
  }, [movements, searchQuery, selectedType, selectedStatus, dateFilter]);

  const loadStockMovements = async () => {
    try {
      setLoading(true);
      setError(null);

      // Fetch stock movements with pagination
      const response = await stockApi.getMovements({
        limit: 50,
        skip: 0,
        sort: 'movement_date',
        order: 'desc'
      });

      // Transform data to match interface
      const movementsData = (response.data?.movements || response.data || []).map((movement) => ({
        id: movement.id || Math.random().toString(36).substr(2, 9),
        movement_no: movement.movement_no || movement.transaction_id || `STK-${movement.id}`,
        product_name: movement.product_name || movement.product?.product_name || 'Unknown Product',
        movement_type: movement.movement_type || movement.type || 'adjustment',
        quantity: Math.abs(parseFloat(movement.quantity) || 0),
        reference_no: movement.reference_no || movement.reference_document || movement.invoice_no,
        movement_date: movement.movement_date || movement.transaction_date || movement.created_at,
        reason: movement.reason || movement.notes,
        batch_no: movement.batch_no || movement.batch_number,
        location_from: movement.location_from || movement.from_location,
        location_to: movement.location_to || movement.to_location,
        created_by: movement.created_by || movement.user_name,
        status: movement.status || 'completed',
        unit_price: parseFloat(movement.unit_price) || 0,
        total_value: (parseFloat(movement.quantity) || 0) * (parseFloat(movement.unit_price) || 0)
      }));

      setMovements(movementsData);
    } catch (err) {
      console.error('Error loading stock movements:', err);
      setError('Failed to load stock movement data');
      // Set mock data for development
      setMovements(generateMockMovements());
    } finally {
      setLoading(false);
    }
  };

  const generateMockMovements = () => {
    const mockData = [];
    const products = ['Paracetamol 500mg', 'Amoxicillin 250mg', 'Aspirin 100mg', 'Cough Syrup', 'Vitamin D3'];
    const types = ['receive', 'issue', 'transfer', 'adjustment'];
    const statuses = ['completed', 'pending', 'cancelled'];
    
    for (let i = 0; i < 25; i++) {
      const type = types[Math.floor(Math.random() * types.length)];
      const quantity = Math.floor(Math.random() * 1000) + 10;
      const unitPrice = Math.floor(Math.random() * 100) + 5;
      
      mockData.push({
        id: `mov_${i + 1}`,
        movement_no: `STK-${String(i + 1).padStart(4, '0')}`,
        product_name: products[Math.floor(Math.random() * products.length)],
        movement_type: type,
        quantity: quantity,
        reference_no: type === 'receive' ? `PO-${Math.floor(Math.random() * 1000)}` : 
                     type === 'issue' ? `INV-${Math.floor(Math.random() * 1000)}` : '',
        movement_date: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000).toISOString(),
        reason: type === 'adjustment' ? 'Stock count correction' : '',
        batch_no: `B${Math.floor(Math.random() * 1000)}`,
        location_from: type === 'transfer' ? 'Warehouse A' : '',
        location_to: type === 'transfer' ? 'Warehouse B' : 'Main Store',
        created_by: 'System User',
        status: statuses[Math.floor(Math.random() * statuses.length)],
        unit_price: unitPrice,
        total_value: quantity * unitPrice
      });
    }
    
    return mockData.sort((a, b) => new Date(b.movement_date) - new Date(a.movement_date));
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadStockMovements();
    setRefreshing(false);
  };

  const filterMovements = () => {
    let filtered = movements;

    // Search filter
    if (searchQuery) {
      filtered = filtered.filter(movement => 
        movement.movement_no.toLowerCase().includes(searchQuery.toLowerCase()) ||
        movement.product_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        movement.reference_no?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        movement.batch_no?.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    // Type filter
    if (selectedType !== 'all') {
      filtered = filtered.filter(movement => movement.movement_type === selectedType);
    }

    // Status filter
    if (selectedStatus !== 'all') {
      filtered = filtered.filter(movement => movement.status === selectedStatus);
    }

    // Date filter
    if (dateFilter !== 'all') {
      const today = new Date();
      filtered = filtered.filter(movement => {
        const movementDate = new Date(movement.movement_date);
        const daysDiff = Math.floor((today - movementDate) / (1000 * 60 * 60 * 24));
        
        switch (dateFilter) {
          case '7': return daysDiff <= 7;
          case '30': return daysDiff <= 30;
          case '90': return daysDiff <= 90;
          default: return true;
        }
      });
    }

    setFilteredMovements(filtered);
  };

  // Multi-select functionality
  const isAllSelected = filteredMovements.length > 0 && filteredMovements.every(item => selectedIds.has(item.id));
  const selectedCount = Array.from(selectedIds).filter(id => filteredMovements.some(f => f.id === id)).length;

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
        filteredMovements.forEach(item => next.delete(item.id));
        return next;
      });
    } else {
      setSelectedIds(prev => {
        const next = new Set(prev);
        filteredMovements.forEach(item => next.add(item.id));
        return next;
      });
    }
  };

  const exportSelectedPDF = () => {
    const itemsToExport = selectedIds.size > 0 
      ? filteredMovements.filter(item => selectedIds.has(item.id))
      : filteredMovements;
    
    if (itemsToExport.length === 0) return;

    try {
      const autoTable = require('jspdf-autotable');
      
      const doc = new jsPDF();
      doc.setFontSize(16);
      doc.text('Stock Movement Report', 20, 20);
      
      const tableData = itemsToExport.map(item => [
        item.movement_no || 'N/A',
        item.product_name || 'N/A',
        getMovementTypeLabel(item.movement_type),
        item.quantity || 0,
        formatCurrency(item.total_value || 0),
        new Date(item.movement_date).toLocaleDateString(),
        item.status || 'N/A'
      ]);

      doc.autoTable({
        head: [['Movement #', 'Product', 'Type', 'Quantity', 'Value', 'Date', 'Status']],
        body: tableData,
        startY: 30,
        styles: { fontSize: 9 },
        headStyles: { fillColor: [59, 130, 246] }
      });

      doc.save('stock-movements-export.pdf');
    } catch (error) {
      console.warn('jspdf-autotable not available, using simple PDF export');
      
      const doc = new jsPDF();
      doc.setFontSize(16);
      doc.text('Stock Movement Report', 20, 20);
      
      let yPos = 40;
      doc.setFontSize(10);
      doc.text('Movement # | Product | Type | Quantity | Value | Date | Status', 20, yPos);
      yPos += 10;
      
      itemsToExport.forEach(item => {
        const rowText = `${item.movement_no} | ${item.product_name} | ${getMovementTypeLabel(item.movement_type)} | ${item.quantity} | ${formatCurrency(item.total_value)} | ${new Date(item.movement_date).toLocaleDateString()} | ${item.status}`;
        doc.text(rowText, 20, yPos);
        yPos += 8;
        
        if (yPos > 270) {
          doc.addPage();
          yPos = 20;
        }
      });
      
      doc.save('stock-movements-export.pdf');
    }
  };

  const printSelected = () => {
    const itemsToPrint = selectedIds.size > 0 
      ? filteredMovements.filter(item => selectedIds.has(item.id))
      : filteredMovements;
      
    const html = `<!DOCTYPE html><html><head><title>Print Stock Movements</title>
      <style>body{font-family:Arial,sans-serif;padding:24px;} table{width:100%;border-collapse:collapse;} th,td{padding:8px;border-bottom:1px solid #ddd;text-align:left;} th{background:#f5f5f5;}</style>
      </head><body>
      <h2>Stock Movement Report</h2>
      <table><thead><tr><th>Movement #</th><th>Product</th><th>Type</th><th>Quantity</th><th>Value</th><th>Date</th><th>Status</th></tr></thead>
      <tbody>
      ${itemsToPrint.map(item => `<tr><td>${item.movement_no}</td><td>${item.product_name}</td><td>${getMovementTypeLabel(item.movement_type)}</td><td>${item.quantity}</td><td>${formatCurrency(item.total_value)}</td><td>${new Date(item.movement_date).toLocaleDateString()}</td><td>${item.status}</td></tr>`).join('')}
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
      ? filteredMovements.filter(item => selectedIds.has(item.id))
      : filteredMovements;
      
    if (itemsToSend.length === 0) return;
    
    const message = encodeURIComponent(
      `Stock Movement Report:\n\n${itemsToSend.map(item => 
        `${item.movement_no} - ${item.product_name} (${getMovementTypeLabel(item.movement_type)}) - ${item.quantity} units - ${formatCurrency(item.total_value)}`
      ).join('\n')}`
    );
    
    window.open(`https://wa.me/?text=${message}`, '_blank');
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'completed': return 'bg-success-100 text-success-800';
      case 'pending': return 'bg-warning-100 text-warning-800';
      case 'cancelled': return 'bg-danger-100 text-danger-800';
      default: return 'bg-app-100 text-app-800';
    }
  };

  const getMovementTypeIcon = (type) => {
    switch (type) {
      case 'receive': return <ArrowDownToLine className="w-4 h-4 text-success-600" />;
      case 'issue': return <ArrowUpFromLine className="w-4 h-4 text-danger-600" />;
      case 'transfer': return <ArrowRightLeft className="w-4 h-4 text-primary-600" />;
      case 'adjustment': return <Package className="w-4 h-4 text-warning-600" />;
      default: return <Package className="w-4 h-4 text-app-600" />;
    }
  };

  const getMovementTypeLabel = (type) => {
    switch (type) {
      case 'receive': return 'Stock In';
      case 'issue': return 'Stock Out';
      case 'transfer': return 'Transfer';
      case 'adjustment': return 'Adjustment';
      default: return 'Other';
    }
  };

  const getMovementTypeColor = (type) => {
    switch (type) {
      case 'receive': return 'text-success-600';
      case 'issue': return 'text-danger-600';
      case 'transfer': return 'text-primary-600';
      case 'adjustment': return 'text-warning-600';
      default: return 'text-app-600';
    }
  };

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
          checked={selectedIds.has(row.id)}
          onChange={() => toggleSelect(row.id)}
          className="w-4 h-4 rounded border-gray-300"
        />
      ),
      width: '50px',
    },
    {
      header: 'Date',
      key: 'movement_date',
      sortable: true,
      render: (value) => new Date(value).toLocaleDateString(),
    },
    {
      header: 'Movement #',
      key: 'movement_no',
      sortable: true,
      render: (_, movement) => (
        <div className="flex items-center gap-2">
          {getMovementTypeIcon(movement.movement_type)}
          <div>
            <div className="font-medium text-app-900">{movement.movement_no}</div>
            <div className={`text-sm ${getMovementTypeColor(movement.movement_type)}`}>
              {getMovementTypeLabel(movement.movement_type)}
            </div>
          </div>
        </div>
      ),
    },
    {
      header: 'Product',
      key: 'product_name',
      sortable: true,
      render: (value, movement) => (
        <div>
          <div className="text-app-900">{value}</div>
          {movement.batch_no && (
            <div className="text-sm text-app-500">Batch: {movement.batch_no}</div>
          )}
        </div>
      ),
    },
    {
      header: 'Quantity',
      key: 'quantity',
      align: 'center',
      sortable: true,
      render: (value, movement) => (
        <span className={`font-medium ${getMovementTypeColor(movement.movement_type)}`}>
          {movement.movement_type === 'issue' ? '-' : '+'}{value}
        </span>
      ),
    },
    {
      header: 'Value',
      key: 'total_value',
      align: 'right',
      sortable: true,
      render: (value) => formatCurrency(value),
    },
    {
      header: 'Reference',
      key: 'reference_no',
      render: (value) => value || '-',
    },
    {
      header: 'Status',
      key: 'status',
      align: 'center',
      render: (value) => (
        <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(value)}`}>
          {value.charAt(0).toUpperCase() + value.slice(1)}
        </span>
      ),
    },
    {
      header: 'Actions',
      key: 'actions',
      align: 'center',
      sortable: false,
      render: (_, movement) => (
        <div className="flex items-center space-x-1">
          <button
            onClick={() => console.log('View movement:', movement.id)}
            className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
            title="View Details"
          >
            <Eye className="w-4 h-4" />
          </button>
          
          <button
            onClick={() => {
              setSelectedIds(new Set([movement.id]));
              setTimeout(() => printSelected(), 0);
            }}
            className="p-2 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded-lg transition-colors"
            title="Print"
          >
            <Printer className="w-4 h-4" />
          </button>

          <button
            onClick={() => {
              setSelectedIds(new Set([movement.id]));
              setTimeout(() => exportSelectedPDF(), 0);
            }}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
            title="Download PDF"
          >
            <Download className="w-4 h-4" />
          </button>
          
          <button
            onClick={() => {
              setSelectedIds(new Set([movement.id]));
              setTimeout(() => whatsappSelected(), 0);
            }}
            className="p-2 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded-lg transition-colors"
            title="Send WhatsApp"
          >
            <MessageCircle className="w-4 h-4" />
          </button>
        </div>
      ),
      width: '150px',
    }
  ];

  if (!open) return null;

  return (
    <div className="h-full bg-blue-50">
      <div className="h-full flex flex-col">
        
        {/* Header - Using Global ModuleHeader */}
        <ModuleHeader
          title="Stock Movement"
          subtitle="Track stock ins, outs, transfers and adjustments"
          icon={ArrowDownToLine}
          iconColor="text-teal-600"
          onClose={onClose}
          historyType="stock"
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
                    placeholder="Search by movement number, product, reference, or batch..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm"
                  />
                </div>

                {/* Type Filter */}
                <div className="relative">
                  <select
                    value={selectedType}
                    onChange={(e) => setSelectedType(e.target.value)}
                    className="appearance-none pl-3 pr-8 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm bg-white"
                  >
                    <option value="all">Type: All</option>
                    <option value="receive">Stock In</option>
                    <option value="issue">Stock Out</option>
                    <option value="transfer">Transfer</option>
                    <option value="adjustment">Adjustment</option>
                  </select>
                  <ChevronDown className="absolute right-2 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                </div>

                {/* Status Filter */}
                <div className="relative">
                  <select
                    value={selectedStatus}
                    onChange={(e) => setSelectedStatus(e.target.value)}
                    className="appearance-none pl-3 pr-8 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 text-sm bg-white"
                  >
                    <option value="all">Status: All</option>
                    <option value="pending">Pending</option>
                    <option value="completed">Completed</option>
                    <option value="cancelled">Cancelled</option>
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
                    {formatCurrency(filteredMovements.reduce((sum, item) => sum + (item.total_value || 0), 0))}
                  </span>
                </div>
                <div>
                  <span className="text-gray-500">Movements:</span>
                  <span className="ml-1 font-semibold">{filteredMovements.length}</span>
                </div>
              </div>
            </div>

            {/* More Filters Panel */}
            {showMoreFilters && (
              <div className="mb-4 p-4 bg-blue-50 rounded-lg border border-blue-200">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Date Period
                    </label>
                    <select 
                      value={dateFilter}
                      onChange={(e) => setDateFilter(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="all">All Time</option>
                      <option value="7">Last 7 days</option>
                      <option value="30">Last 30 days</option>
                      <option value="90">Last 90 days</option>
                    </select>
                  </div>
                  
                  <div className="col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Actions
                    </label>
                    <div className="flex space-x-2">
                      <button 
                        onClick={() => {
                          setSearchQuery('');
                          setSelectedType('all');
                          setSelectedStatus('all');
                          setDateFilter('all');
                        }}
                        className="px-3 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 text-sm"
                      >
                        Clear Filters
                      </button>
                      <button 
                        onClick={() => setShowMoreFilters(false)}
                        className="px-3 py-2 text-white bg-blue-600 rounded-lg hover:bg-blue-700 text-sm"
                      >
                        Apply
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* More Filters Toggle */}
            <div className="mb-4">
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

            {/* Data Table */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200">
              {error && movements.length === 0 ? (
                <div className="text-center py-12">
                  <div className="text-red-600 mb-4">
                    <Package className="w-12 h-12 mx-auto" />
                  </div>
                  <p className="text-red-600 mb-4">{error}</p>
                  <p className="text-sm text-gray-500 mb-4">Showing sample data for development</p>
                  <button
                    onClick={loadStockMovements}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    Retry
                  </button>
                </div>
              ) : (
                <DataTable
                  data={filteredMovements}
                  columns={columns}
                  keyField="id"
                  loading={loading}
                  emptyMessage="No stock movements found"
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
    </div>
  );
};

export default StockMovement;