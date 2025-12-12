import React, { useState, useEffect } from 'react';
import { 
  CreditCard,
  ArrowDownCircle,
  ArrowUpCircle,
  Search,
  Calendar,
  Download,
  Eye,
  X,
  Filter,
  DollarSign
} from 'lucide-react';
import { paymentsApi } from '../../services/api';
import { Pagination, StatusBadge, useToast } from '../global';
import { format } from 'date-fns';

/**
 * PaymentHistory Component
 * Shows all payments and receipts in one unified view
 */
const PaymentHistory = ({ onClose, onSelectPayment }) => {
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const [transactions, setTransactions] = useState([]);
  const [filteredTransactions, setFilteredTransactions] = useState([]);
  
  // Pagination
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalItems, setTotalItems] = useState(0);
  const itemsPerPage = 20;
  
  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [transactionType, setTransactionType] = useState('all'); // all, payment, receipt
  const [paymentMode, setPaymentMode] = useState('all');
  const [partyFilter, setPartyFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  // Summary stats
  const [summary, setSummary] = useState({
    totalPayments: 0,
    totalReceipts: 0,
    balance: 0
  });

  // Payment modes
  const paymentModes = [
    'all', 'cash', 'bank_transfer', 'cheque', 'card', 'upi', 'neft', 'rtgs'
  ];

  // Fetch all transactions
  const fetchTransactions = async () => {
    setLoading(true);
    try {
      const transactionsList = [];
      
      // Fetch payments
      if (transactionType === 'all' || transactionType === 'payment') {
        try {
          const paymentRes = await paymentsApi.getPayments({
            page: 1,
            limit: 100,
            search: searchTerm,
            from_date: dateFrom,
            to_date: dateTo,
            payment_mode: paymentMode !== 'all' ? paymentMode : undefined
          });
          
          const payments = (paymentRes.data?.payments || paymentRes.data || []).map(pay => ({
            ...pay,
            transaction_type: 'payment',
            transaction_number: pay.payment_number || pay.receipt_no,
            transaction_date: pay.payment_date || pay.date,
            party_name: pay.supplier_name || pay.party_name,
            amount: pay.amount || pay.total_amount,
            mode: pay.payment_mode || pay.mode,
            status: pay.status || 'completed',
            reference: pay.reference_number || pay.cheque_number,
            icon: ArrowUpCircle,
            color: 'red'
          }));
          transactionsList.push(...payments);
        } catch (err) {
        }
      }
      
      // Fetch receipts
      if (transactionType === 'all' || transactionType === 'receipt') {
        try {
          const receiptRes = await paymentsApi.getReceipts({
            page: 1,
            limit: 100,
            search: searchTerm,
            from_date: dateFrom,
            to_date: dateTo,
            payment_mode: paymentMode !== 'all' ? paymentMode : undefined
          });
          
          const receipts = (receiptRes.data?.receipts || receiptRes.data || []).map(rec => ({
            ...rec,
            transaction_type: 'receipt',
            transaction_number: rec.receipt_number || rec.receipt_no,
            transaction_date: rec.receipt_date || rec.date,
            party_name: rec.customer_name || rec.party_name,
            amount: rec.amount || rec.total_amount,
            mode: rec.payment_mode || rec.mode,
            status: rec.status || 'completed',
            reference: rec.reference_number || rec.cheque_number,
            icon: ArrowDownCircle,
            color: 'green'
          }));
          transactionsList.push(...receipts);
        } catch (err) {
        }
      }
      
      // Calculate summary
      const totalPayments = transactionsList
        .filter(t => t.transaction_type === 'payment')
        .reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
      
      const totalReceipts = transactionsList
        .filter(t => t.transaction_type === 'receipt')
        .reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
      
      setSummary({
        totalPayments,
        totalReceipts,
        balance: totalReceipts - totalPayments
      });
      
      // Sort by date (newest first)
      transactionsList.sort((a, b) => {
        const dateA = new Date(a.transaction_date);
        const dateB = new Date(b.transaction_date);
        return dateB - dateA;
      });
      
      setTransactions(transactionsList);
      applyFilters(transactionsList);
    } catch (error) {
      toast.error('Failed to fetch transactions');
    } finally {
      setLoading(false);
    }
  };

  // Apply filters to transactions
  const applyFilters = (transactionsList = transactions) => {
    let filtered = [...transactionsList];
    
    // Search filter
    if (searchTerm) {
      const search = searchTerm.toLowerCase();
      filtered = filtered.filter(trans => 
        trans.transaction_number?.toLowerCase().includes(search) ||
        trans.party_name?.toLowerCase().includes(search) ||
        trans.reference?.toLowerCase().includes(search)
      );
    }
    
    // Party filter
    if (partyFilter) {
      const party = partyFilter.toLowerCase();
      filtered = filtered.filter(trans => 
        trans.party_name?.toLowerCase().includes(party)
      );
    }
    
    // Status filter
    if (statusFilter !== 'all') {
      filtered = filtered.filter(trans => 
        trans.status?.toLowerCase() === statusFilter.toLowerCase()
      );
    }
    
    // Payment mode filter
    if (paymentMode !== 'all') {
      filtered = filtered.filter(trans => 
        trans.mode?.toLowerCase() === paymentMode.toLowerCase()
      );
    }
    
    // Pagination
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    const paginated = filtered.slice(startIndex, endIndex);
    
    setFilteredTransactions(paginated);
    setTotalItems(filtered.length);
    setTotalPages(Math.ceil(filtered.length / itemsPerPage));
  };

  // Load transactions on mount and filter changes
  useEffect(() => {
    fetchTransactions();
  }, [transactionType, dateFrom, dateTo]);

  useEffect(() => {
    applyFilters();
  }, [searchTerm, partyFilter, statusFilter, paymentMode, currentPage]);

  // Format date
  const formatDate = (date) => {
    if (!date) return '-';
    try {
      return format(new Date(date), 'dd MMM yyyy');
    } catch {
      return date;
    }
  };

  // Format currency
  const formatCurrency = (amount) => {
    if (!amount && amount !== 0) return '-';
    return `₹${Number(amount).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  };

  // Get status color
  const getStatusColor = (status) => {
    const statusLower = status?.toLowerCase() || '';
    if (statusLower === 'completed' || statusLower === 'success') return 'green';
    if (statusLower === 'pending') return 'yellow';
    if (statusLower === 'failed' || statusLower === 'cancelled') return 'red';
    return 'gray';
  };

  return (
    <div className="fixed inset-0 bg-gray-600 bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-7xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200">
          <div className="flex justify-between items-start">
            <div>
              <h2 className="text-2xl font-bold text-gray-900">Payment History</h2>
              <p className="text-sm text-gray-500 mt-1">View all payments and receipts</p>
            </div>
            <div className="flex items-center space-x-4">
              {/* Summary Cards */}
              <div className="flex space-x-3">
                <div className="bg-green-50 px-4 py-2 rounded-lg">
                  <p className="text-xs text-green-600">Total Receipts</p>
                  <p className="text-lg font-bold text-green-700">{formatCurrency(summary.totalReceipts)}</p>
                </div>
                <div className="bg-red-50 px-4 py-2 rounded-lg">
                  <p className="text-xs text-red-600">Total Payments</p>
                  <p className="text-lg font-bold text-red-700">{formatCurrency(summary.totalPayments)}</p>
                </div>
                <div className="bg-blue-50 px-4 py-2 rounded-lg">
                  <p className="text-xs text-blue-600">Net Balance</p>
                  <p className="text-lg font-bold text-blue-700">{formatCurrency(summary.balance)}</p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <X className="h-5 w-5 text-gray-500" />
              </button>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="px-6 py-3 border-b border-gray-200">
          <div className="flex space-x-4">
            <button
              onClick={() => {
                setTransactionType('all');
                setCurrentPage(1);
              }}
              className={`px-4 py-2 rounded-lg font-medium transition-all ${
                transactionType === 'all' 
                  ? 'bg-gray-100 text-gray-700 border border-gray-300' 
                  : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              <CreditCard className="h-4 w-4 inline mr-2" />
              All Transactions
            </button>
            <button
              onClick={() => {
                setTransactionType('receipt');
                setCurrentPage(1);
              }}
              className={`px-4 py-2 rounded-lg font-medium transition-all ${
                transactionType === 'receipt' 
                  ? 'bg-green-50 text-green-700 border border-green-200' 
                  : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              <ArrowDownCircle className="h-4 w-4 inline mr-2" />
              Receipts (Inward)
            </button>
            <button
              onClick={() => {
                setTransactionType('payment');
                setCurrentPage(1);
              }}
              className={`px-4 py-2 rounded-lg font-medium transition-all ${
                transactionType === 'payment' 
                  ? 'bg-red-50 text-red-700 border border-red-200' 
                  : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              <ArrowUpCircle className="h-4 w-4 inline mr-2" />
              Payments (Outward)
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
          <div className="grid grid-cols-6 gap-4">
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                placeholder="Search..."
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setCurrentPage(1);
                }}
                className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {/* Party Filter */}
            <input
              type="text"
              placeholder="Filter by party..."
              value={partyFilter}
              onChange={(e) => {
                setPartyFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            />

            {/* Payment Mode */}
            <select
              value={paymentMode}
              onChange={(e) => {
                setPaymentMode(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 capitalize"
            >
              {paymentModes.map(mode => (
                <option key={mode} value={mode} className="capitalize">
                  {mode.replace('_', ' ')}
                </option>
              ))}
            </select>

            {/* Status Filter */}
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All Status</option>
              <option value="completed">Completed</option>
              <option value="pending">Pending</option>
              <option value="failed">Failed</option>
              <option value="cancelled">Cancelled</option>
            </select>

            {/* Date From */}
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            />

            {/* Date To */}
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        {/* Table */}
        <div className="flex-1 overflow-auto">
          <table className="w-full">
            <thead className="bg-gray-50 sticky top-0">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Transaction No</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Party</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Amount</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Mode</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Reference</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {loading ? (
                <tr>
                  <td colSpan="9" className="px-6 py-4 text-center text-gray-500">
                    Loading transactions...
                  </td>
                </tr>
              ) : filteredTransactions.length === 0 ? (
                <tr>
                  <td colSpan="9" className="px-6 py-4 text-center text-gray-500">
                    No transactions found
                  </td>
                </tr>
              ) : (
                filteredTransactions.map((trans, index) => {
                  const Icon = trans.icon;
                  return (
                    <tr key={`${trans.transaction_type}-${trans.transaction_number}-${index}`} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className={`flex items-center text-${trans.color}-600`}>
                          <Icon className="h-4 w-4 mr-2" />
                          <span className="text-sm font-medium capitalize">{trans.transaction_type}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="text-sm font-medium text-gray-900">{trans.transaction_number}</span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {formatDate(trans.transaction_date)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="text-sm text-gray-900">{trans.party_name || '-'}</span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className={`text-sm font-medium text-${trans.color}-700`}>
                          {trans.transaction_type === 'payment' ? '-' : '+'}{formatCurrency(trans.amount)}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="text-sm text-gray-600 capitalize">
                          {trans.mode?.replace('_', ' ') || '-'}
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="text-sm text-gray-600">{trans.reference || '-'}</span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <StatusBadge 
                          status={trans.status} 
                          color={getStatusColor(trans.status)}
                        />
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex space-x-2">
                          <button
                            onClick={() => onSelectPayment && onSelectPayment(trans)}
                            className="text-blue-600 hover:text-blue-900"
                            title="View"
                          >
                            <Eye className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => toast.info('Download feature coming soon')}
                            className="text-gray-600 hover:text-gray-900"
                            title="Download"
                          >
                            <Download className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Footer with Pagination */}
        <div className="px-6 py-4 border-t border-gray-200 bg-gray-50">
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            totalItems={totalItems}
            itemsPerPage={itemsPerPage}
            onPageChange={setCurrentPage}
            loading={loading}
            itemName="transactions"
          />
        </div>
      </div>
    </div>
  );
};

export default PaymentHistory;