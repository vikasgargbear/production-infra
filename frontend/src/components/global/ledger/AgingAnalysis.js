import React, { useState, useEffect } from 'react';
import { 
  TrendingUp, AlertTriangle, Users, Building2, 
  Download, Filter, BarChart3 
} from 'lucide-react';
import { partyLedgerApi } from '../../../services/api';
import { formatCurrency } from '../../../utils/formatters';

const AgingAnalysis = ({ 
  partyType = null, // null for all, 'customer', 'supplier'
  showChart = true,
  onPartySelect,
  className = '' 
}) => {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null);
  const [filter, setFilter] = useState(partyType);
  const [sortBy, setSortBy] = useState('total'); // 'total', 'overdue', 'name'

  useEffect(() => {
    fetchAgingData();
  }, [filter]);

  const fetchAgingData = async () => {
    setLoading(true);
    
    try {
      const params = filter ? { party_type: filter } : {};
      const response = await partyLedgerApi.getAgingAnalysis(params);
      setData(response.data);
    } catch (err) {
      console.error('Error fetching aging analysis:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleExport = () => {
    // TODO: Implement CSV export
    console.log('Export aging analysis');
  };

  const sortParties = (parties) => {
    return [...parties].sort((a, b) => {
      switch (sortBy) {
        case 'overdue':
          return b.max_days_overdue - a.max_days_overdue;
        case 'name':
          return a.party_name.localeCompare(b.party_name);
        default:
          return b.total_outstanding - a.total_outstanding;
      }
    });
  };

  const getAgingBarWidth = (amount, maxAmount) => {
    return maxAmount > 0 ? (amount / maxAmount) * 100 : 0;
  };

  if (loading) {
    return (
      <div className={`animate-pulse ${className}`}>
        <div className="h-64 bg-gray-200 rounded-lg"></div>
      </div>
    );
  }

  if (!data) {
    return null;
  }

  const maxAmount = Math.max(...data.parties.map(p => p.total_outstanding));

  return (
    <div className={`bg-white rounded-lg shadow ${className}`}>
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">
              Aging Analysis
            </h2>
            <p className="text-sm text-gray-600 mt-1">
              Outstanding receivables by age
            </p>
          </div>
          
          <button
            onClick={handleExport}
            className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center gap-2"
          >
            <Download className="w-4 h-4" />
            Export
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="px-6 py-3 bg-gray-50 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-gray-500" />
              <select
                value={filter || ''}
                onChange={(e) => setFilter(e.target.value || null)}
                className="text-sm border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="">All Parties</option>
                <option value="customer">Customers Only</option>
                <option value="supplier">Suppliers Only</option>
              </select>
            </div>
            
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-600">Sort by:</span>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="text-sm border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="total">Total Outstanding</option>
                <option value="overdue">Most Overdue</option>
                <option value="name">Party Name</option>
              </select>
            </div>
          </div>
          
          <div className="text-sm text-gray-600">
            {data.party_count} parties
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="px-6 py-4 bg-blue-50 border-b border-blue-200">
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
          <div className="bg-white rounded-lg p-3">
            <p className="text-xs text-gray-600">Total Outstanding</p>
            <p className="text-lg font-bold text-gray-900">
              {formatCurrency(data.summary.total)}
            </p>
          </div>
          <div className="bg-white rounded-lg p-3">
            <p className="text-xs text-gray-600">Current</p>
            <p className="text-lg font-bold text-green-600">
              {formatCurrency(data.summary.current)}
            </p>
          </div>
          <div className="bg-white rounded-lg p-3">
            <p className="text-xs text-gray-600">0-30 Days</p>
            <p className="text-lg font-bold text-yellow-600">
              {formatCurrency(data.summary['0_30_days'])}
            </p>
          </div>
          <div className="bg-white rounded-lg p-3">
            <p className="text-xs text-gray-600">31-60 Days</p>
            <p className="text-lg font-bold text-orange-600">
              {formatCurrency(data.summary['31_60_days'])}
            </p>
          </div>
          <div className="bg-white rounded-lg p-3">
            <p className="text-xs text-gray-600">61-90 Days</p>
            <p className="text-lg font-bold text-red-600">
              {formatCurrency(data.summary['61_90_days'])}
            </p>
          </div>
          <div className="bg-white rounded-lg p-3">
            <p className="text-xs text-gray-600">91-120 Days</p>
            <p className="text-lg font-bold text-red-700">
              {formatCurrency(data.summary['91_120_days'])}
            </p>
          </div>
          <div className="bg-white rounded-lg p-3">
            <p className="text-xs text-gray-600">>120 Days</p>
            <p className="text-lg font-bold text-red-900">
              {formatCurrency(data.summary['above_120_days'])}
            </p>
          </div>
        </div>
      </div>

      {/* Party List */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-200">
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Party
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                Current
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                0-30
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                31-60
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                61-90
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                91-120
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                >120
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                Total
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {sortParties(data.parties).map((party) => (
              <tr
                key={party.party_id}
                className="hover:bg-gray-50 cursor-pointer"
                onClick={() => onPartySelect && onPartySelect(party)}
              >
                <td className="px-6 py-4">
                  <div className="flex items-center">
                    <div className="flex-shrink-0 mr-3">
                      {party.party_type === 'customer' ? (
                        <Users className="w-5 h-5 text-blue-500" />
                      ) : (
                        <Building2 className="w-5 h-5 text-purple-500" />
                      )}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-900">
                        {party.party_name}
                      </p>
                      <p className="text-xs text-gray-500">
                        {party.party_type}
                      </p>
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4 text-right text-sm">
                  {party.aging.current > 0 && (
                    <span className="text-green-600">
                      {formatCurrency(party.aging.current)}
                    </span>
                  )}
                </td>
                <td className="px-6 py-4 text-right text-sm">
                  {party.aging['0_30_days'] > 0 && (
                    <span className="text-yellow-600">
                      {formatCurrency(party.aging['0_30_days'])}
                    </span>
                  )}
                </td>
                <td className="px-6 py-4 text-right text-sm">
                  {party.aging['31_60_days'] > 0 && (
                    <span className="text-orange-600">
                      {formatCurrency(party.aging['31_60_days'])}
                    </span>
                  )}
                </td>
                <td className="px-6 py-4 text-right text-sm">
                  {party.aging['61_90_days'] > 0 && (
                    <span className="text-red-600">
                      {formatCurrency(party.aging['61_90_days'])}
                    </span>
                  )}
                </td>
                <td className="px-6 py-4 text-right text-sm">
                  {party.aging['91_120_days'] > 0 && (
                    <span className="text-red-700">
                      {formatCurrency(party.aging['91_120_days'])}
                    </span>
                  )}
                </td>
                <td className="px-6 py-4 text-right text-sm">
                  {party.aging['above_120_days'] > 0 && (
                    <span className="text-red-900">
                      {formatCurrency(party.aging['above_120_days'])}
                    </span>
                  )}
                </td>
                <td className="px-6 py-4 text-right">
                  <div>
                    <p className="text-sm font-semibold text-gray-900">
                      {formatCurrency(party.total_outstanding)}
                    </p>
                    {showChart && (
                      <div className="mt-1 w-24 bg-gray-200 rounded-full h-2">
                        <div
                          className="bg-blue-600 h-2 rounded-full"
                          style={{ width: `${getAgingBarWidth(party.total_outstanding, maxAmount)}%` }}
                        />
                      </div>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
          {/* Summary Row */}
          <tfoot>
            <tr className="bg-gray-50 font-semibold">
              <td className="px-6 py-3 text-sm">
                Total ({data.party_count} parties)
              </td>
              <td className="px-6 py-3 text-right text-sm text-green-600">
                {formatCurrency(data.summary.current)}
              </td>
              <td className="px-6 py-3 text-right text-sm text-yellow-600">
                {formatCurrency(data.summary['0_30_days'])}
              </td>
              <td className="px-6 py-3 text-right text-sm text-orange-600">
                {formatCurrency(data.summary['31_60_days'])}
              </td>
              <td className="px-6 py-3 text-right text-sm text-red-600">
                {formatCurrency(data.summary['61_90_days'])}
              </td>
              <td className="px-6 py-3 text-right text-sm text-red-700">
                {formatCurrency(data.summary['91_120_days'])}
              </td>
              <td className="px-6 py-3 text-right text-sm text-red-900">
                {formatCurrency(data.summary['above_120_days'])}
              </td>
              <td className="px-6 py-3 text-right text-sm text-gray-900">
                {formatCurrency(data.summary.total)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
};

export default AgingAnalysis;