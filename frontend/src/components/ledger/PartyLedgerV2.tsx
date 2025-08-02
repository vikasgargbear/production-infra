/**
 * PartyLedgerV2 Component
 * Enhanced party ledger with transaction history, balance tracking, and filtering
 */

import React, { useState, useEffect, useMemo } from 'react';
import { useQuery } from 'react-query';
import {
  Calendar,
  Download,
  Filter,
  Search,
  ChevronRight,
  TrendingUp,
  TrendingDown,
  DollarSign,
  FileText,
  CreditCard,
  AlertCircle,
  Printer,
  RefreshCw
} from 'lucide-react';
import { format, parseISO, startOfMonth, endOfMonth } from 'date-fns';
import { partyLedgerAPI } from '../../services/api';
import { CustomerSearch, SupplierSearch, DatePicker, Select, DataTable } from '../global';
import { formatCurrency } from '../../utils/formatters';

interface PartyLedgerV2Props {
  partyType?: 'customer' | 'supplier';
  partyId?: string;
  embedded?: boolean;
}

interface LedgerEntry {
  id: string;
  date: string;
  transaction_type: 'invoice' | 'payment' | 'credit_note' | 'debit_note' | 'opening_balance';
  reference_number: string;
  description: string;
  debit: number;
  credit: number;
  balance: number;
  created_at: string;
}

interface PartyDetails {
  party_id: string;
  party_name: string;
  party_type: 'customer' | 'supplier';
  opening_balance: number;
  total_debit: number;
  total_credit: number;
  closing_balance: number;
  contact_info: {
    phone: string;
    email: string;
    address: string;
  };
}

