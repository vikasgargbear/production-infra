import React, { useState, useEffect } from 'react';
import {
  Search,
  Filter,
  Download,
  Eye,
  Edit,
  Trash2,
  Plus,
  CreditCard,
  AlertTriangle,
  CheckCircle,
  Clock,
  XCircle,
  TrendingUp,
  TrendingDown,
  Loader2,
  RefreshCw,
  AlertCircle,
  X
} from 'lucide-react';
import { customersApi, invoicesApi } from '../services/api';
import offlineStorage from '../services/offlineStorage';

const CreditManagement = () => {
  const [customers, setCustomers] = useState([]);
  const [filteredCustomers, setFilteredCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [creditScoreFilter, setCreditScoreFilter] = useState('all');
  const [showFilters, setShowFilters] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState(null);
  const [showDetails, setShowDetails] = useState(false);
  const [creditStats, setCreditStats] = useState({
    totalCredit: 0,
    outstandingAmount: 0,
    overdueAmount: 0,
    customersOnCredit: 0
  });

  // Load credit management data with offline fallback
  const loadCreditData = async () => {
    setLoading(true);
    setError(null);
    
    try {
      // Load customers and their credit information
      const [customersResponse, invoicesResponse] = await Promise.all([
        customersApi.getAll({ include_credit: true }),
        invoicesApi.getByCustomer(undefined)
      ]);
      
      if (customersResponse?.data && Array.isArray(customersResponse.data)) {
        const customersData = customersResponse.data.map(customer => {
          // Find outstanding invoices for this customer
          const allInvoices = invoicesResponse?.data || [];
          const customerInvoices = allInvoices.filter(inv => 
            inv.customer_id === customer.id && (inv.status === 'UNPAID' || inv.payment_status === 'UNPAID' || inv.status === 'outstanding')
          );
          
          const creditUsed = customerInvoices.reduce((sum, inv) => sum + (inv.amount || inv.total_amount || inv.grand_total || 0), 0);
          const creditAvailable = (customer.credit_limit || 0) - creditUsed;
          
          return {
            ...customer,
            creditUsed,
            creditAvailable,
            outstandingInvoices: customerInvoices.map(inv => ({
              invoiceNo: inv.invoice_number,
              amount: inv.amount,
              dueDate: inv.due_date,
              daysOverdue: inv.days_overdue || 0
            }))
          };
        });
        
        setCustomers(customersData);
        setFilteredCustomers(customersData);
        
        // Calculate credit stats
        const stats = customersData.reduce((acc, customer) => {
          acc.totalCredit += customer.credit_limit || 0;
          acc.outstandingAmount += customer.creditUsed || 0;
          acc.overdueAmount += (customer.outstandingInvoices || [])
            .filter(inv => inv.daysOverdue > 0)
            .reduce((sum, inv) => sum + inv.amount, 0);
          if (customer.creditUsed > 0) acc.customersOnCredit++;
          return acc;
        }, { totalCredit: 0, outstandingAmount: 0, overdueAmount: 0, customersOnCredit: 0 });
        
        setCreditStats(stats);
        
        // Store data offline for future use
        await offlineStorage.storeOffline('credit_management', {
          customers: customersData,
          stats: stats
        }, { 
          critical: true, 
          persistent: true 
        });
      } else {
        setCustomers([]);
        setFilteredCustomers([]);
        setCreditStats({
          totalCredit: 0,
          outstandingAmount: 0,
          overdueAmount: 0,
          customersOnCredit: 0
        });
      }
    } catch (error) {
      console.error('Error loading credit management data:', error);
      
      // Try to load from offline storage instead of using mock data
      const offlineData = await offlineStorage.getOffline('credit_management', { critical: true });
      
      if (offlineData && !offlineStorage.isDataStale(offlineData, 60)) { // 1 hour max for credit data
        console.log('📱 Using offline credit management data');
        setCustomers(offlineData.data.customers);
        setFilteredCustomers(offlineData.data.customers);
        setCreditStats(offlineData.data.stats);
        
        // Show offline indicator
        setError('Currently using offline data. Some information may be outdated.');
      } else {
        // No offline data available - show proper error instead of mock data
        setError('Unable to load credit management data. Please check your connection and try again.');
        setCustomers([]);
        setFilteredCustomers([]);
        setCreditStats({
          totalCredit: 0,
          outstandingAmount: 0,
          overdueAmount: 0,
          customersOnCredit: 0
        });
      }
    } finally {
      setLoading(false);
    }
  };

  // Refresh credit data
  const handleRefresh = async () => {
    setRefreshing(true);
    setError(null);
    
    try {
      await loadCreditData();
    } catch (error) {
      console.error('Error refreshing credit data:', error);
      setError('Failed to refresh data. Please try again.');
    } finally {
      setRefreshing(false);
    }
  };

  // Filter customers
  const filterCustomers = () => {
    let filtered = [...customers];

    // Search filter
    if (searchTerm) {
      filtered = filtered.filter(customer => 
        customer.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        customer.phone?.includes(searchTerm) ||
        customer.email?.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    // Status filter
    if (statusFilter !== 'all') {
      filtered = filtered.filter(customer => {
        if (statusFilter === 'active') return customer.status === 'active';
        if (statusFilter === 'warning') return customer.creditAvailable <= customer.credit_limit * 0.1;
        if (statusFilter === 'blocked') return customer.creditAvailable < 0;
        return true;
      });
    }

    // Credit score filter
    if (creditScoreFilter !== 'all') {
      filtered = filtered.filter(customer => {
        const score = customer.credit_score || 0;
        if (creditScoreFilter === 'excellent') return score >= 90;
        if (creditScoreFilter === 'good') return score >= 70 && score < 90;
        if (creditScoreFilter === 'fair') return score >= 50 && score < 70;
        if (creditScoreFilter === 'poor') return score < 50;
        return true;
      });
    }

    setFilteredCustomers(filtered);
  };

  // Apply filters when any filter changes
  useEffect(() => {
    filterCustomers();
  }, [customers, searchTerm, statusFilter, creditScoreFilter]);

  // Get status color
  const getStatusColor = (customer) => {
    if (customer.creditAvailable < 0) return 'bg-red-100 text-red-800 border-red-200';
    if (customer.creditAvailable <= customer.credit_limit * 0.1) return 'bg-yellow-100 text-yellow-800 border-yellow-200';
    return 'bg-green-100 text-green-800 border-green-200';
  };

  // Get status text
  const getStatusText = (customer) => {
    if (customer.creditAvailable < 0) return 'Blocked';
    if (customer.creditAvailable <= customer.credit_limit * 0.1) return 'Warning';
    return 'Active';
  };

  // Get credit score color
  const getCreditScoreColor = (score) => {
    if (score >= 90) return 'text-green-600';
    if (score >= 70) return 'text-blue-600';
    if (score >= 50) return 'text-yellow-600';
    return 'text-red-600';
  };

  // Get credit score text
  const getCreditScoreText = (score) => {
    if (score >= 90) return 'Excellent';
    if (score >= 70) return 'Good';
    if (score >= 50) return 'Fair';
    return 'Poor';
  };

  // Handle customer selection
  const handleCustomerSelect = (customer) => {
    setSelectedCustomer(customer);
    setShowDetails(true);
  };

  // Load data on component mount
  useEffect(() => {
    loadCreditData();
  }, []);

  // Clear old offline data periodically
  useEffect(() => {
    const interval = setInterval(() => {
      offlineStorage.clearOldData(24); // Clear data older than 24 hours
    }, 60 * 60 * 1000); // Check every hour

    return () => clearInterval(interval);
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
        <span className="ml-2 text-gray-600">Loading credit management data...</span>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Credit Management</h1>
          <p className="text-gray-600">Monitor customer credit limits and outstanding amounts</p>
        </div>
        <div className="flex items-center space-x-3">
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="inline-flex items-center px-3 py-2 border border-gray-300 rounded-md bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <RefreshCw className={`h-4 w-4 mr-1 ${refreshing ? 'animate-spin' : ''}`} />
            {refreshing ? 'Refreshing...' : 'Refresh'}
          </button>
          <button className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700">
            <Plus className="h-4 w-4 mr-2" />
            New Credit Limit
          </button>
        </div>
      </div>

      {/* Error Display */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
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

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Total Credit Limit</p>
              <p className="text-2xl font-bold text-gray-900">
                ₹{creditStats.totalCredit.toLocaleString()}
              </p>
            </div>
            <div className="p-3 bg-blue-100 rounded-lg">
              <CreditCard className="w-6 h-6 text-blue-600" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Outstanding Amount</p>
              <p className="text-2xl font-bold text-gray-900">
                ₹{creditStats.outstandingAmount.toLocaleString()}
              </p>
            </div>
            <div className="p-3 bg-orange-100 rounded-lg">
              <AlertTriangle className="w-6 h-6 text-orange-600" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Overdue Amount</p>
              <p className="text-2xl font-bold text-gray-900">
                ₹{creditStats.overdueAmount.toLocaleString()}
              </p>
            </div>
            <div className="p-3 bg-red-100 rounded-lg">
              <XCircle className="w-6 h-6 text-red-600" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Customers on Credit</p>
              <p className="text-2xl font-bold text-gray-900">
                {creditStats.customersOnCredit}
              </p>
            </div>
            <div className="p-3 bg-green-100 rounded-lg">
              <TrendingUp className="w-6 h-6 text-green-600" />
            </div>
          </div>
        </div>
      </div>

      {/* Filters and Search */}
      <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between space-y-4 lg:space-y-0">
          <div className="flex-1 max-w-md">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search customers..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div className="flex items-center space-x-3">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All Status</option>
              <option value="active">Active</option>
              <option value="warning">Warning</option>
              <option value="blocked">Blocked</option>
            </select>

            <select
              value={creditScoreFilter}
              onChange={(e) => setCreditScoreFilter(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All Scores</option>
              <option value="excellent">Excellent (90+)</option>
              <option value="good">Good (70-89)</option>
              <option value="fair">Fair (50-69)</option>
              <option value="poor">Poor (&lt;50)</option>
            </select>

            <button className="inline-flex items-center px-3 py-2 border border-gray-300 rounded-md bg-white text-gray-700 hover:bg-gray-50">
              <Download className="h-4 w-4 mr-2" />
              Export
            </button>
          </div>
        </div>
      </div>

      {/* Customers Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-medium text-gray-900">
            Customers ({filteredCustomers.length})
          </h3>
        </div>

        {filteredCustomers.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <CreditCard className="h-12 w-12 mx-auto mb-2 text-gray-300" />
            <p>No customers found matching your criteria</p>
            {customers.length > 0 && (
              <p className="text-sm text-gray-400 mt-1">Try adjusting your filters</p>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Customer
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Credit Limit
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Used/Available
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Credit Score
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
                {filteredCustomers.map((customer) => (
                  <tr key={customer.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div>
                        <div className="text-sm font-medium text-gray-900">
                          {customer.name || 'Unknown Customer'}
                        </div>
                        <div className="text-sm text-gray-500">
                          {customer.phone || 'No phone'}
                        </div>
                        {customer.email && (
                          <div className="text-xs text-gray-400">
                            {customer.email}
                          </div>
                        )}
                      </div>
                    </td>
                    
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">
                        ₹{(customer.credit_limit || 0).toLocaleString()}
                      </div>
                      <div className="text-xs text-gray-500">
                        {customer.payment_terms || 30} days
                      </div>
                    </td>
                    
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">
                        <div>Used: ₹{(customer.creditUsed || 0).toLocaleString()}</div>
                        <div className={`font-medium ${
                          customer.creditAvailable >= 0 ? 'text-green-600' : 'text-red-600'
                        }`}>
                          Available: ₹{(customer.creditAvailable || 0).toLocaleString()}
                        </div>
                      </div>
                    </td>
                    
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm">
                        <div className={`font-medium ${getCreditScoreColor(customer.credit_score || 0)}`}>
                          {customer.credit_score || 'N/A'}
                        </div>
                        <div className="text-xs text-gray-500">
                          {getCreditScoreText(customer.credit_score || 0)}
                        </div>
                      </div>
                    </td>
                    
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(customer)}`}>
                        {getStatusText(customer)}
                      </span>
                    </td>
                    
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                      <div className="flex items-center space-x-2">
                        <button
                          onClick={() => handleCustomerSelect(customer)}
                          className="text-blue-600 hover:text-blue-900"
                          title="View Details"
                        >
                          <Eye className="h-4 w-4" />
                        </button>
                        <button
                          className="text-gray-600 hover:text-gray-900"
                          title="Edit"
                        >
                          <Edit className="h-4 w-4" />
                        </button>
                        <button
                          className="text-red-600 hover:text-red-900"
                          title="Delete"
                        >
                          <Trash2 className="h-4 w-4" />
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

      {/* Customer Details Modal */}
      {showDetails && selectedCustomer && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold text-gray-900">Customer Credit Details</h2>
                <button
                  onClick={() => setShowDetails(false)}
                  className="p-2 hover:bg-gray-100 rounded-lg"
                >
                  <X className="w-5 h-5 text-gray-500" />
                </button>
              </div>

              <div className="grid grid-cols-2 gap-6 mb-6">
                <div>
                  <h3 className="font-medium text-gray-900 mb-3">Customer Information</h3>
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-gray-600">Name:</span>
                      <span className="font-medium">{selectedCustomer.name || 'Unknown'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Phone:</span>
                      <span className="font-medium">{selectedCustomer.phone || 'N/A'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Email:</span>
                      <span className="font-medium">{selectedCustomer.email || 'N/A'}</span>
                    </div>
                  </div>
                </div>
                
                <div>
                  <h3 className="font-medium text-gray-900 mb-3">Credit Information</h3>
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-gray-600">Credit Limit:</span>
                      <span className="font-medium">₹{(selectedCustomer.credit_limit || 0).toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Credit Used:</span>
                      <span className="font-medium">₹{(selectedCustomer.creditUsed || 0).toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Credit Available:</span>
                      <span className={`font-medium ${
                        selectedCustomer.creditAvailable >= 0 ? 'text-green-600' : 'text-red-600'
                      }`}>
                        ₹{(selectedCustomer.creditAvailable || 0).toLocaleString()}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Outstanding Invoices */}
              {selectedCustomer.outstandingInvoices && selectedCustomer.outstandingInvoices.length > 0 && (
                <div>
                  <h3 className="font-medium text-gray-900 mb-3">Outstanding Invoices</h3>
                  <div className="space-y-2">
                    {selectedCustomer.outstandingInvoices.map((invoice, index) => (
                      <div key={index} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                        <div>
                          <div className="font-medium">{invoice.invoiceNo}</div>
                          <div className="text-sm text-gray-500">Due: {invoice.dueDate}</div>
                        </div>
                        <div className="text-right">
                          <div className="font-medium">₹{invoice.amount.toLocaleString()}</div>
                          {invoice.daysOverdue > 0 && (
                            <div className="text-sm text-red-600">
                              {invoice.daysOverdue} days overdue
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CreditManagement;