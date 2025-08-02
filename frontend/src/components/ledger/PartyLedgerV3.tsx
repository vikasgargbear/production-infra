/**
 * PartyLedgerV3 Component
 * Advanced party ledger with analytics, aging analysis, and reconciliation features
 */

import React, { useState, useEffect, useMemo } from 'react';
import { useQuery, useMutation } from 'react-query';
import {
  Calendar,
  Download,
  Filter,
  Search,
  TrendingUp,
  TrendingDown,
  DollarSign,
  FileText,
  CreditCard,
  AlertCircle,
  PieChart,
  BarChart3,
  CheckCircle,
  XCircle,
  Mail,
  MessageSquare,
  Eye,
  Edit,
  Trash2
} from 'lucide-react';
import { format, parseISO, subMonths, differenceInDays } from 'date-fns';
import { partyLedgerAPI } from '../../services/api';
import { CustomerSearch, SupplierSearch, DatePicker, Select, DataTable, StatusBadge } from '../global';
import { formatCurrency } from '../../utils/formatters';
import AgingAnalysis from './AgingAnalysis';

interface PartyLedgerV3Props {
  partyType?: 'customer' | 'supplier';
  partyId?: string;
  embedded?: boolean;
  onTransactionClick?: (transaction: LedgerEntry) => void;
}

interface LedgerEntry {
  id: string;
  date: string;
  transaction_type: 'invoice' | 'payment' | 'credit_note' | 'debit_note' | 'opening_balance' | 'adjustment';
  reference_number: string;
  description: string;
  debit: number;
  credit: number;
  balance: number;
  due_date?: string;
  is_reconciled: boolean;
  reconciliation_date?: string;
  tags?: string[];
  attachments?: { id: string; name: string; url: string }[];
  notes?: string;
  created_by: string;
  created_at: string;
  updated_at: string;
}

interface PartyInfo {
  party_id: string;
  party_name: string;
  party_type: 'customer' | 'supplier';
  credit_limit?: number;
  credit_days?: number;
  status: 'active' | 'inactive' | 'blocked';
  contact_info: {
    phone: string;
    email: string;
    address: string;
  };
  tax_info?: {
    gst_number?: string;
    pan_number?: string;
  };
}

interface LedgerSummary {
  opening_balance: number;
  total_debit: number;
  total_credit: number;
  closing_balance: number;
  outstanding_amount: number;
  overdue_amount: number;
  unreconciled_count: number;
  aging_buckets: {
    current: number;
    '1-30': number;
    '31-60': number;
    '61-90': number;
    'over_90': number;
  };
}

