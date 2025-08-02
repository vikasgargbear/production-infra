/**
 * LedgerReports Component
 * Comprehensive reporting dashboard for ledger analytics and insights
 */

import React, { useState } from 'react';
import { useQuery } from 'react-query';
import {
  BarChart3,
  PieChart,
  TrendingUp,
  Calendar,
  Download,
  Filter,
  FileText,
  DollarSign,
  Users,
  Building,
  CreditCard,
  AlertCircle,
  CheckCircle,
  Clock,
  Target,
  Zap,
  Activity
} from 'lucide-react';
import { format, startOfMonth, endOfMonth, subMonths } from 'date-fns';
import { ledgerApi } from '../../services/api/modules/ledger.api';
import { DatePicker, Select } from '../global';
import { formatCurrency } from '../../utils/formatters';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart as RechartsPieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Area,
  AreaChart
} from 'recharts';

interface LedgerReportsProps {
  embedded?: boolean;
}

interface ReportFilters {
  dateRange: {
    from: Date;
    to: Date;
  };
  reportType: string;
  partyType: 'all' | 'customer' | 'supplier';
  groupBy: 'day' | 'week' | 'month' | 'quarter';
}

interface DashboardStats {
  total_receivables: number;
  total_payables: number;
  net_position: number;
  overdue_receivables: number;
  overdue_payables: number;
  collection_efficiency: number;
  payment_efficiency: number;
  cash_flow_trend: 'positive' | 'negative' | 'neutral';
}

const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899'];

