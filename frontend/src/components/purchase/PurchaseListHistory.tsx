import React, { useState, useEffect } from 'react';
import {
  Download, Eye, Edit, Printer,
  MoreHorizontal, Package, ShoppingBag,
  X, Check, AlertCircle, RefreshCw
} from 'lucide-react';
import { Button, StatusBadge, DataTable, InlineFilterPanel } from '../global';
import { purchasesApi } from '../../services/api';

interface PurchaseListHistoryProps {
  onClose?: () => void;
}

interface Purchase {
  id: string;
  purchase_order_id?: string;
  po_number: string;
  supplier_name: string;
  po_date: string;
  total_amount: number;
  payment_status: string;
  po_status: string;
  po_type: string;
  created_at: string;
  expected_delivery_date?: string;
  items_count?: number;
}

// Bulk action bar
const BulkActionBar: React.FC<{
  selectedCount: number;
  onMarkReceived: () => void;
  onMarkPaid: () => void;
  onExport: () => void;
  onClear: () => void;
}> = ({ selectedCount, onMarkReceived, onMarkPaid, onExport, onClear }) => {
  if (selectedCount === 0) return null;

  return (
    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center">
          <span className="text-sm font-medium text-blue-900">
            {selectedCount} purchase{selectedCount > 1 ? 's' : ''} selected
          </span>
        </div>
        <div className="flex items-center space-x-2">
          <Button variant="outline" size="sm" onClick={onMarkReceived}>
            <Check className="w-4 h-4 mr-2" />
            Mark as Received
          </Button>
          <Button variant="outline" size="sm" onClick={onMarkPaid}>
            <Check className="w-4 h-4 mr-2" />
            Mark as Paid
          </Button>
          <Button variant="outline" size="sm" onClick={onExport}>
            <Download className="w-4 h-4 mr-2" />
            Export
          </Button>
          <Button variant="ghost" size="sm" onClick={onClear}>
            <X className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
};

const PurchaseListHistory: React.FC<PurchaseListHistoryProps> = ({ onClose }) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [selectedPurchases, setSelectedPurchases] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pagination, setPagination] = useState({
    total: 0,
    page: 1,
    per_page: 25,
    total_pages: 0
  });

  // State for real data
  const [purchases, setPurchases] = useState<Purchase[]>([]);

  // Filter configuration for the global component
  const filterOptions = [
    {
      key: 'po_status',
      label: 'Status',
      type: 'select' as const,
      options: [
        { value: 'draft', label: 'Draft' },
        { value: 'sent', label: 'Sent' },
        { value: 'confirmed', label: 'Confirmed' },
        { value: 'received', label: 'Received' },
        { value: 'cancelled', label: 'Cancelled' }
      ]
    },
    {
      key: 'payment_status',
      label: 'Payment',
      type: 'select' as const,
      options: [
        { value: 'pending', label: 'Pending' },
        { value: 'partial', label: 'Partial' },
        { value: 'paid', label: 'Paid' }
      ]
    },
    {
      key: 'po_type',
      label: 'Type',
      type: 'select' as const,
      options: [
        { value: 'purchase_order', label: 'Purchase Order' },
        { value: 'direct_purchase', label: 'Direct Purchase' },
        { value: 'grn', label: 'GRN' }
      ]
    },
    {
      key: 'dateFrom',
      label: 'From Date',
      type: 'date' as const
    },
    {
      key: 'dateTo',
      label: 'To Date',
      type: 'date' as const
    }
  ];

  // Fetch purchases from backend
  const fetchPurchases = async (page = 1, filters: any = {}) => {
    setLoading(true);
    setError(null);
    
    try {
      // Prepare search parameters
      const searchParams: any = {
        limit: pagination.per_page,
        offset: (page - 1) * pagination.per_page,
        ...filters
      };
      
      // If there's a search query, add it to the filters
      if (filters.search && filters.search.trim()) {
        searchParams.search = filters.search.trim();
      }
      
      console.log('Fetching purchases with params:', searchParams);
      
      const response = await purchasesApi.enhanced.getAll(searchParams);
      
      if (response.data) {
        // Transform backend data to match our interface
        const transformedPurchases = response.data.purchases?.map((purchase: any) => ({
          id: purchase.purchase_order_id?.toString() || purchase.id,
          purchase_order_id: purchase.purchase_order_id,
          po_number: purchase.po_number || purchase.purchase_no || `PO-${purchase.purchase_order_id || purchase.id}`,
          supplier_name: purchase.supplier_name || purchase.supplier?.name || 'Unknown Supplier',
          po_date: purchase.po_date || purchase.purchase_date || purchase.created_at,
          total_amount: parseFloat(purchase.total_amount) || 0,
          payment_status: purchase.payment_status || 'pending',
          po_status: purchase.po_status || 'draft',
          po_type: purchase.po_type || 'purchase_order',
          created_at: purchase.created_at,
          expected_delivery_date: purchase.expected_delivery_date,
          items_count: purchase.items?.length || 0
        })) || [];

        console.log('Transformed purchases:', transformedPurchases);
        setPurchases(transformedPurchases);
        setPagination({
          total: response.data.total || transformedPurchases.length,
          page: page,
          per_page: pagination.per_page,
          total_pages: Math.ceil((response.data.total || transformedPurchases.length) / pagination.per_page)
        });
      } else {
        setError('No data received from API');
      }
    } catch (error) {
      console.error('Error fetching purchases:', error);
      setError('Failed to fetch purchases. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Load purchases on component mount
  useEffect(() => {
    fetchPurchases();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Refresh purchases
  const handleRefresh = () => {
    fetchPurchases(pagination.page);
  };

  // Handle filter changes with auto-search
  const handleFilterChange = (filters: any) => {
    console.log('Filters changed:', filters);
    // Reset to first page when filters change
    fetchPurchases(1, { ...filters, search: searchQuery });
  };

  // Handle search changes with auto-search
  const handleSearchChange = (query: string) => {
    setSearchQuery(query);
    // Auto-search after a short delay to avoid too many API calls
    const timeoutId = setTimeout(() => {
      fetchPurchases(1, { search: query });
    }, 300);
    
    return () => clearTimeout(timeoutId);
  };

  // Action handlers
  const handleViewPurchase = (purchase: Purchase) => {
    console.log('Viewing purchase:', purchase.po_number);
    // TODO: Navigate to purchase view page or open modal
    alert(`Viewing purchase: ${purchase.po_number}`);
  };

  const handleEditPurchase = (purchase: Purchase) => {
    console.log('Editing purchase:', purchase.po_number);
    // TODO: Navigate to purchase edit page or open modal
    alert(`Editing purchase: ${purchase.po_number}`);
  };

  const handlePrintPurchase = (purchase: Purchase) => {
    console.log('Printing purchase:', purchase.po_number);
    // TODO: Open print dialog or generate PDF
    alert(`Printing purchase: ${purchase.po_number}`);
  };

  const handleMoreOptions = (purchase: Purchase) => {
    console.log('More options for purchase:', purchase.po_number);
    // TODO: Show dropdown menu with more options
    alert(`More options for purchase: ${purchase.po_number}`);
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  const formatDate = (value: string) => {
    if (!value) return 'N/A';
    return new Date(value).toLocaleDateString('en-IN');
  };

  // Helper function to get proper status text
  const getStatusText = (status: string | undefined) => {
    if (!status) return 'Unknown';
    
    console.log('Raw status from backend:', status, 'Type:', typeof status);
    
    // Map backend statuses to display text - handle various formats
    const statusMap: Record<string, string> = {
      // Common lowercase variations
      'draft': 'Draft',
      'sent': 'Sent',
      'confirmed': 'Confirmed',
      'received': 'Received',
      'cancelled': 'Cancelled',
      'canceled': 'Cancelled', // Handle US spelling
      'pending': 'Pending',
      'partial': 'Partial',
      'paid': 'Paid',
      
      // Common uppercase variations
      'DRAFT': 'Draft',
      'SENT': 'Sent',
      'CONFIRMED': 'Confirmed',
      'RECEIVED': 'Received',
      'CANCELLED': 'Cancelled',
      'CANCELED': 'Cancelled',
      'PENDING': 'Pending',
      'PARTIAL': 'Partial',
      'PAID': 'Paid',
      
      // Handle null/undefined cases
      'null': 'Unknown',
      'undefined': 'Unknown',
      '': 'Unknown',
      
      // Handle numeric statuses if backend uses them
      '0': 'Draft',
      '1': 'Sent',
      '2': 'Confirmed',
      '3': 'Received',
      '4': 'Cancelled',
      '5': 'Pending',
      '6': 'Partial',
      '7': 'Paid'
    };
    
    const normalizedStatus = status.toString().toLowerCase().trim();
    const mappedStatus = statusMap[normalizedStatus];
    
    if (mappedStatus) {
      return mappedStatus;
    }
    
    // If no mapping found, log it and return the original value
    console.log('No status mapping found for:', status, 'Returning original value');
    return status;
  };

  const columns = [
    {
      key: 'po_number',
      header: 'PO #',
      render: (value: string, purchase: Purchase) => (
        <div className="font-medium text-gray-900">
          {purchase.po_number}
        </div>
      ),
      width: '120px',
    },
    {
      key: 'supplier_name',
      header: 'Supplier',
      render: (value: string, purchase: Purchase) => (
        <div className="text-gray-900">{purchase.supplier_name}</div>
      ),
      width: '200px',
    },
    {
      key: 'po_date',
      header: 'Date',
      render: (value: string, purchase: Purchase) => (
        <div className="text-gray-600">{formatDate(purchase.po_date)}</div>
      ),
      width: '100px',
    },
    {
      key: 'total_amount',
      header: 'Amount',
      render: (value: number, purchase: Purchase) => (
        <div className="font-medium text-gray-900">
          {formatCurrency(purchase.total_amount)}
        </div>
      ),
      width: '120px',
    },
    {
      key: 'po_status',
      header: 'Status',
      render: (value: string, purchase: Purchase) => {
        const statusText = getStatusText(purchase.po_status);
        console.log('Status column render:', {
          original: purchase.po_status,
          processed: statusText,
          purchase_id: purchase.id
        });
        return (
          <StatusBadge 
            status={statusText} 
            variant="light"
          />
        );
      },
      width: '100px',
    },
    {
      key: 'payment_status',
      header: 'Payment',
      render: (value: string, purchase: Purchase) => {
        const paymentText = getStatusText(purchase.payment_status);
        console.log('Payment column render:', {
          original: purchase.payment_status,
          processed: paymentText,
          purchase_id: purchase.id
        });
        return (
          <StatusBadge 
            status={paymentText} 
            variant="light"
          />
        );
      },
      width: '100px',
    },
    {
      key: 'actions',
      header: 'Actions',
      render: (value: any, purchase: Purchase) => (
        <div className="flex items-center space-x-2">
          <Button 
            variant="ghost" 
            size="sm"
            onClick={() => handleViewPurchase(purchase)}
            title="View Purchase"
            className="h-10 w-10 p-0 hover:bg-blue-50"
          >
            <Eye className="w-5 h-5 text-blue-600" />
          </Button>
          <Button 
            variant="ghost" 
            size="sm"
            onClick={() => handleEditPurchase(purchase)}
            title="Edit Purchase"
            className="h-10 w-10 p-0 hover:bg-green-50"
          >
            <Edit className="w-5 h-5 text-green-600" />
          </Button>
          <Button 
            variant="ghost" 
            size="sm"
            onClick={() => handlePrintPurchase(purchase)}
            title="Print Purchase"
            className="h-10 w-10 p-0 hover:bg-purple-50"
          >
            <Printer className="w-5 h-5 text-purple-600" />
          </Button>
          <Button 
            variant="ghost" 
            size="sm"
            onClick={() => handleMoreOptions(purchase)}
            title="More Options"
            className="h-10 w-10 p-0 hover:bg-gray-50"
          >
            <MoreHorizontal className="w-5 h-5 text-gray-600" />
          </Button>
        </div>
      ),
      width: '180px',
    },
  ];

  return (
    <div className="h-full bg-white">
      <div className="h-full flex flex-col">
        
        {/* Header - Simplified */}
        <div className="bg-white border-b border-gray-200 px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <ShoppingBag className="w-6 h-6 text-blue-600" />
              <div>
                <h1 className="text-2xl font-bold text-gray-900">
                  Purchase History
                </h1>
                <p className="text-sm text-gray-600">
                  View and manage all your purchases
                </p>
              </div>
            </div>
            <div className="flex items-center space-x-3">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleRefresh}
                disabled={loading}
                title="Refresh data"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
              <Button
                variant="outline"
                onClick={() => console.log('Export all purchases')}
                icon={<Download className="w-4 h-4" />}
                iconPosition="left"
              >
                Export All
              </Button>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-7xl mx-auto px-6 py-6">
            
            {/* Global Inline Filter Panel */}
            <div className="mb-6">
              <InlineFilterPanel
                filters={filterOptions}
                onFilterChange={handleFilterChange}
                searchQuery={searchQuery}
                onSearchChange={handleSearchChange}
                showFilters={showFilters}
                onToggleFilters={setShowFilters}
              />
            </div>

            {/* Error Display */}
            {error && (
              <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4">
                <div className="flex items-center">
                  <AlertCircle className="w-5 h-5 text-red-600 mr-3" />
                  <span className="text-red-800">{error}</span>
                </div>
              </div>
            )}

            {/* Bulk Actions */}
            <BulkActionBar
              selectedCount={selectedPurchases.length}
              onMarkReceived={() => console.log('Mark as received')}
              onMarkPaid={() => console.log('Mark as paid')}
              onExport={() => console.log('Export selected')}
              onClear={() => setSelectedPurchases([])}
            />

            {/* Loading State */}
            {loading ? (
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8">
                <div className="text-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-3"></div>
                  <p className="text-gray-600">Loading purchases...</p>
                </div>
              </div>
            ) : purchases.length === 0 ? (
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8">
                <div className="text-center">
                  <Package className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                  <p className="text-lg font-medium text-gray-500">
                    {searchQuery ? `No purchases found matching "${searchQuery}"` : 'No purchases found'}
                  </p>
                  <p className="text-sm text-gray-400">
                    {error ? 'There was an error loading purchases' : 
                     searchQuery ? 'Try adjusting your search terms or filters' : 'No purchases match your criteria'}
                  </p>
                  {searchQuery && (
                    <Button 
                      variant="outline" 
                      onClick={() => {
                        setSearchQuery('');
                        fetchPurchases(1);
                      }} 
                      className="mt-4"
                    >
                      Clear Search
                    </Button>
                  )}
                </div>
              </div>
            ) : (
              /* Purchase Table */
              <div className="bg-white rounded-lg shadow-sm border border-gray-200">
                <DataTable
                  data={purchases}
                  columns={columns}
                  keyField="id"
                  searchable={false}
                  paginated={false}
                  pageSize={pagination.per_page}
                />
                
                {/* Pagination Controls */}
                {pagination.total_pages > 1 && (
                  <div className="flex items-center justify-between px-6 py-4 border-t border-gray-200">
                    <div className="text-sm text-gray-600">
                      Showing {purchases.length} of {pagination.total} purchases
                    </div>
                    <div className="flex items-center space-x-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => fetchPurchases(pagination.page - 1)}
                        disabled={pagination.page <= 1 || loading}
                      >
                        Previous
                      </Button>
                      <span className="text-sm text-gray-600">
                        Page {pagination.page} of {pagination.total_pages}
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => fetchPurchases(pagination.page + 1)}
                        disabled={pagination.page >= pagination.total_pages || loading}
                      >
                        Next
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default PurchaseListHistory;