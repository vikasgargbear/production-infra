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
  IndianRupee,
  AlertCircle,
  Loader2
} from 'lucide-react';
import apiClient from '../../services/api/apiClient';
import { ModuleHeader } from '../global';
import { formatCurrency } from '../../utils/formatters';

// Import extracted components
import { OutstandingSummaryBar } from './outstanding/components/OutstandingSummaryBar';
import { OutstandingFilters } from './outstanding/components/OutstandingFilters';
import { OutstandingTable } from './outstanding/components/OutstandingTable';
import { PartyDetailsView } from './outstanding/components/PartyDetailsView';

// Import hooks and types
import { useOutstandingState } from './outstanding/hooks/useOutstandingState';
import type { OutstandingProps, PartyOutstanding, OutstandingSummary } from './outstanding/types/outstanding.types';

const Outstanding: React.FC<OutstandingProps> = ({
  partyType = 'customer',
  embedded = false,
  onClose,
  initialCustomerId,
  onCustomerChange
}) => {
  // Use centralized state management (replaces 7 useState!)
  const { state, dispatch, filters, ui, selectedParty } = useOutstandingState();

  // Auto-expand customer when navigating from Collection Center
  React.useEffect(() => {
    if (initialCustomerId) {
      dispatch({ type: 'TOGGLE_PARTY_EXPANSION', partyId: initialCustomerId });
      // Clear the initial customer after expanding
      onCustomerChange?.();
    }
  }, [dispatch, initialCustomerId, onCustomerChange]);

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
          invoices: Array.isArray(party.invoices) ? party.invoices : []
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
              count: parseInt(summaryData.current_count || 0),
              amount: parseFloat(summaryData.current || 0)
            },
            '1-30': {
              count: parseInt(summaryData['1_30_count'] || 0),
              amount: parseFloat(summaryData['1_30'] || summaryData.bucket_1_30 || 0)
            },
            '31-60': {
              count: parseInt(summaryData['31_60_count'] || 0),
              amount: parseFloat(summaryData['31_60'] || summaryData.bucket_31_60 || 0)
            },
            '61-90': {
              count: parseInt(summaryData['61_90_count'] || 0),
              amount: parseFloat(summaryData['61_90'] || summaryData.bucket_61_90 || 0)
            },
            over_90: {
              count: parseInt(summaryData['over_90_count'] || 0),
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
        throw err;
      }
    },
    placeholderData: (previousData) => previousData,
    enabled: partyType === 'customer',
    retry: 1
  });

  const parties = useMemo(() => data?.parties || [], [data?.parties]);
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
            />
          </div>
        </div>

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
              {isLoading ? (
                <div className="rounded-lg border border-gray-200 bg-white p-8 text-center">
                  <Loader2 className="mx-auto mb-4 h-8 w-8 animate-spin text-blue-600" />
                  <p className="text-gray-600">Loading outstanding data...</p>
                </div>
              ) : error ? (
                <div role="alert" className="rounded-lg border border-red-200 bg-white p-8 text-center">
                  <AlertCircle className="mx-auto mb-4 h-12 w-12 text-red-500" />
                  <p className="font-medium text-red-700">Outstanding data is unavailable</p>
                  <p className="mt-1 text-sm text-gray-600">No balances are shown because the server request failed.</p>
                  <button
                    type="button"
                    onClick={() => refetch()}
                    className="mt-4 min-h-11 rounded-md bg-blue-600 px-4 py-2 text-white hover:bg-blue-700"
                  >
                    Retry
                  </button>
                </div>
              ) : (
                <>
                  <OutstandingSummaryBar
                    summary={summary}
                    totalAdvances={data?.total_advances || 0}
                    netPosition={data?.net_position || 0}
                    partyType={partyType}
                  />

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

                  {ui.viewMode === 'summary' && (
                    <OutstandingTable
                      parties={filteredParties}
                      expandedParties={state.expandedParties}
                      partyType={partyType}
                      onToggleExpand={(partyId) => dispatch({ type: 'TOGGLE_PARTY_EXPANSION', partyId })}
                      onPartyClick={handlePartyClick}
                    />
                  )}

                  {ui.viewMode === 'aging' && (
                    <div className="rounded-lg bg-white p-4 shadow-sm sm:p-6">
                  <div className="mb-5">
                    <h3 className="text-lg font-semibold text-gray-900">Aging Analysis</h3>
                    <p className="mt-1 text-sm text-gray-500">Outstanding balances grouped by how long they have been due.</p>
                  </div>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
                    {([
                      { key: 'current', label: 'Current', color: 'bg-blue-500' },
                      { key: '1-30', label: '1–30 days', color: 'bg-cyan-500' },
                      { key: '31-60', label: '31–60 days', color: 'bg-amber-500' },
                      { key: '61-90', label: '61–90 days', color: 'bg-orange-500' },
                      { key: 'over_90', label: 'Over 90 days', color: 'bg-red-500' }
                    ] as const).map(({ key, label, color }) => {
                      const bucket = summary.aging_summary[key];
                      const percentage = summary.total_receivable > 0
                        ? Math.min(100, (bucket.amount / summary.total_receivable) * 100)
                        : 0;

                      return (
                        <div key={key} className="rounded-lg border border-gray-200 p-4">
                          <div className="text-sm font-medium text-gray-600">{label}</div>
                          <div className="mt-2 text-xl font-semibold text-gray-900">{formatCurrency(bucket.amount)}</div>
                          <div className="mt-1 text-xs text-gray-500">{bucket.count} {bucket.count === 1 ? 'party' : 'parties'}</div>
                          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-gray-100">
                            <div className={`h-full rounded-full ${color}`} style={{ width: `${percentage}%` }} />
                          </div>
                          <div className="mt-1 text-right text-xs text-gray-500">{percentage.toFixed(0)}%</div>
                        </div>
                      );
                    })}
                  </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Outstanding;
