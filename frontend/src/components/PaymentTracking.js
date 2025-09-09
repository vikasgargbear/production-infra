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
  Banknote,
  Smartphone,
  Building,
  FileText,
  CheckCircle,
  Clock,
  XCircle,
  AlertTriangle,
  Loader2,
  RefreshCw,
  AlertCircle
} from 'lucide-react';
import { paymentsApi, customersApi } from '../services/api';
import offlineStorage from '../services/offlineStorage';

const PaymentTracking = () => {
  const [payments, setPayments] = useState([]);
  const [filteredPayments, setFilteredPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [modeFilter, setModeFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState('all');
  const [showFilters, setShowFilters] = useState(false);
  const [selectedPayment, setSelectedPayment] = useState(null);
  const [showDetails, setShowDetails] = useState(false);

  // Payment mode configurations
  const paymentModes = [
    { id: 'upi', name: 'UPI', icon: Smartphone, color: 'purple' },
    { id: 'cheque', name: 'Cheque', icon: FileText, color: 'blue' },
    { id: 'cash', name: 'Cash', icon: Banknote, color: 'green' },
    { id: 'rtgs_neft', name: 'RTGS/NEFT', icon: Building, color: 'orange' },
    { id: 'card', name: 'Card', icon: CreditCard, color: 'pink' }
  ];

  // Load payments with offline fallback
  const loadPayments = async () => {
    setLoading(true);
    setError(null);
    
    try {
      const response = await paymentsApi.getAll();
      
      if (response?.data && Array.isArray(response.data)) {
        const paymentsData = response.data;
        setPayments(paymentsData);
        setFilteredPayments(paymentsData);
        
        // Store data offline for future use
        await offlineStorage.storeOffline('payments', paymentsData, { 
          critical: true, 
          persistent: true 
        });
      } else {
        setPayments([]);
        setFilteredPayments([]);
      }
    } catch (error) {
      
      // Try to load from offline storage instead of using mock data
      const offlineData = await offlineStorage.getOffline('payments', { critical: true });
      
      if (offlineData && !offlineStorage.isDataStale(offlineData, 30)) { // 30 minutes max for payment data
        setPayments(offlineData.data);
        setFilteredPayments(offlineData.data);
        
        // Show offline indicator
        setError('Currently using offline data. Some information may be outdated.');
      } else {
        // No offline data available - show proper error instead of mock data
        setError('Unable to load payment data. Please check your connection and try again.');
        setPayments([]);
        setFilteredPayments([]);
      }
    } finally {
      setLoading(false);
    }
  };

  // Refresh payments
  const handleRefresh = async () => {
    setRefreshing(true);
    setError(null);
    
    try {
      await loadPayments();
    } catch (error) {
      setError('Failed to refresh data. Please try again.');
    } finally {
      setRefreshing(false);
    }
  };

  // Filter payments
  const filterPayments = () => {
    let filtered = [...payments];

    // Search filter
    if (searchTerm) {
      filtered = filtered.filter(payment => 
        payment.customerName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        payment.invoiceNo?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        payment.transactionId?.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }

    // Status filter
    if (statusFilter !== 'all') {
      filtered = filtered.filter(payment => payment.status === statusFilter);
    }

    // Mode filter
    if (modeFilter !== 'all') {
      filtered = filtered.filter(payment => payment.paymentMode === modeFilter);
    }

    // Date filter
    if (dateFilter !== 'all') {
      const today = new Date().toISOString().split('T')[0];
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      const lastWeek = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      const lastMonth = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

      switch (dateFilter) {
        case 'today':
          filtered = filtered.filter(payment => payment.paymentDate === today);
          break;
        case 'yesterday':
          filtered = filtered.filter(payment => payment.paymentDate === yesterday);
          break;
        case 'last_week':
          filtered = filtered.filter(payment => payment.paymentDate >= lastWeek);
          break;
        case 'last_month':
          filtered = filtered.filter(payment => payment.paymentDate >= lastMonth);
          break;
      }
    }

    setFilteredPayments(filtered);
  };

  // Apply filters when any filter changes
  useEffect(() => {
    filterPayments();
  }, [payments, searchTerm, statusFilter, modeFilter, dateFilter]);

  // Calculate stats
  const calculateStats = () => {
    if (!payments.length) return { totalCollection: 0, pendingAmount: 0, completedCount: 0, pendingCount: 0 };

    const today = new Date().toISOString().split('T')[0];
    const todayPayments = payments.filter(p => p.paymentDate === today && p.status === 'completed');
    const todayCollection = todayPayments.reduce((sum, p) => sum + (p.paymentAmount || 0), 0);
    
    const totalCollection = payments
      .filter(p => p.status === 'completed')
      .reduce((sum, p) => sum + (p.paymentAmount || 0), 0);
    
    const pendingAmount = payments
      .filter(p => p.status === 'pending')
      .reduce((sum, p) => sum + (p.paymentAmount || 0), 0);
    
    const completedCount = payments.filter(p => p.status === 'completed').length;
    const pendingCount = payments.filter(p => p.status === 'pending').length;

    return {
      todayCollection,
      totalCollection,
      pendingAmount,
      completedCount,
      pendingCount
    };
  };

  // Get status color
  const getStatusColor = (status) => {
    switch (status) {
      case 'completed': return 'bg-green-100 text-green-800 border-green-200';
      case 'pending': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
      case 'bounced': return 'bg-red-100 text-red-800 border-red-200';
      case 'failed': return 'bg-red-100 text-red-800 border-red-200';
      default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  // Get status icon
  const getStatusIcon = (status) => {
    switch (status) {
      case 'completed': return CheckCircle;
      case 'pending': return Clock;
      case 'bounced': return XCircle;
      case 'failed': return AlertTriangle;
      default: return Clock;
    }
  };

  // Get payment mode icon
  const getPaymentModeIcon = (mode) => {
    const modeConfig = paymentModes.find(m => m.id === mode);
    return modeConfig ? modeConfig.icon : CreditCard;
  };

  // Get payment mode color
  const getPaymentModeColor = (mode) => {
    const modeConfig = paymentModes.find(m => m.id === mode);
    return modeConfig ? modeConfig.color : 'gray';
  };

  // Handle payment selection
  const handlePaymentSelect = (payment) => {
    setSelectedPayment(payment);
    setShowDetails(true);
  };

  // Load data on component mount
  useEffect(() => {
    loadPayments();
  }, []);

  // Clear old offline data periodically
  useEffect(() => {
    const interval = setInterval(() => {
      offlineStorage.clearOldData(24); // Clear data older than 24 hours
    }, 60 * 60 * 1000); // Check every hour

    return () => clearInterval(interval);
  }, []);

  const stats = calculateStats();

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
        <span className="ml-2 text-gray-600">Loading payment data...</span>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Payment Tracking</h1>
          <p className="text-gray-600">Monitor and track all payment transactions</p>
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
            New Payment
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
              <p className="text-sm font-medium text-gray-600">Today's Collection</p>
              <p className="text-2xl font-bold text-gray-900">
                ₹{stats.todayCollection.toLocaleString()}
              </p>
            </div>
            <div className="p-3 bg-green-100 rounded-lg">
              <CheckCircle className="w-6 h-6 text-green-600" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Total Collection</p>
              <p className="text-2xl font-bold text-gray-900">
                ₹{stats.totalCollection.toLocaleString()}
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
              <p className="text-sm font-medium text-gray-600">Pending Amount</p>
              <p className="text-2xl font-bold text-gray-900">
                ₹{stats.pendingAmount.toLocaleString()}
              </p>
            </div>
            <div className="p-3 bg-yellow-100 rounded-lg">
              <Clock className="w-6 h-6 text-yellow-600" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Completed</p>
              <p className="text-2xl font-bold text-gray-900">
                {stats.completedCount} / {payments.length}
              </p>
            </div>
            <div className="p-3 bg-green-100 rounded-lg">
              <CheckCircle className="w-6 h-6 text-green-600" />
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
                placeholder="Search payments..."
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
              <option value="completed">Completed</option>
              <option value="pending">Pending</option>
              <option value="bounced">Bounced</option>
              <option value="failed">Failed</option>
            </select>

            <select
              value={modeFilter}
              onChange={(e) => setModeFilter(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All Modes</option>
              {paymentModes.map(mode => (
                <option key={mode.id} value={mode.id}>{mode.name}</option>
              ))}
            </select>

            <select
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All Dates</option>
              <option value="today">Today</option>
              <option value="yesterday">Yesterday</option>
              <option value="last_week">Last Week</option>
              <option value="last_month">Last Month</option>
            </select>

            <button className="inline-flex items-center px-3 py-2 border border-gray-300 rounded-md bg-white text-gray-700 hover:bg-gray-50">
              <Download className="h-4 w-4 mr-2" />
              Export
            </button>
          </div>
        </div>
      </div>

      {/* Payments Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-medium text-gray-900">
            Payments ({filteredPayments.length})
          </h3>
        </div>

        {filteredPayments.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <CreditCard className="h-12 w-12 mx-auto mb-2 text-gray-300" />
            <p>No payments found matching your criteria</p>
            {payments.length > 0 && (
              <p className="text-sm text-gray-400 mt-1">Try adjusting your filters</p>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Payment Details
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Customer
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Amount
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Mode
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
                {filteredPayments.map((payment) => {
                  const StatusIcon = getStatusIcon(payment.status);
                  const ModeIcon = getPaymentModeIcon(payment.paymentMode);
                  
                  return (
                    <tr key={payment.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div>
                          <div className="text-sm font-medium text-gray-900">
                            {payment.invoiceNo || 'N/A'}
                          </div>
                          <div className="text-sm text-gray-500">
                            {payment.paymentDate || 'N/A'}
                          </div>
                          {payment.transactionId && (
                            <div className="text-xs text-gray-400 font-mono">
                              {payment.transactionId}
                            </div>
                          )}
                        </div>
                      </td>
                      
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div>
                          <div className="text-sm font-medium text-gray-900">
                            {payment.customerName || 'Unknown Customer'}
                          </div>
                          {payment.customerPhone && (
                            <div className="text-sm text-gray-500">
                              {payment.customerPhone}
                            </div>
                          )}
                        </div>
                      </td>
                      
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">
                          <div className="font-medium">
                            ₹{(payment.paymentAmount || 0).toLocaleString()}
                          </div>
                          {payment.invoiceAmount && payment.invoiceAmount !== payment.paymentAmount && (
                            <div className="text-xs text-gray-500">
                              of ₹{payment.invoiceAmount.toLocaleString()}
                            </div>
                          )}
                        </div>
                      </td>
                      
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex items-center">
                          <div className={`p-2 bg-${getPaymentModeColor(payment.paymentMode)}-100 rounded-lg mr-2`}>
                            <ModeIcon className={`w-4 h-4 text-${getPaymentModeColor(payment.paymentMode)}-600`} />
                          </div>
                          <span className="text-sm text-gray-900">
                            {paymentModes.find(m => m.id === payment.paymentMode)?.name || 'Unknown'}
                          </span>
                        </div>
                      </td>
                      
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(payment.status)}`}>
                          <StatusIcon className="w-3 h-3 mr-1" />
                          {payment.status || 'Unknown'}
                        </span>
                      </td>
                      
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        <div className="flex items-center space-x-2">
                          <button
                            onClick={() => handlePaymentSelect(payment)}
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
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Payment Details Modal */}
      {showDetails && selectedPayment && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div className="p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold text-gray-900">Payment Details</h2>
                <button
                  onClick={() => setShowDetails(false)}
                  className="p-2 hover:bg-gray-100 rounded-lg"
                >
                  <XCircle className="w-5 h-5 text-gray-500" />
                </button>
              </div>

              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Payment ID</label>
                    <p className="text-sm text-gray-900">{selectedPayment.id}</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Invoice No</label>
                    <p className="text-sm text-gray-900">{selectedPayment.invoiceNo || 'N/A'}</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Customer</label>
                    <p className="text-sm text-gray-900">{selectedPayment.customerName || 'Unknown'}</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Amount</label>
                    <p className="text-sm text-gray-900">₹{(selectedPayment.paymentAmount || 0).toLocaleString()}</p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Payment Mode</label>
                    <p className="text-sm text-gray-900">
                      {paymentModes.find(m => m.id === selectedPayment.paymentMode)?.name || 'Unknown'}
                    </p>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Status</label>
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusColor(selectedPayment.status)}`}>
                      {selectedPayment.status || 'Unknown'}
                    </span>
                  </div>
                </div>

                {selectedPayment.remarks && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Remarks</label>
                    <p className="text-sm text-gray-900">{selectedPayment.remarks}</p>
                  </div>
                )}

                {selectedPayment.attachments && selectedPayment.attachments.length > 0 && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Attachments</label>
                    <div className="flex space-x-2">
                      {selectedPayment.attachments.map((attachment, index) => (
                        <span key={index} className="text-sm text-blue-600 hover:text-blue-800 underline cursor-pointer">
                          {attachment}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PaymentTracking;