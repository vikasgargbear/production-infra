/**
 * Outstanding Component
 * Combined view of party-wise outstanding balances with drill-down to individual bills
 */

import React, { useState, useMemo } from 'react';
import { useQuery } from 'react-query';
import {
  ChevronDown,
  ChevronRight,
  ChevronLeft,
  IndianRupee,
  AlertCircle,
  Clock,
  Download,
  FileSpreadsheet,
  Search,
  Loader2,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  Calendar,
  BarChart3,
  Table,
  CreditCard
} from 'lucide-react';
import { format, parseISO, differenceInDays } from 'date-fns';
import apiClient from '../../services/api/apiClient';
import { DataTable, StatusBadge, Select, ModuleHeader } from '../global';
import { formatCurrency } from '../../utils/formatters';
import PaymentAllocationModal from '../payment/shared/PaymentAllocationModal';

interface OutstandingProps {
  partyType?: 'customer' | 'supplier';
  embedded?: boolean;
  onClose?: () => void;
}

interface PartyOutstanding {
  party_id: string;
  party_name: string;
  party_phone: string;
  party_email: string;
  total_outstanding: number;
  total_overdue: number;
  invoice_count: number;
  overdue_count: number;
  oldest_invoice_days: number;
  credit_limit?: number;
  credit_utilization?: number;
  invoices?: InvoiceDetail[];
  total_advance?: number;
  customer_net_position?: number;
}

interface InvoiceDetail {
  invoice_id: string;
  invoice_number: string;
  invoice_date: string;
  due_date: string;
  original_amount: number;
  paid_amount: number;
  current_outstanding: number;
  days_overdue: number;
  aging_bucket: 'current' | '1-30' | '31-60' | '61-90' | 'over_90';
  status: 'pending' | 'partial' | 'overdue';
}

interface Summary {
  total_receivable: number;
  total_payable: number;
  total_overdue: number;
  party_count: number;
  overdue_party_count: number;
  aging_summary: {
    current: { count: number; amount: number };
    '1-30': { count: number; amount: number };
    '31-60': { count: number; amount: number };
    '61-90': { count: number; amount: number };
    over_90: { count: number; amount: number };
  };
}

