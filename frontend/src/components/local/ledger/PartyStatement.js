import React, { useState, useEffect } from 'react';
import {
  User, Search, Calendar, Download, Eye, Filter,
  TrendingUp, TrendingDown, CreditCard, FileText,
  AlertCircle, CheckCircle, X, RefreshCw
} from 'lucide-react';
import { ledgerApi } from '../../services/api/modules/ledger.api';
import { formatCurrency, formatDate } from '../../utils/formatters';
import { DataTable, StatusBadge, DatePicker, Select, SummaryCard } from '../global';
import { CustomerSearch } from '../global';

const PartyStatement = ({ open = true, onClose }) => {
  const [loading, setLoading] = useState(false);
  const [selectedParty, setSelectedParty] = useState(null);
  const [partyType, setPartyType] = useState('customer');
  const [statement, setStatement] = useState([]);
  const [balance, setBalance] = useState(null);
  const [dateRange, setDateRange] = useState({
    fromDate: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0],
    toDate: new Date().toISOString().split('T')[0]
  });
  const [showFilters, setShowFilters] = useState(false);

  const loadPartyData = async (party) => {
    if (!party) return;
    
    setLoading(true);
    try {
      // TODO: Remove mock data when backend schema is fixed
      // Backend issue: party_ledger table uses UUID but customers table uses integer ID
      
      // Generate mock data for demonstration
      const mockBalance = {
        balance: Math.random() * 50000 + 10000,
        balance_type: Math.random() > 0.5 ? 'Dr' : 'Cr',
        transaction_count: Math.floor(Math.random() * 50) + 10,
        last_transaction_date: new Date().toISOString().split('T')[0]
      };
      
      const mockTransactions = Array.from({ length: 20 }, (_, i) => {
        const isDebit = Math.random() > 0.5;
        const amount = Math.random() * 10000 + 1000;
        const date = new Date();
        date.setDate(date.getDate() - i * 5);
        
        return {
          ledger_id: `ledger-${i}`,
          transaction_date: date.toISOString().split('T')[0],
          transaction_type: isDebit ? 'invoice' : 'payment',
          reference_number: isDebit ? `INV-2025-${1000 + i}` : `PAY-2025-${500 + i}`,
          description: isDebit ? 'Sales Invoice' : 'Payment Received',
          debit_amount: isDebit ? amount : 0,
          credit_amount: !isDebit ? amount : 0,
          running_balance: mockBalance.balance - (i * 1000),
          balance_type: mockBalance.balance_type,
          payment_mode: !isDebit ? 'online' : null
        };
      });
      
      setBalance(mockBalance);
      setStatement(mockTransactions);
      
      /* Original API calls - restore when backend is fixed
      const [balanceResponse, statementResponse] = await Promise.all([
        ledgerApi.getPartyBalance(party.customer_id || party.supplier_id, partyType),
        ledgerApi.getPartyStatement(party.customer_id || party.supplier_id, partyType, {
          fromDate: dateRange.fromDate,
          toDate: dateRange.toDate,
          limit: 100
        })
      ]);

      setBalance(balanceResponse.data);
      setStatement(statementResponse.data.transactions || []);
      */
    } catch (error) {
      console.error('Error loading party data:', error);
      // Show user-friendly error
      setBalance(null);
      setStatement([]);
    } finally {
      setLoading(false);
    }
  };

  const handlePartySelect = (party) => {
    setSelectedParty(party);
    loadPartyData(party);
  };

  const handleDateRangeChange = () => {
    if (selectedParty) {
      loadPartyData(selectedParty);
    }
  };

  const handleExportStatement = async () => {
    if (!selectedParty) return;
    
    try {
      const response = await ledgerApi.generateStatementReport(
        selectedParty.customer_id || selectedParty.supplier_id,
        partyType,
        {
          fromDate: dateRange.fromDate,
          toDate: dateRange.toDate,
          format: 'pdf'
        }
      );

      // Create download link
      const url = window.URL.createObjectURL(new Blob([response.data], { type: 'application/pdf' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = `statement_${selectedParty.customer_name || selectedParty.supplier_name}_${dateRange.fromDate}_${dateRange.toDate}.pdf`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error exporting statement:', error);
      alert('Failed to export statement. Please try again.');
    }
  };

  const getTransactionIcon = (type) => {
    switch (type) {
      case 'invoice':
      case 'sale':
        return <FileText className="w-4 h-4 text-blue-600" />;
      case 'payment':
      case 'receipt':
        return <CreditCard className="w-4 h-4 text-green-600" />;
      case 'credit_note':
        return <TrendingDown className="w-4 h-4 text-red-600" />;
      case 'debit_note':
        return <TrendingUp className="w-4 h-4 text-orange-600" />;
      default:
        return <FileText className="w-4 h-4 text-gray-600" />;
    }
  };

  const columns = [
    {
      header: 'Date',
      field: 'transaction_date',
      render: (row) => (
        <div className="text-sm">
          {formatDate(row.transaction_date)}
        </div>
      )
    },
    {
      header: 'Type',
      field: 'transaction_type',
      render: (row) => (
        <div className="flex items-center space-x-2">
          {getTransactionIcon(row.transaction_type)}
          <span className="text-sm font-medium capitalize">
            {row.transaction_type.replace('_', ' ')}
          </span>
        </div>
      )
    },
    {
      header: 'Reference',
      field: 'reference_number',
      render: (row) => (
        <div>
          <div className="text-sm font-medium">{row.reference_number}</div>
          {row.description && (
            <div className="text-xs text-gray-500">{row.description}</div>
          )}
        </div>
      )
    },
    {
      header: 'Debit',
      field: 'debit_amount',
      render: (row) => (
        <div className="text-right">
          {row.debit_amount > 0 ? (
            <span className="text-red-600 font-medium">
              {formatCurrency(row.debit_amount)}
            </span>
          ) : (
            <span className="text-gray-400">-</span>
          )}
        </div>
      )
    },
    {
      header: 'Credit',
      field: 'credit_amount',
      render: (row) => (
        <div className="text-right">
          {row.credit_amount > 0 ? (
            <span className="text-green-600 font-medium">
              {formatCurrency(row.credit_amount)}
            </span>
          ) : (
            <span className="text-gray-400">-</span>
          )}
        </div>
      )
    },
    {
      header: 'Balance',
      field: 'running_balance',
      render: (row) => (
        <div className="text-right">
          <span className={`font-medium ${
            row.balance_type === 'Dr' ? 'text-red-600' : 'text-green-600'
          }`}>
            {formatCurrency(row.running_balance)} {row.balance_type}
          </span>
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
              <h1 className="text-2xl font-bold text-gray-900">Party Statement</h1>
              <p className="text-sm text-gray-600">View detailed transaction history</p>
            </div>
            
            <div className="flex items-center space-x-3">
              {selectedParty && (
                <>
                  <button
                    onClick={handleExportStatement}
                    className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                  >
                    <Download className="w-4 h-4" />
                    <span>Export PDF</span>
                  </button>
                  
                  <button
                    onClick={() => loadPartyData(selectedParty)}
                    className="p-2 text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg"
                    title="Refresh"
                  >
                    <RefreshCw className="w-4 h-4" />
                  </button>
                </>
              )}
              
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
          
          {/* Party Selection */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Select Party</h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Party Type
                </label>
                <Select
                  value={partyType}
                  onChange={setPartyType}
                  options={[
                    { value: 'customer', label: 'Customer' },
                    { value: 'supplier', label: 'Supplier' }
                  ]}
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Search {partyType === 'customer' ? 'Customer' : 'Supplier'}
                </label>
                <CustomerSearch
                  onChange={handlePartySelect}
                  placeholder={`Search ${partyType}...`}
                  className="w-full"
                />
              </div>
            </div>
          </div>

          {/* Selected Party Info & Balance */}
          {selectedParty && balance && (
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
              <div className="md:col-span-2 bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                <div className="flex items-center space-x-3">
                  <div className="p-3 bg-blue-100 rounded-full">
                    <User className="w-6 h-6 text-blue-600" />
                  </div>
                  <div>
                    <h3 className="text-lg font-medium text-gray-900">
                      {selectedParty.customer_name || selectedParty.supplier_name}
                    </h3>
                    <p className="text-sm text-gray-500">
                      {selectedParty.phone && `Phone: ${selectedParty.phone}`}
                      {selectedParty.gstin && ` • GSTIN: ${selectedParty.gstin}`}
                    </p>
                  </div>
                </div>
              </div>

              <SummaryCard
                title="Current Balance"
                value={`${formatCurrency(balance.balance)} ${balance.balance_type}`}
                icon={balance.balance_type === 'Dr' ? TrendingUp : TrendingDown}
                color={balance.balance_type === 'Dr' ? 'red' : 'green'}
              />

              <SummaryCard
                title="Total Transactions"
                value={balance.transaction_count}
                icon={FileText}
                color="blue"
              />
            </div>
          )}

          {/* Date Range Filter */}
          {selectedParty && (
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-6">
              <div className="flex items-center justify-between">
                <h4 className="font-medium text-gray-900">Date Range</h4>
                <button
                  onClick={() => setShowFilters(!showFilters)}
                  className="flex items-center space-x-2 text-sm text-gray-600 hover:text-gray-800"
                >
                  <Filter className="w-4 h-4" />
                  <span>Filters</span>
                </button>
              </div>
              
              {showFilters && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      From Date
                    </label>
                    <DatePicker
                      value={new Date(dateRange.fromDate)}
                      onChange={(date) => setDateRange(prev => ({ 
                        ...prev, 
                        fromDate: date.toISOString().split('T')[0] 
                      }))}
                    />
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      To Date
                    </label>
                    <DatePicker
                      value={new Date(dateRange.toDate)}
                      onChange={(date) => setDateRange(prev => ({ 
                        ...prev, 
                        toDate: date.toISOString().split('T')[0] 
                      }))}
                    />
                  </div>
                  
                  <div className="flex items-end">
                    <button
                      onClick={handleDateRangeChange}
                      className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                    >
                      Apply Filter
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Statement Table */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200">
            {loading ? (
              <div className="flex items-center justify-center h-64">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
              </div>
            ) : selectedParty && statement.length > 0 ? (
              <DataTable
                columns={columns}
                data={statement}
                emptyMessage="No transactions found for the selected period"
              />
            ) : selectedParty ? (
              <div className="text-center py-12">
                <FileText className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                <p className="text-gray-600">No transactions found</p>
                <p className="text-sm text-gray-500 mt-1">
                  Try adjusting the date range or check if there are any transactions
                </p>
              </div>
            ) : (
              <div className="text-center py-12">
                <User className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                <p className="text-gray-600">Select a party to view statement</p>
                <p className="text-sm text-gray-500 mt-1">
                  Search and select a customer or supplier above
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default PartyStatement;