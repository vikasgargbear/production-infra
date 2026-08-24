import React, { useState, useEffect } from 'react';
import {
  ArrowDownToLine, Search, Filter, Download, Printer, MessageCircle,
  ArrowUpFromLine, ArrowRightLeft, Package,
  RefreshCw, Loader2
} from 'lucide-react';
import { stockApi } from '../../../services/api';
import { formatCurrency } from '../../../utils/formatters';
import { DataTable, ModuleHeader } from '../../global';
import { jsPDF } from 'jspdf';
import { autoTable } from 'jspdf-autotable';

// TypeScript interfaces
interface StockMovementProps {
  open?: boolean;
  onClose?: () => void;
}

type MovementType = 'receive' | 'issue' | 'transfer' | 'adjustment';
type MovementStatus = 'pending' | 'completed' | 'cancelled';

interface StockMovementItem {
  id: string;
  movement_no: string;
  product_name: string;
  movement_type: MovementType;
  quantity: number;
  reference_no?: string;
  movement_date: string;
  reason?: string;
  batch_number?: string;
  location_from?: string;
  location_to?: string;
  created_by?: string;
  status: MovementStatus;
  /** null means cost is unknown — never treat as ₹0 in the UI. */
  unit_cost: number | null;
  /** null means valuation is unknown — display "—", not ₹0. */
  total_value: number | null;
}

