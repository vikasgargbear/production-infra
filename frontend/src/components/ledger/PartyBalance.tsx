/**
 * PartyBalance Component
 * Displays party-wise balance summary with drill-down capabilities
 */

import React, { useState, useMemo } from 'react';
import { useQuery } from 'react-query';
import {
  TrendingUp,
  TrendingDown,
  Users,
  Building,
  Search,
  Filter,
  Download,
  ChevronRight,
  AlertCircle,
  CheckCircle,
  DollarSign
} from 'lucide-react';
import { ledgerApi } from '../../services/api/modules/ledger.api';
import { DataTable, StatusBadge, Select } from '../global';
import { formatCurrency } from '../../utils/formatters';
import { useNavigate } from 'react-router-dom';

interface PartyBalanceProps {
  partyType?: 'customer' | 'supplier' | 'all';
  embedded?: boolean;
  onPartyClick?: (party: PartyBalanceItem) => void;
}

interface PartyBalanceItem {
  party_id: string;
  party_name: string;
  party_type: 'customer' | 'supplier';
  party_code: string;
  contact_phone: string;
  contact_email: string;
  opening_balance: number;
  debit_total: number;
  credit_total: number;
  closing_balance: number;
  outstanding_invoices: number;
  overdue_amount: number;
  credit_limit?: number;
  credit_utilization?: number;
  last_transaction_date?: string;
  status: 'active' | 'inactive' | 'blocked';
  risk_level?: 'low' | 'medium' | 'high';
}

interface BalanceSummary {
  total_receivable: number;
  total_payable: number;
  net_balance: number;
  active_parties: number;
  parties_with_balance: number;
  high_risk_parties: number;
}

