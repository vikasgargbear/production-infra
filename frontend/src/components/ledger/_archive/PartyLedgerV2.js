import React, { useState, useEffect, useRef } from 'react';
import { 
  X, Users, Search, Calendar, Filter, Download,
  Printer, Mail, MessageSquare, TrendingUp, TrendingDown,
  FileText, IndianRupee, Clock, AlertCircle, Building
} from 'lucide-react';
import { customersApi } from '../../services/api';
import { searchCache, smartSearch } from '../../utils/searchCache';

// Import global components
import { CustomerSearch, ProductSearch, GSTCalculator, ProductCreationModal, ProceedToReviewComponent } from '../global';
import CustomerCreationModal from '../customers/CustomerCreationModal';
import { SalesItemsTable } from '../sales';

const PartyLedgerV2 = ({ open = true, onClose }) => {
  const [filters, setFilters] = useState({
    party_type: 'all', // 'customer', 'supplier', 'all'
    party_id: '',
    party_name: '',
    from_date: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    to_date: new Date().toISOString().split('T')[0]
  });

  const [ledgerData, setLedgerData] = useState({
    party_details: null,
    opening_balance: 0,
    transactions: [],
    closing_balance: 0,
    total_debit: 0,
    total_credit: 0,
    pending_dues: []
  });

  const [loading, setLoading] = useState(false);
  const [selectedParty, setSelectedParty] = useState(null);
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState('');

  // Keyboard shortcuts
  const shortcuts = [
    { key: 'Ctrl+F', label: 'Search Party' },
    { key: 'Ctrl+P', label: 'Print' },
    { key: 'Ctrl+E', label: 'Export' },
    { key: 'Ctrl+R', label: 'Refresh' },
    { key: 'Esc', label: 'Close' }
  ];

  useEffect(() => {
    const handleKeyPress = (e) => {
      // Ctrl+P to print
      if (e.ctrlKey && e.key === 'p') {
        e.preventDefault();
        handlePrint();
      }
      // Ctrl+E to export
      if (e.ctrlKey && e.key === 'e') {
        e.preventDefault();
        handleExport();
      }
      // Ctrl+R to refresh
      if (e.ctrlKey && e.key === 'r') {
        e.preventDefault();
        if (selectedParty) {
          fetchLedgerData();
        }
      }
      // Esc to close
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [selectedParty]);

  const fetchLedgerData = async () => {
    if (!selectedParty) {
      setMessage('Please select a party first', 'error');
      setMessageType('error');
      return;
    }

    setLoading(true);
    try {
      // TODO: Implement ledger API
      const response = { data: [] };
      
      setLedgerData(response.data);
      
      setMessage('Ledger data loaded successfully', 'success');
      setMessageType('success');
    } catch (error) {
      console.error('Error fetching ledger data:', error);
      setMessage(error.message || 'Failed to fetch ledger data', 'error');
      setMessageType('error');
    } finally {
      setLoading(false);
    }
  };

  const handlePartySelect = (party) => {
    setSelectedParty(party);
    setFilters(prev => ({
      ...prev,
      party_id: party.id || party.customer_id || party.supplier_id,
      party_name: party.customer_name || party.supplier_name || party.name
    }));
    // Auto-fetch ledger data when party is selected
    setTimeout(() => fetchLedgerData(), 100);
  };

  const handlePrint = () => {
    window.print();
  };

  const handleExport = () => {
    // Export functionality
    setMessage('Exporting ledger data...', 'info');
    setMessageType('info');
  };

  const clearMessage = () => {
    setMessage('');
    setMessageType('');
  };

  if (!open) return null;

  return (
    <div className="h-full bg-gray-50">
      <div className="h-full flex flex-col">
        {/* Header - Match Invoice Style */}
        <div className="bg-white border-b border-gray-200">
          <div className="flex items-center justify-between px-6 py-4">
            <div className="flex items-center gap-3">
              <Users className="w-5 h-5 text-gray-600" />
              <h1 className="text-xl font-semibold text-gray-900">Party Ledger</h1>
              <div className="px-3 py-1 bg-gradient-to-r from-purple-50 to-indigo-50 border border-purple-200 rounded-lg">
                <span className="text-sm font-medium text-purple-700">
                  {selectedParty ? selectedParty.name || selectedParty.customer_name : 'Select Party'}
                </span>
              </div>
            </div>
            
            <div className="flex items-center gap-3">
              <button
                onClick={handleExport}
                className="text-gray-600 hover:text-gray-800 transition-colors text-sm flex items-center gap-1"
              >
                <Download className="w-4 h-4" />
                Export
              </button>
              <button
                onClick={handlePrint}
                className="text-gray-600 hover:text-gray-800 transition-colors text-sm flex items-center gap-1"
              >
                <Printer className="w-4 h-4" />
                Print
              </button>
              <button
                onClick={fetchLedgerData}
                disabled={!selectedParty}
                className="px-5 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:bg-gray-400 disabled:cursor-not-allowed text-sm font-medium"
              >
                View Ledger
              </button>
              <button 
                onClick={onClose} 
                className="p-1.5 hover:bg-gray-100 rounded-lg ml-2"
                title="Close (Esc)"
              >
                <X className="w-5 h-5 text-gray-400 hover:text-gray-600" />
              </button>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto bg-gray-50">
          <div className="max-w-6xl mx-auto px-6 py-8">
          {/* Message Display */}
          {message && (
            <div className={`px-4 py-3 rounded-lg flex items-start text-sm ${
              messageType === 'success' ? 'bg-green-50 text-green-800 border border-green-200' : 
              messageType === 'error' ? 'bg-red-50 text-red-800 border border-red-200' : 
              'bg-blue-50 text-blue-800 border border-blue-200'
            }`}>
              <div className="flex-1">{message}</div>
              <button onClick={clearMessage} className="ml-2 hover:opacity-70">
                <X className="w-3 h-3" />
              </button>
            </div>
          )}

            {/* Party Selection */}
            <div className="mb-8">
              <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-4">SELECT PARTY</h3>
              <div className="flex items-center gap-3 mb-4">
                <button
                  onClick={() => setFilters(prev => ({ ...prev, party_type: 'all' }))}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                    filters.party_type === 'all' 
                      ? 'bg-purple-100 text-purple-700' 
                      : 'text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  All Parties
                </button>
                <button
                  onClick={() => setFilters(prev => ({ ...prev, party_type: 'customer' }))}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ${
                    filters.party_type === 'customer' 
                      ? 'bg-purple-100 text-purple-700' 
                      : 'text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  <Users className="w-4 h-4" />
                  Customers
                </button>
                <button
                  onClick={() => setFilters(prev => ({ ...prev, party_type: 'supplier' }))}
                  className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors flex items-center gap-2 ${
                    filters.party_type === 'supplier' 
                      ? 'bg-purple-100 text-purple-700' 
                      : 'text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  <Building className="w-4 h-4" />
                  Suppliers
                </button>
              </div>
              <CustomerSearch
                value={selectedParty}
                onChange={handlePartySelect}
                onCreateNew={() => {/* Handle create new */}}
                displayMode="inline"
                placeholder={`Search ${filters.party_type === 'supplier' ? 'supplier' : filters.party_type === 'customer' ? 'customer' : 'party'} by name, phone, or code...`}
                required
              />
            </div>

            {/* Date Range */}
            <div className="mb-8">
              <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-4">DATE RANGE</h3>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-2">From Date</label>
                  <div className="relative">
                    <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      type="date"
                      value={filters.from_date}
                      onChange={(e) => setFilters(prev => ({ ...prev, from_date: e.target.value }))}
                      className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-600 mb-2">To Date</label>
                  <div className="relative">
                    <Calendar className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      type="date"
                      value={filters.to_date}
                      onChange={(e) => setFilters(prev => ({ ...prev, to_date: e.target.value }))}
                      className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Ledger Summary */}
            {ledgerData.party_details && (
              <div className="mb-8">
                <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-4">LEDGER SUMMARY</h3>
                <div className="bg-white rounded-lg border border-gray-200 p-6">
                  <div className="grid grid-cols-4 gap-4 mb-6">
                <div className="text-center">
                  <p className="text-sm text-gray-600">Opening Balance</p>
                  <p className="text-xl font-bold text-gray-900">
                    ₹{ledgerData.opening_balance.toFixed(2)}
                  </p>
                </div>
                <div className="text-center">
                  <p className="text-sm text-gray-600">Total Debit</p>
                  <p className="text-xl font-bold text-red-600">
                    ₹{ledgerData.total_debit.toFixed(2)}
                  </p>
                </div>
                <div className="text-center">
                  <p className="text-sm text-gray-600">Total Credit</p>
                  <p className="text-xl font-bold text-green-600">
                    ₹{ledgerData.total_credit.toFixed(2)}
                  </p>
                </div>
                <div className="text-center">
                  <p className="text-sm text-gray-600">Closing Balance</p>
                  <p className="text-xl font-bold text-blue-600">
                    ₹{ledgerData.closing_balance.toFixed(2)}
                  </p>
                </div>
              </div>

              {/* Pending Dues Alert */}
              {ledgerData.pending_dues.length > 0 && (
                <div className="mb-6 p-4 bg-amber-50 border border-amber-200 rounded-lg">
                  <div className="flex items-start">
                    <AlertCircle className="w-5 h-5 text-amber-600 mr-3 flex-shrink-0" />
                    <div>
                      <p className="font-medium text-amber-900">Overdue Payments</p>
                      <p className="text-sm text-amber-700 mt-1">
                        {ledgerData.pending_dues.length} invoice(s) are overdue
                      </p>
                    </div>
                  </div>
                </div>
              )}
                </div>
              </div>
            )}

            {/* Transactions Table */}
            {ledgerData.transactions.length > 0 && (
              <div className="mb-8">
                <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider mb-4">TRANSACTION DETAILS</h3>
                <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
                  <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Date</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Type</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Reference</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-600 uppercase">Description</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-600 uppercase">Debit</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-600 uppercase">Credit</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-600 uppercase">Balance</th>
                    </tr>
                  </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {ledgerData.transactions.map(transaction => (
                          <tr key={transaction.id} className="hover:bg-gray-50">
                            <td className="px-6 py-4 text-sm text-gray-900">
                              {new Date(transaction.date).toLocaleDateString('en-IN')}
                            </td>
                            <td className="px-6 py-4">
                              <div className={`inline-flex px-2 py-1 text-xs font-medium rounded-full ${
                                transaction.type === 'Invoice' ? 'bg-blue-100 text-blue-800' :
                                transaction.type === 'Payment' ? 'bg-green-100 text-green-800' :
                                'bg-gray-100 text-gray-800'
                              }`}>
                                {transaction.type}
                              </div>
                            </td>
                            <td className="px-6 py-4 text-sm font-medium text-gray-900">
                              {transaction.reference}
                            </td>
                            <td className="px-6 py-4 text-sm text-gray-600">
                              {transaction.description}
                            </td>
                            <td className="px-6 py-4 text-sm text-right">
                              {transaction.debit > 0 && (
                                <span className="text-red-600 font-medium">
                                  ₹{transaction.debit.toFixed(2)}
                                </span>
                              )}
                            </td>
                            <td className="px-6 py-4 text-sm text-right">
                              {transaction.credit > 0 && (
                                <span className="text-green-600 font-medium">
                                  ₹{transaction.credit.toFixed(2)}
                                </span>
                              )}
                            </td>
                            <td className="px-6 py-4 text-sm text-right font-bold text-gray-900">
                              ₹{transaction.balance.toFixed(2)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            )}

            {/* Empty State */}
            {!loading && !ledgerData.party_details && selectedParty && (
              <div className="bg-white rounded-lg border border-gray-200 p-8 text-center">
                <Users className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-600">No ledger data available</p>
                <p className="text-sm text-gray-500 mt-2">Try adjusting your date range or check if the party has any transactions</p>
              </div>
            )}
          </div>
        </div>

        {/* Footer - Using Global Component */}
        <ProceedToReviewComponent
          currentStep={1}
          canProceed={false}
          onReset={() => {
            setSelectedParty(null);
            setLedgerData({
              party_details: null,
              opening_balance: 0,
              transactions: [],
              closing_balance: 0,
              total_debit: 0,
              total_credit: 0,
              pending_dues: []
            });
            setFilters({
              party_type: 'all',
              party_id: '',
              party_name: '',
              from_date: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
              to_date: new Date().toISOString().split('T')[0]
            });
          }}
          totalItems={ledgerData.transactions ? ledgerData.transactions.length : 0}
          totalAmount={ledgerData.closing_balance || 0}
          showTotals={ledgerData.party_details !== null}
        />
      </div>
    </div>
  );
};

export default PartyLedgerV2;