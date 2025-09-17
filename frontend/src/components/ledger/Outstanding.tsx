/**
 * Outstanding Component
 * Combined view of party-wise outstanding balances with drill-down to individual bills
 */

import React, { useState, useMemo } from 'react';
import { useQuery } from 'react-query';
import {
  ChevronDown,
  ChevronRight,
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
  Table
} from 'lucide-react';
import { format, parseISO, differenceInDays } from 'date-fns';
import apiClient from '../../services/api/apiClient';
import { DataTable, StatusBadge, Select, ModuleHeader } from '../global';
import { formatCurrency } from '../../utils/formatters';

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
}

interface InvoiceDetail {
  invoice_id: string;
  invoice_number: string;
  invoice_date: string;
  due_date: string;
  original_amount: number;
  paid_amount: number;
  outstanding_amount: number;
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
    status: 'all', // all, overdue, current
    searchQuery: ''
  });
  const [viewMode, setViewMode] = useState<'summary' | 'aging'>('summary');

  // Fetch outstanding data with net position (including advances)
  const { data, isLoading, refetch, error } = useQuery(
    ['outstanding-data', partyType, filters],
    async () => {
      try {
        // Use the new customer-outstanding endpoint that includes advance payments
        const response = await apiClient.get('/customer-outstanding/net-position', {
          params: {
            // No customer_id filter - get all customers with net position
          }
        });
        
        // The API returns { customers: [], summary: {} } with net position info
        const responseData = response.data || {};
        const customers = responseData.customers || [];

        // Transform customers data to party format
        const partiesMap = new Map<string, PartyOutstanding>();
        
        // Process each customer with net position
        customers.forEach((customer: any) => {
          const partyId = String(customer.customer_id);

          // Only show customers with actual outstanding (negative net balance)
          // or those with advance payments that might need attention
          const netBalance = customer.net_balance || 0;
          const outstanding = customer.outstanding || 0;
          const advance = customer.advance || 0;

          // Create party entry with net position info
          partiesMap.set(partyId, {
            party_id: partyId,
            party_name: customer.customer_name || 'Unknown Customer',
            party_phone: customer.phone || '',
            party_email: customer.email || '',
            total_outstanding: outstanding, // Use actual outstanding, not net
            total_advance: advance, // Add advance amount
            net_balance: netBalance, // Add net position
            net_type: customer.net_type || (netBalance >= 0 ? 'credit' : 'debit'),
            total_overdue: 0, // Will be calculated if we fetch invoice details
            invoice_count: customer.unpaid_invoices || 0,
            overdue_count: 0,
            oldest_invoice_days: 0,
            invoices: []
          } as any);
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
        
        // Use summary from API if available, otherwise calculate
        if (responseData.summary) {
          summary.total_receivable = responseData.summary.total_outstanding || 0;
          summary.total_advance = responseData.summary.total_advance || 0;
          summary.net_position = responseData.summary.net_position || 0;
          summary.party_count = responseData.summary.customer_count || parties.length;
        } else {
          // Calculate totals
          parties.forEach(party => {
            summary.total_receivable += party.total_outstanding;
            summary.total_overdue += party.total_overdue;
            if (party.overdue_count > 0) {
              summary.overdue_party_count++;
            }
          
            // Update aging summary
            party.invoices?.forEach(invoice => {
              const bucket = invoice.aging_bucket;
              const amount = invoice.outstanding_amount;

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
        }

        return { parties, summary };
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
      filtered = filtered.filter((party: PartyOutstanding) =>
        party.party_name.toLowerCase().includes(query) ||
        party.party_phone?.includes(query)
      );
    }
    
    // Apply status filter
    if (filters.status === 'overdue') {
      filtered = filtered.filter((party: PartyOutstanding) => party.total_overdue > 0);
    } else if (filters.status === 'current') {
      filtered = filtered.filter((party: PartyOutstanding) => party.total_overdue === 0);
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
      key: 'net_position',
      header: 'Net Position',
      align: 'right' as const,
      render: (_: any, party: any) => (
        <div className="text-right">
          {/* Show net position with color coding */}
          <div className={`font-semibold ${party.net_type === 'credit' ? 'text-green-600' : 'text-red-600'}`}>
            {formatCurrency(Math.abs(party.net_balance || party.total_outstanding))}
            <span className="ml-1 text-xs">
              {party.net_type === 'credit' ? '(Advance)' : '(To Receive)'}
            </span>
          </div>
          {/* Show breakdown if there's both outstanding and advance */}
          {party.total_outstanding > 0 && party.total_advance > 0 && (
            <div className="text-xs text-gray-500 mt-1">
              <span>Outstanding: {formatCurrency(party.total_outstanding)}</span>
              <span className="mx-1">|</span>
              <span>Advance: {formatCurrency(party.total_advance)}</span>
            </div>
          )}
        </div>
      ),
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
      key: 'outstanding_amount',
      header: 'Outstanding',
      align: 'right' as const,
      render: (_: any, invoice: InvoiceDetail) => formatCurrency(invoice.outstanding_amount),
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
              onSaveDraft={() => {}}
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
            onSaveDraft={() => {}}
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
                variant: "default",
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
                      <div className={`text-xl font-semibold ${(summary as any).net_position >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {formatCurrency(Math.abs((summary as any).net_position || summary.total_receivable))}
                        <span className="text-xs ml-1">
                          {(summary as any).net_position >= 0 ? '(Advance)' : '(To Receive)'}
                        </span>
                      </div>
                    </div>
                    <div className="h-10 w-px bg-gray-200"></div>
                    <div>
                      <span className="text-xs text-gray-500 uppercase tracking-wider">Total Outstanding</span>
                      <div className="text-xl font-semibold text-gray-900">{formatCurrency(summary.total_receivable)}</div>
                    </div>
                    {(summary as any).total_advance > 0 && (
                      <>
                        <div className="h-10 w-px bg-gray-200"></div>
                        <div>
                          <span className="text-xs text-gray-500 uppercase tracking-wider">Total Advance</span>
                          <div className="text-xl font-semibold text-green-600">{formatCurrency((summary as any).total_advance || 0)}</div>
                        </div>
                      </>
                    )}
                    <div className="h-10 w-px bg-gray-200"></div>
                    <div>
                      <span className="text-xs text-gray-500 uppercase tracking-wider">Parties</span>
                      <div className="text-xl font-semibold text-gray-900">{summary.party_count}</div>
                    </div>
                  </div>
                  
                  {/* Aging Distribution Bar */}
                  <div className="flex items-center space-x-4">
                    <div className="text-xs text-gray-500 uppercase tracking-wider">Aging Distribution</div>
                    <div className="flex items-center space-x-1">
                      {summary.total_receivable > 0 && (
                        <>
                          {summary.aging_summary.current.amount > 0 && (
                            <div 
                              className="h-6 bg-green-500 rounded-l" 
                              style={{width: `${(summary.aging_summary.current.amount / summary.total_receivable) * 100}px`}}
                              title={`Current: ${formatCurrency(summary.aging_summary.current.amount)}`}
                            />
                          )}
                          {summary.aging_summary['1-30'].amount > 0 && (
                            <div 
                              className="h-6 bg-yellow-500" 
                              style={{width: `${(summary.aging_summary['1-30'].amount / summary.total_receivable) * 100}px`}}
                              title={`1-30 days: ${formatCurrency(summary.aging_summary['1-30'].amount)}`}
                            />
                          )}
                          {summary.aging_summary['31-60'].amount > 0 && (
                            <div 
                              className="h-6 bg-orange-500" 
                              style={{width: `${(summary.aging_summary['31-60'].amount / summary.total_receivable) * 100}px`}}
                              title={`31-60 days: ${formatCurrency(summary.aging_summary['31-60'].amount)}`}
                            />
                          )}
                          {summary.aging_summary['61-90'].amount > 0 && (
                            <div 
                              className="h-6 bg-red-500" 
                              style={{width: `${(summary.aging_summary['61-90'].amount / summary.total_receivable) * 100}px`}}
                              title={`61-90 days: ${formatCurrency(summary.aging_summary['61-90'].amount)}`}
                            />
                          )}
                          {summary.aging_summary.over_90.amount > 0 && (
                            <div 
                              className="h-6 bg-red-800 rounded-r" 
                              style={{width: `${(summary.aging_summary.over_90.amount / summary.total_receivable) * 100}px`}}
                              title={`90+ days: ${formatCurrency(summary.aging_summary.over_90.amount)}`}
                            />
                          )}
                        </>
                      )}
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
                        { value: 'all', label: 'All Status' },
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
                    {/* Custom table implementation for proper expand/collapse */}
                    <table className="w-full">
                      <thead className="bg-gray-50 border-b">
                        <tr>
                          <th className="w-10"></th>
                          <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                            {partyType === 'customer' ? 'Customer' : 'Supplier'}
                          </th>
                          <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Total Outstanding
                          </th>
                          <th className="text-center px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Bills
                          </th>
                          <th className="text-center px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Oldest Bill
                          </th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {filteredParties.map((party: PartyOutstanding) => (
                          <React.Fragment key={party.party_id}>
                            {/* Party Row */}
                            <tr className="hover:bg-gray-50">
                              <td className="px-2 py-3">
                                <button
                                  onClick={() => togglePartyExpansion(party.party_id)}
                                  className="p-1 hover:bg-gray-100 rounded"
                                >
                                  {expandedParties.has(party.party_id) ? 
                                    <ChevronDown className="w-4 h-4" /> : 
                                    <ChevronRight className="w-4 h-4" />
                                  }
                                </button>
                              </td>
                              <td className="px-4 py-3">
                                <div>
                                  <div className="font-medium">{party.party_name}</div>
                                  {(party.party_phone || party.party_email) && (
                                    <div className="text-xs text-gray-500">
                                      {party.party_phone && <span className="mr-3">{party.party_phone}</span>}
                                      {party.party_email && <span>{party.party_email}</span>}
                                    </div>
                                  )}
                                </div>
                              </td>
                              <td className="px-4 py-3 text-right">
                                <div className="font-medium">{formatCurrency(party.total_outstanding)}</div>
                                {party.total_overdue > 0 && (
                                  <div className="text-xs text-red-600">
                                    Overdue: {formatCurrency(party.total_overdue)}
                                  </div>
                                )}
                              </td>
                              <td className="px-4 py-3 text-center">
                                <div>{party.invoice_count}</div>
                                {party.overdue_count > 0 && (
                                  <div className="text-xs text-red-600">
                                    {party.overdue_count} overdue
                                  </div>
                                )}
                              </td>
                              <td className="px-4 py-3 text-center">
                                {party.oldest_invoice_days ? (
                                  <span className={
                                    party.oldest_invoice_days > 60 ? 'text-red-600' : 
                                    party.oldest_invoice_days > 30 ? 'text-orange-600' : 'text-gray-600'
                                  }>
                                    {party.oldest_invoice_days} days
                                  </span>
                                ) : (
                                  <span className="text-gray-400">-</span>
                                )}
                              </td>
                            </tr>
                            
                            {/* Expanded Invoice Details - Immediately below the party row */}
                            {expandedParties.has(party.party_id) && party.invoices && party.invoices.length > 0 && (
                              <tr>
                                <td colSpan={5} className="p-0">
                                  <div className="bg-gray-50 px-12 py-4">
                                    <h4 className="text-sm font-medium text-gray-700 mb-3">
                                      Invoice Details for {party.party_name}
                                    </h4>
                                    <DataTable
                                      columns={invoiceColumns}
                                      data={party.invoices}
                                      keyField="invoice_id"
                                      loading={false}
                                      emptyMessage="No invoices found"
                                    />
                                  </div>
                                </td>
                              </tr>
                            )}
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
                              buckets[invoice.aging_bucket] += invoice.outstanding_amount;
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