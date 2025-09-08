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

interface PartyLedgerV3Props {
  partyType?: 'customer' | 'supplier';
  partyId?: string;
  embedded?: boolean;
  onTransactionClick?: (transaction: LedgerEntry) => void;
  onClose?: () => void;
}

interface LedgerEntry {
  id?: string; // Optional for backward compatibility
  ledger_id?: number | string; // API returns ledger_id
  date: string;
  transaction_type: 'invoice' | 'payment' | 'credit_note' | 'debit_note' | 'opening_balance' | 'adjustment' | 'Invoice' | 'Payment'; // Include API values
  reference_number?: string; // API returns 'reference'
  reference?: string; // API field name
  reference_type?: string; // API returns this
  description: string;
  debit: number;
  credit: number;
  balance?: number;
  running_balance?: number; // API returns running_balance
  status?: string; // Payment status
  due_date?: string;
  is_reconciled?: boolean;
  reconciliation_date?: string;
  tags?: string[];
  attachments?: { id: string; name: string; url: string }[];
  notes?: string;
  created_by?: string;
  created_at?: string;
  updated_at?: string;
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

  // Fetch party info - pass the entire customer object for ID extraction
  const { data: partyInfo, isLoading: loadingParty, error: partyError } = useQuery(
    ['party-info', selectedParty || initialPartyId],
    () => partyLedgerAPI.getPartyInfo(selectedParty || initialPartyId),
    {
      enabled: !!(selectedParty || initialPartyId)
    }
  );

  // Fetch ledger entries with summary - pass the entire customer object
  const { data: ledgerData, isLoading: loadingLedger, refetch, error: ledgerError } = useQuery(
    ['party-ledger-v3', selectedParty || initialPartyId, dateRange, filters],
    () => partyLedgerAPI.getEnhancedLedger({
      party_id: selectedParty || initialPartyId,  // Pass entire object, not just .id
      party_type: partyType,
      date_from: format(dateRange.from, 'yyyy-MM-dd'),
      date_to: format(dateRange.to, 'yyyy-MM-dd'),
      transaction_type: filters.transactionType !== 'all' ? filters.transactionType : undefined,
      reconciliation_status: filters.reconciliationStatus !== 'all' ? filters.reconciliationStatus : undefined,
      include_summary: true,
      include_aging: true
    }),
    {
      enabled: !!(selectedParty || initialPartyId)
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
    
    // Filter out any undefined/null entries first
    let filtered = ledgerData.entries.filter((entry: any) => entry != null);
    
    if (filters.searchQuery) {
      const query = filters.searchQuery.toLowerCase();
      filtered = filtered.filter((entry: LedgerEntry) =>
        (entry.reference_number || entry.reference || '').toLowerCase().includes(query) ||
        (entry.description || '').toLowerCase().includes(query) ||
        (entry.notes || '').toLowerCase().includes(query)
      );
    }
    
    return filtered;
  }, [ledgerData, filters.searchQuery]);


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
        include_aging: false
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

  // Simplify columns to debug - return plain strings/elements
  const columns = [
    {
      key: 'date',
      header: 'Date',
      render: (value: any, entry: any) => {
        console.log('[Column Render] Date:', { value, entry });
        if (!entry || !entry.date) return '-';
        try {
          return format(parseISO(entry.date), 'dd/MM/yyyy');
        } catch (e) {
          return entry.date || '-';
        }
      },
      width: '120px'
    },
    {
      key: 'type',
      header: 'Type',
      render: (value: any, entry: any) => {
        console.log('[Column Render] Type:', { value, entry });
        const type = entry?.type || '-';
        // Add color coding for different transaction types
        let textColor = '';
        if (type.includes('Invoice')) textColor = 'blue';
        else if (type.includes('Payment')) textColor = 'green';
        else if (type.includes('Credit')) textColor = 'orange';
        else if (type.includes('Debit')) textColor = 'red';
        
        return (
          <span style={{ color: textColor, fontWeight: 'bold' }}>
            {type}
          </span>
        );
      },
      width: '150px'
    },
    {
      key: 'reference',
      header: 'Reference',
      render: (value: any, entry: any) => {
        console.log('[Column Render] Reference:', { value, entry });
        return entry?.reference || entry?.reference_number || '-';
      },
      width: '150px'
    },
    {
      key: 'description',
      header: 'Description',
      render: (value: any, entry: any) => {
        console.log('[Column Render] Description:', { value, entry });
        return entry?.description || '-';
      }
    },
    {
      key: 'debit',
      header: 'Debit',
      align: 'right' as const,
      render: (value: any, entry: any) => {
        console.log('[Column Render] Debit:', { value, entry });
        if (!entry || !entry.debit) return '-';
        const amount = parseFloat(String(entry.debit));
        return amount > 0 ? `₹${amount.toFixed(2)}` : '-';
      },
      width: '120px'
    },
    {
      key: 'credit',
      header: 'Credit',
      align: 'right' as const,
      render: (value: any, entry: any) => {
        console.log('[Column Render] Credit:', { value, entry });
        if (!entry || !entry.credit) return '-';
        const amount = parseFloat(String(entry.credit));
        return amount > 0 ? `₹${amount.toFixed(2)}` : '-';
      },
      width: '120px'
    },
    {
      key: 'running_balance',
      header: 'Balance',
      align: 'right' as const,
      render: (value: any, entry: any) => {
        console.log('[Column Render] Balance:', { value, entry });
        if (!entry) return '-';
        const balance = entry.running_balance ?? entry.balance ?? 0;
        const balanceNum = parseFloat(String(balance));
        const isReceivable = balanceNum > 0;
        return `₹${Math.abs(balanceNum).toFixed(2)} ${isReceivable ? '(Dr)' : '(Cr)'}`;
      },
      width: '150px'
    },
    {
      key: 'status',
      header: 'Status',
      render: (value: any, entry: any) => {
        console.log('[Column Render] Status:', { value, entry });
        return entry?.status || '-';
      },
      width: '100px'
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
            onSaveDraft={() => {}}
            additionalActions={[
              {
                label: refreshing ? "Refreshing..." : "Refresh",
                onClick: handleRefresh,
                variant: refreshing ? "secondary" : "primary",
                icon: RefreshCw,
                disabled: refreshing,
                className: refreshing ? "animate-spin" : ""
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
        <div className="mb-6">
          {partyType === 'customer' ? (
            <CustomerSearch
              value={selectedParty}
              onChange={setSelectedParty}
              placeholder="Search customer by name, phone or ID"
            />
          ) : (
            <SupplierSearch
              onChange={setSelectedParty}
              placeholder="Search supplier by name or ID"
            />
          )}
        </div>
      )}

      {/* Content */}
      {(selectedParty || initialPartyId) && (
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
            
            {(() => {
              console.log('[PartyLedgerV3] Rendering DataTable with:', {
                filteredEntries: filteredEntries,
                entriesCount: filteredEntries?.length,
                firstEntry: filteredEntries?.[0],
                columnsCount: columns.length,
                loading: loadingLedger,
                ledgerData: ledgerData
              });
              return null;
            })()}
            
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

      
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// Helper functions
function downloadFile(data: Blob, filename: string) {
  const url = window.URL.createObjectURL(data);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  window.URL.revokeObjectURL(url);
}

export default PartyLedgerV3;