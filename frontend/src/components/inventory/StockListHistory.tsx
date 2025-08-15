import React, { useState, useEffect } from 'react';
import { Search, Filter, ChevronRight, Package, ArrowUpFromLine, ArrowDownToLine, ArrowRightLeft } from 'lucide-react';
import { stockApi } from '../../services/api';
import { DataTable, Column } from '../global/ui/display/DataTable';

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
  batch_no?: string;
  location_from?: string;
  location_to?: string;
  created_by?: string;
  status: 'pending' | 'completed' | 'cancelled';
}

const StockListHistory: React.FC<StockListHistoryProps> = () => {
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [filteredMovements, setFilteredMovements] = useState<StockMovement[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedType, setSelectedType] = useState<'all' | 'receive' | 'issue' | 'transfer' | 'adjustment'>('all');
  const [selectedStatus, setSelectedStatus] = useState<'all' | 'pending' | 'completed' | 'cancelled'>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
        movement.batch_no?.toLowerCase().includes(searchQuery.toLowerCase())
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

      // Fetch stock movements
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
        reference_no: movement.reference_no || movement.reference_document || movement.invoice_no,
        movement_date: movement.movement_date || movement.transaction_date || movement.created_at,
        reason: movement.reason || movement.notes,
        batch_no: movement.batch_no || movement.batch_number,
        location_from: movement.location_from || movement.from_location,
        location_to: movement.location_to || movement.to_location,
        created_by: movement.created_by || movement.user_name,
        status: movement.status || 'completed'
      }));

      setMovements(movementsData);
    } catch (err) {
      console.error('Error loading stock movements:', err);
      setError('Failed to load stock movement history');
    } finally {
      setLoading(false);
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
          {movement.batch_no && (
            <div className="text-sm text-app-500">Batch: {movement.batch_no}</div>
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
    <div className="min-h-screen bg-app-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b border-app-200 px-8 py-6">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-primary-100 rounded-lg flex items-center justify-center">
            <Package className="w-6 h-6 text-primary-600" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-app-800">Stock Movement History</h1>
            <p className="text-app-600 mt-1">View all stock movements, transfers, and adjustments</p>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white px-8 py-6 border-b border-app-200 shadow-sm">
        <div className="flex items-center space-x-6">
          {/* Search */}
          <div className="flex-1 relative">
            <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-app-400 w-5 h-5" />
            <input
              type="text"
              placeholder="Search by movement number, product, reference, or batch..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-12 pr-4 py-2 border border-app-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 bg-white"
            />
          </div>

          {/* Type Filter */}
          <select
            value={selectedType}
            onChange={(e) => setSelectedType(e.target.value as any)}
            className="px-3 py-2 border border-app-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 bg-white min-w-[130px]"
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
            className="px-3 py-2 border border-app-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 bg-white min-w-[120px]"
          >
            <option value="all">All Status</option>
            <option value="pending">Pending</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>
      </div>

      {/* Content */}
      <div className="bg-white px-8 py-8 min-h-[calc(100vh-300px)]">
        {error ? (
          <div className="text-center py-12">
            <div className="text-danger-600 mb-4">
              <Package className="w-12 h-12 mx-auto" />
            </div>
            <p className="text-danger-600">{error}</p>
            <button
              onClick={loadStockMovements}
              className="mt-4 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
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
            emptyIcon={<Package className="w-12 h-12 text-app-400" />}
            hoverable={true}
            striped={true}
            paginated={true}
            pageSize={20}
            searchable={false}
          />
        )}
      </div>
    </div>
  );
};

export default StockListHistory;