const PartyBalance: React.FC<PartyBalanceProps> = ({
  partyType = 'all',
  embedded = false,
  onPartyClick
}) => {
  const navigate = useNavigate();
  const [filters, setFilters] = useState({
    balanceType: 'all', // all, receivable, payable, zero
    status: 'all',
    riskLevel: 'all',
    searchQuery: '',
    sortBy: 'balance',
    sortOrder: 'desc'
  });

  // Fetch party balances
  const { data, isLoading } = useQuery(
    ['party-balances', partyType, filters],
    () => ledgerApi.getPartyBalances({
      party_type: partyType !== 'all' ? partyType : undefined,
      balance_type: filters.balanceType !== 'all' ? filters.balanceType : undefined,
      status: filters.status !== 'all' ? filters.status : undefined,
      risk_level: filters.riskLevel !== 'all' ? filters.riskLevel : undefined,
      sort_by: filters.sortBy,
      sort_order: filters.sortOrder
    }),
    {
      keepPreviousData: true
    }
  );

  const parties = data?.parties || [];
  const summary: BalanceSummary = data?.summary || {
    total_receivable: 0,
    total_payable: 0,
    net_balance: 0,
    active_parties: 0,
    parties_with_balance: 0,
    high_risk_parties: 0
  };

  // Filter parties based on search
  const filteredParties = useMemo(() => {
    if (!filters.searchQuery) return parties;
    
    const query = filters.searchQuery.toLowerCase();
    return parties.filter((party: PartyBalanceItem) =>
      party.party_name.toLowerCase().includes(query) ||
      party.party_code.toLowerCase().includes(query) ||
      party.contact_phone.includes(query)
    );
  }, [parties, filters.searchQuery]);

  const handlePartyClick = (party: PartyBalanceItem) => {
    if (onPartyClick) {
      onPartyClick(party);
    } else {
      navigate(`/ledger/party/${party.party_id}`);
    }
  };

  const handleExport = async () => {
    try {
      const response = await ledgerApi.exportPartyBalances({
        party_type: partyType !== 'all' ? partyType : undefined,
        format: 'excel'
      });
      
      const blob = new Blob([response.data], {
        type: 'application/vnd.ms-excel'
      });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `party-balances-${new Date().toISOString().split('T')[0]}.xlsx`;
      link.click();
    } catch (error) {
      console.error('Export failed:', error);
    }
  };

  const getRiskLevelColor = (level?: string) => {
    switch (level) {
      case 'low': return 'green';
      case 'medium': return 'yellow';
      case 'high': return 'red';
      default: return 'gray';
    }
  };

  const columns = [
    {
      key: 'party',
      label: 'Party Details',
      render: (party: PartyBalanceItem) => (
        <div 
          className="cursor-pointer hover:text-blue-600"
          onClick={() => handlePartyClick(party)}
        >
          <div className="flex items-center gap-2">
            {party.party_type === 'customer' ? (
              <Users className="h-4 w-4 text-blue-600" />
            ) : (
              <Building className="h-4 w-4 text-green-600" />
            )}
            <div>
              <div className="font-medium">{party.party_name}</div>
              <div className="text-sm text-gray-500">
                {party.party_code} • {party.contact_phone}
              </div>
            </div>
          </div>
        </div>
      )
    },
    {
      key: 'type',
      label: 'Type',
      render: (party: PartyBalanceItem) => (
        <StatusBadge
          status={party.party_type}
          color={party.party_type === 'customer' ? 'blue' : 'green'}
          label={party.party_type.toUpperCase()}
        />
      )
    },
    {
      key: 'opening',
      label: 'Opening Balance',
      align: 'right' as const,
      render: (party: PartyBalanceItem) => (
        <span className={party.opening_balance < 0 ? 'text-red-600' : ''}>
          {formatCurrency(Math.abs(party.opening_balance))}
          {party.opening_balance < 0 && ' (Dr)'}
        </span>
      )
    },
    {
      key: 'transactions',
      label: 'Period Activity',
      render: (party: PartyBalanceItem) => (
        <div className="text-right">
          <div className="text-sm">
            <span className="text-red-600">Dr: {formatCurrency(party.debit_total)}</span>
          </div>
          <div className="text-sm">
            <span className="text-green-600">Cr: {formatCurrency(party.credit_total)}</span>
          </div>
        </div>
      )
    },
    {
      key: 'closing',
      label: 'Closing Balance',
      align: 'right' as const,
      render: (party: PartyBalanceItem) => (
        <div>
          <div className={`font-semibold ${party.closing_balance < 0 ? 'text-red-600' : 'text-green-600'}`}>
            {formatCurrency(Math.abs(party.closing_balance))}
          </div>
          <div className="text-sm text-gray-500">
            {party.closing_balance < 0 ? 'Payable' : party.closing_balance > 0 ? 'Receivable' : 'Settled'}
          </div>
        </div>
      )
    },
    {
      key: 'outstanding',
      label: 'Outstanding',
      render: (party: PartyBalanceItem) => (
        <div className="text-right">
          <div className="font-medium">
            {formatCurrency(party.outstanding_invoices)}
          </div>
          {party.overdue_amount > 0 && (
            <div className="text-sm text-red-600 flex items-center justify-end gap-1">
              <AlertCircle className="h-3 w-3" />
              Overdue: {formatCurrency(party.overdue_amount)}
            </div>
          )}
        </div>
      )
    },
    {
      key: 'credit',
      label: 'Credit Status',
      render: (party: PartyBalanceItem) => (
        <div>
          {party.credit_limit ? (
            <div>
              <div className="text-sm">
                Limit: {formatCurrency(party.credit_limit)}
              </div>
              <div className="mt-1">
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className={`h-2 rounded-full ${
                      (party.credit_utilization || 0) > 80 
                        ? 'bg-red-600' 
                        : (party.credit_utilization || 0) > 60 
                          ? 'bg-yellow-600' 
                          : 'bg-green-600'
                    }`}
                    style={{ width: `${Math.min(party.credit_utilization || 0, 100)}%` }}
                  />
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  {party.credit_utilization?.toFixed(0)}% used
                </div>
              </div>
            </div>
          ) : (
            <span className="text-sm text-gray-400">No limit</span>
          )}
        </div>
      )
    },
    {
      key: 'risk',
      label: 'Risk',
      render: (party: PartyBalanceItem) => (
        <div className="flex items-center gap-2">
          {party.risk_level && (
            <StatusBadge
              status={party.risk_level}
              color={getRiskLevelColor(party.risk_level)}
              label={party.risk_level.toUpperCase()}
            />
          )}
          {party.status !== 'active' && (
            <StatusBadge
              status={party.status}
              color={party.status === 'blocked' ? 'red' : 'gray'}
              label={party.status.toUpperCase()}
            />
          )}
        </div>
      )
    },
    {
      key: 'action',
      label: '',
      render: (party: PartyBalanceItem) => (
        <button
          onClick={() => handlePartyClick(party)}
          className="text-blue-600 hover:text-blue-800"
        >
          <ChevronRight className="h-5 w-5" />
        </button>
      )
    }
  ];

  return (
    <div className={embedded ? '' : 'p-6'}>
      {/* Header */}
      {!embedded && (
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-800">Party Balances</h1>
          <p className="text-gray-600">Overview of all party account balances</p>
        </div>
      )}

      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="bg-white p-4 rounded-lg shadow">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Total Receivable</p>
              <p className="text-2xl font-bold text-green-600">
                {formatCurrency(summary.total_receivable)}
              </p>
            </div>
            <TrendingUp className="h-10 w-10 text-green-400" />
          </div>
        </div>

        <div className="bg-white p-4 rounded-lg shadow">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Total Payable</p>
              <p className="text-2xl font-bold text-red-600">
                {formatCurrency(summary.total_payable)}
              </p>
            </div>
            <TrendingDown className="h-10 w-10 text-red-400" />
          </div>
        </div>

        <div className="bg-white p-4 rounded-lg shadow">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Net Balance</p>
              <p className={`text-2xl font-bold ${
                summary.net_balance >= 0 ? 'text-green-600' : 'text-red-600'
              }`}>
                {formatCurrency(Math.abs(summary.net_balance))}
              </p>
            </div>
            <DollarSign className="h-10 w-10 text-gray-400" />
          </div>
        </div>

        <div className="bg-white p-4 rounded-lg shadow">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Active Parties</p>
              <p className="text-2xl font-bold text-gray-800">
                {summary.active_parties}
              </p>
              <p className="text-sm text-red-500">
                {summary.high_risk_parties} high risk
              </p>
            </div>
            <Users className="h-10 w-10 text-gray-400" />
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="mb-6 bg-white p-4 rounded-lg shadow">
        <div className="flex flex-wrap gap-4">
          {partyType === 'all' && (
            <div className="min-w-[150px]">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Party Type
              </label>
              <Select
                value={partyType}
                onChange={(value) => setFilters({ ...filters, balanceType: value })}
                options={[
                  { value: 'all', label: 'All Types' },
                  { value: 'customer', label: 'Customers' },
                  { value: 'supplier', label: 'Suppliers' }
                ]}
              />
            </div>
          )}

          <div className="min-w-[150px]">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Balance Type
            </label>
            <Select
              value={filters.balanceType}
              onChange={(value) => setFilters({ ...filters, balanceType: value })}
              options={[
                { value: 'all', label: 'All Balances' },
                { value: 'receivable', label: 'Receivable' },
                { value: 'payable', label: 'Payable' },
                { value: 'zero', label: 'Zero Balance' }
              ]}
            />
          </div>

          <div className="min-w-[150px]">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Status
            </label>
            <Select
              value={filters.status}
              onChange={(value) => setFilters({ ...filters, status: value })}
              options={[
                { value: 'all', label: 'All Status' },
                { value: 'active', label: 'Active' },
                { value: 'inactive', label: 'Inactive' },
                { value: 'blocked', label: 'Blocked' }
              ]}
            />
          </div>

          <div className="min-w-[150px]">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Risk Level
            </label>
            <Select
              value={filters.riskLevel}
              onChange={(value) => setFilters({ ...filters, riskLevel: value })}
              options={[
                { value: 'all', label: 'All Levels' },
                { value: 'low', label: 'Low Risk' },
                { value: 'medium', label: 'Medium Risk' },
                { value: 'high', label: 'High Risk' }
              ]}
            />
          </div>

          <div className="flex-1 min-w-[250px]">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Search
            </label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-5 w-5" />
              <input
                type="text"
                value={filters.searchQuery}
                onChange={(e) => setFilters({ ...filters, searchQuery: e.target.value })}
                placeholder="Search by name, code or phone..."
                className="pl-10 pr-4 py-2 w-full border rounded-md"
              />
            </div>
          </div>

          <div className="flex items-end">
            <button
              onClick={handleExport}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 flex items-center gap-2"
            >
              <Download className="h-4 w-4" />
              Export
            </button>
          </div>
        </div>
      </div>

      {/* Party Balance Table */}
      <div className="bg-white rounded-lg shadow">
        <DataTable
          columns={columns}
          data={filteredParties}
          loading={isLoading}
          emptyMessage="No parties found"
        />
      </div>
    </div>
  );
};

export default PartyBalance;