const PartyLedgerV3: React.FC<PartyLedgerV3Props> = ({
  partyType = 'customer',
  partyId: initialPartyId,
  embedded = false,
  onTransactionClick
}) => {
  const [selectedParty, setSelectedParty] = useState<any>(null);
  const [dateRange, setDateRange] = useState({
    from: subMonths(new Date(), 3),
    to: new Date()
  });
  const [filters, setFilters] = useState({
    transactionType: 'all',
    reconciliationStatus: 'all',
    searchQuery: ''
  });
  const [selectedTransactions, setSelectedTransactions] = useState<string[]>([]);
  const [showAgingAnalysis, setShowAgingAnalysis] = useState(false);
  const [viewMode, setViewMode] = useState<'table' | 'summary' | 'analytics'>('table');

  // Fetch party info
  const { data: partyInfo, isLoading: loadingParty } = useQuery(
    ['party-info', selectedParty?.id || initialPartyId],
    () => partyLedgerAPI.getPartyInfo(selectedParty?.id || initialPartyId),
    {
      enabled: !!(selectedParty?.id || initialPartyId)
    }
  );

  // Fetch ledger entries with summary
  const { data: ledgerData, isLoading: loadingLedger, refetch } = useQuery(
    ['party-ledger-v3', selectedParty?.id || initialPartyId, dateRange, filters],
    () => partyLedgerAPI.getEnhancedLedger({
      party_id: selectedParty?.id || initialPartyId,
      party_type: partyType,
      date_from: format(dateRange.from, 'yyyy-MM-dd'),
      date_to: format(dateRange.to, 'yyyy-MM-dd'),
      transaction_type: filters.transactionType !== 'all' ? filters.transactionType : undefined,
      reconciliation_status: filters.reconciliationStatus !== 'all' ? filters.reconciliationStatus : undefined,
      include_summary: true,
      include_aging: true
    }),
    {
      enabled: !!(selectedParty?.id || initialPartyId)
    }
  );

  // Reconciliation mutation
  const reconcileMutation = useMutation(
    (transactionIds: string[]) => partyLedgerAPI.reconcileTransactions(transactionIds),
    {
      onSuccess: () => {
        refetch();
        setSelectedTransactions([]);
      }
    }
  );

  // Filter entries
  const filteredEntries = useMemo(() => {
    if (!ledgerData?.entries) return [];
    
    let filtered = ledgerData.entries;
    
    if (filters.searchQuery) {
      const query = filters.searchQuery.toLowerCase();
      filtered = filtered.filter((entry: LedgerEntry) =>
        entry.reference_number.toLowerCase().includes(query) ||
        entry.description.toLowerCase().includes(query) ||
        entry.notes?.toLowerCase().includes(query)
      );
    }
    
    return filtered;
  }, [ledgerData, filters.searchQuery]);

  // Calculate analytics
  const analytics = useMemo(() => {
    if (!ledgerData?.entries || !ledgerData?.summary) return null;
    
    const monthlyTrend = calculateMonthlyTrend(ledgerData.entries);
    const transactionBreakdown = calculateTransactionBreakdown(ledgerData.entries);
    
    return {
      monthlyTrend,
      transactionBreakdown,
      averagePaymentDays: calculateAveragePaymentDays(ledgerData.entries),
      creditUtilization: partyInfo?.credit_limit 
        ? (ledgerData.summary.outstanding_amount / partyInfo.credit_limit) * 100 
        : 0
    };
  }, [ledgerData, partyInfo]);

  const handleBulkAction = (action: 'reconcile' | 'export' | 'email') => {
    switch (action) {
      case 'reconcile':
        if (selectedTransactions.length > 0) {
          reconcileMutation.mutate(selectedTransactions);
        }
        break;
      case 'export':
        handleExport('pdf', selectedTransactions);
        break;
      case 'email':
        handleEmailStatement(selectedTransactions);
        break;
    }
  };

  const handleExport = async (format: 'pdf' | 'excel', transactionIds?: string[]) => {
    try {
      const response = await partyLedgerAPI.exportEnhancedLedger({
        party_id: selectedParty?.id || initialPartyId,
        date_from: format(dateRange.from, 'yyyy-MM-dd'),
        date_to: format(dateRange.to, 'yyyy-MM-dd'),
        transaction_ids: transactionIds,
        format,
        include_summary: true,
        include_aging: showAgingAnalysis
      });
      
      downloadFile(response.data, `ledger-${format}-${Date.now()}.${format}`);
    } catch (error) {
      console.error('Export failed:', error);
    }
  };

  const handleEmailStatement = async (transactionIds?: string[]) => {
    try {
      await partyLedgerAPI.emailStatement({
        party_id: selectedParty?.id || initialPartyId,
        date_from: format(dateRange.from, 'yyyy-MM-dd'),
        date_to: format(dateRange.to, 'yyyy-MM-dd'),
        transaction_ids: transactionIds,
        email: partyInfo?.contact_info.email
      });
      
      // Show success message
    } catch (error) {
      console.error('Email failed:', error);
    }
  };

  const columns = [
    {
      key: 'select',
      label: (
        <input
          type="checkbox"
          checked={selectedTransactions.length === filteredEntries.length}
          onChange={(e) => {
            if (e.target.checked) {
              setSelectedTransactions(filteredEntries.map((entry: LedgerEntry) => entry.id));
            } else {
              setSelectedTransactions([]);
            }
          }}
        />
      ),
      render: (entry: LedgerEntry) => (
        <input
          type="checkbox"
          checked={selectedTransactions.includes(entry.id)}
          onChange={(e) => {
            if (e.target.checked) {
              setSelectedTransactions([...selectedTransactions, entry.id]);
            } else {
              setSelectedTransactions(selectedTransactions.filter(id => id !== entry.id));
            }
          }}
        />
      ),
      width: '50px'
    },
    {
      key: 'date',
      label: 'Date',
      render: (entry: LedgerEntry) => (
        <div>
          <div className="font-medium">{format(parseISO(entry.date), 'dd/MM/yyyy')}</div>
          {entry.due_date && (
            <div className="text-xs text-gray-500">
              Due: {format(parseISO(entry.due_date), 'dd/MM/yyyy')}
            </div>
          )}
        </div>
      )
    },
    {
      key: 'type',
      label: 'Type',
      render: (entry: LedgerEntry) => {
        const typeConfig = {
          invoice: { color: 'blue', icon: FileText },
          payment: { color: 'green', icon: CreditCard },
          credit_note: { color: 'yellow', icon: TrendingDown },
          debit_note: { color: 'red', icon: TrendingUp },
          opening_balance: { color: 'gray', icon: DollarSign },
          adjustment: { color: 'purple', icon: Edit }
        };
        
        const config = typeConfig[entry.transaction_type];
        const Icon = config.icon;
        
        return (
          <div className="flex items-center gap-2">
            <Icon className={`h-4 w-4 text-${config.color}-600`} />
            <StatusBadge
              status={entry.transaction_type}
              color={config.color}
              label={entry.transaction_type.replace('_', ' ').toUpperCase()}
            />
          </div>
        );
      }
    },
    {
      key: 'reference',
      label: 'Reference',
      render: (entry: LedgerEntry) => (
        <button
          onClick={() => onTransactionClick?.(entry)}
          className="text-blue-600 hover:text-blue-800 font-mono text-sm underline"
        >
          {entry.reference_number}
        </button>
      )
    },
    {
      key: 'description',
      label: 'Description',
      render: (entry: LedgerEntry) => (
        <div>
          <div>{entry.description}</div>
          {entry.notes && (
            <div className="text-xs text-gray-500 mt-1">{entry.notes}</div>
          )}
          {entry.tags && entry.tags.length > 0 && (
            <div className="flex gap-1 mt-1">
              {entry.tags.map(tag => (
                <span key={tag} className="text-xs px-2 py-0.5 bg-gray-100 rounded">
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>
      )
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
        <div className={`font-semibold ${entry.balance < 0 ? 'text-red-600' : 'text-green-600'}`}>
          {formatCurrency(Math.abs(entry.balance))}
          <span className="text-xs ml-1">
            {entry.balance < 0 ? 'Dr' : 'Cr'}
          </span>
        </div>
      )
    },
    {
      key: 'status',
      label: 'Status',
      render: (entry: LedgerEntry) => (
        <div className="flex items-center gap-1">
          {entry.is_reconciled ? (
            <CheckCircle className="h-4 w-4 text-green-600" />
          ) : (
            <XCircle className="h-4 w-4 text-gray-400" />
          )}
          {entry.due_date && differenceInDays(new Date(), parseISO(entry.due_date)) > 0 && !entry.is_reconciled && (
            <AlertCircle className="h-4 w-4 text-red-600" />
          )}
        </div>
      )
    }
  ];

  return (
    <div className={embedded ? '' : 'p-6'}>
      {/* Header */}
      {!embedded && (
        <div className="mb-6 flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-gray-800">Advanced Party Ledger</h1>
            <p className="text-gray-600">Complete transaction history with analytics and reconciliation</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setViewMode('table')}
              className={`px-4 py-2 rounded-md ${
                viewMode === 'table' 
                  ? 'bg-blue-600 text-white' 
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Table View
            </button>
            <button
              onClick={() => setViewMode('summary')}
              className={`px-4 py-2 rounded-md ${
                viewMode === 'summary' 
                  ? 'bg-blue-600 text-white' 
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Summary
            </button>
            <button
              onClick={() => setViewMode('analytics')}
              className={`px-4 py-2 rounded-md ${
                viewMode === 'analytics' 
                  ? 'bg-blue-600 text-white' 
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Analytics
            </button>
          </div>
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
              onSelect={setSelectedParty}
              placeholder="Search customer by name, phone or ID"
            />
          ) : (
            <SupplierSearch
              onSelect={setSelectedParty}
              placeholder="Search supplier by name or ID"
            />
          )}
        </div>
      )}

      {/* Content based on view mode */}
      {(selectedParty || initialPartyId) && viewMode === 'table' && (
        <>
          {/* Filters */}
          <div className="mb-6 bg-white p-4 rounded-lg shadow">
            {/* Filter controls */}
          </div>

          {/* Ledger Table */}
          <div className="bg-white rounded-lg shadow">
            {selectedTransactions.length > 0 && (
              <div className="p-4 border-b bg-gray-50 flex justify-between items-center">
                <span className="text-sm text-gray-600">
                  {selectedTransactions.length} transactions selected
                </span>
                <div className="flex gap-2">
                  <button
                    onClick={() => handleBulkAction('reconcile')}
                    className="px-3 py-1 bg-green-600 text-white rounded-md hover:bg-green-700 text-sm"
                  >
                    Reconcile Selected
                  </button>
                  <button
                    onClick={() => handleBulkAction('export')}
                    className="px-3 py-1 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm"
                  >
                    Export Selected
                  </button>
                </div>
              </div>
            )}
            
            <DataTable
              columns={columns}
              data={filteredEntries}
              loading={loadingLedger}
              emptyMessage="No transactions found"
            />
          </div>
        </>
      )}

      {/* Summary View */}
      {(selectedParty || initialPartyId) && viewMode === 'summary' && ledgerData?.summary && (
        <div className="space-y-6">
          {/* Summary cards */}
          <div className="grid grid-cols-4 gap-4">
            {/* Add summary cards here */}
          </div>
          
          {/* Aging Analysis */}
          <AgingAnalysis
            partyId={selectedParty?.id || initialPartyId}
            partyType={partyType}
          />
        </div>
      )}

      {/* Analytics View */}
      {(selectedParty || initialPartyId) && viewMode === 'analytics' && analytics && (
        <div className="space-y-6">
          {/* Add analytics charts here */}
        </div>
      )}
    </div>
  );
};

// Helper functions
function calculateMonthlyTrend(entries: LedgerEntry[]) {
  // Implementation for monthly trend calculation
  return [];
}

function calculateTransactionBreakdown(entries: LedgerEntry[]) {
  // Implementation for transaction breakdown
  return {};
}

function calculateAveragePaymentDays(entries: LedgerEntry[]) {
  // Implementation for average payment days
  return 0;
}

function downloadFile(data: Blob, filename: string) {
  const url = window.URL.createObjectURL(data);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  window.URL.revokeObjectURL(url);
}

export default PartyLedgerV3;