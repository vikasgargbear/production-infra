/**
 * TaxAnalytics Component
 * Comprehensive GST and tax analytics dashboard
 */

import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Receipt, TrendingUp, TrendingDown, Calendar,
  Download, Filter, FileText, DollarSign,
  AlertCircle, CheckCircle, Clock, Info,
  ChevronDown, ChevronRight, RefreshCw
} from 'lucide-react';
import { format, startOfMonth, endOfMonth } from 'date-fns';
import apiClient from '../../services/api/apiClient';
import { DatePicker, Select, ModuleHeader } from '../global';
import { formatCurrency } from '../../utils/formatters';
import {
  BarChart, Bar, LineChart, Line, PieChart as RechartsPieChart,
  Pie, Cell, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer, Area, AreaChart
} from 'recharts';

interface TaxAnalyticsProps {
  embedded?: boolean;
  onClose?: () => void;
}

interface TaxFilters {
  dateRange: {
    from: Date | null;
    to: Date | null;
  };
  taxType: 'all' | 'cgst' | 'sgst' | 'igst';
  view: 'summary' | 'detailed' | 'comparison';
}

const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899'];

const TaxAnalytics: React.FC<TaxAnalyticsProps> = ({ embedded = false, onClose }) => {
  const [filters, setFilters] = useState<TaxFilters>({
    dateRange: {
      from: startOfMonth(new Date()),
      to: endOfMonth(new Date())
    },
    taxType: 'all',
    view: 'summary'
  });

  const [selectedReport, setSelectedReport] = useState('overview');

  // Fetch tax summary data from real API
  const { data: taxSummary, isLoading, refetch } = useQuery({
    queryKey: ['tax-summary', filters],
    queryFn: async () => {
      const response = await apiClient.get('/tax-entries/analytics/summary', {
        params: {
          date_from: filters.dateRange.from ? format(filters.dateRange.from, 'yyyy-MM-dd') : undefined,
          date_to: filters.dateRange.to ? format(filters.dateRange.to, 'yyyy-MM-dd') : undefined
        }
      });

      const data = response.data || {};

      // Transform API response to match our component structure
      return {
        output_tax: data.total_output_tax || 0,
        input_tax: data.total_input_tax || 0,
        net_tax_liability: (data.total_output_tax || 0) - (data.total_input_tax || 0),
        cgst_collected: data.cgst_collected || 0,
        sgst_collected: data.sgst_collected || 0,
        igst_collected: data.igst_collected || 0,
        cgst_paid: data.cgst_paid || 0,
        sgst_paid: data.sgst_paid || 0,
        igst_paid: data.igst_paid || 0,
        pending_returns: data.pending_returns || 0,
        compliance_score: data.compliance_score || 100
      };
    }
  });

  // Fetch monthly tax trends from real API
  const { data: taxTrends } = useQuery({
    queryKey: ['tax-trends', filters],
    queryFn: async () => {
      const response = await apiClient.get('/tax-entries/gstr1/summary', {
        params: {
          date_from: filters.dateRange.from ? format(filters.dateRange.from, 'yyyy-MM-dd') : undefined,
          date_to: filters.dateRange.to ? format(filters.dateRange.to, 'yyyy-MM-dd') : undefined
        }
      });

      const data = response.data || {};

      // Transform the API response for charts
      return {
        monthly_data: data.monthly_summary || [],
        tax_breakdown: [
          { name: 'CGST', value: data.total_cgst || 0 },
          { name: 'SGST', value: data.total_sgst || 0 },
          { name: 'IGST', value: data.total_igst || 0 }
        ]
      };
    }
  });

  const renderSummaryCards = () => (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">
      {/* Output Tax Card */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-2">
          <div className="p-2 bg-blue-50 rounded-lg">
            <TrendingUp className="w-5 h-5 text-blue-600" />
          </div>
          <span className="text-xs text-gray-500 font-semibold">THIS MONTH</span>
        </div>
        <p className="text-2xl font-bold text-gray-900">
          {formatCurrency(taxSummary?.output_tax || 0)}
        </p>
        <p className="text-sm text-gray-600 mt-1">Output Tax Collected</p>
        <div className="mt-4 text-xs">
          <span className="text-green-600 font-semibold">↑ 8.3%</span>
          <span className="text-gray-500 ml-1">vs last month</span>
        </div>
      </div>

      {/* Input Tax Card */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-2">
          <div className="p-2 bg-green-50 rounded-lg">
            <TrendingDown className="w-5 h-5 text-green-600" />
          </div>
          <span className="text-xs text-gray-500 font-semibold">THIS MONTH</span>
        </div>
        <p className="text-2xl font-bold text-gray-900">
          {formatCurrency(taxSummary?.input_tax || 0)}
        </p>
        <p className="text-sm text-gray-600 mt-1">Input Tax Credit</p>
        <div className="mt-4 text-xs">
          <span className="text-green-600 font-semibold">↑ 5.2%</span>
          <span className="text-gray-500 ml-1">vs last month</span>
        </div>
      </div>

      {/* Net Liability Card */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-2">
          <div className="p-2 bg-amber-50 rounded-lg">
            <DollarSign className="w-5 h-5 text-amber-600" />
          </div>
          <span className="text-xs text-gray-500 font-semibold">PAYABLE</span>
        </div>
        <p className="text-2xl font-bold text-gray-900">
          {formatCurrency(taxSummary?.net_tax_liability || 0)}
        </p>
        <p className="text-sm text-gray-600 mt-1">Net Tax Liability</p>
        <div className="mt-4 text-xs">
          <Clock className="w-3 h-3 inline text-amber-500 mr-1" />
          <span className="text-gray-500">Due in 15 days</span>
        </div>
      </div>

      {/* Compliance Score Card */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <div className="flex items-center justify-between mb-2">
          <div className="p-2 bg-purple-50 rounded-lg">
            <CheckCircle className="w-5 h-5 text-purple-600" />
          </div>
          <span className="text-xs text-gray-500 font-semibold">COMPLIANCE</span>
        </div>
        <div className="flex items-baseline gap-2">
          <p className="text-2xl font-bold text-gray-900">
            {taxSummary?.compliance_score || 0}%
          </p>
          <div className="w-20 h-2 bg-gray-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-purple-400 to-purple-600 rounded-full"
              style={{ width: `${taxSummary?.compliance_score || 0}%` }}
            />
          </div>
        </div>
        <p className="text-sm text-gray-600 mt-1">Compliance Score</p>
        <div className="mt-4 text-xs">
          <span className="text-purple-600 font-semibold">
            {taxSummary?.pending_returns || 0} returns pending
          </span>
        </div>
      </div>
    </div>
  );

  const renderTaxTrends = () => (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
      {/* Monthly Tax Trends */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Monthly Tax Trends</h3>
        <ResponsiveContainer width="100%" height={300}>
          <AreaChart data={taxTrends?.monthly_data || []}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="month" />
            <YAxis />
            <Tooltip formatter={(value) => formatCurrency(Number(value))} />
            <Legend />
            <Area
              type="monotone"
              dataKey="output"
              stackId="1"
              stroke="#3B82F6"
              fill="#93C5FD"
              name="Output Tax"
            />
            <Area
              type="monotone"
              dataKey="input"
              stackId="1"
              stroke="#10B981"
              fill="#86EFAC"
              name="Input Tax"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Tax Composition */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Tax Composition</h3>
        <ResponsiveContainer width="100%" height={300}>
          <RechartsPieChart>
            <Pie
              data={taxTrends?.tax_breakdown || []}
              cx="50%"
              cy="50%"
              labelLine={false}
              label={({ name, percent }) => `${name} ${((percent || 0) * 100).toFixed(0)}%`}
              outerRadius={100}
              fill="#8884d8"
              dataKey="value"
            >
              {(taxTrends?.tax_breakdown || []).map((entry: any, index: number) => (
                <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
              ))}
            </Pie>
            <Tooltip formatter={(value) => formatCurrency(Number(value))} />
          </RechartsPieChart>
        </ResponsiveContainer>
      </div>
    </div>
  );

  const renderDetailedBreakdown = () => (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">Detailed Tax Breakdown</h3>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Tax Component
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                Collected
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                Paid
              </th>
              <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                Net Position
              </th>
              <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                Status
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            <tr>
              <td className="px-4 py-3 text-sm font-medium text-gray-900">CGST</td>
              <td className="px-4 py-3 text-sm text-right text-gray-600">
                {formatCurrency(taxSummary?.cgst_collected || 0)}
              </td>
              <td className="px-4 py-3 text-sm text-right text-gray-600">
                {formatCurrency(taxSummary?.cgst_paid || 0)}
              </td>
              <td className="px-4 py-3 text-sm text-right font-semibold text-gray-900">
                {formatCurrency((taxSummary?.cgst_collected || 0) - (taxSummary?.cgst_paid || 0))}
              </td>
              <td className="px-4 py-3 text-center">
                <span className="px-2 py-1 text-xs font-medium bg-green-100 text-green-800 rounded-full">
                  Active
                </span>
              </td>
            </tr>
            <tr>
              <td className="px-4 py-3 text-sm font-medium text-gray-900">SGST</td>
              <td className="px-4 py-3 text-sm text-right text-gray-600">
                {formatCurrency(taxSummary?.sgst_collected || 0)}
              </td>
              <td className="px-4 py-3 text-sm text-right text-gray-600">
                {formatCurrency(taxSummary?.sgst_paid || 0)}
              </td>
              <td className="px-4 py-3 text-sm text-right font-semibold text-gray-900">
                {formatCurrency((taxSummary?.sgst_collected || 0) - (taxSummary?.sgst_paid || 0))}
              </td>
              <td className="px-4 py-3 text-center">
                <span className="px-2 py-1 text-xs font-medium bg-green-100 text-green-800 rounded-full">
                  Active
                </span>
              </td>
            </tr>
            <tr>
              <td className="px-4 py-3 text-sm font-medium text-gray-900">IGST</td>
              <td className="px-4 py-3 text-sm text-right text-gray-600">
                {formatCurrency(taxSummary?.igst_collected || 0)}
              </td>
              <td className="px-4 py-3 text-sm text-right text-gray-600">
                {formatCurrency(taxSummary?.igst_paid || 0)}
              </td>
              <td className="px-4 py-3 text-sm text-right font-semibold text-gray-900">
                {formatCurrency((taxSummary?.igst_collected || 0) - (taxSummary?.igst_paid || 0))}
              </td>
              <td className="px-4 py-3 text-center">
                <span className="px-2 py-1 text-xs font-medium bg-gray-100 text-gray-600 rounded-full">
                  N/A
                </span>
              </td>
            </tr>
            <tr className="bg-gray-50">
              <td className="px-4 py-3 text-sm font-bold text-gray-900">Total</td>
              <td className="px-4 py-3 text-sm text-right font-bold text-gray-900">
                {formatCurrency(taxSummary?.output_tax || 0)}
              </td>
              <td className="px-4 py-3 text-sm text-right font-bold text-gray-900">
                {formatCurrency(taxSummary?.input_tax || 0)}
              </td>
              <td className="px-4 py-3 text-sm text-right font-bold text-blue-600">
                {formatCurrency(taxSummary?.net_tax_liability || 0)}
              </td>
              <td className="px-4 py-3 text-center">
                <span className="px-2 py-1 text-xs font-medium bg-blue-100 text-blue-800 rounded-full">
                  Payable
                </span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading tax analytics...</p>
        </div>
      </div>
    );
  }

  return (
    <div className={embedded ? 'p-6' : 'h-full bg-gray-50'}>
      <div className={embedded ? '' : 'h-full flex flex-col'}>
        {!embedded && (
          <ModuleHeader
            title="Tax Analytics"
            documentNumber=""
            status=""
            icon={Receipt}
            iconColor="text-orange-600"
            onClose={onClose}
            historyType="report"
            onSaveDraft={() => { }}
            additionalActions={[
              {
                label: 'Refresh',
                icon: RefreshCw,
                onClick: () => refetch(),
                variant: 'outline'
              },
              {
                label: 'Export',
                icon: Download,
                onClick: () => { },
                variant: 'secondary'
              }
            ] as any}
          />
        )}

        <div className={embedded ? '' : 'flex-1 overflow-y-auto'}>
          <div className="max-w-7xl mx-auto px-6 py-6">
            {/* Filters */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <DatePicker
                    value={filters.dateRange.from}
                    onChange={(date) => setFilters(prev => ({
                      ...prev,
                      dateRange: { ...prev.dateRange, from: date }
                    }))}
                    placeholder="From date"
                  />
                  <DatePicker
                    value={filters.dateRange.to}
                    onChange={(date) => setFilters(prev => ({
                      ...prev,
                      dateRange: { ...prev.dateRange, to: date }
                    }))}
                    placeholder="To date"
                  />
                  <Select
                    value={filters.taxType}
                    onChange={(value) => setFilters(prev => ({ ...prev, taxType: value as any }))}
                    options={[
                      { value: 'all', label: 'All Taxes' },
                      { value: 'cgst', label: 'CGST' },
                      { value: 'sgst', label: 'SGST' },
                      { value: 'igst', label: 'IGST' }
                    ]}
                  />
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setFilters(prev => ({ ...prev, view: 'summary' }))}
                    className={`px-4 py-2 text-sm font-medium rounded-lg ${filters.view === 'summary'
                        ? 'bg-blue-100 text-blue-700'
                        : 'text-gray-600 hover:bg-gray-100'
                      }`}
                  >
                    Summary
                  </button>
                  <button
                    onClick={() => setFilters(prev => ({ ...prev, view: 'detailed' }))}
                    className={`px-4 py-2 text-sm font-medium rounded-lg ${filters.view === 'detailed'
                        ? 'bg-blue-100 text-blue-700'
                        : 'text-gray-600 hover:bg-gray-100'
                      }`}
                  >
                    Detailed
                  </button>
                  <button
                    onClick={() => setFilters(prev => ({ ...prev, view: 'comparison' }))}
                    className={`px-4 py-2 text-sm font-medium rounded-lg ${filters.view === 'comparison'
                        ? 'bg-blue-100 text-blue-700'
                        : 'text-gray-600 hover:bg-gray-100'
                      }`}
                  >
                    Comparison
                  </button>
                </div>
              </div>
            </div>

            {/* Summary Cards */}
            {renderSummaryCards()}

            {/* Charts */}
            {filters.view === 'summary' && renderTaxTrends()}
            {filters.view === 'detailed' && renderDetailedBreakdown()}
            {filters.view === 'comparison' && renderTaxTrends()}
          </div>
        </div>
      </div>
    </div>
  );
};

export default TaxAnalytics;