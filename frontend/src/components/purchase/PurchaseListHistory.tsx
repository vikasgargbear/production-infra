import React, { useState, useEffect } from 'react';
import { Search, Filter, ChevronRight, ShoppingBag, FileText, Package } from 'lucide-react';
import { purchasesApi } from '../../services/api';
import { DataTable, Column, ModuleHeader } from '../global';

interface PurchaseListHistoryProps {
  open?: boolean;
  onClose?: () => void;
}

interface Purchase {
  id: string;
  invoice_no: string;
  supplier_name: string;
  invoice_date: string;
  total_amount: number;
  payment_status: 'pending' | 'partial' | 'paid';
  payment_amount: number;
  purchase_type: 'purchase' | 'purchase_order' | 'grn';
  created_at: string;
}

const PurchaseListHistory: React.FC<PurchaseListHistoryProps> = ({ onClose }) => {
  const [purchases, setPurchases] = useState<Purchase[]>([]);
  const [filteredPurchases, setFilteredPurchases] = useState<Purchase[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStatus, setSelectedStatus] = useState<'all' | 'pending' | 'partial' | 'paid'>('all');
  const [selectedType, setSelectedType] = useState<'all' | 'purchase' | 'purchase_order' | 'grn'>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load purchases data
  useEffect(() => {
    loadPurchases();
  }, []);

  // Filter purchases based on search and filters
  useEffect(() => {
    let filtered = purchases;

    // Filter by search query
    if (searchQuery) {
      filtered = filtered.filter(purchase => 
        purchase.invoice_no.toLowerCase().includes(searchQuery.toLowerCase()) ||
        purchase.supplier_name.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    // Filter by payment status
    if (selectedStatus !== 'all') {
      filtered = filtered.filter(purchase => purchase.payment_status === selectedStatus);
    }

    // Filter by type
    if (selectedType !== 'all') {
      filtered = filtered.filter(purchase => purchase.purchase_type === selectedType);
    }

    setFilteredPurchases(filtered);
  }, [purchases, searchQuery, selectedStatus, selectedType]);

  const loadPurchases = async () => {
    try {
      setLoading(true);
      setError(null);

      // Fetch purchases data
      const response = await purchasesApi.getAll({
        limit: 100,
        sort: 'created_at',
        order: 'desc'
      });

      // Transform data to match interface
      const purchasesData: Purchase[] = (response.data?.purchases || response.data || []).map((purchase: any) => ({
        id: purchase.id,
        invoice_no: purchase.invoice_no || purchase.purchase_no || `PUR-${purchase.id}`,
        supplier_name: purchase.supplier_name || purchase.supplier?.name || 'Unknown Supplier',
        invoice_date: purchase.invoice_date || purchase.purchase_date || purchase.created_at,
        total_amount: parseFloat(purchase.total_amount) || 0,
        payment_status: purchase.payment_status || 'pending',
        payment_amount: parseFloat(purchase.payment_amount) || 0,
        purchase_type: purchase.purchase_type || purchase.is_purchase_order ? 'purchase_order' : 'purchase',
        created_at: purchase.created_at
      }));

      setPurchases(purchasesData);
    } catch (err) {
      console.error('Error loading purchases:', err);
      setError('Failed to load purchase history');
    } finally {
      setLoading(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'paid': return 'bg-success-100 text-success-800';
      case 'partial': return 'bg-warning-100 text-warning-800';
      case 'pending': return 'bg-danger-100 text-danger-800';
      default: return 'bg-app-100 text-app-800';
    }
  };

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'purchase_order': return <FileText className="w-4 h-4 text-purchase-600" />;
      case 'grn': return <Package className="w-4 h-4 text-purchase-600" />;
      default: return <ShoppingBag className="w-4 h-4 text-purchase-600" />;
    }
  };

  const getTypeLabel = (type: string) => {
    switch (type) {
      case 'purchase_order': return 'Purchase Order';
      case 'grn': return 'GRN';
      default: return 'Purchase';
    }
  };

  // Define columns for DataTable
  const columns: Column<Purchase>[] = [
    {
      key: 'invoice_no',
      header: 'Document No.',
      render: (_, purchase) => (
        <div className="flex items-center gap-2">
          {getTypeIcon(purchase.purchase_type)}
          <div>
            <div className="font-medium text-app-900">{purchase.invoice_no}</div>
            <div className="text-sm text-app-500">{getTypeLabel(purchase.purchase_type)}</div>
          </div>
        </div>
      ),
    },
    {
      key: 'supplier_name',
      header: 'Supplier',
      render: (value) => (
        <div className="text-app-900">{value}</div>
      ),
    },
    {
      key: 'invoice_date',
      header: 'Date',
      render: (value) => new Date(value).toLocaleDateString(),
    },
    {
      key: 'total_amount',
      header: 'Total Amount',
      align: 'right' as const,
      render: (value) => `₹${value.toLocaleString()}`,
    },
    {
      key: 'payment_info',
      header: 'Payment',
      align: 'right' as const,
      render: (_, purchase) => (
        <div>
          <div className="text-app-900">₹{purchase.payment_amount.toLocaleString()}</div>
          <div className="text-sm text-app-500">
            {purchase.payment_status === 'paid' ? 'Fully Paid' : 
             purchase.payment_status === 'partial' ? 'Partially Paid' : 'Unpaid'}
          </div>
        </div>
      ),
    },
    {
      key: 'payment_status',
      header: 'Status',
      align: 'center' as const,
      render: (value) => (
        <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(value)}`}>
          {value === 'paid' ? 'Paid' : value === 'partial' ? 'Partial' : 'Pending'}
        </span>
      ),
    },
    {
      key: 'balance',
      header: 'Balance',
      align: 'right' as const,
      render: (_, purchase) => {
        const balance = purchase.total_amount - purchase.payment_amount;
        return (
          <span className={balance > 0 ? 'text-danger-600' : 'text-success-600'}>
            ₹{balance.toLocaleString()}
          </span>
        );
      },
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'center' as const,
      sortable: false,
      render: (_, purchase) => (
        <button
          onClick={() => console.log('View purchase:', purchase.id)}
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
          title="Purchase History"
          documentNumber=""
          status=""
          icon={ShoppingBag}
          iconColor="text-green-600"
          onClose={onClose}
          historyType="purchase"
          onSaveDraft={() => {}}
        />

        {/* Keyboard Shortcuts Help */}
        <div className="bg-blue-50 px-4 py-2 text-xs text-blue-700 border-b border-blue-200">
          Keyboard shortcuts: <strong>Ctrl+F</strong> - Search | <strong>Esc</strong> - Close
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-6xl mx-auto px-6 py-6">
            
            {/* Filters */}
            <div className="bg-white rounded-lg shadow-sm border border-blue-200 p-6 mb-6">
              <div className="flex items-center space-x-6">
                {/* Search */}
                <div className="flex-1 relative">
                  <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
                  <input
                    type="text"
                    placeholder="Search by invoice number or supplier..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full pl-12 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
                  />
                </div>

                {/* Type Filter */}
                <select
                  value={selectedType}
                  onChange={(e) => setSelectedType(e.target.value as any)}
                  className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white min-w-[140px]"
                >
                  <option value="all">All Types</option>
                  <option value="purchase">Purchases</option>
                  <option value="purchase_order">Purchase Orders</option>
                  <option value="grn">GRNs</option>
                </select>

                {/* Status Filter */}
                <select
                  value={selectedStatus}
                  onChange={(e) => setSelectedStatus(e.target.value as any)}
                  className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white min-w-[120px]"
                >
                  <option value="all">All Status</option>
                  <option value="pending">Pending</option>
                  <option value="partial">Partial</option>
                  <option value="paid">Paid</option>
                </select>
              </div>
            </div>

            {/* Data Table */}
            <div className="bg-white rounded-lg shadow-sm border border-blue-200">
              {error ? (
                <div className="text-center py-12">
                  <div className="text-red-600 mb-4">
                    <ShoppingBag className="w-12 h-12 mx-auto" />
                  </div>
                  <p className="text-red-600">{error}</p>
                  <button
                    onClick={loadPurchases}
                    className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    Retry
                  </button>
                </div>
              ) : (
                <DataTable
                  data={filteredPurchases}
                  columns={columns}
                  keyField="id"
                  loading={loading}
                  emptyMessage="No purchases found"
                  emptyIcon={<ShoppingBag className="w-12 h-12 text-gray-400" />}
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

export default PurchaseListHistory;