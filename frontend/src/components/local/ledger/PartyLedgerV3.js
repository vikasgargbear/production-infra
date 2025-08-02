import React, { useState, useEffect } from 'react';
import { 
  X, Users, Search, Calendar, Download, Printer, Building
} from 'lucide-react';
import { partyLedgerApi } from '../../services/api';
import { CustomerSearch } from '../global';

const PartyLedgerV3 = ({ open = true, onClose }) => {
  const [selectedParty, setSelectedParty] = useState(null);
  const [partyType, setPartyType] = useState('customer');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [ledgerData, setLedgerData] = useState(null);
  const [dateRange, setDateRange] = useState({
    from: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    to: new Date().toISOString().split('T')[0]
  });

  // Fetch ledger data when party is selected or date range changes
  useEffect(() => {
    if (selectedParty) {
      fetchLedgerData();
    }
  }, [selectedParty, dateRange]);

  const fetchLedgerData = async () => {
    if (!selectedParty) return;

    setLoading(true);
    setError(null);
    
    try {
      const partyId = selectedParty.customer_id || selectedParty.supplier_id || selectedParty.id;
      
      console.log('=== FETCHING LEDGER DATA ===');
      console.log('Party:', selectedParty);
      console.log('Party ID:', partyId);
      console.log('Party Type:', partyType);
      console.log('Date Range:', dateRange);

      // Make all API calls
      const [statementRes, balanceRes, outstandingRes] = await Promise.all([
        partyLedgerApi.getStatement(partyId, partyType, {
          from_date: dateRange.from,
          to_date: dateRange.to
        }),
        partyLedgerApi.getBalance(partyId, partyType),
        partyLedgerApi.getOutstandingBills(partyId, partyType)
      ]);

      console.log('=== API RESPONSES ===');
      console.log('Statement:', statementRes.data);
      console.log('Balance:', balanceRes.data);
      console.log('Outstanding:', outstandingRes.data);

      // Set the ledger data
      setLedgerData({
        statement: statementRes.data,
        balance: balanceRes.data,
        outstanding: outstandingRes.data
      });

    } catch (err) {
      console.error('=== API ERROR ===', err);
      setError(err.response?.data?.detail || err.message || 'Failed to fetch ledger data');
      setLedgerData(null);
    } finally {
      setLoading(false);
    }
  };

  const handlePartySelect = (party) => {
    console.log('=== PARTY SELECTED ===', party);
    setSelectedParty(party);
    setLedgerData(null); // Clear previous data
  };

  const handleRefresh = () => {
    if (selectedParty) {
      fetchLedgerData();
    }
  };

  if (!open) return null;

  return (
    <div className="h-full bg-gray-50">
      <div className="h-full flex flex-col">
        {/* Header */}
        <div className="bg-white border-b border-gray-200">
          <div className="flex items-center justify-between px-6 py-4">
            <div className="flex items-center gap-3">
              <Users className="w-5 h-5 text-gray-600" />
              <h1 className="text-xl font-semibold text-gray-900">Party Ledger</h1>
              {selectedParty && (
                <div className="px-3 py-1 bg-purple-50 border border-purple-200 rounded-lg">
                  <span className="text-sm font-medium text-purple-700">
                    {selectedParty.customer_name || selectedParty.supplier_name || selectedParty.name}
                  </span>
                </div>
              )}
            </div>
            
            <div className="flex items-center gap-3">
              <button
                onClick={handleRefresh}
                disabled={!selectedParty || loading}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50"
              >
                Refresh
              </button>
              <button 
                onClick={onClose} 
                className="p-1.5 hover:bg-gray-100 rounded-lg"
              >
                <X className="w-5 h-5 text-gray-400 hover:text-gray-600" />
              </button>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* Party Selection */}
          <div className="mb-6">
            <div className="flex items-center gap-4 mb-4">
              <button
                onClick={() => setPartyType('customer')}
                className={`px-4 py-2 rounded-lg text-sm font-medium ${
                  partyType === 'customer' 
                    ? 'bg-blue-100 text-blue-700' 
                    : 'bg-gray-100 text-gray-700'
                }`}
              >
                <Users className="w-4 h-4 inline mr-2" />
                Customer
              </button>
              <button
                onClick={() => setPartyType('supplier')}
                className={`px-4 py-2 rounded-lg text-sm font-medium ${
                  partyType === 'supplier' 
                    ? 'bg-blue-100 text-blue-700' 
                    : 'bg-gray-100 text-gray-700'
                }`}
              >
                <Building className="w-4 h-4 inline mr-2" />
                Supplier
              </button>
            </div>

            <CustomerSearch
              value={selectedParty}
              onChange={handlePartySelect}
              placeholder={`Search ${partyType}...`}
              displayMode="inline"
            />
          </div>

          {/* Date Range */}
          <div className="mb-6 grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">From Date</label>
              <input
                type="date"
                value={dateRange.from}
                onChange={(e) => setDateRange(prev => ({ ...prev, from: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">To Date</label>
              <input
                type="date"
                value={dateRange.to}
                onChange={(e) => setDateRange(prev => ({ ...prev, to: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              />
            </div>
          </div>

          {/* Error Display */}
          {error && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700">
              <p className="font-medium">Error</p>
              <p className="text-sm">{error}</p>
            </div>
          )}

          {/* Loading State */}
          {loading && (
            <div className="bg-white rounded-lg border border-gray-200 p-8 text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
              <p className="text-gray-600">Loading ledger data...</p>
            </div>
          )}

          {/* Ledger Data Display */}
          {!loading && ledgerData && (
            <div className="space-y-6">
              {/* Balance Summary */}
              <div className="bg-white rounded-lg border border-gray-200 p-6">
                <h3 className="text-lg font-semibold mb-4">Balance Summary</h3>
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <p className="text-sm text-gray-600">Current Balance</p>
                    <p className="text-2xl font-bold text-gray-900">
                      ₹{ledgerData.balance?.balance || 0}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Total Transactions</p>
                    <p className="text-2xl font-bold text-gray-900">
                      {ledgerData.statement?.total_transactions || 0}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Outstanding Bills</p>
                    <p className="text-2xl font-bold text-gray-900">
                      {ledgerData.outstanding?.summary?.total_bills || 0}
                    </p>
                  </div>
                </div>
              </div>

              {/* Transactions */}
              <div className="bg-white rounded-lg border border-gray-200">
                <div className="p-4 border-b border-gray-200">
                  <h3 className="text-lg font-semibold">Transactions</h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Type</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Reference</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Description</th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Debit</th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Credit</th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Balance</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200">
                      {ledgerData.statement?.transactions?.length > 0 ? (
                        ledgerData.statement.transactions.map((txn, idx) => (
                          <tr key={idx} className="hover:bg-gray-50">
                            <td className="px-4 py-3 text-sm">{txn.date}</td>
                            <td className="px-4 py-3 text-sm">{txn.transaction_type}</td>
                            <td className="px-4 py-3 text-sm font-medium">{txn.reference}</td>
                            <td className="px-4 py-3 text-sm">{txn.description}</td>
                            <td className="px-4 py-3 text-sm text-right">
                              {txn.debit ? `₹${txn.debit}` : '-'}
                            </td>
                            <td className="px-4 py-3 text-sm text-right">
                              {txn.credit ? `₹${txn.credit}` : '-'}
                            </td>
                            <td className="px-4 py-3 text-sm text-right font-medium">
                              ₹{txn.balance}
                            </td>
                          </tr>
                        ))
                      ) : (
                        <tr>
                          <td colSpan="7" className="px-4 py-8 text-center text-gray-500">
                            No transactions found for the selected date range
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Debug Info */}
              <div className="bg-gray-100 rounded-lg p-4 text-xs font-mono">
                <p>Party ID: {selectedParty?.customer_id || selectedParty?.supplier_id || 'N/A'}</p>
                <p>Party Type: {partyType}</p>
                <p>Date Range: {dateRange.from} to {dateRange.to}</p>
                <p>API Response: {JSON.stringify(ledgerData.statement?.transactions?.length || 0)} transactions</p>
              </div>
            </div>
          )}

          {/* Empty State */}
          {!loading && !ledgerData && !error && (
            <div className="bg-white rounded-lg border border-gray-200 p-8 text-center">
              <Search className="w-16 h-16 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-600">Select a party to view their ledger</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default PartyLedgerV3;