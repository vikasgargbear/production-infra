import React, { useState, useEffect, useRef } from 'react';
import { 
  X, Users, Search, Calendar, Filter, Download,
  Printer, Mail, MessageSquare, TrendingUp, TrendingDown,
  FileText, IndianRupee, Clock, AlertCircle
} from 'lucide-react';
import { customersApi, suppliersApi } from '../../services/api';
import { searchCache, smartSearch } from '../../utils/searchCache';

const PartyLedger = ({ open = true, onClose }) => {
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

  const [partySearchQuery, setPartySearchQuery] = useState('');
  const [partySearchResults, setPartySearchResults] = useState([]);
  const [showPartySearch, setShowPartySearch] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selectedParty, setSelectedParty] = useState(null);

  const partySearchRef = useRef(null);
  const searchTimeoutRef = useRef(null);

  // Click outside handler
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (partySearchRef.current && !partySearchRef.current.contains(event.target)) {
        setShowPartySearch(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Search parties
  const searchParties = async (query) => {
    if (!query || query.length < 2) {
      setPartySearchResults([]);
      return;
    }

    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    searchTimeoutRef.current = setTimeout(async () => {
      try {
        // Mock data - replace with actual API calls
        const mockParties = [
          { 
            id: '1', 
            name: 'John Doe', 
            type: 'customer', 
            phone: '9876543210',
            balance: -5000, // negative means they owe us
            credit_limit: 10000
          },
          { 
            id: '2', 
            name: 'ABC Suppliers', 
            type: 'supplier', 
            phone: '9876543211',
            balance: 15000, // positive means we owe them
            credit_limit: 50000
          },
          { 
            id: '3', 
            name: 'Jane Smith', 
            type: 'customer', 
            phone: '9876543212',
            balance: 2500,
            credit_limit: 20000
          }
        ];

        const filtered = mockParties.filter(party => {
          const matchesQuery = party.name.toLowerCase().includes(query.toLowerCase()) ||
                              party.phone.includes(query);
          const matchesType = filters.party_type === 'all' || party.type === filters.party_type;
          return matchesQuery && matchesType;
        });

        setPartySearchResults(filtered);
      } catch (error) {
        console.error('Error searching parties:', error);
      }
    }, 300);
  };

  // Select party and load ledger
  const handlePartySelect = async (party) => {
    setSelectedParty(party);
    setFilters(prev => ({
      ...prev,
      party_id: party.id,
      party_name: party.name
    }));
    setShowPartySearch(false);
    setPartySearchQuery('');
    
    await loadLedger(party.id);
  };

  // Load ledger data
  const loadLedger = async (partyId) => {
    setLoading(true);
    try {
      // Mock ledger data - replace with actual API call
      const mockLedger = {
        party_details: selectedParty,
        opening_balance: 10000,
        transactions: [
          {
            id: 1,
            date: '2025-07-01',
            type: 'invoice',
            reference: 'INV-001',
            description: 'Sales Invoice',
            debit: 5000,
            credit: 0,
            balance: 15000
          },
          {
            id: 2,
            date: '2025-07-05',
            type: 'payment',
            reference: 'PAY-001',
            description: 'Payment Received',
            debit: 0,
            credit: 3000,
            balance: 12000
          },
          {
            id: 3,
            date: '2025-07-10',
            type: 'invoice',
            reference: 'INV-002',
            description: 'Sales Invoice',
            debit: 8000,
            credit: 0,
            balance: 20000
          },
          {
            id: 4,
            date: '2025-07-15',
            type: 'return',
            reference: 'SR-001',
            description: 'Sales Return',
            debit: 0,
            credit: 2000,
            balance: 18000
          },
          {
            id: 5,
            date: '2025-07-18',
            type: 'payment',
            reference: 'PAY-002',
            description: 'Payment Received',
            debit: 0,
            credit: 5000,
            balance: 13000
          }
        ],
        closing_balance: 13000,
        total_debit: 13000,
        total_credit: 10000,
        pending_dues: [
          {
            reference: 'INV-001',
            date: '2025-07-01',
            due_date: '2025-07-31',
            amount: 2000,
            days_overdue: 0,
            status: 'pending'
          },
          {
            reference: 'INV-002',
            date: '2025-07-10',
            due_date: '2025-08-09',
            amount: 6000,
            days_overdue: 0,
            status: 'pending'
          }
        ]
      };

      setLedgerData(mockLedger);
    } catch (error) {
      console.error('Error loading ledger:', error);
    } finally {
      setLoading(false);
    }
  };

  // Calculate aging buckets
  const getAgingBuckets = () => {
    const buckets = {
      current: { amount: 0, count: 0 },
      '1-30': { amount: 0, count: 0 },
      '31-60': { amount: 0, count: 0 },
      '61-90': { amount: 0, count: 0 },
      'over90': { amount: 0, count: 0 }
    };

    ledgerData.pending_dues.forEach(due => {
      const daysOverdue = Math.max(0, Math.floor((new Date() - new Date(due.due_date)) / (1000 * 60 * 60 * 24)));
      
      if (daysOverdue === 0) {
        buckets.current.amount += due.amount;
        buckets.current.count++;
      } else if (daysOverdue <= 30) {
        buckets['1-30'].amount += due.amount;
        buckets['1-30'].count++;
      } else if (daysOverdue <= 60) {
        buckets['31-60'].amount += due.amount;
        buckets['31-60'].count++;
      } else if (daysOverdue <= 90) {
        buckets['61-90'].amount += due.amount;
        buckets['61-90'].count++;
      } else {
        buckets.over90.amount += due.amount;
        buckets.over90.count++;
      }
    });

    return buckets;
  };

  // Send reminder
  const sendReminder = (method) => {
    if (!selectedParty) return;

    const message = `Dear ${selectedParty.name},\n\nThis is a gentle reminder about your pending dues of ₹${ledgerData.closing_balance.toLocaleString()}.\n\nPlease make the payment at your earliest convenience.\n\nThank you!`;

    if (method === 'whatsapp') {
      const whatsappUrl = `https://wa.me/91${selectedParty.phone}?text=${encodeURIComponent(message)}`;
      window.open(whatsappUrl, '_blank');
    } else {
      // Email implementation
      console.log('Sending email reminder:', message);
      alert('Email reminder functionality will be implemented soon!');
    }
  };

  // Export ledger
  const exportLedger = (format) => {
    if (format === 'pdf') {
      window.print();
    } else {
      // Excel export implementation
      console.log('Exporting to Excel...');
      alert('Excel export functionality will be implemented soon!');
    }
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 0
    }).format(Math.abs(amount));
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg w-full max-w-7xl h-[90vh] flex flex-col">
        
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center">
              <Users className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900">Party Ledger</h1>
              <p className="text-sm text-gray-500">View transactions and track dues</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Filters */}
        <div className="px-6 py-4 bg-gray-50 border-b border-gray-200">
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Party Type</label>
              <select
                value={filters.party_type}
                onChange={(e) => setFilters({ ...filters, party_type: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              >
                <option value="all">All Parties</option>
                <option value="customer">Customers Only</option>
                <option value="supplier">Suppliers Only</option>
              </select>
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Search Party</label>
              <div className="relative" ref={partySearchRef}>
                <Search className="absolute left-3 top-2.5 w-5 h-5 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search by name or phone..."
                  value={partySearchQuery}
                  onChange={(e) => {
                    setPartySearchQuery(e.target.value);
                    searchParties(e.target.value);
                    setShowPartySearch(true);
                  }}
                  onFocus={() => setShowPartySearch(true)}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                />
                
                {showPartySearch && partySearchResults.length > 0 && (
                  <div className="absolute z-10 w-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                    {partySearchResults.map(party => (
                      <div
                        key={party.id}
                        onClick={() => handlePartySelect(party)}
                        className="px-4 py-3 hover:bg-gray-50 cursor-pointer border-b border-gray-100 last:border-0"
                      >
                        <div className="flex justify-between items-start">
                          <div>
                            <p className="font-medium text-gray-900">{party.name}</p>
                            <p className="text-sm text-gray-600">
                              {party.type === 'customer' ? 'Customer' : 'Supplier'} • {party.phone}
                            </p>
                          </div>
                          <p className={`font-semibold ${party.balance < 0 ? 'text-red-600' : 'text-green-600'}`}>
                            {formatCurrency(party.balance)}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">From Date</label>
              <input
                type="date"
                value={filters.from_date}
                onChange={(e) => setFilters({ ...filters, from_date: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">To Date</label>
              <input
                type="date"
                value={filters.to_date}
                onChange={(e) => setFilters({ ...filters, to_date: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
            </div>
          ) : selectedParty ? (
            <>
              {/* Party Summary */}
              <div className="bg-blue-50 rounded-lg p-6 mb-6">
                <div className="flex justify-between items-start">
                  <div>
                    <h2 className="text-xl font-bold text-gray-900">{selectedParty.name}</h2>
                    <p className="text-gray-600 mt-1">
                      {selectedParty.type === 'customer' ? 'Customer' : 'Supplier'} • {selectedParty.phone}
                    </p>
                    <p className="text-sm text-gray-600 mt-2">
                      Credit Limit: {formatCurrency(selectedParty.credit_limit)}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-gray-600">Current Balance</p>
                    <p className={`text-2xl font-bold ${ledgerData.closing_balance < 0 ? 'text-red-600' : 'text-green-600'}`}>
                      {formatCurrency(ledgerData.closing_balance)}
                    </p>
                    <p className="text-sm text-gray-600 mt-1">
                      {ledgerData.closing_balance < 0 ? 'Receivable' : 'Payable'}
                    </p>
                    
                    {/* Action Buttons */}
                    <div className="flex gap-2 mt-4 justify-end">
                      <button
                        onClick={() => sendReminder('whatsapp')}
                        className="px-3 py-1.5 bg-green-600 text-white rounded-lg hover:bg-green-700 text-sm flex items-center gap-1"
                      >
                        <MessageSquare className="w-4 h-4" />
                        WhatsApp
                      </button>
                      <button
                        onClick={() => sendReminder('email')}
                        className="px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm flex items-center gap-1"
                      >
                        <Mail className="w-4 h-4" />
                        Email
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Aging Analysis */}
              {ledgerData.pending_dues.length > 0 && (
                <div className="mb-6">
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Aging Analysis</h3>
                  <div className="grid grid-cols-5 gap-4">
                    {Object.entries(getAgingBuckets()).map(([bucket, data]) => (
                      <div key={bucket} className="bg-gray-50 rounded-lg p-4">
                        <p className="text-sm text-gray-600 mb-1">{bucket} days</p>
                        <p className="text-lg font-bold text-gray-900">{formatCurrency(data.amount)}</p>
                        <p className="text-xs text-gray-500">{data.count} invoice(s)</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Transactions Table */}
              <div className="mb-6">
                <div className="flex justify-between items-center mb-4">
                  <h3 className="text-lg font-semibold text-gray-900">Transaction History</h3>
                  <div className="flex gap-2">
                    <button
                      onClick={() => exportLedger('pdf')}
                      className="px-3 py-1.5 text-gray-700 hover:bg-gray-100 rounded-lg text-sm flex items-center gap-1"
                    >
                      <Printer className="w-4 h-4" />
                      PDF
                    </button>
                    <button
                      onClick={() => exportLedger('excel')}
                      className="px-3 py-1.5 text-gray-700 hover:bg-gray-100 rounded-lg text-sm flex items-center gap-1"
                    >
                      <Download className="w-4 h-4" />
                      Excel
                    </button>
                  </div>
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
                      <tr className="bg-gray-50">
                        <td colSpan="6" className="px-4 py-3 font-semibold">Opening Balance</td>
                        <td className="px-4 py-3 text-right font-semibold">
                          {formatCurrency(ledgerData.opening_balance)}
                        </td>
                      </tr>
                      {ledgerData.transactions.map(transaction => (
                        <tr key={transaction.id} className="hover:bg-gray-50">
                          <td className="px-4 py-3 text-sm">
                            {new Date(transaction.date).toLocaleDateString()}
                          </td>
                          <td className="px-4 py-3">
                            <span className={`text-xs px-2 py-1 rounded-full ${
                              transaction.type === 'invoice' ? 'bg-blue-100 text-blue-800' :
                              transaction.type === 'payment' ? 'bg-green-100 text-green-800' :
                              'bg-yellow-100 text-yellow-800'
                            }`}>
                              {transaction.type}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-sm font-medium">
                            {transaction.reference}
                          </td>
                          <td className="px-4 py-3 text-sm">
                            {transaction.description}
                          </td>
                          <td className="px-4 py-3 text-right text-sm">
                            {transaction.debit > 0 ? formatCurrency(transaction.debit) : '-'}
                          </td>
                          <td className="px-4 py-3 text-right text-sm">
                            {transaction.credit > 0 ? formatCurrency(transaction.credit) : '-'}
                          </td>
                          <td className="px-4 py-3 text-right font-medium">
                            {formatCurrency(transaction.balance)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-gray-100">
                      <tr>
                        <td colSpan="4" className="px-4 py-3 font-semibold">Totals</td>
                        <td className="px-4 py-3 text-right font-semibold">
                          {formatCurrency(ledgerData.total_debit)}
                        </td>
                        <td className="px-4 py-3 text-right font-semibold">
                          {formatCurrency(ledgerData.total_credit)}
                        </td>
                        <td className="px-4 py-3 text-right font-bold text-lg">
                          {formatCurrency(ledgerData.closing_balance)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>

              {/* Pending Dues */}
              {ledgerData.pending_dues.length > 0 && (
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 mb-4">Pending Dues</h3>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Invoice</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Due Date</th>
                          <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Amount</th>
                          <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-200">
                        {ledgerData.pending_dues.map((due, index) => {
                          const isOverdue = new Date(due.due_date) < new Date();
                          return (
                            <tr key={index} className={isOverdue ? 'bg-red-50' : ''}>
                              <td className="px-4 py-3 font-medium">{due.reference}</td>
                              <td className="px-4 py-3 text-sm">
                                {new Date(due.date).toLocaleDateString()}
                              </td>
                              <td className="px-4 py-3 text-sm">
                                {new Date(due.due_date).toLocaleDateString()}
                              </td>
                              <td className="px-4 py-3 text-right font-medium">
                                {formatCurrency(due.amount)}
                              </td>
                              <td className="px-4 py-3 text-center">
                                {isOverdue ? (
                                  <span className="text-xs px-2 py-1 bg-red-100 text-red-800 rounded-full">
                                    Overdue
                                  </span>
                                ) : (
                                  <span className="text-xs px-2 py-1 bg-yellow-100 text-yellow-800 rounded-full">
                                    Pending
                                  </span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="flex flex-col items-center justify-center h-full">
              <Users className="w-16 h-16 text-gray-400 mb-4" />
              <p className="text-xl text-gray-600">Select a party to view ledger</p>
              <p className="text-sm text-gray-500 mt-2">Search and select a customer or supplier above</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default PartyLedger;