const LedgerReports: React.FC<LedgerReportsProps> = ({ embedded = false }) => {
  const [filters, setFilters] = useState<ReportFilters>({
    dateRange: {
      from: startOfMonth(subMonths(new Date(), 2)),
      to: endOfMonth(new Date())
    },
    reportType: 'overview',
    partyType: 'all',
    groupBy: 'month'
  });

  const [selectedReport, setSelectedReport] = useState('overview');

  // Fetch dashboard stats
  const { data: stats } = useQuery(
    ['ledger-stats', filters],
    () => ledgerApi.getDashboardStats({
      date_from: format(filters.dateRange.from, 'yyyy-MM-dd'),
      date_to: format(filters.dateRange.to, 'yyyy-MM-dd'),
      party_type: filters.partyType !== 'all' ? filters.partyType : undefined
    }),
    {
      refetchInterval: 300000 // Refresh every 5 minutes
    }
  );

  // Fetch report data based on selected report
  const { data: reportData, isLoading } = useQuery(
    ['ledger-report', selectedReport, filters],
    () => {
      switch (selectedReport) {
        case 'aging':
          return ledgerApi.getAgingReport(filters);
        case 'cashflow':
          return ledgerApi.getCashFlowReport(filters);
        case 'party_performance':
          return ledgerApi.getPartyPerformanceReport(filters);
        case 'collection':
          return ledgerApi.getCollectionReport(filters);
        case 'trend':
          return ledgerApi.getTrendAnalysis(filters);
        default:
          return ledgerApi.getOverviewReport(filters);
      }
    }
  );

  const dashboardStats: DashboardStats = stats || {
    total_receivables: 0,
    total_payables: 0,
    net_position: 0,
    overdue_receivables: 0,
    overdue_payables: 0,
    collection_efficiency: 0,
    payment_efficiency: 0,
    cash_flow_trend: 'neutral'
  };

  const handleExport = async (format: 'pdf' | 'excel') => {
    try {
      const response = await ledgerApi.exportReport({
        report_type: selectedReport,
        filters,
        format
      });
      
      const blob = new Blob([response.data], {
        type: format === 'pdf' ? 'application/pdf' : 'application/vnd.ms-excel'
      });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `ledger-report-${selectedReport}-${format(new Date(), 'yyyy-MM-dd')}.${format}`;
      link.click();
    } catch (error) {
      console.error('Export failed:', error);
    }
  };

  const reportTypes = [
    { value: 'overview', label: 'Overview Dashboard', icon: BarChart3 },
    { value: 'aging', label: 'Aging Analysis', icon: Clock },
    { value: 'cashflow', label: 'Cash Flow', icon: TrendingUp },
    { value: 'party_performance', label: 'Party Performance', icon: Users },
    { value: 'collection', label: 'Collection Analysis', icon: CreditCard },
    { value: 'trend', label: 'Trend Analysis', icon: Activity }
  ];

  const renderReport = () => {
    if (!reportData) return null;

    switch (selectedReport) {
      case 'overview':
        return renderOverviewDashboard();
      case 'aging':
        return renderAgingAnalysis();
      case 'cashflow':
        return renderCashFlowReport();
      case 'party_performance':
        return renderPartyPerformance();
      case 'collection':
        return renderCollectionAnalysis();
      case 'trend':
        return renderTrendAnalysis();
      default:
        return null;
    }
  };

  const renderOverviewDashboard = () => {
    const data = reportData as any;
    
    return (
      <div className="space-y-6">
        {/* Monthly Receivables vs Payables */}
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-lg font-semibold mb-4">Monthly Receivables vs Payables</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={data.monthly_data}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" />
              <YAxis />
              <Tooltip formatter={(value) => formatCurrency(Number(value))} />
              <Legend />
              <Bar dataKey="receivables" fill="#3B82F6" name="Receivables" />
              <Bar dataKey="payables" fill="#EF4444" name="Payables" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Outstanding by Party Type */}
        <div className="grid grid-cols-2 gap-6">
          <div className="bg-white p-6 rounded-lg shadow">
            <h3 className="text-lg font-semibold mb-4">Outstanding by Type</h3>
            <ResponsiveContainer width="100%" height={250}>
              <RechartsPieChart>
                <Pie
                  data={data.outstanding_by_type}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                >
                  {data.outstanding_by_type.map((entry: any, index: number) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(value) => formatCurrency(Number(value))} />
              </RechartsPieChart>
            </ResponsiveContainer>
          </div>

          <div className="bg-white p-6 rounded-lg shadow">
            <h3 className="text-lg font-semibold mb-4">Collection Efficiency Trend</h3>
            <ResponsiveContainer width="100%" height={250}>
              <LineChart data={data.efficiency_trend}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="month" />
                <YAxis />
                <Tooltip formatter={(value) => `${value}%`} />
                <Line 
                  type="monotone" 
                  dataKey="collection_rate" 
                  stroke="#10B981" 
                  name="Collection Rate"
                  strokeWidth={2}
                />
                <Line 
                  type="monotone" 
                  dataKey="payment_rate" 
                  stroke="#F59E0B" 
                  name="Payment Rate"
                  strokeWidth={2}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    );
  };

  const renderAgingAnalysis = () => {
    const data = reportData as any;
    
    return (
      <div className="space-y-6">
        {/* Aging Buckets Chart */}
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-lg font-semibold mb-4">Outstanding by Age</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={data.aging_buckets}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="bucket" />
              <YAxis />
              <Tooltip formatter={(value) => formatCurrency(Number(value))} />
              <Legend />
              <Bar dataKey="customers" fill="#3B82F6" name="Customer Outstanding" />
              <Bar dataKey="suppliers" fill="#10B981" name="Supplier Outstanding" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Top Overdue Parties */}
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-lg font-semibold mb-4">Top Overdue Parties</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2">Party Name</th>
                  <th className="text-left py-2">Type</th>
                  <th className="text-right py-2">Total Outstanding</th>
                  <th className="text-right py-2">Overdue Amount</th>
                  <th className="text-right py-2">Oldest Invoice</th>
                  <th className="text-left py-2">Risk Level</th>
                </tr>
              </thead>
              <tbody>
                {data.top_overdue_parties.map((party: any, index: number) => (
                  <tr key={index} className="border-b">
                    <td className="py-2">{party.name}</td>
                    <td className="py-2">
                      <span className={`px-2 py-1 rounded text-xs ${
                        party.type === 'customer' ? 'bg-blue-100 text-blue-800' : 'bg-green-100 text-green-800'
                      }`}>
                        {party.type}
                      </span>
                    </td>
                    <td className="text-right py-2">{formatCurrency(party.total_outstanding)}</td>
                    <td className="text-right py-2 text-red-600">{formatCurrency(party.overdue_amount)}</td>
                    <td className="text-right py-2">{party.days_overdue} days</td>
                    <td className="py-2">
                      <span className={`px-2 py-1 rounded text-xs ${
                        party.risk_level === 'high' ? 'bg-red-100 text-red-800' :
                        party.risk_level === 'medium' ? 'bg-yellow-100 text-yellow-800' :
                        'bg-green-100 text-green-800'
                      }`}>
                        {party.risk_level}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  };

  const renderCashFlowReport = () => {
    const data = reportData as any;
    
    return (
      <div className="space-y-6">
        {/* Cash Flow Chart */}
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-lg font-semibold mb-4">Cash Flow Trend</h3>
          <ResponsiveContainer width="100%" height={350}>
            <AreaChart data={data.cashflow_trend}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" />
              <YAxis />
              <Tooltip formatter={(value) => formatCurrency(Number(value))} />
              <Legend />
              <Area 
                type="monotone" 
                dataKey="inflow" 
                stackId="1" 
                stroke="#10B981" 
                fill="#10B981" 
                name="Cash Inflow"
              />
              <Area 
                type="monotone" 
                dataKey="outflow" 
                stackId="2" 
                stroke="#EF4444" 
                fill="#EF4444" 
                name="Cash Outflow"
              />
              <Line 
                type="monotone" 
                dataKey="net_flow" 
                stroke="#3B82F6" 
                strokeWidth={2}
                name="Net Cash Flow"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Cash Flow Summary */}
        <div className="grid grid-cols-3 gap-6">
          <div className="bg-white p-6 rounded-lg shadow">
            <h4 className="font-semibold mb-2">Total Inflow</h4>
            <p className="text-2xl font-bold text-green-600">
              {formatCurrency(data.summary.total_inflow)}
            </p>
            <p className="text-sm text-gray-500 mt-1">
              {data.summary.inflow_transactions} transactions
            </p>
          </div>
          <div className="bg-white p-6 rounded-lg shadow">
            <h4 className="font-semibold mb-2">Total Outflow</h4>
            <p className="text-2xl font-bold text-red-600">
              {formatCurrency(data.summary.total_outflow)}
            </p>
            <p className="text-sm text-gray-500 mt-1">
              {data.summary.outflow_transactions} transactions
            </p>
          </div>
          <div className="bg-white p-6 rounded-lg shadow">
            <h4 className="font-semibold mb-2">Net Position</h4>
            <p className={`text-2xl font-bold ${
              data.summary.net_position >= 0 ? 'text-green-600' : 'text-red-600'
            }`}>
              {formatCurrency(Math.abs(data.summary.net_position))}
            </p>
            <p className="text-sm text-gray-500 mt-1">
              {data.summary.net_position >= 0 ? 'Positive' : 'Negative'} cash flow
            </p>
          </div>
        </div>
      </div>
    );
  };

  const renderPartyPerformance = () => {
    const data = reportData as any;
    
    return (
      <div className="space-y-6">
        {/* Top Performing Parties */}
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-lg font-semibold mb-4">Top Performing Parties</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2">Party Name</th>
                  <th className="text-right py-2">Total Business</th>
                  <th className="text-right py-2">On-Time Payment %</th>
                  <th className="text-right py-2">Avg Payment Days</th>
                  <th className="text-right py-2">Outstanding</th>
                  <th className="text-left py-2">Rating</th>
                </tr>
              </thead>
              <tbody>
                {data.top_performers.map((party: any, index: number) => (
                  <tr key={index} className="border-b">
                    <td className="py-2">{party.name}</td>
                    <td className="text-right py-2">{formatCurrency(party.total_business)}</td>
                    <td className="text-right py-2">{party.ontime_payment_rate}%</td>
                    <td className="text-right py-2">{party.avg_payment_days} days</td>
                    <td className="text-right py-2">{formatCurrency(party.outstanding)}</td>
                    <td className="py-2">
                      <div className="flex gap-1">
                        {[...Array(5)].map((_, i) => (
                          <span key={i} className={i < party.rating ? 'text-yellow-400' : 'text-gray-300'}>
                            ★
                          </span>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Payment Behavior Distribution */}
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-lg font-semibold mb-4">Payment Behavior Distribution</h3>
          <ResponsiveContainer width="100%" height={300}>
            <RechartsPieChart>
              <Pie
                data={data.payment_behavior}
                cx="50%"
                cy="50%"
                outerRadius={100}
                fill="#8884d8"
                dataKey="count"
                label={({ name, value }) => `${name}: ${value}`}
              >
                {data.payment_behavior.map((entry: any, index: number) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
              <Legend />
            </RechartsPieChart>
          </ResponsiveContainer>
        </div>
      </div>
    );
  };

  const renderCollectionAnalysis = () => {
    const data = reportData as any;
    
    return (
      <div className="space-y-6">
        {/* Collection Funnel */}
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-lg font-semibold mb-4">Collection Funnel</h3>
          <div className="space-y-4">
            {data.collection_funnel.map((stage: any, index: number) => (
              <div key={index} className="relative">
                <div
                  className="bg-blue-500 text-white p-4 rounded"
                  style={{ width: `${stage.percentage}%` }}
                >
                  <div className="flex justify-between items-center">
                    <span className="font-semibold">{stage.name}</span>
                    <span>{formatCurrency(stage.amount)}</span>
                  </div>
                </div>
                <span className="absolute right-2 top-4 text-gray-600">
                  {stage.count} bills
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Collection Efficiency by Agent */}
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-lg font-semibold mb-4">Agent Performance</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={data.agent_performance}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="agent_name" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Bar dataKey="collected" fill="#10B981" name="Collected Amount" />
              <Bar dataKey="target" fill="#3B82F6" name="Target Amount" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    );
  };

  const renderTrendAnalysis = () => {
    const data = reportData as any;
    
    return (
      <div className="space-y-6">
        {/* Multi-metric Trend */}
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-lg font-semibold mb-4">Key Metrics Trend</h3>
          <ResponsiveContainer width="100%" height={400}>
            <LineChart data={data.metrics_trend}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" />
              <YAxis yAxisId="left" />
              <YAxis yAxisId="right" orientation="right" />
              <Tooltip />
              <Legend />
              <Line 
                yAxisId="left"
                type="monotone" 
                dataKey="receivables" 
                stroke="#3B82F6" 
                name="Receivables"
              />
              <Line 
                yAxisId="left"
                type="monotone" 
                dataKey="payables" 
                stroke="#EF4444" 
                name="Payables"
              />
              <Line 
                yAxisId="right"
                type="monotone" 
                dataKey="collection_rate" 
                stroke="#10B981" 
                name="Collection Rate %"
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Seasonal Analysis */}
        <div className="bg-white p-6 rounded-lg shadow">
          <h3 className="text-lg font-semibold mb-4">Seasonal Patterns</h3>
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={data.seasonal_data}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" />
              <YAxis />
              <Tooltip formatter={(value) => formatCurrency(Number(value))} />
              <Legend />
              <Area 
                type="monotone" 
                dataKey="this_year" 
                stroke="#3B82F6" 
                fill="#3B82F6" 
                fillOpacity={0.6}
                name="This Year"
              />
              <Area 
                type="monotone" 
                dataKey="last_year" 
                stroke="#94A3B8" 
                fill="#94A3B8" 
                fillOpacity={0.3}
                name="Last Year"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    );
  };

  return (
    <div className={embedded ? '' : 'p-6'}>
      {/* Header */}
      {!embedded && (
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-800">Ledger Reports</h1>
          <p className="text-gray-600">Analytics and insights for your accounting data</p>
        </div>
      )}

      {/* Quick Stats */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="bg-white p-4 rounded-lg shadow">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Total Receivables</p>
              <p className="text-2xl font-bold text-green-600">
                {formatCurrency(dashboardStats.total_receivables)}
              </p>
              <p className="text-sm text-red-500">
                Overdue: {formatCurrency(dashboardStats.overdue_receivables)}
              </p>
            </div>
            <TrendingUp className="h-10 w-10 text-green-400" />
          </div>
        </div>

        <div className="bg-white p-4 rounded-lg shadow">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Total Payables</p>
              <p className="text-2xl font-bold text-red-600">
                {formatCurrency(dashboardStats.total_payables)}
              </p>
              <p className="text-sm text-red-500">
                Overdue: {formatCurrency(dashboardStats.overdue_payables)}
              </p>
            </div>
            <TrendingDown className="h-10 w-10 text-red-400" />
          </div>
        </div>

        <div className="bg-white p-4 rounded-lg shadow">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Collection Efficiency</p>
              <p className="text-2xl font-bold text-blue-600">
                {dashboardStats.collection_efficiency.toFixed(1)}%
              </p>
              <p className="text-sm text-gray-500">
                This month
              </p>
            </div>
            <Target className="h-10 w-10 text-blue-400" />
          </div>
        </div>

        <div className="bg-white p-4 rounded-lg shadow">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">Net Position</p>
              <p className={`text-2xl font-bold ${
                dashboardStats.net_position >= 0 ? 'text-green-600' : 'text-red-600'
              }`}>
                {formatCurrency(Math.abs(dashboardStats.net_position))}
              </p>
              <p className="text-sm text-gray-500">
                {dashboardStats.cash_flow_trend === 'positive' ? '↑' : 
                 dashboardStats.cash_flow_trend === 'negative' ? '↓' : '→'} Trend
              </p>
            </div>
            <DollarSign className="h-10 w-10 text-gray-400" />
          </div>
        </div>
      </div>

      {/* Report Selection and Filters */}
      <div className="mb-6 bg-white p-4 rounded-lg shadow">
        <div className="flex flex-wrap gap-4 items-end">
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Report Type
            </label>
            <div className="grid grid-cols-3 gap-2">
              {reportTypes.map((report) => {
                const Icon = report.icon;
                return (
                  <button
                    key={report.value}
                    onClick={() => setSelectedReport(report.value)}
                    className={`p-3 rounded-lg border flex items-center gap-2 ${
                      selectedReport === report.value
                        ? 'bg-blue-50 border-blue-500 text-blue-700'
                        : 'bg-white border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    <Icon className="h-5 w-5" />
                    <span className="text-sm font-medium">{report.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="min-w-[200px]">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Date Range
            </label>
            <div className="flex gap-2">
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
            </div>
          </div>

          <div className="min-w-[150px]">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Party Type
            </label>
            <Select
              value={filters.partyType}
              onChange={(value) => setFilters({ ...filters, partyType: value as any })}
              options={[
                { value: 'all', label: 'All Parties' },
                { value: 'customer', label: 'Customers' },
                { value: 'supplier', label: 'Suppliers' }
              ]}
            />
          </div>

          <div className="min-w-[150px]">
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Group By
            </label>
            <Select
              value={filters.groupBy}
              onChange={(value) => setFilters({ ...filters, groupBy: value as any })}
              options={[
                { value: 'day', label: 'Daily' },
                { value: 'week', label: 'Weekly' },
                { value: 'month', label: 'Monthly' },
                { value: 'quarter', label: 'Quarterly' }
              ]}
            />
          </div>

          <div className="flex gap-2">
            <button
              onClick={() => handleExport('pdf')}
              className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 flex items-center gap-2"
            >
              <Download className="h-4 w-4" />
              PDF
            </button>
            <button
              onClick={() => handleExport('excel')}
              className="px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 flex items-center gap-2"
            >
              <Download className="h-4 w-4" />
              Excel
            </button>
          </div>
        </div>
      </div>

      {/* Report Content */}
      <div className="min-h-[500px]">
        {isLoading ? (
          <div className="flex items-center justify-center h-[500px]">
            <div className="text-gray-500">Loading report...</div>
          </div>
        ) : (
          renderReport()
        )}
      </div>
    </div>
  );
};

export default LedgerReports;