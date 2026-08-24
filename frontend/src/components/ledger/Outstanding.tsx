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
import { formatExactCurrency } from '../../utils/exactDecimal';

// Import extracted components
import { OutstandingSummaryBar } from './outstanding/components/OutstandingSummaryBar';
import { OutstandingFilters } from './outstanding/components/OutstandingFilters';
import { OutstandingTable } from './outstanding/components/OutstandingTable';
import { PartyDetailsView } from './outstanding/components/PartyDetailsView';

// Import hooks and types
import { useOutstandingState } from './outstanding/hooks/useOutstandingState';
import type { OutstandingProps, PartyOutstanding } from './outstanding/types/outstanding.types';
import { hasPositiveMoney, projectCanonicalLedger } from './outstanding/canonicalLedgerProjection';

const Outstanding: React.FC<OutstandingProps> = ({
  partyType = 'customer',
  embedded = false,
  onClose,
  initialCustomerId,
  onCustomerChange
}) => {
  // Use centralized state management (replaces 7 useState!)
  const { state, dispatch, filters, ui, selectedParty } = useOutstandingState();
  const [exportFeedback, setExportFeedback] = React.useState<{ type: 'info' | 'error'; message: string } | null>(null);

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
        const { parties, summary } = projectCanonicalLedger(responseData);

        return {
          parties,
          summary,
          total_advances: '0.00',
          net_position: '0.00',
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
    total_receivable: '0.00',
    total_payable: '0.00',
    total_overdue: '0.00',
    party_count: 0,
    overdue_party_count: 0,
    aging_summary: {
      current: { count: 0, amount: '0.00' },
      '1-30': { count: 0, amount: '0.00' },
      '31-60': { count: 0, amount: '0.00' },
      '61-90': { count: 0, amount: '0.00' },
      over_90: { count: 0, amount: '0.00' }
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
      filtered = filtered.filter((party: PartyOutstanding) => hasPositiveMoney(party.total_overdue, 'Party overdue'));
    } else if (filters.status === 'current') {
      filtered = filtered.filter((party: PartyOutstanding) => !hasPositiveMoney(party.total_overdue, 'Party overdue'));
    } else if (filters.status === 'net-outstanding') {
      filtered = filtered.filter((party: PartyOutstanding) => hasPositiveMoney(party.total_outstanding, 'Party outstanding'));
    }

    return filtered;
  }, [parties, filters]);

  // Event handlers
  const handlePartyClick = (party: PartyOutstanding) => {
    dispatch({ type: 'SET_SELECTED_PARTY', party });
    dispatch({ type: 'SET_DETAILS_VIEW', show: true });
  };

  const handleExport = () => {
    setExportFeedback(null);
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
        setExportFeedback({ type: 'info', message: 'There is no outstanding data to export for the current filters.' });
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
      setExportFeedback({ type: 'error', message: 'Outstanding export failed. No file was downloaded.' });
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
                    totalAdvances={data?.total_advances || '0.00'}
                    netPosition={data?.net_position || '0.00'}
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

                  {exportFeedback && (
                    <p
                      role={exportFeedback.type === 'error' ? 'alert' : 'status'}
                      className={`mb-4 rounded-md border px-4 py-3 text-sm ${exportFeedback.type === 'error'
                        ? 'border-red-200 bg-red-50 text-red-700'
                        : 'border-blue-200 bg-blue-50 text-blue-800'
                        }`}
                    >
                      {exportFeedback.message}
                    </p>
                  )}

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
                      return (
                        <div key={key} className="rounded-lg border border-gray-200 p-4">
                          <div className="text-sm font-medium text-gray-600">{label}</div>
                          <div className="mt-2 text-xl font-semibold text-gray-900">{formatExactCurrency(bucket.amount, `${label} outstanding`)}</div>
                          <div className="mt-1 text-xs text-gray-500">{bucket.count} {bucket.count === 1 ? 'party' : 'parties'}</div>
                          <div className={`mt-3 h-1.5 rounded-full ${color}`} aria-hidden="true" />
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