const Outstanding: React.FC<OutstandingProps> = ({
  partyType = 'customer',
  embedded = false,
  onClose
}) => {
  const [expandedParties, setExpandedParties] = useState<Set<string>>(new Set());
  const [filters, setFilters] = useState({
    status: 'all', // Show all customers by default
    searchQuery: ''
  });
  const [viewMode, setViewMode] = useState<'summary' | 'aging'>('summary');
  const [selectedParty, setSelectedParty] = useState<PartyOutstanding | null>(null);
  const [showDetailsView, setShowDetailsView] = useState(false);
  const [allocationModal, setAllocationModal] = useState<{ isOpen: boolean; customerId: number | null; customerName: string }>({
    isOpen: false,
    customerId: null,
    customerName: ''
  });

  // Fetch outstanding data using the sales API
  const { data, isLoading, refetch, error } = useQuery(
    ['outstanding-data', partyType, filters],
    async () => {
      try {
        // Use the sales/outstanding endpoint which exists
        const response = await apiClient.get('/sales/outstanding', {
          params: {
            // No customer_id filter - get all customers
          }
        });

        // The API returns { invoices: [], total_outstanding: number, count: number }
        const responseData = response.data || {};
        const invoices = Array.isArray(responseData.invoices) ? responseData.invoices :
          Array.isArray(responseData) ? responseData : [];

        // Group by customer for summary view
        const partiesMap = new Map<string, PartyOutstanding>();

        // Process invoices and group by customer
        invoices.forEach((invoice: any) => {
          const partyId = String(invoice.customer_id);

          if (!partiesMap.has(partyId)) {
            partiesMap.set(partyId, {
              party_id: partyId,
              party_name: invoice.customer_name || 'Unknown Customer',
              party_phone: invoice.customer_phone || '',
              party_email: invoice.customer_email || '',
              total_outstanding: 0,
              total_advance: invoice.customer_advance || 0, // Unallocated amount
              customer_net_position: invoice.customer_net_position || 0, // Net position from backend
              total_overdue: 0,
              invoice_count: 0,
              overdue_count: 0,
              oldest_invoice_days: 0,
              invoices: []
            } as any);
          }

          const party = partiesMap.get(partyId)!;
          const pendingAmount = parseFloat(invoice.pending_amount || 0);
          const daysOverdue = parseInt(invoice.days_overdue || 0);

          // Update advance and net position if provided
          if (invoice.customer_advance && party.total_advance === 0) {
            party.total_advance = invoice.customer_advance;
          }
          if (invoice.customer_net_position !== undefined && party.customer_net_position === 0) {
            party.customer_net_position = invoice.customer_net_position;
          }

          party.total_outstanding += pendingAmount;
          party.invoice_count++;

          if (daysOverdue > 0) {
            party.total_overdue += pendingAmount;
            party.overdue_count++;
            party.oldest_invoice_days = Math.max(party.oldest_invoice_days, daysOverdue);
          }

          // Determine aging bucket
          let agingBucket: InvoiceDetail['aging_bucket'] = 'current';
          if (daysOverdue > 90) agingBucket = 'over_90';
          else if (daysOverdue > 60) agingBucket = '61-90';
          else if (daysOverdue > 30) agingBucket = '31-60';
          else if (daysOverdue > 0) agingBucket = '1-30';

          // Determine status
          let status: InvoiceDetail['status'] = 'pending';
          if (invoice.payment_status === 'partial') status = 'partial';
          else if (daysOverdue > 0) status = 'overdue';

          // Add invoice details
          party.invoices!.push({
            invoice_id: String(invoice.invoice_id),
            invoice_number: invoice.invoice_number || '',
            invoice_date: invoice.invoice_date || '',
            due_date: invoice.due_date || '',
            original_amount: parseFloat(invoice.final_amount || 0),
            paid_amount: parseFloat(invoice.paid_amount || 0),
            current_outstanding: pendingAmount,
            days_overdue: daysOverdue,
            aging_bucket: agingBucket,
            status: status
          });
        });

        const parties = Array.from(partiesMap.values());

        // Calculate summary
        const summary: Summary = {
          total_receivable: 0,
          total_payable: 0,
          total_overdue: 0,
          party_count: parties.length,
          overdue_party_count: 0,
          aging_summary: {
            current: { count: 0, amount: 0 },
            '1-30': { count: 0, amount: 0 },
            '31-60': { count: 0, amount: 0 },
            '61-90': { count: 0, amount: 0 },
            over_90: { count: 0, amount: 0 }
          }
        };

        // Don't use local calculation - use backend values if available
        // Backend calculates correctly at customer level
        if (responseData.total_outstanding !== undefined) {
          summary.total_receivable = responseData.total_outstanding;
        } else {
          // Fallback to local calculation
          parties.forEach(party => {
            summary.total_receivable += party.total_outstanding;
          });
        }

        // Calculate other summaries
        parties.forEach(party => {
          summary.total_overdue += party.total_overdue;
          if (party.overdue_count > 0) {
            summary.overdue_party_count++;
          }

          // Update aging summary
          party.invoices?.forEach(invoice => {
            const bucket = invoice.aging_bucket;
            const amount = invoice.current_outstanding;

            if (bucket === 'current') {
              summary.aging_summary.current.count++;
              summary.aging_summary.current.amount += amount;
            } else if (bucket === '1-30') {
              summary.aging_summary['1-30'].count++;
              summary.aging_summary['1-30'].amount += amount;
            } else if (bucket === '31-60') {
              summary.aging_summary['31-60'].count++;
              summary.aging_summary['31-60'].amount += amount;
            } else if (bucket === '61-90') {
              summary.aging_summary['61-90'].count++;
              summary.aging_summary['61-90'].amount += amount;
            } else if (bucket === 'over_90') {
              summary.aging_summary.over_90.count++;
              summary.aging_summary.over_90.amount += amount;
            }
          });
        });

        // Include the API response data for use in summary
        return {
          parties,
          summary,
          total_advances: responseData.total_advances || 0,
          net_position: responseData.net_position || 0,
          customer_advances: responseData.customer_advances || {}
        };
      } catch (err) {
        // Return empty data structure on error
        return {
          parties: [],
          summary: {
            total_receivable: 0,
            total_payable: 0,
            total_overdue: 0,
            party_count: 0,
            overdue_party_count: 0,
            aging_summary: {
              current: { count: 0, amount: 0 },
              '1-30': { count: 0, amount: 0 },
              '31-60': { count: 0, amount: 0 },
              '61-90': { count: 0, amount: 0 },
              over_90: { count: 0, amount: 0 }
            }
          }
        };
      }
    },
    {
      keepPreviousData: true,
      enabled: partyType === 'customer', // Only enable for customers for now
      retry: 1
    }
  );

  const parties = data?.parties || [];
  const summary = data?.summary || {
    total_receivable: 0,
    total_payable: 0,
    total_overdue: 0,
    party_count: 0,
    overdue_party_count: 0,
    aging_summary: {
      current: { count: 0, amount: 0 },
      '1-30': { count: 0, amount: 0 },
      '31-60': { count: 0, amount: 0 },
      '61-90': { count: 0, amount: 0 },
      over_90: { count: 0, amount: 0 }
    }
  };

  // Filter parties based on search and status
  const filteredParties = useMemo(() => {
    let filtered = parties;

    // Apply search filter
    if (filters.searchQuery) {
      const query = filters.searchQuery.toLowerCase();
      filtered = filtered.filter((party: any) =>
        party.party_name.toLowerCase().includes(query) ||
        party.party_phone?.includes(query)
      );
    }

    // Apply status filter
    if (filters.status === 'overdue') {
      filtered = filtered.filter((party: any) => party.total_overdue > 0);
    } else if (filters.status === 'current') {
      filtered = filtered.filter((party: any) => party.total_overdue === 0);
    } else if (filters.status === 'net-outstanding') {
      // Only show customers who actually owe money (positive net position from backend)
      filtered = filtered.filter((party: any) => {
        const netPosition = party.customer_net_position || ((party.total_advance || 0) - party.total_outstanding);
        return netPosition > 0; // Positive means they owe money
      });
    }

    return filtered;
  }, [parties, filters]);

  const togglePartyExpansion = (partyId: string) => {
    const newExpanded = new Set(expandedParties);
    if (newExpanded.has(partyId)) {
      newExpanded.delete(partyId);
    } else {
      newExpanded.add(partyId);
    }
    setExpandedParties(newExpanded);
  };

  const handlePartyClick = (party: PartyOutstanding) => {
    setSelectedParty(party);
    setShowDetailsView(true);
  };

  const handleExport = () => {
    try {
      // Export current view data as CSV
      const csvData = filteredParties.map((party: PartyOutstanding) => ({
        'Party Name': party.party_name,
        'Phone': party.party_phone,
        'Total Outstanding': party.total_outstanding,
        'Overdue Amount': party.total_overdue,
        'Invoice Count': party.invoice_count,
        'Overdue Count': party.overdue_count,
        'Oldest Days': party.oldest_invoice_days
      }));

      if (csvData.length === 0) {
        alert('No data to export');
        return;
      }

      // Convert to CSV
      const headers = Object.keys(csvData[0]);
      const csvContent = [
        headers.join(','),
        ...csvData.map(row => headers.map(h => `"${row[h] || ''}"`).join(','))
      ].join('\n');

      // Create download link
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `outstanding_${partyType}_${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      alert('Failed to export data');
    }
  };

  const getAgingColor = (bucket: string) => {
    switch (bucket) {
      case 'current': return 'text-green-600';
      case '1-30': return 'text-yellow-600';
      case '31-60': return 'text-orange-600';
      case '61-90': return 'text-red-600';
      case 'over_90': return 'text-red-800';
      default: return 'text-gray-600';
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'overdue':
        return <StatusBadge status="error" label="Overdue" />;
      case 'partial':
        return <StatusBadge status="warning" label="Partial" />;
      case 'pending':
        return <StatusBadge status="info" label="Pending" />;
      default:
        return <StatusBadge status="default" label={status} />;
    }
  };

  // Columns for the main party table
  const partyColumns = [
    {
      key: 'expand',
      header: '',
      render: (_: any, party: PartyOutstanding) => (
        <button
          onClick={() => togglePartyExpansion(party.party_id)}
          className="p-1 hover:bg-gray-100 rounded"
        >
          {expandedParties.has(party.party_id) ?
            <ChevronDown className="w-4 h-4" /> :
            <ChevronRight className="w-4 h-4" />
          }
        </button>
      ),
      width: '40px'
    },
    {
      key: 'party_name',
      header: partyType === 'customer' ? 'Customer' : 'Supplier',
      render: (_: any, party: PartyOutstanding) => (
        <div>
          <div className="font-medium">{party.party_name}</div>
          {(party.party_phone || party.party_email) && (
            <div className="text-xs text-gray-500">
              {party.party_phone && <span className="mr-3">{party.party_phone}</span>}
              {party.party_email && <span>{party.party_email}</span>}
            </div>
          )}
        </div>
      )
    },
    {
      key: 'total_outstanding',
      header: 'Net Position',
      align: 'right' as const,
      render: (_: any, party: any) => {
        // Use backend-calculated net position (negative means advance, positive means owed)
        const netPosition = party.customer_net_position || ((party.total_advance || 0) - party.total_outstanding);
        const hasAdvance = party.total_advance > 0;
        const isCredit = netPosition <= 0; // Negative net position means customer has credit/advance

        return (
          <div className="text-right">
            {/* Show net position */}
            <div className={`font-semibold ${isCredit ? 'text-green-600' : 'text-red-600'}`}>
              {formatCurrency(Math.abs(netPosition))}
              <span className="ml-1 text-xs">
                {isCredit ? '(Advance)' : '(To Receive)'}
              </span>
            </div>

            {/* Show breakdown if there's both outstanding and advance */}
            {hasAdvance && party.total_outstanding > 0 && (
              <div className="text-xs text-gray-500 mt-1">
                <div>Outstanding: {formatCurrency(party.total_outstanding)}</div>
                <div>Advance: {formatCurrency(party.total_advance)}</div>
              </div>
            )}

            {/* Allocate Button */}
            {party.total_advance > 0 && party.total_outstanding > 0 && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setSelectedParty(party); // Set selected party so we have invoice data
                  setAllocationModal({
                    isOpen: true,
                    customerId: parseInt(party.party_id),
                    customerName: party.party_name
                  });
                }}
                className="mt-2 px-2 py-1 text-xs bg-blue-100 text-blue-700 rounded hover:bg-blue-200 flex items-center"
              >
                <CreditCard className="w-3 h-3 mr-1" />
                Allocate
              </button>
            )}

            {/* Show overdue if any */}
            {party.total_overdue > 0 && (
              <div className="text-xs text-red-600 mt-1">
                Overdue: {formatCurrency(party.total_overdue)}
              </div>
            )}
          </div>
        );
      },
      width: '200px'
    },
    {
      key: 'invoice_count',
      header: 'Bills',
      align: 'center' as const,
      render: (_: any, party: PartyOutstanding) => (
        <div className="text-center">
          <div>{party.invoice_count}</div>
          {party.overdue_count > 0 && (
            <div className="text-xs text-red-600">
              {party.overdue_count} overdue
            </div>
          )}
        </div>
      ),
      width: '100px'
    },
    {
      key: 'oldest_invoice',
      header: 'Oldest Bill',
      align: 'center' as const,
      render: (_: any, party: PartyOutstanding) => {
        if (!party.oldest_invoice_days) return <span className="text-gray-400">-</span>;
        const color = party.oldest_invoice_days > 60 ? 'text-red-600' :
          party.oldest_invoice_days > 30 ? 'text-orange-600' : 'text-gray-600';
        return (
          <span className={color}>
            {party.oldest_invoice_days} days
          </span>
        );
      },
      width: '120px'
    }
  ];

  // Columns for expanded invoice details
  const invoiceColumns = [
    {
      key: 'invoice_number',
      header: 'Invoice #',
      render: (_: any, invoice: InvoiceDetail) => invoice.invoice_number,
      width: '120px'
    },
    {
      key: 'invoice_date',
      header: 'Date',
      render: (_: any, invoice: InvoiceDetail) => {
        try {
          return format(parseISO(invoice.invoice_date), 'dd/MM/yyyy');
        } catch {
          return invoice.invoice_date;
        }
      },
      width: '100px'
    },
    {
      key: 'due_date',
      header: 'Due Date',
      render: (_: any, invoice: InvoiceDetail) => {
        try {
          return format(parseISO(invoice.due_date), 'dd/MM/yyyy');
        } catch {
          return invoice.due_date || '-';
        }
      },
      width: '100px'
    },
    {
      key: 'original_amount',
      header: 'Amount',
      align: 'right' as const,
      render: (_: any, invoice: InvoiceDetail) => formatCurrency(invoice.original_amount),
      width: '120px'
    },
    {
      key: 'paid_amount',
      header: 'Paid',
      align: 'right' as const,
      render: (_: any, invoice: InvoiceDetail) => formatCurrency(invoice.paid_amount),
      width: '120px'
    },
    {
      key: 'current_outstanding',
      header: 'Outstanding',
      align: 'right' as const,
      render: (_: any, invoice: InvoiceDetail) => formatCurrency(invoice.current_outstanding),
      width: '120px'
    },
    {
      key: 'aging',
      header: 'Aging',
      align: 'center' as const,
      render: (_: any, invoice: InvoiceDetail) => (
        <span className={getAgingColor(invoice.aging_bucket)}>
          {invoice.aging_bucket === 'over_90' ? '90+' : invoice.aging_bucket}
        </span>
      ),
      width: '80px'
    },
    {
      key: 'status',
      header: 'Status',
      render: (_: any, invoice: InvoiceDetail) => getStatusBadge(invoice.status),
      width: '100px'
    }
  ];

  // Show message for suppliers
  if (partyType === 'supplier') {
    return (
      <div className={embedded ? 'p-6' : 'h-full bg-blue-50'}>
        {!embedded && (
          <div className="h-full flex flex-col">
            <ModuleHeader
              title="Outstanding"
              documentNumber=""
              status=""
              icon={IndianRupee}
              iconColor="text-blue-600"
              onClose={onClose}
              historyType="outstanding"
              onSaveDraft={() => { }}
              additionalActions={[]}
            />
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center">
                <AlertCircle className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-600">Supplier outstanding is not available yet</p>
                <p className="text-sm text-gray-500 mt-2">This feature will be available soon</p>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // If showing customer details, render that view instead
  if (showDetailsView && selectedParty) {
    return (
      <div className="h-full bg-blue-50">
        <div className="h-full flex flex-col">
          <ModuleHeader
            title={`Customer Details - ${selectedParty.party_name}`}
            documentNumber=""
            status=""
            icon={IndianRupee}
            iconColor="text-blue-600"
            onClose={() => setShowDetailsView(false)}
            historyType="customer-details"
            onSaveDraft={() => { }}
            additionalActions={[
              {
                label: "Back to Outstanding",
                onClick: () => setShowDetailsView(false),
                variant: "secondary",
                icon: ChevronLeft,
                className: "font-medium"
              }
            ] as any}
          />

          <div className="flex-1 overflow-y-auto">
            <div className="max-w-7xl mx-auto px-6 py-6">
              {/* Customer Contact Info */}
              <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-2xl font-bold text-gray-900">{selectedParty.party_name}</h2>
                    <div className="flex items-center gap-6 mt-2 text-gray-600">
                      {selectedParty.party_phone && (
                        <div className="flex items-center gap-2">
                          <span>📱</span>
                          <span>{selectedParty.party_phone}</span>
                        </div>
                      )}
                      {selectedParty.party_email && (
                        <div className="flex items-center gap-2">
                          <span>✉️</span>
                          <span>{selectedParty.party_email}</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Summary Cards */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
                <div className="bg-white rounded-lg shadow-sm p-6">
                  <div className="text-sm text-gray-600 mb-2">Total Outstanding</div>
                  <div className="text-2xl font-bold text-gray-900">
                    {formatCurrency(selectedParty.total_outstanding)}
                  </div>
                  <div className="text-sm text-gray-500 mt-1">
                    {selectedParty.invoice_count} invoices
                  </div>
                </div>

                <div className="bg-white rounded-lg shadow-sm p-6">
                  <div className="text-sm text-gray-600 mb-2">Overdue Amount</div>
                  <div className="text-2xl font-bold text-red-600">
                    {formatCurrency(selectedParty.total_overdue)}
                  </div>
                  <div className="text-sm text-gray-500 mt-1">
                    {selectedParty.overdue_count} overdue
                  </div>
                </div>

                <div className="bg-white rounded-lg shadow-sm p-6">
                  <div className="text-sm text-gray-600 mb-2">Unallocated Advance</div>
                  <div className="text-2xl font-bold text-green-600">
                    {formatCurrency((selectedParty as any).total_advance || 0)}
                  </div>
                </div>

                <div className="bg-white rounded-lg shadow-sm p-6">
                  <div className="text-sm text-gray-600 mb-2">Net Position</div>
                  <div className="text-2xl font-bold">
                    {(() => {
                      const netPosition = (selectedParty as any).customer_net_position ||
                        ((selectedParty as any).total_advance || 0) - selectedParty.total_outstanding;
                      const isCredit = netPosition <= 0;
                      return (
                        <span className={isCredit ? 'text-green-600' : 'text-blue-600'}>
                          {formatCurrency(Math.abs(netPosition))}
                          <div className="text-sm font-normal text-gray-500 mt-1">
                            {isCredit ? 'Customer has advance' : 'Amount to receive'}
                          </div>
                        </span>
                      );
                    })()}
                  </div>
                </div>
              </div>

              {/* Outstanding Invoices Table */}
              <div className="bg-white rounded-lg shadow-sm">
                <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
                  <h3 className="text-lg font-semibold">Outstanding Invoices</h3>
                  <button
                    onClick={() => {
                      setAllocationModal({
                        isOpen: true,
                        customerId: parseInt(selectedParty.party_id),
                        customerName: selectedParty.party_name
                      });
                    }}
                    className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 flex items-center"
                  >
                    <CreditCard className="w-4 h-4 mr-2" />
                    Allocate Payment
                  </button>
                </div>
                <div className="p-6">
                  {selectedParty.invoices && selectedParty.invoices.length > 0 ? (
                    <DataTable
                      columns={invoiceColumns}
                      data={selectedParty.invoices}
                      keyField="invoice_id"
                      loading={false}
                      emptyMessage="No invoices found"
                    />
                  ) : (
                    <div className="text-center py-12 text-gray-500">
                      <Clock className="w-12 h-12 mx-auto mb-4 text-gray-300" />
                      <p className="text-lg">No outstanding invoices</p>
                      <p className="text-sm">This customer has no pending payments</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Payment Allocation Modal for customer details view */}
        {allocationModal.isOpen && allocationModal.customerId && (
          <PaymentAllocationModal
            isOpen={allocationModal.isOpen}
            onClose={() => setAllocationModal({ isOpen: false, customerId: null, customerName: '' })}
            customerId={allocationModal.customerId}
            customerName={allocationModal.customerName}
            invoices={selectedParty?.invoices || []}
            onAllocationComplete={() => {
              refetch(); // Refresh outstanding data after allocation
              setAllocationModal({ isOpen: false, customerId: null, customerName: '' });
            }}
          />
        )}
      </div>
    );
  }

  return (
    <div className={embedded ? 'p-6' : 'h-full bg-blue-50'}>
      {!embedded && (
        <div className="h-full flex flex-col">
          <ModuleHeader
            title="Outstanding & Payments"
            documentNumber=""
            status=""
            icon={IndianRupee}
            iconColor="text-blue-600"
            onClose={onClose}
            historyType="outstanding"
            onSaveDraft={() => { }}
            additionalActions={[
              {
                label: viewMode === 'summary' ? "View Aging Analysis" : "View Summary",
                onClick: () => setViewMode(viewMode === 'summary' ? 'aging' : 'summary'),
                variant: viewMode === 'aging' ? "primary" : "secondary",
                icon: viewMode === 'summary' ? BarChart3 : Table,
                className: "font-medium"
              },
              {
                label: "Refresh",
                onClick: () => refetch(),
                variant: "primary",
                icon: RefreshCw
              }
            ] as any}
          />

          <div className="flex-1 overflow-y-auto">
            <div className="max-w-7xl mx-auto px-6 py-6">

              {/* Summary Bar - More professional and compact */}
              <div className="bg-white border border-gray-200 rounded-lg shadow-sm mb-6 p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-8">
                    <div>
                      <span className="text-xs text-gray-500 uppercase tracking-wider">Net Position</span>
                      <div className={`text-xl font-semibold ${(data?.net_position || 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {formatCurrency(Math.abs(data?.net_position || 0))}
                        <span className="text-xs ml-1">
                          {(data?.net_position || 0) >= 0 ? '(Advance)' : '(To Receive)'}
                        </span>
                      </div>
                    </div>
                    <div className="h-10 w-px bg-gray-200"></div>
                    <div>
                      <span className="text-xs text-gray-500 uppercase tracking-wider">Total Outstanding</span>
                      <div className="text-xl font-semibold text-red-600">{formatCurrency(summary.total_receivable)}</div>
                    </div>
                    <div className="h-10 w-px bg-gray-200"></div>
                    <div>
                      <span className="text-xs text-gray-500 uppercase tracking-wider">Total Unallocated</span>
                      <div className="text-xl font-semibold text-green-600">{formatCurrency(data?.total_advances || 0)}</div>
                    </div>
                    <div className="h-10 w-px bg-gray-200"></div>
                    <div>
                      <span className="text-xs text-gray-500 uppercase tracking-wider">Parties</span>
                      <div className="text-xl font-semibold text-gray-900">{summary.party_count}</div>
                    </div>
                  </div>

                  {/* Aging Distribution */}
                  <div className="border-t pt-4">
                    <div className="text-xs text-gray-500 uppercase tracking-wider mb-2">Aging Distribution</div>
                    <div className="bg-gray-100 rounded-lg p-2">
                      <div className="flex h-8 rounded overflow-hidden">
                        {summary.total_receivable > 0 && (
                          <>
                            {summary.aging_summary.current.amount > 0 && (
                              <div
                                className="bg-green-500 hover:bg-green-600 transition-colors"
                                style={{ width: `${(summary.aging_summary.current.amount / summary.total_receivable) * 100}%` }}
                                title={`Current: ${formatCurrency(summary.aging_summary.current.amount)}`}
                              />
                            )}
                            {summary.aging_summary['1-30'].amount > 0 && (
                              <div
                                className="bg-yellow-500 hover:bg-yellow-600 transition-colors"
                                style={{ width: `${(summary.aging_summary['1-30'].amount / summary.total_receivable) * 100}%` }}
                                title={`1-30 days: ${formatCurrency(summary.aging_summary['1-30'].amount)}`}
                              />
                            )}
                            {summary.aging_summary['31-60'].amount > 0 && (
                              <div
                                className="bg-orange-500 hover:bg-orange-600 transition-colors"
                                style={{ width: `${(summary.aging_summary['31-60'].amount / summary.total_receivable) * 100}%` }}
                                title={`31-60 days: ${formatCurrency(summary.aging_summary['31-60'].amount)}`}
                              />
                            )}
                            {summary.aging_summary['61-90'].amount > 0 && (
                              <div
                                className="bg-red-500 hover:bg-red-600 transition-colors"
                                style={{ width: `${(summary.aging_summary['61-90'].amount / summary.total_receivable) * 100}%` }}
                                title={`61-90 days: ${formatCurrency(summary.aging_summary['61-90'].amount)}`}
                              />
                            )}
                            {summary.aging_summary.over_90.amount > 0 && (
                              <div
                                className="bg-red-800 hover:bg-red-900 transition-colors"
                                style={{ width: `${(summary.aging_summary.over_90.amount / summary.total_receivable) * 100}%` }}
                                title={`90+ days: ${formatCurrency(summary.aging_summary.over_90.amount)}`}
                              />
                            )}
                          </>
                        )}
                        {summary.total_receivable === 0 && (
                          <div className="w-full bg-gray-300 flex items-center justify-center text-gray-500 text-sm">
                            No outstanding amounts
                          </div>
                        )}
                      </div>

                      {/* Legend */}
                      <div className="flex flex-wrap gap-3 mt-3 text-xs">
                        <div className="flex items-center gap-1">
                          <div className="w-3 h-3 bg-green-500 rounded"></div>
                          <span className="text-gray-600">Current</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <div className="w-3 h-3 bg-yellow-500 rounded"></div>
                          <span className="text-gray-600">1-30 days</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <div className="w-3 h-3 bg-orange-500 rounded"></div>
                          <span className="text-gray-600">31-60 days</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <div className="w-3 h-3 bg-red-500 rounded"></div>
                          <span className="text-gray-600">61-90 days</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <div className="w-3 h-3 bg-red-800 rounded"></div>
                          <span className="text-gray-600">90+ days</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Filters */}
              <div className="bg-white p-4 rounded-lg shadow-sm mb-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-4 flex-1">
                    <div className="flex-1 max-w-md">
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                        <input
                          type="text"
                          placeholder="Search by party name or phone..."
                          value={filters.searchQuery}
                          onChange={(e) => setFilters({ ...filters, searchQuery: e.target.value })}
                          className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        />
                      </div>
                    </div>

                    <Select
                      value={filters.status}
                      onChange={(value) => setFilters({ ...filters, status: value })}
                      options={[
                        { value: 'all', label: 'All Customers' },
                        { value: 'net-outstanding', label: 'Net Outstanding Only' },
                        { value: 'overdue', label: 'Overdue Only' },
                        { value: 'current', label: 'Current Only' }
                      ]}
                    />
                  </div>

                  <button
                    onClick={handleExport}
                    className="ml-4 px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                  >
                    <FileSpreadsheet className="w-4 h-4 inline-block mr-2" />
                    Export
                  </button>
                </div>
              </div>

              {/* Party Outstanding Table - Summary View */}
              {viewMode === 'summary' && (
                <div className="bg-white rounded-lg shadow-sm">
                  {isLoading ? (
                    <div className="p-8 text-center">
                      <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4 text-blue-600" />
                      <p className="text-gray-600">Loading outstanding data...</p>
                    </div>
                  ) : error ? (
                    <div className="p-8 text-center">
                      <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
                      <p className="text-red-600">Failed to load outstanding data</p>
                      <button
                        onClick={() => refetch()}
                        className="mt-4 px-4 py-2 bg-red-100 text-red-700 rounded-md hover:bg-red-200"
                      >
                        Retry
                      </button>
                    </div>
                  ) : filteredParties.length === 0 ? (
                    <div className="p-8 text-center text-gray-500">
                      {filters.searchQuery || filters.status !== 'all' ?
                        'No matching records found' :
                        'No outstanding records found'}
                    </div>
                  ) : (
                    <div>
                      {/* Compact table - click for details */}
                      <table className="w-full">
                        <thead className="bg-gray-50 border-b">
                          <tr>
                            <th className="text-left px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                              {partyType === 'customer' ? 'Customer' : 'Supplier'}
                            </th>
                            <th className="text-right px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                              Net Position
                            </th>
                            <th className="text-center px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                              Status
                            </th>
                            <th className="text-center px-6 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                              Actions
                            </th>
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                          {filteredParties.map((party: PartyOutstanding) => (
                            <React.Fragment key={party.party_id}>
                              {/* Compact Party Row */}
                              <tr
                                className="hover:bg-gray-50 cursor-pointer"
                                onClick={() => handlePartyClick(party)}
                              >
                                <td className="px-6 py-3">
                                  <div className="font-medium">{party.party_name}</div>
                                </td>
                                <td className="px-6 py-3 text-right">
                                  {(() => {
                                    const netPosition = (party as any).customer_net_position || ((party as any).total_advance || 0) - party.total_outstanding;
                                    const isCredit = netPosition <= 0;

                                    return (
                                      <div className={`font-semibold ${isCredit ? 'text-green-600' : 'text-red-600'}`}>
                                        {formatCurrency(Math.abs(netPosition))}
                                        <span className="ml-1 text-xs">
                                          {isCredit ? 'Adv' : 'Due'}
                                        </span>
                                      </div>
                                    );
                                  })()}
                                </td>
                                <td className="px-6 py-3 text-center">
                                  {party.total_overdue > 0 ? (
                                    <span className="px-2 py-1 text-xs rounded-full bg-red-100 text-red-700">
                                      Overdue
                                    </span>
                                  ) : (
                                    <span className="px-2 py-1 text-xs rounded-full bg-green-100 text-green-700">
                                      Current
                                    </span>
                                  )}
                                </td>
                                <td className="px-6 py-3 text-center">
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setSelectedParty(party); // Set selected party so we have invoice data
                                      setAllocationModal({
                                        isOpen: true,
                                        customerId: parseInt(party.party_id),
                                        customerName: party.party_name
                                      });
                                    }}
                                    className="px-3 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700"
                                  >
                                    Allocate Payment
                                  </button>
                                </td>
                              </tr>
                            </React.Fragment>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {/* Aging Analysis View */}
              {viewMode === 'aging' && (
                <div className="bg-white rounded-lg shadow-sm">
                  {isLoading ? (
                    <div className="p-8 text-center">
                      <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4 text-blue-600" />
                      <p className="text-gray-600">Loading aging analysis...</p>
                    </div>
                  ) : (
                    <div className="p-6">
                      <h3 className="text-lg font-semibold mb-4">Aging Analysis by Party</h3>

                      {/* Aging Analysis Table */}
                      <table className="w-full">
                        <thead className="bg-gray-50 border-b">
                          <tr>
                            <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                              Party
                            </th>
                            <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                              Current
                            </th>
                            <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                              1-30 Days
                            </th>
                            <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                              31-60 Days
                            </th>
                            <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                              61-90 Days
                            </th>
                            <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                              90+ Days
                            </th>
                            <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider font-semibold">
                              Total
                            </th>
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                          {filteredParties.map((party: PartyOutstanding) => {
                            // Calculate aging buckets for this party
                            const buckets = {
                              current: 0,
                              '1-30': 0,
                              '31-60': 0,
                              '61-90': 0,
                              'over_90': 0
                            };

                            party.invoices?.forEach(invoice => {
                              buckets[invoice.aging_bucket] += invoice.current_outstanding;
                            });

                            return (
                              <tr key={party.party_id} className="hover:bg-gray-50">
                                <td className="px-4 py-3">
                                  <div className="font-medium">{party.party_name}</div>
                                  <div className="text-xs text-gray-500">{party.invoice_count} invoices</div>
                                </td>
                                <td className="px-4 py-3 text-right">
                                  {buckets.current > 0 && (
                                    <span className="text-green-600">{formatCurrency(buckets.current)}</span>
                                  )}
                                </td>
                                <td className="px-4 py-3 text-right">
                                  {buckets['1-30'] > 0 && (
                                    <span className="text-yellow-600">{formatCurrency(buckets['1-30'])}</span>
                                  )}
                                </td>
                                <td className="px-4 py-3 text-right">
                                  {buckets['31-60'] > 0 && (
                                    <span className="text-orange-600">{formatCurrency(buckets['31-60'])}</span>
                                  )}
                                </td>
                                <td className="px-4 py-3 text-right">
                                  {buckets['61-90'] > 0 && (
                                    <span className="text-red-600">{formatCurrency(buckets['61-90'])}</span>
                                  )}
                                </td>
                                <td className="px-4 py-3 text-right">
                                  {buckets.over_90 > 0 && (
                                    <span className="text-red-800 font-semibold">{formatCurrency(buckets.over_90)}</span>
                                  )}
                                </td>
                                <td className="px-4 py-3 text-right font-semibold">
                                  {formatCurrency(party.total_outstanding)}
                                </td>
                              </tr>
                            );
                          })}

                          {/* Total Row */}
                          <tr className="bg-gray-50 font-semibold">
                            <td className="px-4 py-3">TOTAL</td>
                            <td className="px-4 py-3 text-right text-green-600">
                              {formatCurrency(summary.aging_summary.current.amount)}
                            </td>
                            <td className="px-4 py-3 text-right text-yellow-600">
                              {formatCurrency(summary.aging_summary['1-30'].amount)}
                            </td>
                            <td className="px-4 py-3 text-right text-orange-600">
                              {formatCurrency(summary.aging_summary['31-60'].amount)}
                            </td>
                            <td className="px-4 py-3 text-right text-red-600">
                              {formatCurrency(summary.aging_summary['61-90'].amount)}
                            </td>
                            <td className="px-4 py-3 text-right text-red-800">
                              {formatCurrency(summary.aging_summary.over_90.amount)}
                            </td>
                            <td className="px-4 py-3 text-right text-lg">
                              {formatCurrency(summary.total_receivable)}
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}


    </div>
  );
};

export default Outstanding;