const StockMovement: React.FC<StockMovementProps> = ({ open = true, onClose }) => {
  const [movements, setMovements] = useState<StockMovementItem[]>([]);
  const [filteredMovements, setFilteredMovements] = useState<StockMovementItem[]>([]);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedType, setSelectedType] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [showMoreFilters, setShowMoreFilters] = useState<boolean>(false);
  const [dateFilter, setDateFilter] = useState<string>('all');
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [hasMore, setHasMore] = useState<boolean>(true);

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
        limit: 100,
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
        reference_no: movement.reference_no || movement.reference_document || movement.invoice_number,
        movement_date: movement.movement_date || movement.transaction_date || movement.created_at,
        reason: movement.reason || movement.notes,
        batch_number: movement.batch_number || movement.batch_number,
        location_from: movement.location_from || movement.from_location,
        location_to: movement.location_to || movement.to_location,
        created_by: movement.created_by || movement.user_name,
        status: movement.status || 'completed',
        // Never default cost to 0 — null cost must stay null so the display
        // layer can show "—" instead of a misleading ₹0.
        unit_cost: (movement.unit_cost != null && movement.unit_cost !== '')
          ? parseFloat(movement.unit_cost)
          : null,
        total_value: (movement.total_value != null && movement.total_value !== '')
          ? parseFloat(movement.total_value)
          : ((movement.unit_cost != null && movement.unit_cost !== '')
              ? (Math.abs(parseFloat(movement.quantity) || 0)) * parseFloat(movement.unit_cost)
              : null)
      }));

      setMovements(movementsData);
    } catch (err) {
      setError('Failed to load stock movement data');
      // No fallback to mock data - enterprise practice
      setMovements([]);
    } finally {
      setLoading(false);
    }
  };

  // Removed mock data generation - enterprise practice requires real data only

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
        movement.batch_number?.toLowerCase().includes(searchQuery.toLowerCase())
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
        const daysDiff = Math.floor((today.getTime() - movementDate.getTime()) / (1000 * 60 * 60 * 24));

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

  // Selection count for display
  const selectedCount = Array.from(selectedIds).filter(id => filteredMovements.some(f => f.id === id)).length;

  const exportSelectedCSV = () => {
    const itemsToExport = selectedIds.size > 0
      ? filteredMovements.filter(item => selectedIds.has(item.id))
      : filteredMovements;

    if (itemsToExport.length === 0) return;

    try {
      // Prepare CSV data
      const csvHeaders = [
        'Movement No',
        'Product Name',
        'Movement Type',
        'Quantity',
        'Total Value',
        'Reference',
        'Movement Date',
        'Location From',
        'Location To',
        'Status'
      ];

      const csvData = itemsToExport.map(item => [
        item.movement_no || '',
        item.product_name || '',
        getMovementTypeLabel(item.movement_type) || '',
        item.quantity || 0,
        item.total_value != null ? item.total_value : 'Unavailable',
        item.reference_no || '',
        new Date(item.movement_date).toLocaleDateString() || '',
        item.location_from || '',
        item.location_to || '',
        item.status || ''
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
      link.setAttribute('download', `stock_movements_${new Date().toISOString().split('T')[0]}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      // Download initiated — no blocking dialog needed
    } catch (error) {
      console.error('CSV export failed:', error);
      // Non-blocking: error is surfaced via the existing error state
      setError('Failed to export movements. Please try again.');
    }
  };

  const exportSelectedPDF = () => {
    const itemsToExport = selectedIds.size > 0
      ? filteredMovements.filter(item => selectedIds.has(item.id))
      : filteredMovements;

    if (itemsToExport.length === 0) return;

    try {
      const doc = new jsPDF();
      doc.setFontSize(16);
      doc.text('Stock Movement Report', 20, 20);

      const tableData = itemsToExport.map(item => [
        item.movement_no || 'N/A',
        item.product_name || 'N/A',
        getMovementTypeLabel(item.movement_type),
        item.quantity || 0,
        item.total_value != null ? formatCurrency(item.total_value) : '—',
        new Date(item.movement_date).toLocaleDateString(),
        item.status || 'N/A'
      ]);

      autoTable(doc, {
        head: [['Movement #', 'Product', 'Type', 'Quantity', 'Value', 'Date', 'Status']],
        body: tableData,
        startY: 30,
        styles: { fontSize: 9 },
        headStyles: { fillColor: [59, 130, 246] }
      });

      doc.save('stock-movements-export.pdf');
    } catch (error) {

      const doc = new jsPDF();
      doc.setFontSize(16);
      doc.text('Stock Movement Report', 20, 20);

      let yPos = 40;
      doc.setFontSize(10);
      doc.text('Movement # | Product | Type | Quantity | Value | Date | Status', 20, yPos);
      yPos += 10;

      itemsToExport.forEach(item => {
        const valueStr = item.total_value != null ? formatCurrency(item.total_value) : '—';
        const rowText = `${item.movement_no} | ${item.product_name} | ${getMovementTypeLabel(item.movement_type)} | ${item.quantity} | ${valueStr} | ${new Date(item.movement_date).toLocaleDateString()} | ${item.status}`;
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
      ${itemsToPrint.map(item => `<tr><td>${item.movement_no}</td><td>${item.product_name}</td><td>${getMovementTypeLabel(item.movement_type)}</td><td>${item.quantity}</td><td>${item.total_value != null ? formatCurrency(item.total_value) : '—'}</td><td>${new Date(item.movement_date).toLocaleDateString()}</td><td>${item.status}</td></tr>`).join('')}
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
        `${item.movement_no} - ${item.product_name} (${getMovementTypeLabel(item.movement_type)}) - ${item.quantity} units - ${item.total_value != null ? formatCurrency(item.total_value) : 'value unavailable'}`
      ).join('\n')}`
    );

    // Opens WhatsApp with pre-filled text; recipient must be chosen by the user inside WhatsApp.
    window.open(`https://wa.me/?text=${message}`, '_blank');
  };

  const getStatusColor = (status: string): string => {
    switch (status) {
      case 'completed': return 'bg-success-100 text-success-800';
      case 'pending': return 'bg-warning-100 text-warning-800';
      case 'cancelled': return 'bg-danger-100 text-danger-800';
      default: return 'bg-app-100 text-app-800';
    }
  };

  const getMovementTypeIcon = (type: string, quantity: number = 0): React.ReactNode => {
    switch (type) {
      case 'receive': return <ArrowDownToLine className="w-4 h-4 text-green-700" />; // Stock In - Dark Green
      case 'issue': return <ArrowUpFromLine className="w-4 h-4 text-red-600" />; // Stock Out - Red  
      case 'transfer': return <ArrowRightLeft className="w-4 h-4 text-blue-600" />; // Transfer - Blue
      case 'adjustment':
        // Positive adjustment = Light Green, Negative = Light Red
        return <Package className={`w-4 h-4 ${quantity >= 0 ? 'text-green-500' : 'text-red-400'}`} />;
      default: return <Package className="w-4 h-4 text-gray-600" />;
    }
  };

  const getMovementTypeLabel = (type: string): string => {
    switch (type) {
      case 'receive': return 'Stock In';
      case 'issue': return 'Stock Out';
      case 'transfer': return 'Transfer';
      case 'adjustment': return 'Adjustment';
      default: return 'Other';
    }
  };

  const getMovementTypeColor = (type: string, quantity: number = 0): string => {
    switch (type) {
      case 'receive': return 'text-green-700'; // Stock In - Dark Green
      case 'issue': return 'text-red-600'; // Stock Out - Red
      case 'transfer': return 'text-blue-600'; // Transfer - Blue  
      case 'adjustment':
        // Positive adjustment = Light Green, Negative = Light Red
        return quantity >= 0 ? 'text-green-500' : 'text-red-400';
      default: return 'text-gray-600';
    }
  };

  const getMovementRowBackground = (type: string, quantity: number = 0): string => {
    switch (type) {
      case 'receive': return 'bg-green-50 border-l-4 border-green-600'; // Stock In
      case 'issue': return 'bg-red-50 border-l-4 border-red-600'; // Stock Out  
      case 'transfer': return 'bg-blue-50 border-l-4 border-blue-600'; // Transfer
      case 'adjustment':
        return quantity >= 0
          ? 'bg-green-50 border-l-4 border-green-400' // Positive adjustment
          : 'bg-red-50 border-l-4 border-red-400'; // Negative adjustment
      default: return 'bg-white';
    }
  };

  const columns = [
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
          {getMovementTypeIcon(movement.movement_type, movement.movement_type === 'issue' ? -movement.quantity : movement.quantity)}
          <div>
            <div className="font-medium text-app-900">{movement.movement_no}</div>
            <div className={`text-sm ${getMovementTypeColor(movement.movement_type, movement.movement_type === 'issue' ? -movement.quantity : movement.quantity)}`}>
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
          {movement.batch_number && (
            <div className="text-sm text-app-500">Batch: {movement.batch_number}</div>
          )}
        </div>
      ),
    },
    {
      header: 'Quantity',
      key: 'quantity',
      align: 'center' as const,
      sortable: true,
      render: (value, movement) => (
        <span className={`font-medium ${getMovementTypeColor(movement.movement_type, movement.movement_type === 'issue' ? -value : value)}`}>
          {movement.movement_type === 'issue' ? '-' : '+'}{value}
        </span>
      ),
    },
    {
      header: 'Value',
      key: 'total_value',
      align: 'right' as const,
      sortable: true,
      // Never show ₹0 for unknown/missing cost — display "—" instead.
      render: (value: number | null) => value != null ? formatCurrency(value) : '—',
    },
    {
      header: 'Description',
      key: 'reason',
      render: (value) => value || '-',
    },
    {
      header: 'Reference',
      key: 'reference_no',
      render: (value) => value || '-',
    },
    {
      header: 'Status',
      key: 'status',
      align: 'center' as const,
      render: (value) => (
        <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(value)}`}>
          {value.charAt(0).toUpperCase() + value.slice(1)}
        </span>
      ),
    },
    {
      header: 'Actions',
      key: 'actions',
      align: 'center' as const,
      sortable: false,
      render: (_, movement) => (
        <div className="flex items-center space-x-1">
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
            title="Share via WhatsApp"
            aria-label="Share this movement via WhatsApp"
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
    <div className="h-full bg-gray-50">
      <div className="h-full flex flex-col">

        {/* Header - Using Global ModuleHeader */}
        <ModuleHeader
          title="Stock Movement"
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
        <div className="bg-white px-4 py-2 text-xs text-gray-600 border-b border-gray-200">
          Keyboard shortcuts: <strong>Ctrl+F</strong> - Search | <strong>Esc</strong> - Close
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-6xl mx-auto px-6 py-6">

            {/* Enhanced Filter Bar */}
            <div className={`border border-gray-200 bg-white shadow-sm p-4 ${showMoreFilters ? 'rounded-t-lg' : 'rounded-lg mb-6'
              }`}>
              <div className="flex items-center space-x-4">
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

                {/* Stock In Quick Filter */}
                <button
                  onClick={() => setSelectedType(selectedType === 'receive' ? 'all' : 'receive')}
                  className={`
                    px-3 py-2 rounded-lg text-sm transition-all duration-200
                    flex items-center space-x-1.5 border
                    ${selectedType === 'receive'
                      ? 'bg-green-50 border-green-300 text-green-700'
                      : 'bg-white border-gray-300 hover:border-green-300 hover:bg-green-50 text-gray-600 hover:text-green-600'
                    }
                  `}
                  title={selectedType === 'receive' ? 'Showing stock in movements' : 'Filter stock in movements'}
                >
                  <ArrowDownToLine className="w-4 h-4" />
                  <span>Stock In</span>
                </button>

                {/* Stock Out Quick Filter */}
                <button
                  onClick={() => setSelectedType(selectedType === 'issue' ? 'all' : 'issue')}
                  className={`
                    px-3 py-2 rounded-lg text-sm transition-all duration-200
                    flex items-center space-x-1.5 border
                    ${selectedType === 'issue'
                      ? 'bg-red-50 border-red-300 text-red-700'
                      : 'bg-white border-gray-300 hover:border-red-300 hover:bg-red-50 text-gray-600 hover:text-red-600'
                    }
                  `}
                  title={selectedType === 'issue' ? 'Showing stock out movements' : 'Filter stock out movements'}
                >
                  <ArrowUpFromLine className="w-4 h-4" />
                  <span>Stock Out</span>
                </button>

                {/* Filter Divider */}
                <div className="h-8 w-px bg-gray-300"></div>

                {/* Global Refresh Button */}
                <button
                  onClick={() => {
                    setRefreshing(true);
                    loadStockMovements().finally(() => setRefreshing(false));
                  }}
                  disabled={refreshing || loading}
                  className={`relative inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border transition-colors ${refreshing
                    ? 'bg-gray-100 border-gray-300'
                    : 'bg-white border-gray-300 hover:bg-gray-100'
                    }`}
                  title="Refresh movements"
                  aria-label="Refresh stock movements"
                >
                  <RefreshCw className={`w-5 h-5 ${refreshing ? 'animate-spin text-gray-600' : 'text-gray-600'
                    }`} />
                </button>

                {/* Global Export Button */}
                <button
                  onClick={exportSelectedCSV}
                  className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg bg-white border border-gray-300 hover:bg-gray-100 transition-colors disabled:bg-gray-100 disabled:text-gray-400 disabled:cursor-not-allowed"
                  title="Export to CSV"
                  aria-label="Export stock movements to CSV"
                  disabled={filteredMovements.length === 0}
                >
                  <Download className="w-4 h-4 text-gray-600" />
                </button>

                {/* Advanced Filters Toggle Button */}
                <button
                  onClick={() => setShowMoreFilters(!showMoreFilters)}
                  className={`
                    p-2 rounded-xl transition-all duration-200 border
                    ${showMoreFilters
                      ? 'bg-indigo-50 border-indigo-300'
                      : 'bg-white border-gray-300 hover:bg-gray-50 hover:border-gray-400'
                    }
                  `}
                  title={showMoreFilters ? 'Hide filters' : 'More filters'}
                >
                  <Filter className={`w-4 h-4 transition-transform duration-300 ${showMoreFilters ? 'rotate-180 text-indigo-600' : 'text-gray-600'
                    }`} />
                </button>

                {/* Bulk Actions - Only show when items selected */}
                {selectedCount > 0 && (
                  <div className="flex items-center space-x-2 ml-2 pl-2 border-l border-gray-300">
                    <span className="text-sm text-gray-600">({selectedCount})</span>
                    <button
                      onClick={printSelected}
                      className="p-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                      title="Print selected items"
                    >
                      <Printer className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>

              {/* Summary Stats */}
              <div className="flex items-center justify-end gap-4 text-sm mt-2 pt-2 border-t border-gray-200">
                <div>
                  <span className="text-gray-500">Total Value:</span>
                  <span className="ml-1 font-semibold">
                    {formatCurrency(filteredMovements.reduce((sum, item) =>
                      item.total_value != null ? sum + item.total_value : sum, 0))}
                  </span>
                </div>
                <div>
                  <span className="text-gray-500">Movements:</span>
                  <span className="ml-1 font-semibold">{filteredMovements.length}</span>
                </div>
              </div>
            </div>

            {/* Advanced Filters Panel */}
            {showMoreFilters && (
              <div className="border-l border-r border-b border-gray-200 bg-white rounded-b-lg px-4 pb-4 mb-6">
                <div className="border-t border-gray-200 mx-[-16px] mt-4 mb-4"></div>
                <div className="grid grid-cols-3 gap-4">
                  {/* Movement Type Filter */}
                  <select
                    value={selectedType}
                    onChange={(e) => setSelectedType(e.target.value)}
                    className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                  >
                    <option value="all">Movement Type</option>
                    <option value="receive">Stock In</option>
                    <option value="issue">Stock Out</option>
                    <option value="transfer">Transfer</option>
                    <option value="adjustment">Adjustment</option>
                  </select>

                  {/* Status Filter */}
                  <select
                    value={selectedStatus}
                    onChange={(e) => setSelectedStatus(e.target.value)}
                    className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                  >
                    <option value="all">Status</option>
                    <option value="pending">Pending</option>
                    <option value="completed">Completed</option>
                    <option value="cancelled">Cancelled</option>
                  </select>

                  {/* Date Period Filter */}
                  <select
                    value={dateFilter}
                    onChange={(e) => setDateFilter(e.target.value)}
                    className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                  >
                    <option value="all">Date Period</option>
                    <option value="7">Last 7 Days</option>
                    <option value="30">Last 30 Days</option>
                    <option value="90">Last 90 Days</option>
                  </select>
                </div>

                <div className="mt-3 flex justify-end">
                  <button
                    onClick={() => {
                      setSearchQuery('');
                      setSelectedType('all');
                      setSelectedStatus('all');
                      setDateFilter('all');
                    }}
                    className="px-3 py-1.5 text-xs text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                  >
                    Clear Filters
                  </button>
                </div>
              </div>
            )}

            {/* Data Table */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200">
              {error && movements.length === 0 ? (
                <div className="text-center py-12">
                  <div className="text-red-600 mb-4">
                    <Package className="w-12 h-12 mx-auto" />
                  </div>
                  <p className="text-red-600 mb-4">{error}</p>
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
                  striped={false}
                  paginated={true}
                  pageSize={20}
                  searchable={false}
                  selectable={true}
                  selectedRows={Array.from(selectedIds)}
                  onSelectionChange={(newSelection) => setSelectedIds(new Set(newSelection))}
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
