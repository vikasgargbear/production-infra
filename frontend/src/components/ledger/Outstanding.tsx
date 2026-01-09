/**
 * Outstanding Component (REFACTORED)
 * Reduced from 1,214 lines to ~470 lines (61% reduction)
 * 
 * Refactoring changes:
 * - 7 useState → 1 useReducer (via useOutstandingState hook)
 * - Extracted 4 sub-components (Summary, Filters, Table, DetailsView)
 * - All sub-components use React.memo for performance
 * - Types extracted to outstanding/types/
 */

import React, { useMemo } from 'react';
import { useQuery } from 'react-query';
import {
  ChevronLeft,
  IndianRupee,
  AlertCircle,
  Loader2,
  RefreshCw,
  BarChart3,
  Table
} from 'lucide-react';
import apiClient from '../../services/api/apiClient';
import { ModuleHeader } from '../global';
import PaymentAllocationModal from '../payment/shared/PaymentAllocationModal';
import { formatCurrency } from '../../utils/formatters';

// Import extracted components
import { OutstandingSummaryBar } from './outstanding/components/OutstandingSummaryBar';
import { OutstandingFilters } from './outstanding/components/OutstandingFilters';
import { OutstandingTable } from './outstanding/components/OutstandingTable';
import { PartyDetailsView } from './outstanding/components/PartyDetailsView';

// Import hooks and types
import { useOutstandingState } from './outstanding/hooks/useOutstandingState';
import type { OutstandingProps, PartyOutstanding, InvoiceDetail, OutstandingSummary } from './outstanding/types/outstanding.types';

