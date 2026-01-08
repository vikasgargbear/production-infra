import React, { useState, useEffect } from 'react';
import { Search, Filter, ChevronRight, Package, ArrowUpFromLine, ArrowDownToLine, ArrowRightLeft } from 'lucide-react';
import { stockApi } from '../../services/api';
import { DataTable, Column, ModuleHeader } from '../global';

interface StockListHistoryProps {
  open?: boolean;
  onClose?: () => void;
}

interface StockMovement {
  id: string;
  movement_no: string;
  product_name: string;
  movement_type: 'receive' | 'issue' | 'transfer' | 'adjustment';
  quantity: number;
  reference_no?: string;
  movement_date: string;
  reason?: string;
  batch_number?: string;
  location_from?: string;
  location_to?: string;
  created_by?: string;
  status: 'pending' | 'completed' | 'cancelled';
}

const StockListHistory: React.FC<StockListHistoryProps> = ({ onClose }) => {
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [filteredMovements, setFilteredMovements] = useState<StockMovement[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedType, setSelectedType] = useState<'all' | 'receive' | 'issue' | 'transfer' | 'adjustment'>('all');
  const [selectedStatus, setSelectedStatus] = useState<'all' | 'pending' | 'completed' | 'cancelled'>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ESC key handler for better UX
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && onClose) {
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // Load stock movements data
  useEffect(() => {
    loadStockMovements();
  }, []);

  // Filter movements based on search and filters
  useEffect(() => {
    let filtered = movements;

    // Filter by search query
    if (searchQuery) {
      filtered = filtered.filter(movement => 
        movement.movement_no.toLowerCase().includes(searchQuery.toLowerCase()) ||
        movement.product_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        movement.reference_no?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        movement.batch_number?.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    // Filter by movement type
    if (selectedType !== 'all') {
      filtered = filtered.filter(movement => movement.movement_type === selectedType);
    }

    // Filter by status
    if (selectedStatus !== 'all') {
      filtered = filtered.filter(movement => movement.status === selectedStatus);
    }

    setFilteredMovements(filtered);
  }, [movements, searchQuery, selectedType, selectedStatus]);

  const loadStockMovements = async () => {
    try {
      setLoading(true);
      setError(null);

      // Try to fetch from stock movements endpoint first
      try {
        const response = await stockApi.getMovements({
          limit: 100,
          sort: 'movement_date',
          order: 'desc'
        });

        // Transform data to match interface
        const movementsData: StockMovement[] = (response.data?.movements || response.data || []).map((movement: any) => ({
          id: movement.id,
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
          status: movement.status || 'completed'
        }));

        setMovements(movementsData);
        return;
      } catch (stockApiError) {
      }

      // Fallback: Derive stock movements from existing transaction data
      const derivedMovements = await deriveStockMovementsFromTransactions();
      setMovements(derivedMovements);

    } catch (err) {
      setError('Failed to load stock movement history. Backend stock tracking may not be fully configured.');
    } finally {
      setLoading(false);
    }
  };

  // Derive stock movements from purchases, sales, and adjustments
  const deriveStockMovementsFromTransactions = async (): Promise<StockMovement[]> => {
    const movements: StockMovement[] = [];
    
    try {
      // Import APIs dynamically to avoid circular dependencies
      const { purchasesApi } = await import('../../services/api');
      const { invoicesApi } = await import('../../services/api');
      
      // Get recent purchases (stock-in movements)
      try {
        const purchasesResponse = await purchasesApi.getAll({ limit: 50 });
        const purchases = purchasesResponse.data?.purchases || purchasesResponse.data || [];
        
        purchases.forEach((purchase: any, index: number) => {
          if (purchase.items && Array.isArray(purchase.items)) {
            purchase.items.forEach((item: any, itemIndex: number) => {
              movements.push({
                id: `purchase-${purchase.id || index}-${itemIndex}`,
                movement_no: `STK-IN-${purchase.purchase_number || purchase.po_number || (Date.now() + index)}`,
                product_name: item.product_name || 'Unknown Product',
                movement_type: 'receive',
                quantity: Math.abs(parseFloat(item.quantity) || 0),
                reference_no: purchase.purchase_number || purchase.po_number || purchase.supplier_invoice_number,
                movement_date: purchase.invoice_date || purchase.po_date || purchase.created_at || new Date().toISOString(),
                reason: `Purchase from ${purchase.supplier_name || 'Supplier'}`,
                batch_number: item.batch_number || item.batch_number || 'N/A',
                location_from: purchase.supplier_name || 'Supplier',
                location_to: 'Main Warehouse',
                created_by: 'System',
                status: 'completed'
              });
            });
          }
        });
      } catch (purchaseError) {
      }

      // Get recent sales (stock-out movements)
      try {
        const invoicesResponse = await invoicesApi.getAll({ limit: 50 });
        const invoices = invoicesResponse.data?.invoices || invoicesResponse.data || [];
        
        invoices.forEach((invoice: any, index: number) => {
          if (invoice.items && Array.isArray(invoice.items)) {
            invoice.items.forEach((item: any, itemIndex: number) => {
              movements.push({
                id: `sale-${invoice.id || index}-${itemIndex}`,
                movement_no: `STK-OUT-${invoice.invoice_number || (Date.now() + index + 1000)}`,
                product_name: item.product_name || 'Unknown Product',
                movement_type: 'issue',
                quantity: Math.abs(parseFloat(item.quantity) || 0),
                reference_no: invoice.invoice_number || invoice.invoice_number,
                movement_date: invoice.invoice_date || invoice.created_at || new Date().toISOString(),
                reason: `Sale to ${invoice.customer_name || 'Customer'}`,
                batch_number: item.batch_number || item.batch_number || 'N/A',
                location_from: 'Main Warehouse',
                location_to: invoice.customer_name || 'Customer',
                created_by: 'System',
                status: 'completed'
              });
            });
          }
        });
      } catch (invoiceError) {
      }

      // Sort by date (newest first)
      movements.sort((a, b) => new Date(b.movement_date).getTime() - new Date(a.movement_date).getTime());
      
      return movements.slice(0, 100); // Limit to 100 most recent
      
    } catch (error) {
      return [];
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'bg-success-100 text-success-800';
      case 'pending': return 'bg-warning-100 text-warning-800';
      case 'cancelled': return 'bg-danger-100 text-danger-800';
      default: return 'bg-app-100 text-app-800';
    }
  };

  const getMovementTypeIcon = (type: string) => {
    switch (type) {
      case 'receive': return <ArrowDownToLine className="w-4 h-4 text-success-600" />;
      case 'issue': return <ArrowUpFromLine className="w-4 h-4 text-danger-600" />;
      case 'transfer': return <ArrowRightLeft className="w-4 h-4 text-primary-600" />;
      case 'adjustment': return <Package className="w-4 h-4 text-warning-600" />;
      default: return <Package className="w-4 h-4 text-app-600" />;
    }
  };

  const getMovementTypeLabel = (type: string) => {
    switch (type) {
      case 'receive': return 'Stock In';
      case 'issue': return 'Stock Out';
      case 'transfer': return 'Transfer';
      case 'adjustment': return 'Adjustment';
      default: return 'Other';
    }
  };

  const getMovementTypeColor = (type: string) => {
    switch (type) {
      case 'receive': return 'text-success-600';
      case 'issue': return 'text-danger-600';
      case 'transfer': return 'text-primary-600';
      case 'adjustment': return 'text-warning-600';
      default: return 'text-app-600';
    }
  };

  // Define columns for DataTable
  const columns: Column<StockMovement>[] = [
    {
      key: 'movement_no',
      header: 'Movement No.',
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
      key: 'product_name',
      header: 'Product',
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
      key: 'quantity',
      header: 'Quantity',
      align: 'center' as const,
      render: (value, movement) => (
        <span className={`font-medium ${getMovementTypeColor(movement.movement_type)}`}>
          {movement.movement_type === 'issue' ? '-' : '+'}{value}
        </span>
      ),
    },
    {
      key: 'reference_no',
      header: 'Reference',
      render: (value) => value || '-',
    },
    {
      key: 'location_info',
      header: 'Location',
      render: (_, movement) => (
        <div className="text-sm">
          {movement.movement_type === 'transfer' ? (
            <div>
              <div className="text-app-600">From: {movement.location_from || '-'}</div>
              <div className="text-app-600">To: {movement.location_to || '-'}</div>
            </div>
          ) : (
            <div className="text-app-600">
              {movement.location_to || movement.location_from || '-'}
            </div>
          )}
        </div>
      ),
    },
    {
      key: 'movement_date',
      header: 'Date',
      render: (value) => new Date(value).toLocaleDateString(),
    },
    {
      key: 'status',
      header: 'Status',
      align: 'center' as const,
      render: (value) => (
        <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(value)}`}>
          {value.charAt(0).toUpperCase() + value.slice(1)}
        </span>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'center' as const,
      sortable: false,
      render: (_, movement) => (
        <button
          onClick={() => console.log('View movement:', movement.id)}
          className="text-primary-600 hover:text-primary-700 p-1 rounded transition-colors"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      ),
    },
  ];

  return (
    <div className="h-full bg-blue-50">
      <div className="h-full flex flex-col">
        
        {/* Header - Using Global ModuleHeader */}
        <ModuleHeader
          title="Stock Movement History"
          documentNumber=""
          status=""
          icon={Package}
          iconColor="text-blue-600"
          onClose={onClose}
          historyType="stock"
          onSaveDraft={() => {}}
        />

        {/* Keyboard Shortcuts Help */}
        <div className="bg-blue-50 px-4 py-2 text-xs text-blue-700 border-b border-blue-200">
          Keyboard shortcuts: <strong>Ctrl+F</strong> - Search | <strong>Esc</strong> - Close
        </div>

        {/* Info Notice - Only show when using derived data */}
        {movements.length > 0 && movements[0].id?.startsWith('purchase-') && (
          <div className="bg-amber-50 px-4 py-2 text-xs text-amber-700 border-b border-amber-200">
            📊 Stock movements are derived from purchase and sales transactions. Direct stock tracking data will be available once inventory movements are recorded.
          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-6xl mx-auto px-6 py-6">
          {/* Filters */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-6">
            <div className="flex items-center space-x-6">
              {/* Search */}
              <div className="flex-1 relative">
                <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                <input
                  type="text"
                  placeholder="Search by movement number, product, reference, or batch..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-12 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
                />
              </div>

              {/* Type Filter */}
              <select
                value={selectedType}
                onChange={(e) => setSelectedType(e.target.value as any)}
                className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white min-w-[130px]"
              >
                <option value="all">All Types</option>
                <option value="receive">Stock In</option>
                <option value="issue">Stock Out</option>
                <option value="transfer">Transfer</option>
                <option value="adjustment">Adjustment</option>
              </select>

              {/* Status Filter */}
              <select
                value={selectedStatus}
                onChange={(e) => setSelectedStatus(e.target.value as any)}
                className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white min-w-[120px]"
              >
                <option value="all">All Status</option>
                <option value="pending">Pending</option>
                <option value="completed">Completed</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>
          </div>

          {/* Data Table */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200">
            {error ? (
              <div className="text-center py-12">
                <div className="text-red-600 mb-4">
                  <Package className="w-12 h-12 mx-auto" />
                </div>
                <p className="text-red-600">{error}</p>
                <button
                  onClick={loadStockMovements}
                  className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
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

export default StockListHistory;