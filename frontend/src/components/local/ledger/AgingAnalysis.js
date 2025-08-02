import React, { useState, useEffect } from 'react';
import {
  Clock, Users, TrendingUp, AlertTriangle, DollarSign,
  Search, Filter, Download, Eye, X, RefreshCw,
  Calendar, BarChart3, PieChart
} from 'lucide-react';
import { ledgerApi } from '../../services/api/modules/ledger.api';
import { formatCurrency, formatDate } from '../../utils/formatters';
import { DataTable, StatusBadge, Select, SummaryCard } from '../global';

const AgingAnalysis = ({ open = true, onClose }) => {
  const [loading, setLoading] = useState(true);
  const [agingData, setAgingData] = useState([]);
  const [filteredData, setFilteredData] = useState([]);
  const [partyType, setPartyType] = useState('customer');
  const [searchQuery, setSearchQuery] = useState('');
  const [minAmountFilter, setMinAmountFilter] = useState('');
  const [showFilters, setShowFilters] = useState(false);
  const [summary, setSummary] = useState({
    totalParties: 0,
    totalOutstanding: 0,
    overdueAmount: 0,
    averageAge: 0
  });
  const [agingSummary, setAgingSummary] = useState({
    current: 0,
    days0to30: 0,
    days31to60: 0,
    days61to90: 0,
    days91to120: 0,
    daysOver120: 0
  });

  useEffect(() => {
    loadAgingAnalysis();
  }, [partyType]);

  useEffect(() => {
    filterData();
  }, [agingData, searchQuery, minAmountFilter]);

  const loadAgingAnalysis = async () => {
    setLoading(true);
    try {
      const response = await ledgerApi.getAgingAnalysis(partyType, {
        limit: 500,
        sortBy: 'total_outstanding',
        sortOrder: 'desc'
      });
      
      const analysisData = response.data.aging_analysis || [];
      setAgingData(analysisData);
      
      // Calculate summary
      const summary = analysisData.reduce((acc, party) => {
        acc.totalParties++;
        acc.totalOutstanding += party.total_outstanding;
        
        // Calculate overdue (anything beyond current)
        acc.overdueAmount += (party.days_31_to_60 + party.days_61_to_90 + 
                             party.days_91_to_120 + party.days_over_120);
        
        return acc;
      }, {
        totalParties: 0,
        totalOutstanding: 0,
        overdueAmount: 0,
        averageAge: 0
      });
      
      // Calculate aging buckets summary
      const agingSummary = analysisData.reduce((acc, party) => {
        acc.current += party.current || 0;
        acc.days0to30 += party.days_0_to_30 || 0;
        acc.days31to60 += party.days_31_to_60 || 0;
        acc.days61to90 += party.days_61_to_90 || 0;
        acc.days91to120 += party.days_91_to_120 || 0;
        acc.daysOver120 += party.days_over_120 || 0;
        return acc;
      }, {
        current: 0,
        days0to30: 0,
        days31to60: 0,
        days61to90: 0,
        days91to120: 0,
        daysOver120: 0
      });
      
      setSummary(summary);
      setAgingSummary(agingSummary);
    } catch (error) {
      console.error('Error loading aging analysis:', error);
      setAgingData([]);
      setSummary({
        totalParties: 0,
        totalOutstanding: 0,
        overdueAmount: 0,
        averageAge: 0
      });
      setAgingSummary({
        current: 0,
        days0to30: 0,
        days31to60: 0,
        days61to90: 0,
        days91to120: 0,
        daysOver120: 0
      });
    } finally {
      setLoading(false);
    }
  };

  const filterData = () => {
    let filtered = [...agingData];

    // Search filter
    if (searchQuery) {
      filtered = filtered.filter(party =>
        party.party_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (party.phone && party.phone.includes(searchQuery))
      );
    }

    // Minimum amount filter
    if (minAmountFilter) {
      const minAmount = parseFloat(minAmountFilter);
      filtered = filtered.filter(party => party.total_outstanding >= minAmount);
    }

    // Sort by total outstanding (highest first)
    filtered.sort((a, b) => b.total_outstanding - a.total_outstanding);

    setFilteredData(filtered);
  };

  const handleExportAnalysis = async () => {
    try {
      const response = await ledgerApi.exportAgingAnalysis(partyType, 'excel');
      
      // Create download link
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.download = `aging_analysis_${partyType}_${new Date().toISOString().split('T')[0]}.xlsx`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
      
      alert(`Successfully exported aging analysis for ${filteredData.length} ${partyType}s`);
    } catch (error) {
      console.error('Export error:', error);
      alert('Failed to export data. Please try again.');
    }
  };

  const getAgingStatusColor = (daysOverdue) => {
    if (daysOverdue <= 0) return 'green';
    if (daysOverdue <= 30) return 'yellow';
    if (daysOverdue <= 60) return 'orange';
    if (daysOverdue <= 90) return 'red';
    return 'red';
  };

  const AgingBarChart = ({ party }) => {
    const total = party.total_outstanding;
    const buckets = [
      { label: 'Current', amount: party.current, color: 'bg-green-500' },
      { label: '0-30', amount: party.days_0_to_30, color: 'bg-yellow-500' },
      { label: '31-60', amount: party.days_31_to_60, color: 'bg-orange-500' },
      { label: '61-90', amount: party.days_61_to_90, color: 'bg-red-500' },
      { label: '91-120', amount: party.days_91_to_120, color: 'bg-red-600' },
      { label: '>120', amount: party.days_over_120, color: 'bg-red-800' }
    ];

    return (
      <div className="w-full">
        <div className="flex h-4 rounded overflow-hidden">
          {buckets.map((bucket, index) => {
            const percentage = total > 0 ? (bucket.amount / total) * 100 : 0;
            return percentage > 0 ? (
              <div
                key={index}
                className={bucket.color}
                style={{ width: `${percentage}%` }}
                title={`${bucket.label}: ${formatCurrency(bucket.amount)}`}
              />
            ) : null;
          })}
        </div>
        <div className="grid grid-cols-6 gap-1 mt-2 text-xs">
          {buckets.map((bucket, index) => (
            <div key={index} className="text-center">
              <div className={`w-3 h-3 ${bucket.color} rounded mx-auto mb-1`}></div>
              <div className="text-gray-600">{bucket.label}</div>
              <div className="font-medium">{formatCurrency(bucket.amount)}</div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const columns = [
    {
      header: 'Party Details',
      field: 'party_name',
      render: (row) => (
        <div>
          <div className="font-medium text-gray-900">{row.party_name}</div>
          {row.phone && (
            <div className="text-sm text-gray-500">📞 {row.phone}</div>
          )}
          <div className="text-sm text-gray-500">
            Bills: {row.total_bills} • Last: {row.last_transaction_date && formatDate(row.last_transaction_date)}
          </div>
        </div>
      )
    },
    {
      header: 'Total Outstanding',
      field: 'total_outstanding',
      render: (row) => (
        <div className="text-right">
          <div className="text-lg font-bold text-red-600">
            {formatCurrency(row.total_outstanding)}
          </div>
          <div className="text-sm text-gray-500">
            {row.total_bills} bills
          </div>
        </div>
      )
    },
    {
      header: 'Aging Breakdown',
      field: 'aging_breakdown',
      render: (row) => (
        <div className="min-w-80">
          <AgingBarChart party={row} />
        </div>
      )
    },
    {
      header: 'Risk Level',
      field: 'average_days_overdue',
      render: (row) => {
        const avgDays = row.average_days_overdue || 0;
        const riskLevel = avgDays <= 30 ? 'Low' : avgDays <= 60 ? 'Medium' : 'High';
        const riskColor = avgDays <= 30 ? 'green' : avgDays <= 60 ? 'yellow' : 'red';
        
        return (
          <div className="text-center">
            <StatusBadge
              status={riskLevel}
              color={riskColor}
            />
            <div className="text-sm text-gray-500 mt-1">
              Avg: {Math.round(avgDays)} days
            </div>
          </div>
        );
      }
    }
  ];

  if (!open) return null;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="bg-white shadow-sm border-b border-gray-200 flex-shrink-0">
        <div className="px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between py-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Aging Analysis</h1>
              <p className="text-sm text-gray-600">Detailed overdue analysis by aging buckets</p>
            </div>
            
            <div className="flex items-center space-x-3">
              <button
                onClick={handleExportAnalysis}
                className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                <Download className="w-4 h-4" />
                <span>Export Excel</span>
              </button>
              
              <button
                onClick={loadAgingAnalysis}
                className="p-2 text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded-lg"
                title="Refresh"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              </button>
              
              <button
                onClick={onClose}
                className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto bg-gray-50">
        <div className="px-4 sm:px-6 lg:px-8 py-6">
          
          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <SummaryCard
              title="Total Parties"
              value={summary.totalParties}
              icon={Users}
              color="blue"
            />

            <SummaryCard
              title="Total Outstanding"
              value={formatCurrency(summary.totalOutstanding)}
              icon={DollarSign}
              color="amber"
            />

            <SummaryCard
              title="Overdue Amount"
              value={formatCurrency(summary.overdueAmount)}
              icon={AlertTriangle}
              color="red"
              subtitle="Beyond current"
            />

            <SummaryCard
              title="Risk Exposure"
              value={`${((summary.overdueAmount / summary.totalOutstanding) * 100 || 0).toFixed(1)}%`}
              icon={TrendingUp}
              color="purple"
              subtitle="Overdue ratio"
            />
          </div>

          {/* Aging Buckets Summary */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">Aging Buckets Overview</h3>
            <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
              <div className="text-center p-4 bg-green-50 rounded-lg">
                <div className="w-4 h-4 bg-green-500 rounded mx-auto mb-2"></div>
                <div className="text-sm font-medium text-gray-700">Current</div>
                <div className="text-lg font-bold text-green-600">{formatCurrency(agingSummary.current)}</div>
              </div>
              
              <div className="text-center p-4 bg-yellow-50 rounded-lg">
                <div className="w-4 h-4 bg-yellow-500 rounded mx-auto mb-2"></div>
                <div className="text-sm font-medium text-gray-700">0-30 Days</div>
                <div className="text-lg font-bold text-yellow-600">{formatCurrency(agingSummary.days0to30)}</div>
              </div>
              
              <div className="text-center p-4 bg-orange-50 rounded-lg">
                <div className="w-4 h-4 bg-orange-500 rounded mx-auto mb-2"></div>
                <div className="text-sm font-medium text-gray-700">31-60 Days</div>
                <div className="text-lg font-bold text-orange-600">{formatCurrency(agingSummary.days31to60)}</div>
              </div>
              
              <div className="text-center p-4 bg-red-50 rounded-lg">
                <div className="w-4 h-4 bg-red-500 rounded mx-auto mb-2"></div>
                <div className="text-sm font-medium text-gray-700">61-90 Days</div>
                <div className="text-lg font-bold text-red-600">{formatCurrency(agingSummary.days61to90)}</div>
              </div>
              
              <div className="text-center p-4 bg-red-50 rounded-lg">
                <div className="w-4 h-4 bg-red-600 rounded mx-auto mb-2"></div>
                <div className="text-sm font-medium text-gray-700">91-120 Days</div>
                <div className="text-lg font-bold text-red-700">{formatCurrency(agingSummary.days91to120)}</div>
              </div>
              
              <div className="text-center p-4 bg-red-50 rounded-lg">
                <div className="w-4 h-4 bg-red-800 rounded mx-auto mb-2"></div>
                <div className="text-sm font-medium text-gray-700">>120 Days</div>
                <div className="text-lg font-bold text-red-800">{formatCurrency(agingSummary.daysOver120)}</div>
              </div>
            </div>
          </div>

          {/* Filters */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-medium text-gray-900">Filters</h3>
              <button
                onClick={() => setShowFilters(!showFilters)}
                className="flex items-center space-x-2 text-sm text-gray-600 hover:text-gray-800"
              >
                <Filter className="w-4 h-4" />
                <span>{showFilters ? 'Hide' : 'Show'} Filters</span>
              </button>
            </div>

            <div className={`grid grid-cols-1 md:grid-cols-3 gap-4 ${showFilters ? '' : 'hidden'}`}>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Party Type
                </label>
                <Select
                  value={partyType}
                  onChange={setPartyType}
                  options={[
                    { value: 'customer', label: 'Customers' },
                    { value: 'supplier', label: 'Suppliers' }
                  ]}
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Minimum Amount
                </label>
                <input
                  type="number"
                  value={minAmountFilter}
                  onChange={(e) => setMinAmountFilter(e.target.value)}
                  placeholder="0"
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Search Party
                </label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-4 h-4" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search by name or phone..."
                    className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Aging Analysis Table */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200">
            {loading ? (
              <div className="flex items-center justify-center h-64">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
              </div>
            ) : filteredData.length > 0 ? (
              <DataTable
                columns={columns}
                data={filteredData}
                emptyMessage="No aging data found"
              />
            ) : (
              <div className="text-center py-12">
                <Clock className="w-12 h-12 text-gray-400 mx-auto mb-3" />
                <p className="text-gray-600">No aging data found</p>
                <p className="text-sm text-gray-500 mt-1">
                  {searchQuery || minAmountFilter 
                    ? 'Try adjusting your filters' 
                    : `No ${partyType}s have outstanding amounts`}
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default AgingAnalysis;