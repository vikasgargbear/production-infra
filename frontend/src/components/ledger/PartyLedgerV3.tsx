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
  Trash2,
  Loader2,
  RefreshCw
} from 'lucide-react';
import { format, parseISO, subMonths, differenceInDays } from 'date-fns';
import { partyLedgerAPI } from '../../services/api';
import { CustomerSearch, SupplierSearch, DatePicker, Select, DataTable, StatusBadge, ModuleHeader } from '../global';
import { formatCurrency } from '../../utils/formatters';
import AgingAnalysis from './AgingAnalysis';

interface PartyLedgerV3Props {
  partyType?: 'customer' | 'supplier';
  partyId?: string;
  embedded?: boolean;
  onTransactionClick?: (transaction: LedgerEntry) => void;
  onClose?: () => void;
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
  onTransactionClick,
  onClose
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
  const { data: partyInfo, isLoading: loadingParty, error: partyError } = useQuery(
    ['party-info', selectedParty?.id || initialPartyId],
    () => partyLedgerAPI.getPartyInfo(selectedParty?.id || initialPartyId),
    {
      enabled: !!(selectedParty?.id || initialPartyId)
    }
  );

  // Fetch ledger entries with summary
  const { data: ledgerData, isLoading: loadingLedger, refetch, error: ledgerError } = useQuery(
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

  const [refreshing, setRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleRefresh = async () => {
    setRefreshing(true);
    setErrorMessage(null);
    try {
      await refetch();
    } catch (error) {
      console.error('Refresh failed:', error);
      setErrorMessage('Failed to refresh data');
    } finally {
      setRefreshing(false);
    }
  };

  // Set error message when queries fail
  React.useEffect(() => {
    if (partyError || ledgerError) {
      setErrorMessage('Failed to load party ledger data');
    }
  }, [partyError, ledgerError]);

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

  const handleExport = async (exportFormat: 'pdf' | 'excel', transactionIds?: string[]) => {
    try {
      const response = await partyLedgerAPI.exportEnhancedLedger({
        party_id: selectedParty?.id || initialPartyId,
        date_from: format(dateRange.from, 'yyyy-MM-dd'),
        date_to: format(dateRange.to, 'yyyy-MM-dd'),
        transaction_ids: transactionIds,
        format: exportFormat,
        include_summary: true,
        include_aging: showAgingAnalysis
      });
      
      downloadFile(response.data, `ledger-${exportFormat}-${Date.now()}.${exportFormat}`);
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
      header: '',
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
      header: 'Date',
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
      header: 'Type',
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
              status={entry.transaction_type === 'payment' ? 'success' : entry.transaction_type === 'invoice' ? 'info' : entry.transaction_type === 'credit_note' ? 'warning' : 'error'}
              label={entry.transaction_type.replace('_', ' ').toUpperCase()}
            />
          </div>
        );
      }
    },
    {
      key: 'reference',
      header: 'Reference',
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
      header: 'Description',
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
      header: 'Debit',
      align: 'right' as const,
      render: (entry: LedgerEntry) => entry.debit ? formatCurrency(entry.debit) : '-'
    },
    {
      key: 'credit',
      header: 'Credit',
      align: 'right' as const,
      render: (entry: LedgerEntry) => entry.credit ? formatCurrency(entry.credit) : '-'
    },
    {
      key: 'balance',
      header: 'Balance',
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
      header: 'Status',
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
    <div className={embedded ? 'p-6' : 'h-full bg-blue-50'}>
      {!embedded && (
        <div className="h-full flex flex-col">
          <ModuleHeader
            title="Party Ledger"
            documentNumber=""
            status=""
            icon={FileText}
            iconColor="text-blue-600"
            onClose={onClose}
            historyType="ledger"
            onSaveDraft={() => {}}
            additionalActions={[
              {
                label: "Refresh",
                onClick: handleRefresh,
                variant: "default",
                icon: refreshing ? Loader2 : RefreshCw,
                disabled: refreshing
              },
              {
                label: 'Table',
                onClick: () => setViewMode('table'),
                variant: viewMode === 'table' ? 'primary' : 'default'
              },
              {
                label: 'Summary',
                onClick: () => setViewMode('summary'),
                variant: viewMode === 'summary' ? 'primary' : 'default'
              },
              {
                label: 'Analytics',
                onClick: () => setViewMode('analytics'),
                variant: viewMode === 'analytics' ? 'primary' : 'default'
              }
            ] as any}
          />
          <div className="bg-blue-50 px-4 py-2 text-xs text-blue-700 border-b border-blue-200">
            Keyboard shortcuts: <strong>Ctrl+F</strong> - Search | <strong>Ctrl+E</strong> - Export | <strong>Esc</strong> - Close
          </div>
          <div className="flex-1 overflow-y-auto">
            <div className="max-w-6xl mx-auto px-6 py-6">

              {/* Loading State */}
              {(loadingParty || loadingLedger) && (
                <div className="bg-white rounded-lg shadow-sm border border-blue-200 p-8 mb-6">
                  <div className="text-center">
                    <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4 text-blue-600" />
                    <p className="text-gray-600">Loading party ledger data...</p>
                  </div>
                </div>
              )}

              {/* Error State */}
              {errorMessage && (
                <div className="bg-white rounded-lg shadow-sm border border-red-200 p-6 mb-6">
                  <div className="text-center max-w-md mx-auto">
                    <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
                    <h3 className="text-lg font-medium text-red-800 mb-2">Error</h3>
                    <p className="text-red-700 mb-4">{errorMessage}</p>
                    <button
                      onClick={() => refetch()}
                      className="px-4 py-2 bg-red-100 text-red-700 rounded-md hover:bg-red-200 text-sm"
                    >
                      Retry
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
              value={selectedParty}
              onChange={setSelectedParty}
              placeholder="Search customer by name, phone or ID"
            />
          ) : (
            <SupplierSearch
              onSupplierSelect={setSelectedParty}
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
              keyField="id"
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
            open={showAgingAnalysis}
            onClose={() => setShowAgingAnalysis(false)}
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
          </div>
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