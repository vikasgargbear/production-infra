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
  RefreshCw,
  FileDown,
  FileSpreadsheet,
  Printer
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
    }
  };

  const handlePrint = () => {
    window.print();
  };

  // Simplify columns to debug - return plain strings/elements
  const columns = [
    {
      key: 'date',
      header: 'Date',
      render: (value: any, entry: any) => {
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
        return entry?.reference || entry?.reference_number || '-';
      },
      width: '150px'
    },
    {
      key: 'debit',
      header: 'Debit',
      align: 'right' as const,
      render: (value: any, entry: any) => {
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
        if (!entry) return '-';

        // Use display_balance and balance_type from backend if available
        const displayBalance = entry.display_balance ?? Math.abs(entry.running_balance ?? entry.balance ?? 0);
        const balanceType = entry.balance_type;

        // Determine if customer owes us (Dr) or has advance (Cr)
        // Negative balance = customer owes us (Dr)
        // Positive balance = customer has advance/credit (Cr)
        const rawBalance = entry.running_balance ?? entry.balance ?? 0;
        const isDebit = balanceType === 'Dr' || (!balanceType && rawBalance < 0);

        return (
          <div className="flex flex-col items-end">
            <div className={`font-semibold ${isDebit ? 'text-red-600' : 'text-green-600'}`}>
              ₹{parseFloat(String(displayBalance)).toFixed(2)}
            </div>
            <div className={`text-xs ${isDebit ? 'text-red-500' : 'text-green-500'}`}>
              {isDebit ? '📈 To Receive' : '💰 Advance'}
            </div>
          </div>
        );
      },
      width: '150px'
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
          <div className="flex-1 flex">
            {/* Main Content */}
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

              {/* Party Selection - Inline without wrapper */}
              {!initialPartyId && (
                <div className="mb-6">
                  {partyType === 'customer' ? (
                    <CustomerSearch
                      value={selectedParty}
                      onChange={setSelectedParty}
                      placeholder="Search customer by name, phone or ID"
                      displayMode="inline"
                      clearable={true}
                    />
                  ) : (
                    <SupplierSearch
                      onChange={setSelectedParty}
                      placeholder="Search supplier by name or ID"
                      displayMode="inline"
                      clearable={true}
                    />
                  )}
                </div>
              )}

              {/* Content - Always show table structure */}
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
                  return null;
                })()}

                <DataTable
                  columns={columns}
                  data={filteredEntries}
                  keyField="id"
                  loading={loadingLedger}
                  emptyMessage={selectedParty || initialPartyId ? "No transactions found" : "Please select a customer to view ledger"}
                />
                </div>
              </div>
            </div>

            {/* Sidebar */}
            {(selectedParty || initialPartyId) && (
              <div className="w-80 border-l border-gray-200 bg-white overflow-y-auto">
                <div className="p-4">
                  {/* Party Summary */}
                  <div className="mb-6">
                    <h3 className="text-sm font-semibold text-gray-700 mb-3">Party Details</h3>
                    <div className="bg-gray-50 rounded-lg p-3 space-y-2">
                      <div>
                        <span className="text-xs text-gray-500">Name</span>
                        <p className="font-medium text-sm">
                          {selectedParty?.name || selectedParty?.label || 'N/A'}
                        </p>
                      </div>
                      {selectedParty?.phone && (
                        <div>
                          <span className="text-xs text-gray-500">Phone</span>
                          <p className="font-medium text-sm">{selectedParty.phone}</p>
                        </div>
                      )}
                      {selectedParty?.email && (
                        <div>
                          <span className="text-xs text-gray-500">Email</span>
                          <p className="font-medium text-sm">{selectedParty.email}</p>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Balance Overview */}
                  <div className="mb-6">
                    <h3 className="text-sm font-semibold text-gray-700 mb-3">Balance Overview</h3>
                    <div className="space-y-3">
                      <div className="flex justify-between items-center p-3 bg-blue-50 rounded-lg">
                        <span className="text-sm text-gray-600">Total Debit</span>
                        <span className="font-semibold text-blue-600">
                          ₹{filteredEntries.reduce((sum, entry) => sum + (entry.debit || 0), 0).toFixed(2)}
                        </span>
                      </div>
                      <div className="flex justify-between items-center p-3 bg-green-50 rounded-lg">
                        <span className="text-sm text-gray-600">Total Credit</span>
                        <span className="font-semibold text-green-600">
                          ₹{filteredEntries.reduce((sum, entry) => sum + (entry.credit || 0), 0).toFixed(2)}
                        </span>
                      </div>
                      <div className="flex justify-between items-center p-3 bg-gray-100 rounded-lg">
                        <span className="text-sm text-gray-600">Current Balance</span>
                        <span className={`font-bold ${
                          filteredEntries.length > 0 && filteredEntries[filteredEntries.length - 1]?.balance >= 0
                            ? 'text-green-600'
                            : 'text-red-600'
                        }`}>
                          ₹{filteredEntries.length > 0 ? Math.abs(filteredEntries[filteredEntries.length - 1]?.balance || 0).toFixed(2) : '0.00'}
                          {filteredEntries.length > 0 && filteredEntries[filteredEntries.length - 1]?.balance < 0 && ' (Dr)'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Recent Transactions */}
                  <div className="mb-6">
                    <h3 className="text-sm font-semibold text-gray-700 mb-3">Recent Transactions</h3>
                    <div className="space-y-2">
                      {filteredEntries.slice(0, 5).map((entry, index) => (
                        <div key={entry.id || index} className="border-b pb-2 last:border-0">
                          <div className="flex justify-between items-start">
                            <div className="flex-1">
                              <p className="text-xs text-gray-500">{entry.date}</p>
                              <p className="text-sm font-medium">{entry.type}</p>
                            </div>
                            <div className="text-right">
                              {entry.debit > 0 && (
                                <p className="text-sm font-medium text-blue-600">₹{entry.debit.toFixed(2)}</p>
                              )}
                              {entry.credit > 0 && (
                                <p className="text-sm font-medium text-green-600">₹{entry.credit.toFixed(2)}</p>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                      {filteredEntries.length === 0 && (
                        <p className="text-xs text-gray-500 text-center py-4">No transactions yet</p>
                      )}
                    </div>
                  </div>

                  {/* Quick Actions */}
                  <div>
                    <h3 className="text-sm font-semibold text-gray-700 mb-3">Quick Actions</h3>
                    <div className="space-y-2">
                      <button
                        onClick={() => handleExport('pdf')}
                        className="w-full px-3 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 text-sm flex items-center justify-center gap-2"
                      >
                        <FileDown className="w-4 h-4" />
                        Export as PDF
                      </button>
                      <button
                        onClick={() => handleExport('excel')}
                        className="w-full px-3 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 text-sm flex items-center justify-center gap-2"
                      >
                        <FileSpreadsheet className="w-4 h-4" />
                        Export as Excel
                      </button>
                      <button
                        onClick={handlePrint}
                        className="w-full px-3 py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 text-sm flex items-center justify-center gap-2"
                      >
                        <Printer className="w-4 h-4" />
                        Print Ledger
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Embedded View */}
      {embedded && (
        <>
          {/* Party Selection for embedded view - Inline */}
          {!initialPartyId && (
            <div className="mb-6">
              {partyType === 'customer' ? (
                <CustomerSearch
                  value={selectedParty}
                  onChange={setSelectedParty}
                  placeholder="Search customer by name, phone or ID"
                  displayMode="inline"
                  clearable={true}
                />
              ) : (
                <SupplierSearch
                  onChange={setSelectedParty}
                  placeholder="Search supplier by name or ID"
                  displayMode="inline"
                  clearable={true}
                />
              )}
            </div>
          )}

          {/* Content for embedded view */}
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
              emptyMessage={selectedParty || initialPartyId ? "No transactions found" : "Please select a customer to view ledger"}
            />
          </div>
        </>
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