const Outstanding: React.FC<OutstandingProps> = ({
  partyType = 'customer',
  embedded = false,
  onClose
}) => {
  // Use centralized state management (replaces 7 useState!)
  const { state, dispatch, filters, ui, selectedParty, allocationModal } = useOutstandingState();

  // Fetch outstanding data using the sales API
  const { data, isLoading, refetch, error } = useQuery(
    ['outstanding-data', partyType, filters],
    async () => {
      try {
        // Use the sales/outstanding endpoint
        const response = await apiClient.get('/sales/outstanding', {
          params: {}
        });

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
              total_advance: invoice.customer_advance || 0,
              customer_net_position: invoice.customer_net_position || 0,
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
        const summary: OutstandingSummary = {
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

        // Use backend total if available
        if (responseData.total_outstanding !== undefined) {
          summary.total_receivable = responseData.total_outstanding;
        } else {
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

        return {
          parties,
          summary,
          total_advances: responseData.total_advances || 0,
          net_position: responseData.net_position || 0,
          customer_advances: responseData.customer_advances || {}
        };
      } catch (err) {
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
          },
          total_advances: 0,
          net_position: 0,
          customer_advances: {}
        };
      }
    },
    {
      keepPreviousData: true,
      enabled: partyType === 'customer',
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
      filtered = filtered.filter((party: any) => {
        const netPosition = party.customer_net_position || ((party.total_advance || 0) - party.total_outstanding);
        return netPosition > 0;
      });
    }

    return filtered;
  }, [parties, filters]);

  // Event handlers
  const handlePartyClick = (party: PartyOutstanding) => {
    dispatch({ type: 'SET_SELECTED_PARTY', party });
    dispatch({ type: 'SET_DETAILS_VIEW', show: true });
  };

  const handleAllocateClick = (party: PartyOutstanding) => {
    dispatch({ type: 'SET_SELECTED_PARTY', party });
    dispatch({
      type: 'OPEN_ALLOCATION_MODAL',
      customerId: parseInt(party.party_id),
      customerName: party.party_name
    });
  };

  const handleExport = () => {
    try {
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

      const headers = Object.keys(csvData[0]);
      const csvContent = [
        headers.join(','),
        ...csvData.map(row => headers.map(h => `"${(row as any)[h] || ''}"`).join(','))
      ].join('\n');

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

  // If showing customer details, render that view
  if (ui.showDetailsView && selectedParty) {
    return (
      <div className="h-full bg-blue-50">
        <div className="h-full flex flex-col">
          <ModuleHeader
            title={`Customer Details - ${selectedParty.party_name}`}
            documentNumber=""
            status=""
            icon={IndianRupee}
            iconColor="text-blue-600"
            onClose={() => dispatch({ type: 'SET_DETAILS_VIEW', show: false })}
            historyType="customer-details"
            onSaveDraft={() => { }}
            additionalActions={[
              {
                label: "Back to Outstanding",
                onClick: () => dispatch({ type: 'SET_DETAILS_VIEW', show: false }),
                variant: "secondary",
                icon: ChevronLeft,
                className: "font-medium"
              }
            ] as any}
          />

          <div className="flex-1 overflow-y-auto">
            <PartyDetailsView
              party={selectedParty}
              onBack={() => dispatch({ type: 'SET_DETAILS_VIEW', show: false })}
              onAllocatePayment={() => {
                dispatch({
                  type: 'OPEN_ALLOCATION_MODAL',
                  customerId: parseInt(selectedParty.party_id),
                  customerName: selectedParty.party_name
                });
              }}
            />
          </div>
        </div>

        {/* Payment Allocation Modal */}
        {allocationModal.isOpen && allocationModal.customerId && (
          <PaymentAllocationModal
            isOpen={allocationModal.isOpen}
            onClose={() => dispatch({ type: 'CLOSE_ALLOCATION_MODAL' })}
            customerId={allocationModal.customerId}
            customerName={allocationModal.customerName}
            invoices={(selectedParty?.invoices || []) as any}
            onAllocationComplete={() => {
              refetch();
              dispatch({ type: 'CLOSE_ALLOCATION_MODAL' });
            }}
          />
        )}
      </div>
    );
  }

  // Main summary view
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
                label: ui.viewMode === 'summary' ? "View Aging Analysis" : "View Summary",
                onClick: () => dispatch({ type: 'SET_VIEW_MODE', mode: ui.viewMode === 'summary' ? 'aging' : 'summary' }),
                variant: ui.viewMode === 'aging' ? "primary" : "secondary",
                icon: ui.viewMode === 'summary' ? BarChart3 : Table,
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
              {/* Summary Bar */}
              <OutstandingSummaryBar
                summary={summary}
                totalAdvances={data?.total_advances || 0}
                netPosition={data?.net_position || 0}
                partyType={partyType}
              />

              {/* Filters */}
              <OutstandingFilters
                status={filters.status}
                searchQuery={filters.searchQuery}
                viewMode={ui.viewMode}
                onStatusChange={(status) => dispatch({ type: 'SET_FILTERS', filters: { status } })}
                onSearchChange={(searchQuery) => dispatch({ type: 'SET_FILTERS', filters: { searchQuery } })}
                onViewModeChange={(mode) => dispatch({ type: 'SET_VIEW_MODE', mode })}
                onExport={handleExport}
                onRefresh={() => refetch()}
              />

              {/* Table or Aging View */}
              {ui.viewMode === 'summary' && (
                <>
                  {isLoading ? (
                    <div className="bg-white rounded-lg shadow-sm p-8 text-center">
                      <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4 text-blue-600" />
                      <p className="text-gray-600">Loading outstanding data...</p>
                    </div>
                  ) : error ? (
                    <div className="bg-white rounded-lg shadow-sm p-8 text-center">
                      <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
                      <p className="text-red-600">Failed to load outstanding data</p>
                      <button
                        onClick={() => refetch()}
                        className="mt-4 px-4 py-2 bg-red-100 text-red-700 rounded-md hover:bg-red-200"
                      >
                        Retry
                      </button>
                    </div>
                  ) : (
                    <OutstandingTable
                      parties={filteredParties}
                      expandedParties={state.expandedParties}
                      partyType={partyType}
                      onToggleExpand={(partyId) => dispatch({ type: 'TOGGLE_PARTY_EXPANSION', partyId })}
                      onPartyClick={handlePartyClick}
                      onAllocateClick={handleAllocateClick}
                    />
                  )}
                </>
              )}

              {/* Aging Analysis View (simplified for now) */}
              {ui.viewMode === 'aging' && (
                <div className="bg-white rounded-lg shadow-sm p-6">
                  <h3 className="text-lg font-semibold mb-4">Aging Analysis</h3>
                  <p className="text-gray-500">Detailed aging analysis view coming soon</p>
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