const PartyLedgerV2: React.FC<PartyLedgerV2Props> = ({
  partyType = 'customer',
  partyId: initialPartyId,
  embedded = false
}) => {
  const [selectedParty, setSelectedParty] = useState<any>(null);
  const [dateRange, setDateRange] = useState({
    from: startOfMonth(new Date()),
    to: endOfMonth(new Date())
  });
  const [transactionFilter, setTransactionFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Fetch party details
  const { data: partyDetails, isLoading: loadingDetails } = useQuery(
    ['party-details', selectedParty?.id || initialPartyId],
    () => partyLedgerAPI.getPartyDetails(selectedParty?.id || initialPartyId),
    {
      enabled: !!(selectedParty?.id || initialPartyId)
    }
  );

  // Fetch ledger entries
  const { data: ledgerData, isLoading: loadingLedger, refetch } = useQuery(
    ['party-ledger', selectedParty?.id || initialPartyId, dateRange, transactionFilter],
    () => partyLedgerAPI.getPartyLedger({
      party_id: selectedParty?.id || initialPartyId,
      party_type: partyType,
      date_from: format(dateRange.from, 'yyyy-MM-dd'),
      date_to: format(dateRange.to, 'yyyy-MM-dd'),
      transaction_type: transactionFilter !== 'all' ? transactionFilter : undefined
    }),
    {
      enabled: !!(selectedParty?.id || initialPartyId)
    }
  );

  // Filter entries based on search
  const filteredEntries = useMemo(() => {
    if (!ledgerData?.entries) return [];
    
    if (!searchQuery) return ledgerData.entries;
    
    const query = searchQuery.toLowerCase();
    return ledgerData.entries.filter((entry: LedgerEntry) =>
      entry.reference_number.toLowerCase().includes(query) ||
      entry.description.toLowerCase().includes(query)
    );
  }, [ledgerData, searchQuery]);

  // Calculate summary statistics
  const summary = useMemo(() => {
    if (!partyDetails) return null;
    
    return {
      openingBalance: partyDetails.opening_balance,
      totalDebit: partyDetails.total_debit,
      totalCredit: partyDetails.total_credit,
      closingBalance: partyDetails.closing_balance,
      isPayable: partyDetails.closing_balance < 0,
      isReceivable: partyDetails.closing_balance > 0
    };
  }, [partyDetails]);

  const handlePartySelect = (party: any) => {
    setSelectedParty(party);
  };

  const handleExport = async (format: 'pdf' | 'excel') => {
    try {
      const response = await partyLedgerAPI.exportLedger({
        party_id: selectedParty?.id || initialPartyId,
        party_type: partyType,
        date_from: format(dateRange.from, 'yyyy-MM-dd'),
        date_to: format(dateRange.to, 'yyyy-MM-dd'),
        format
      });
      
      // Handle file download
      const blob = new Blob([response.data], {
        type: format === 'pdf' ? 'application/pdf' : 'application/vnd.ms-excel'
      });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `ledger-${selectedParty?.name || 'party'}-${format(new Date(), 'yyyy-MM-dd')}.${format}`;
      link.click();
    } catch (error) {
      console.error('Export failed:', error);
    }
  };

  const columns = [
    {
      key: 'date',
      label: 'Date',
      render: (entry: LedgerEntry) => format(parseISO(entry.date), 'dd/MM/yyyy')
    },
    {
      key: 'transaction_type',
      label: 'Type',
      render: (entry: LedgerEntry) => (
        <span className={`px-2 py-1 rounded text-xs font-medium ${
          entry.transaction_type === 'invoice' ? 'bg-blue-100 text-blue-800' :
          entry.transaction_type === 'payment' ? 'bg-green-100 text-green-800' :
          entry.transaction_type === 'credit_note' ? 'bg-yellow-100 text-yellow-800' :
          entry.transaction_type === 'debit_note' ? 'bg-red-100 text-red-800' :
          'bg-gray-100 text-gray-800'
        }`}>
          {entry.transaction_type.replace('_', ' ').toUpperCase()}
        </span>
      )
    },
    {
      key: 'reference_number',
      label: 'Reference',
      render: (entry: LedgerEntry) => (
        <span className="font-mono text-sm">{entry.reference_number}</span>
      )
    },
    {
      key: 'description',
      label: 'Description'
    },
    {
      key: 'debit',
      label: 'Debit',
      align: 'right' as const,
      render: (entry: LedgerEntry) => entry.debit ? formatCurrency(entry.debit) : '-'
    },
    {
      key: 'credit',
      label: 'Credit',
      align: 'right' as const,
      render: (entry: LedgerEntry) => entry.credit ? formatCurrency(entry.credit) : '-'
    },
    {
      key: 'balance',
      label: 'Balance',
      align: 'right' as const,
      render: (entry: LedgerEntry) => (
        <span className={entry.balance < 0 ? 'text-red-600 font-semibold' : 'font-semibold'}>
          {formatCurrency(Math.abs(entry.balance))}
          {entry.balance < 0 ? ' (Dr)' : ' (Cr)'}
        </span>
      )
    }
  ];

  return (
    <div className={embedded ? '' : 'p-6'}>
      {/* Header */}
      {!embedded && (
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-800">Party Ledger</h1>
          <p className="text-gray-600">View transaction history and account balance</p>
        </div>
      )}

      {/* Party Selection */}
      {!initialPartyId && (
        <div className="mb-6 bg-white p-4 rounded-lg shadow">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Select {partyType === 'customer' ? 'Customer' : 'Supplier'}
          </label>
          {partyType === 'customer' ? (
            <CustomerSearch
              onSelect={handlePartySelect}
              placeholder="Search customer by name, phone or ID"
            />
          ) : (
            <SupplierSearch
              onSelect={handlePartySelect}
              placeholder="Search supplier by name or ID"
            />
          )}
        </div>
      )}

      {/* Party Details & Summary */}
      {partyDetails && (
        <div className="mb-6 bg-white rounded-lg shadow">
          <div className="p-6 border-b">
            <div className="flex justify-between items-start">
              <div>
                <h2 className="text-xl font-semibold text-gray-800">
                  {partyDetails.party_name}
                </h2>
                <div className="mt-2 space-y-1 text-sm text-gray-600">
                  <p>Phone: {partyDetails.contact_info.phone}</p>
                  <p>Email: {partyDetails.contact_info.email}</p>
                  <p>Address: {partyDetails.contact_info.address}</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-sm text-gray-500">Account Balance</p>
                <p className={`text-2xl font-bold ${
                  summary?.closingBalance && summary.closingBalance < 0 
                    ? 'text-red-600' 
                    : 'text-green-600'
                }`}>
                  {formatCurrency(Math.abs(summary?.closingBalance || 0))}
                </p>
                <p className="text-sm text-gray-500">
                  {summary?.isPayable ? 'Payable' : 'Receivable'}
                </p>
              </div>
            </div>
          </div>

          {/* Summary Cards */}
          <div className="grid grid-cols-4 gap-4 p-6">
            <div className="text-center">
              <p className="text-sm text-gray-500">Opening Balance</p>
              <p className="text-lg font-semibold">
                {formatCurrency(summary?.openingBalance || 0)}
              </p>
            </div>
            <div className="text-center">
              <p className="text-sm text-gray-500">Total Debit</p>
              <p className="text-lg font-semibold text-red-600">
                {formatCurrency(summary?.totalDebit || 0)}
              </p>
            </div>
            <div className="text-center">
              <p className="text-sm text-gray-500">Total Credit</p>
              <p className="text-lg font-semibold text-green-600">
                {formatCurrency(summary?.totalCredit || 0)}
              </p>
            </div>
            <div className="text-center">
              <p className="text-sm text-gray-500">Closing Balance</p>
              <p className={`text-lg font-semibold ${
                summary?.closingBalance && summary.closingBalance < 0 
                  ? 'text-red-600' 
                  : 'text-green-600'
              }`}>
                {formatCurrency(Math.abs(summary?.closingBalance || 0))}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Filters and Actions */}
      {(selectedParty || initialPartyId) && (
        <div className="mb-6 bg-white p-4 rounded-lg shadow">
          <div className="flex flex-wrap gap-4 items-end">
            <div className="flex-1 min-w-[200px]">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Date Range
              </label>
              <div className="flex gap-2">
                <DatePicker
                  value={dateRange.from}
                  onChange={(date) => setDateRange(prev => ({ ...prev, from: date }))}
                  placeholder="From date"
                />
                <DatePicker
                  value={dateRange.to}
                  onChange={(date) => setDateRange(prev => ({ ...prev, to: date }))}
                  placeholder="To date"
                />
              </div>
            </div>

            <div className="min-w-[200px]">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Transaction Type
              </label>
              <Select
                value={transactionFilter}
                onChange={setTransactionFilter}
                options={[
                  { value: 'all', label: 'All Transactions' },
                  { value: 'invoice', label: 'Invoices' },
                  { value: 'payment', label: 'Payments' },
                  { value: 'credit_note', label: 'Credit Notes' },
                  { value: 'debit_note', label: 'Debit Notes' }
                ]}
              />
            </div>

            <div className="flex-1 min-w-[250px]">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Search
              </label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-5 w-5" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search by reference or description"
                  className="pl-10 pr-4 py-2 w-full border rounded-md focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => refetch()}
                className="px-4 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 flex items-center gap-2"
              >
                <RefreshCw className="h-4 w-4" />
                Refresh
              </button>
              <button
                onClick={() => handleExport('pdf')}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 flex items-center gap-2"
              >
                <Download className="h-4 w-4" />
                PDF
              </button>
              <button
                onClick={() => handleExport('excel')}
                className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 flex items-center gap-2"
              >
                <Download className="h-4 w-4" />
                Excel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Ledger Table */}
      {(selectedParty || initialPartyId) && (
        <div className="bg-white rounded-lg shadow">
          <DataTable
            columns={columns}
            data={filteredEntries}
            loading={loadingLedger}
            emptyMessage="No transactions found for the selected period"
          />
        </div>
      )}
    </div>
  );
};

export default PartyLedgerV2;