import React, { useState, useEffect } from 'react';
import {
  Users, Search, Filter, Download, Eye,
  TrendingUp, TrendingDown, CreditCard, AlertTriangle,
  CheckCircle, X, RefreshCw, User
} from 'lucide-react';
import { ledgerApi } from '../../services/api/modules/ledger.api';
import { formatCurrency, formatDate } from '../../utils/formatters';
import { DataTable, StatusBadge, Select, SummaryCard } from '../global';

const PartyBalance = ({ open = true, onClose }) => {
  const [loading, setLoading] = useState(true);
  const [balances, setBalances] = useState([]);
  const [filteredBalances, setFilteredBalances] = useState([]);
  const [partyType, setPartyType] = useState('customer');
  const [searchQuery, setSearchQuery] = useState('');
  const [balanceFilter, setBalanceFilter] = useState('all'); // all, debit, credit, zero
  const [showFilters, setShowFilters] = useState(false);
  const [summary, setSummary] = useState({
    totalParties: 0,
    totalDebitBalance: 0,
    totalCreditBalance: 0,
    partiesWithBalance: 0
  });

  useEffect(() => {
    loadBalances();
  }, [partyType]);

  useEffect(() => {
    filterBalances();
  }, [balances, searchQuery, balanceFilter]);

  const loadBalances = async () => {
    setLoading(true);
    try {
      // TODO: Remove mock data when backend schema is fixed
      // Generate mock balance data for demonstration
      const mockBalances = Array.from({ length: 25 }, (_, i) => {
        const hasBalance = Math.random() > 0.2;
        const isDebit = Math.random() > 0.5;
        const balance = hasBalance ? Math.random() * 50000 + 1000 : 0;
        
        return {
          party_id: `party-${i}`,
          party_name: `${partyType === 'customer' ? 'Customer' : 'Supplier'} ${i + 1}`,
          phone: `98${Math.floor(Math.random() * 100000000).toString().padStart(8, '0')}`,
          balance: balance,
          balance_type: balance > 0 ? (isDebit ? 'Dr' : 'Cr') : '',
          last_transaction_date: hasBalance ? new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0] : null,
          transaction_count: hasBalance ? Math.floor(Math.random() * 50) + 1 : 0
        };
      });
      
      setBalances(mockBalances);
      
      // Calculate summary
      const summary = mockBalances.reduce((acc, balance) => {
        acc.totalParties++;
        if (balance.balance > 0) {
          if (balance.balance_type === 'Dr') {
            acc.totalDebitBalance += balance.balance;
          } else {
            acc.totalCreditBalance += balance.balance;
          }
          acc.partiesWithBalance++;
        }
        return acc;
      }, {
        totalParties: 0,
        totalDebitBalance: 0,
        totalCreditBalance: 0,
        partiesWithBalance: 0
      });
      
      setSummary(summary);
      
      /* Original API call - restore when backend is fixed
      const response = await ledgerApi.getAllBalances(partyType, { limit: 500 });
      const balanceData = response.data.balances || [];
      setBalances(balanceData);
      */
    } catch (error) {
      console.error('Error loading balances:', error);
      setBalances([]);
      setSummary({
        totalParties: 0,
        totalDebitBalance: 0,
        totalCreditBalance: 0,
        partiesWithBalance: 0
      });
    } finally {
      setLoading(false);
    }
  };

  const filterBalances = () => {
    let filtered = [...balances];

    // Search filter
    if (searchQuery) {
      filtered = filtered.filter(balance =>
        balance.party_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (balance.phone && balance.phone.includes(searchQuery))
      );
    }

    // Balance type filter
    switch (balanceFilter) {
      case 'debit':
        filtered = filtered.filter(balance => balance.balance > 0 && balance.balance_type === 'Dr');
        break;
      case 'credit':
        filtered = filtered.filter(balance => balance.balance > 0 && balance.balance_type === 'Cr');
        break;
      case 'zero':
        filtered = filtered.filter(balance => balance.balance === 0);
        break;
      case 'nonzero':
        filtered = filtered.filter(balance => balance.balance > 0);
        break;
    }

    // Sort by balance amount (highest first)
    filtered.sort((a, b) => b.balance - a.balance);

    setFilteredBalances(filtered);
  };

  const handleExportBalances = async () => {
    try {
      // Create CSV content
      const csvHeaders = [
        'Party Name',
        'Phone',
        'Balance Amount',
        'Balance Type',
        'Last Transaction Date',
        'Transaction Count'
      ];

      const csvData = filteredBalances.map(balance => [
        balance.party_name,
        balance.phone || '',
        balance.balance,
        balance.balance_type,
        balance.last_transaction_date || '',
        balance.transaction_count
      ]);

      const csvContent = [
        csvHeaders.join(','),
        ...csvData.map(row => row.map(cell => `"${cell}"`).join(','))
      ].join('\n');

      // Create and download file
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const link = document.createElement('a');
      const url = URL.createObjectURL(blob);
      link.setAttribute('href', url);
      link.setAttribute('download', `party_balances_${partyType}_${new Date().toISOString().split('T')[0]}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      
      alert(`Successfully exported ${filteredBalances.length} ${partyType} balances`);
    } catch (error) {
      console.error('Export error:', error);
      alert('Failed to export data. Please try again.');
    }
  };

  const getBalanceStatus = (balance) => {
    if (balance.balance === 0) {
      return { color: 'gray', text: 'No Balance', icon: CheckCircle };
    } else if (balance.balance_type === 'Dr') {
      return { color: 'red', text: 'Receivable', icon: TrendingUp };
    } else {
      return { color: 'green', text: 'Payable', icon: TrendingDown };
    }
  };

  const columns = [
    {
      header: 'Party Details',
      field: 'party_name',
      render: (row) => (
        <div>
          <div className="font-medium text-gray-900">{row.party_name}</div>
          {row.phone && (
            <div className="text-sm text-gray-500">📞 {row.phone}</div>
          )}
        </div>
      )
    },
    {
      header: 'Balance',
      field: 'balance',
      render: (row) => (
        <div className="text-right">
          {row.balance > 0 ? (
            <div>
              <span className={`text-lg font-bold ${
                row.balance_type === 'Dr' ? 'text-red-600' : 'text-green-600'
              }`}>
                {formatCurrency(row.balance)}
              </span>
              <span className={`ml-1 text-sm ${
                row.balance_type === 'Dr' ? 'text-red-500' : 'text-green-500'
              }`}>
                {row.balance_type}
              </span>
            </div>
          ) : (
            <span className="text-gray-400 font-medium">No Balance</span>
          )}
        </div>
      )
    },
    {
      header: 'Status',
      field: 'balance_type',
      render: (row) => {
        const status = getBalanceStatus(row);
        return (
          <div className="flex items-center space-x-2">
            <status.icon className={`w-4 h-4 text-${status.color}-600`} />
            <StatusBadge
              status={status.text}
              color={status.color}
            />
          </div>
        );
      }
    },
    {
      header: 'Activity',
      field: 'transaction_count',
      render: (row) => (
        <div className="text-center">
          <div className="font-medium">{row.transaction_count}</div>
          <div className="text-xs text-gray-500">transactions</div>
          {row.last_transaction_date && (
            <div className="text-xs text-gray-500 mt-1">
              Last: {formatDate(row.last_transaction_date)}
            </div>
          )}
        </div>
      )
    }
  ];

  if (!open) return null;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="bg-white shadow-sm border-b border-gray-200 flex-shrink-0">
        <div className="px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between py-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Party Balances</h1>
              <p className="text-sm text-gray-600">Current outstanding amounts</p>
            </div>
            
            <div className="flex items-center space-x-3">
              <button
                onClick={handleExportBalances}
                className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                <Download className="w-4 h-4" />
                <span>Export</span>
              </button>
              
              <button
                onClick={loadBalances}
                className="p-2 text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg"
                title="Refresh"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              </button>
              
              <button
                onClick={onClose}
                className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto bg-gray-50">
        <div className="px-4 sm:px-6 lg:px-8 py-6">
          
          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <SummaryCard
              title="Total Parties"
              value={summary.totalParties}
              icon={Users}
              color="blue"
            />

            <SummaryCard
              title="Receivables"
              value={formatCurrency(summary.totalDebitBalance)}
              icon={TrendingUp}
              color="red"
              subtitle="Amount to receive"
            />

            <SummaryCard
              title="Payables"
              value={formatCurrency(summary.totalCreditBalance)}
              icon={TrendingDown}
              color="green"
              subtitle="Amount to pay"
            />

            <SummaryCard
              title="Active Parties"
              value={summary.partiesWithBalance}
              icon={User}
              color="amber"
              subtitle="With outstanding balance"
            />
          </div>

          {/* Filters */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-medium text-gray-900">Filters</h3>
              <button
                onClick={() => setShowFilters(!showFilters)}
                className="flex items-center space-x-2 text-sm text-gray-600 hover:text-gray-800"
              >
                <Filter className="w-4 h-4" />
                <span>{showFilters ? 'Hide' : 'Show'} Filters</span>
              </button>
            </div>

            <div className={`grid grid-cols-1 md:grid-cols-3 gap-4 ${showFilters ? '' : 'hidden'}`}>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Party Type
                </label>
                <Select
                  value={partyType}
                  onChange={setPartyType}
                  options={[
                    { value: 'customer', label: 'Customers' },
                    { value: 'supplier', label: 'Suppliers' }
                  ]}
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Balance Filter
                </label>
                <Select
                  value={balanceFilter}
                  onChange={setBalanceFilter}
                  options={[
                    { value: 'all', label: 'All Balances' },
                    { value: 'nonzero', label: 'Non-zero Balances' },
                    { value: 'debit', label: 'Receivables Only' },
                    { value: 'credit', label: 'Payables Only' },
                    { value: 'zero', label: 'Zero Balances' }
                  ]}
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Search Party
                </label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search by name or phone..."
                    className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Balances Table */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200">
            {loading ? (
              <div className="flex items-center justify-center h-64">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
              </div>
            ) : filteredBalances.length > 0 ? (
              <DataTable
                columns={columns}
                data={filteredBalances}
                emptyMessage="No balances found"
              />
            ) : (
              <div className="text-center py-12">
                <Users className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                <p className="text-gray-600">No {partyType} balances found</p>
                <p className="text-sm text-gray-500 mt-1">
                  {searchQuery || balanceFilter !== 'all' 
                    ? 'Try adjusting your filters' 
                    : `No ${partyType}s have transactions yet`}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default PartyBalance;