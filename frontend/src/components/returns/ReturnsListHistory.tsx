import React, { useState, useEffect } from 'react';
import { Search, Filter, ChevronRight, Package, ShoppingCart, RotateCcw } from 'lucide-react';
import { returnsApi } from '../../services/api';
import { DataTable, Column } from '../global/ui/display/DataTable';

interface ReturnsListHistoryProps {
  open?: boolean;
  onClose?: () => void;
}

interface Return {
  id: string;
  return_no: string;
  return_type: 'sales' | 'purchase';
  customer_name?: string;
  supplier_name?: string;
  original_document_no: string;
  return_date: string;
  total_amount: number;
  status: 'pending' | 'approved' | 'rejected' | 'completed';
  reason: string;
}

const ReturnsListHistory: React.FC<ReturnsListHistoryProps> = () => {
  const [returns, setReturns] = useState<Return[]>([]);
  const [filteredReturns, setFilteredReturns] = useState<Return[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedType, setSelectedType] = useState<'all' | 'sales' | 'purchase'>('all');
  const [selectedStatus, setSelectedStatus] = useState<'all' | 'pending' | 'approved' | 'completed'>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load returns data
  useEffect(() => {
    loadReturns();
  }, []);

  // Filter returns based on search and filters
  useEffect(() => {
    let filtered = returns;

    // Filter by search query
    if (searchQuery) {
      filtered = filtered.filter(ret => 
        ret.return_no.toLowerCase().includes(searchQuery.toLowerCase()) ||
        ret.customer_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        ret.supplier_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
        ret.original_document_no.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    // Filter by type
    if (selectedType !== 'all') {
      filtered = filtered.filter(ret => ret.return_type === selectedType);
    }

    // Filter by status
    if (selectedStatus !== 'all') {
      filtered = filtered.filter(ret => ret.status === selectedStatus);
    }

    setFilteredReturns(filtered);
  }, [returns, searchQuery, selectedType, selectedStatus]);

  const loadReturns = async () => {
    try {
      setLoading(true);
      setError(null);

      // Fetch both sales and purchase returns
      const [salesResponse, purchaseResponse] = await Promise.all([
        returnsApi.getSaleReturns(),
        returnsApi.getPurchaseReturns()
      ]);

      // Transform and combine data
      const salesReturns: Return[] = (salesResponse.data?.returns || []).map((ret: any) => ({
        id: ret.id,
        return_no: ret.return_no || ret.sales_return_no || `SR-${ret.id}`,
        return_type: 'sales' as const,
        customer_name: ret.customer_name,
        original_document_no: ret.original_invoice_no || ret.invoice_no || '-',
        return_date: ret.return_date,
        total_amount: ret.total_amount || 0,
        status: ret.status || 'pending',
        reason: ret.return_reason || ret.reason || '-'
      }));

      const purchaseReturns: Return[] = (purchaseResponse.data?.returns || []).map((ret: any) => ({
        id: ret.id,
        return_no: ret.return_no || ret.purchase_return_no || `PR-${ret.id}`,
        return_type: 'purchase' as const,
        supplier_name: ret.supplier_name,
        original_document_no: ret.original_purchase_no || ret.purchase_no || '-',
        return_date: ret.return_date,
        total_amount: ret.total_amount || 0,
        status: ret.status || 'pending',
        reason: ret.return_reason || ret.reason || '-'
      }));

      const allReturns = [...salesReturns, ...purchaseReturns].sort((a, b) => 
        new Date(b.return_date).getTime() - new Date(a.return_date).getTime()
      );

      setReturns(allReturns);
    } catch (err) {
      console.error('Error loading returns:', err);
      setError('Failed to load returns history');
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed': return 'bg-success-100 text-success-800';
      case 'approved': return 'bg-primary-100 text-primary-800';
      case 'pending': return 'bg-warning-100 text-warning-800';
      case 'rejected': return 'bg-danger-100 text-danger-800';
      default: return 'bg-app-100 text-app-800';
    }
  };

  const getTypeIcon = (type: 'sales' | 'purchase') => {
    return type === 'sales' ? 
      <ShoppingCart className="w-4 h-4 text-sales-600" /> : 
      <Package className="w-4 h-4 text-purchase-600" />;
  };

  // Define columns for DataTable
  const columns: Column<Return>[] = [
    {
      key: 'return_no',
      header: 'Return No.',
      render: (_, ret) => (
        <div className="flex items-center gap-2">
          {getTypeIcon(ret.return_type)}
          <span className="font-medium text-app-900">{ret.return_no}</span>
        </div>
      ),
    },
    {
      key: 'party',
      header: 'Party',
      render: (_, ret) => ret.customer_name || ret.supplier_name || '-',
    },
    {
      key: 'original_document_no',
      header: 'Original Document',
      render: (_, ret) => (
        <div>
          <div className="text-app-900">{ret.original_document_no}</div>
          <div className="text-sm text-app-500 capitalize">{ret.return_type} return</div>
        </div>
      ),
    },
    {
      key: 'return_date',
      header: 'Return Date',
      render: (value) => new Date(value).toLocaleDateString(),
    },
    {
      key: 'total_amount',
      header: 'Amount',
      align: 'right' as const,
      render: (value) => `₹${value.toLocaleString()}`,
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
      key: 'reason',
      header: 'Reason',
      render: (value) => (
        <span className="text-app-600 text-sm truncate max-w-32" title={value}>
          {value}
        </span>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'center' as const,
      sortable: false,
      render: (_, ret) => (
        <button
          onClick={() => console.log('View return:', ret.id)}
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
          <div className="w-12 h-12 bg-danger-100 rounded-lg flex items-center justify-center">
            <RotateCcw className="w-6 h-6 text-danger-600" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-app-800">Returns History</h1>
            <p className="text-app-600 mt-1">View all sales and purchase returns</p>
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
              placeholder="Search returns by number, party, or document..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-12 pr-4 py-2 border border-app-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 bg-white"
            />
          </div>

          {/* Type Filter */}
          <select
            value={selectedType}
            onChange={(e) => setSelectedType(e.target.value as any)}
            className="px-3 py-2 border border-app-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 bg-white min-w-[120px]"
          >
            <option value="all">All Types</option>
            <option value="sales">Sales Returns</option>
            <option value="purchase">Purchase Returns</option>
          </select>

          {/* Status Filter */}
          <select
            value={selectedStatus}
            onChange={(e) => setSelectedStatus(e.target.value as any)}
            className="px-3 py-2 border border-app-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-primary-500 bg-white min-w-[120px]"
          >
            <option value="all">All Status</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="completed">Completed</option>
          </select>
        </div>
      </div>

      {/* Content */}
      <div className="bg-white px-8 py-8 min-h-[calc(100vh-300px)]">
        {error ? (
          <div className="text-center py-12">
            <div className="text-danger-600 mb-4">
              <RotateCcw className="w-12 h-12 mx-auto" />
            </div>
            <p className="text-danger-600">{error}</p>
            <button
              onClick={loadReturns}
              className="mt-4 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
            >
              Retry
            </button>
          </div>
        ) : (
          <DataTable
            data={filteredReturns}
            columns={columns}
            keyField="id"
            loading={loading}
            emptyMessage="No returns found"
            emptyIcon={<RotateCcw className="w-12 h-12 text-app-400" />}
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

export default ReturnsListHistory;