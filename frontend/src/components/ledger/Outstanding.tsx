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
import { useQuery } from '@tanstack/react-query';
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
  onClose,
  initialCustomerId,
  onCustomerChange
}) => {
  // Use centralized state management (replaces 7 useState!)
  const { state, dispatch, filters, ui, selectedParty, allocationModal } = useOutstandingState();

  // Auto-expand customer when navigating from Collection Center
  React.useEffect(() => {
    if (initialCustomerId) {
      dispatch({ type: 'TOGGLE_EXPAND', payload: initialCustomerId });
      // Clear the initial customer after expanding
      onCustomerChange?.();
    }
  }, [initialCustomerId]);

  // Fetch outstanding data using the ledger aging API (works on production)
  const { data, isLoading, refetch, error } = useQuery({
    queryKey: ['outstanding-data', partyType, filters],
    queryFn: async () => {
      try {
        // Use the ledger/aging endpoint which returns party-level outstanding with aging
        const response = await apiClient.get('/ledger/aging', {
          params: { party_type: partyType }
        });

        const responseData = response.data || {};
        const agingData = responseData.aging_data || [];
        const summaryData = responseData.summary || {};

        // Transform aging_data to PartyOutstanding format
        const parties: PartyOutstanding[] = agingData.map((party: any) => ({
          party_id: String(party.customer_id || party.supplier_id || party.party_id),
          party_name: party.customer_name || party.supplier_name || party.party_name || 'Unknown',
          party_phone: party.phone || party.primary_phone || '',
          party_email: party.email || party.primary_email || '',
          total_outstanding: parseFloat(party.total_outstanding || party.total_payable || 0),
          total_advance: parseFloat(party.advance || 0),
          customer_net_position: parseFloat(party.net_balance || party.total_outstanding || 0),
          total_overdue: parseFloat(party.overdue_amount || party.overdue || 0),
          invoice_count: parseInt(party.pending_invoices || party.invoice_count || 0),
          overdue_count: parseInt(party.overdue_invoices || 0),
          oldest_invoice_days: parseInt(party.max_overdue_days || party.oldest_invoice_days || 0),
          credit_limit: parseFloat(party.credit_limit || 0),
          credit_utilization: parseFloat(party.credit_utilization || 0),
          invoices: [] // Invoice details would need separate API call
        }));

        // Build summary from response
        const summary: OutstandingSummary = {
          total_receivable: parseFloat(summaryData.total || summaryData.total_receivable || 0),
          total_payable: parseFloat(summaryData.total_payable || 0),
          total_overdue: parseFloat(summaryData.overdue || summaryData.total_overdue || 0),
          party_count: parseInt(summaryData.party_count || parties.length),
          overdue_party_count: parties.filter(p => p.total_overdue > 0).length,
          aging_summary: {
            current: {
              count: parties.filter(p => p.oldest_invoice_days <= 0).length,
              amount: parseFloat(summaryData.current || 0)
            },
            '1-30': {
              count: parties.filter(p => p.oldest_invoice_days > 0 && p.oldest_invoice_days <= 30).length,
              amount: parseFloat(summaryData['1_30'] || summaryData.bucket_1_30 || 0)
            },
            '31-60': {
              count: parties.filter(p => p.oldest_invoice_days > 30 && p.oldest_invoice_days <= 60).length,
              amount: parseFloat(summaryData['31_60'] || summaryData.bucket_31_60 || 0)
            },
            '61-90': {
              count: parties.filter(p => p.oldest_invoice_days > 60 && p.oldest_invoice_days <= 90).length,
              amount: parseFloat(summaryData['61_90'] || summaryData.bucket_61_90 || 0)
            },
            over_90: {
              count: parties.filter(p => p.oldest_invoice_days > 90).length,
              amount: parseFloat(summaryData['over_90'] || summaryData.bucket_90_plus || 0)
            }
          }
        };

        return {
          parties,
          summary,
          total_advances: 0,
          net_position: 0,
          customer_advances: {}
        };
      } catch (err) {
        console.error('Outstanding API error:', err);
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
    placeholderData: (previousData) => previousData,
    enabled: partyType === 'customer',
    retry: 1
  });

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
              iconColor="text-amber-600"
              onClose={onClose}
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
      <div className="h-full bg-gray-100">
        <div className="h-full flex flex-col">
          <ModuleHeader
            title={`${selectedParty.party_name} - Outstanding`}
            documentNumber=""
            status=""
            icon={IndianRupee}
            iconColor="text-amber-600"
            onClose={() => dispatch({ type: 'SET_DETAILS_VIEW', show: false })}
            onSaveDraft={() => { }}
            additionalActions={[
              {
                label: "Back",
                onClick: () => dispatch({ type: 'SET_DETAILS_VIEW', show: false }),
                variant: "secondary"
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

  return (
    <div className={embedded ? 'p-6' : 'h-full bg-gray-100'}>
      {!embedded && (
        <div className="h-full flex flex-col">
          <ModuleHeader
            title="Outstanding & Aging"
            documentNumber=""
            status=""
            icon={IndianRupee}
            iconColor="text-amber-600"
            onClose={onClose}
            onSaveDraft={() => { }}
            additionalActions={[
              {
                label: "Refresh",
                onClick: () => refetch(),
                variant: "primary"
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