import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle, Calendar, DollarSign, Download, Package,
  RefreshCw, ShoppingCart, TrendingUp, Users,
} from 'lucide-react';
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer,
  Tooltip, XAxis, YAxis,
} from 'recharts';
import { ModuleHeader } from '../global';
import apiClient from '../../services/api/apiClient';
import { formatCurrency } from '../../utils/formatters';
import {
  dashboardDateRange,
  ExecutiveInventorySummary,
  ExecutiveRange,
  ExecutiveRankedRow,
  ExecutiveSalesPoint,
  ExecutiveStats,
  projectBusinessContext,
  projectExecutiveInventory,
  projectExecutiveSales,
  projectExecutiveStats,
  projectTopCustomers,
  projectTopProducts,
} from './utils/executiveDashboardProjection';

interface ExecutiveDashboardProps {
  embedded?: boolean;
  onClose?: () => void;
}

interface MetricCard {
  title: string;
  value: string | number;
  change: number | null;
  icon: React.ComponentType<{ className?: string }>;
  subtitle: string;
}

const SECTION_LABELS = ['summary', 'sales trend', 'inventory', 'top products', 'top customers'] as const;

const ExecutiveDashboard: React.FC<ExecutiveDashboardProps> = ({ embedded = false, onClose }) => {
  const [dateRange, setDateRange] = useState<ExecutiveRange>('30days');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [businessDate, setBusinessDate] = useState<string | null>(null);
  const [metrics, setMetrics] = useState<MetricCard[]>([]);
  const [stats, setStats] = useState<ExecutiveStats | null>(null);
  const [salesData, setSalesData] = useState<ExecutiveSalesPoint[]>([]);
  const [inventoryData, setInventoryData] = useState<ExecutiveInventorySummary | null>(null);
  const [topProducts, setTopProducts] = useState<ExecutiveRankedRow[]>([]);
  const [topCustomers, setTopCustomers] = useState<ExecutiveRankedRow[]>([]);
  const [unavailableSections, setUnavailableSections] = useState<string[]>([]);

  const loadDashboardData = useCallback(async () => {
    setLoading(true);
    try {
      const contextResponse = await apiClient.get('/canonical/business-context');
      const context = projectBusinessContext(contextResponse.data);
      const dateParams = dashboardDateRange(context.business_date, dateRange);
      setBusinessDate(context.business_date);

      const results = await Promise.allSettled([
        apiClient.get('/dashboard/stats', { params: dateParams }),
        apiClient.get('/dashboard/sales-analytics', { params: dateParams }),
        apiClient.get('/dashboard/inventory-summary'),
        apiClient.get('/dashboard/top-products', { params: { ...dateParams, limit: 5 } }),
        apiClient.get('/dashboard/top-customers', { params: { ...dateParams, limit: 5 } }),
      ]);

      const unavailable: string[] = [];
      const project = <T,>(index: number, projector: (value: unknown) => T): T | null => {
        const result = results[index];
        if (result.status === 'rejected') {
          unavailable.push(SECTION_LABELS[index]);
          return null;
        }
        try {
          return projector(result.value.data);
        } catch (error) {
          console.error(`Invalid canonical ${SECTION_LABELS[index]} response:`, error);
          unavailable.push(SECTION_LABELS[index]);
          return null;
        }
      };

      const nextStats = project(0, projectExecutiveStats);
      const nextSales = project(1, projectExecutiveSales) ?? [];
      const nextInventory = project(2, projectExecutiveInventory);
      const nextProducts = project(3, projectTopProducts) ?? [];
      const nextCustomers = project(4, projectTopCustomers) ?? [];

      setStats(nextStats);
      setSalesData(nextSales);
      setInventoryData(nextInventory);
      setTopProducts(nextProducts);
      setTopCustomers(nextCustomers);
      setUnavailableSections(unavailable);

      const nextMetrics: MetricCard[] = [];
      if (nextStats) {
        nextMetrics.push(
          {
            title: 'Total Revenue', value: formatCurrency(nextStats.total_revenue),
            change: nextStats.revenue_change, icon: DollarSign,
            subtitle: 'Posted invoices in this period',
          },
          {
            title: 'Sales Orders', value: nextStats.total_orders,
            change: nextStats.orders_change, icon: ShoppingCart,
            subtitle: 'Non-cancelled orders in this period',
          },
          {
            title: 'New Customers', value: nextStats.new_customers,
            change: nextStats.new_customers_change, icon: Users,
            subtitle: 'Registered in this period',
          },
        );
      }
      if (nextInventory) {
        nextMetrics.push({
          title: 'Active Products', value: nextInventory.active_products,
          change: null, icon: Package,
          subtitle: `Inventory as of ${nextInventory.business_date}`,
        });
      }
      setMetrics(nextMetrics);
    } catch (error) {
      console.error('Error loading canonical executive dashboard:', error);
      setBusinessDate(null);
      setMetrics([]);
      setStats(null);
      setSalesData([]);
      setInventoryData(null);
      setTopProducts([]);
      setTopCustomers([]);
      setUnavailableSections(['business context', ...SECTION_LABELS]);
    } finally {
      setLoading(false);
    }
  }, [dateRange]);

  useEffect(() => { loadDashboardData(); }, [loadDashboardData]);

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadDashboardData();
    setRefreshing(false);
  };

  const handleExport = () => {
    const escape = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`;
    const rows: unknown[][] = [
      ['Executive Dashboard', dateRange, businessDate ?? 'Business date unavailable'],
      [], ['Metric', 'Value', 'Change %'],
      ...metrics.map(metric => [metric.title, metric.value, metric.change]),
      [], ['Top Product', 'Revenue', 'Sales Quantity'],
      ...topProducts.map(product => [product.name, product.revenue, product.volume]),
      [], ['Top Customer', 'Revenue', 'Invoice Count'],
      ...topCustomers.map(customer => [customer.name, customer.revenue, customer.volume]),
    ];
    const blob = new Blob([rows.map(row => row.map(escape).join(',')).join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `executive-dashboard-${businessDate ?? 'unavailable'}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  if (loading && !refreshing) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="text-center">
          <div className="mx-auto h-12 w-12 animate-spin rounded-full border-b-2 border-blue-600" />
          <p className="mt-4 text-gray-600">Loading executive dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className={embedded ? 'p-6' : 'h-full bg-gray-50'}>
      <div className={embedded ? '' : 'flex h-full flex-col'}>
        {!embedded && (
          <ModuleHeader
            title="Executive Dashboard" documentNumber="" status=""
            icon={TrendingUp} iconColor="text-blue-600" onClose={onClose}
            historyType="report"
            additionalActions={[
              { label: 'Refresh', icon: RefreshCw, onClick: handleRefresh, variant: 'outline', disabled: refreshing },
              {
                label: 'Export', icon: Download, onClick: handleExport, variant: 'secondary',
                disabled: metrics.length === 0 && topProducts.length === 0 && topCustomers.length === 0,
              },
            ] as any}
          />
        )}

        <div className={embedded ? '' : 'flex-1 overflow-y-auto'}>
          <div className="mx-auto max-w-7xl px-3 py-4 sm:px-6 sm:py-6">
            <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="grid grid-cols-2 gap-2 min-[400px]:grid-cols-4 sm:flex sm:items-center" aria-label="Dashboard period">
                {([
                  ['7days', '7 Days'], ['30days', '30 Days'],
                  ['month', 'This Month'], ['90days', '90 Days'],
                ] as const).map(([value, label]) => (
                  <button
                    key={value} type="button" aria-pressed={dateRange === value}
                    onClick={() => setDateRange(value)}
                    className={`min-h-12 rounded-lg border px-2 py-2 text-sm font-medium sm:px-4 ${
                      dateRange === value
                        ? 'border-blue-200 bg-blue-50 text-blue-700'
                        : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'
                    }`}
                  >{label}</button>
                ))}
              </div>
              <div className="flex min-w-0 items-center gap-2 text-sm text-gray-500">
                <Calendar className="h-4 w-4 shrink-0" />
                <span className="break-words">
                  {businessDate ? `Business date: ${businessDate}` : 'Business date unavailable'}
                </span>
              </div>
            </div>

            {unavailableSections.length > 0 && (
              <div className="mb-6 flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900" role="status">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>Unavailable canonical sections: {unavailableSections.join(', ')}.</span>
              </div>
            )}

            <div className="mb-6 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
              {metrics.map(metric => {
                const Icon = metric.icon;
                return (
                  <div key={metric.title} className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
                    <div className="mb-4 flex items-center justify-between">
                      <div className="rounded-lg bg-gray-50 p-2"><Icon className="h-5 w-5 text-gray-600" /></div>
                      {metric.change === null ? (
                        <span className="text-sm text-gray-400">Change unavailable</span>
                      ) : (
                        <span className={`text-sm font-medium ${metric.change > 0 ? 'text-green-600' : metric.change < 0 ? 'text-red-600' : 'text-gray-500'}`}>
                          {metric.change > 0 ? '↑ ' : metric.change < 0 ? '↓ ' : ''}{Math.abs(metric.change).toFixed(1)}%
                        </span>
                      )}
                    </div>
                    <p className="text-2xl font-bold text-gray-900">{metric.value}</p>
                    <p className="mt-1 text-sm text-gray-600">{metric.title}</p>
                    <p className="mt-2 text-xs text-gray-400">{metric.subtitle}</p>
                  </div>
                );
              })}
            </div>

            <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
              <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
                <h3 className="mb-4 text-lg font-semibold text-gray-900">Revenue Trend</h3>
                {salesData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <AreaChart data={salesData}>
                      <CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="date" /><YAxis />
                      <Tooltip formatter={(value) => formatCurrency(Number(value))} />
                      <Area type="monotone" dataKey="revenue" stroke="#3B82F6" fill="#93C5FD" strokeWidth={2} />
                    </AreaChart>
                  </ResponsiveContainer>
                ) : <p className="py-24 text-center text-sm text-gray-500">No sales in this period</p>}
              </div>

              <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
                <h3 className="mb-4 text-lg font-semibold text-gray-900">Top Products</h3>
                {topProducts.length > 0 ? (
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={topProducts.map(row => ({ ...row, revenue: Number(row.revenue) }))}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="name" angle={-45} textAnchor="end" height={100} /><YAxis />
                      <Tooltip formatter={(value) => formatCurrency(Number(value))} />
                      <Bar dataKey="revenue" fill="#3B82F6" />
                    </BarChart>
                  </ResponsiveContainer>
                ) : <p className="py-24 text-center text-sm text-gray-500">No product sales in this period</p>}
              </div>
            </div>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
              <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
                <h3 className="mb-4 text-lg font-semibold text-gray-900">Inventory Status</h3>
                {inventoryData ? (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600">Total Stock Value</span>
                      <span className="text-sm font-semibold">{formatCurrency(inventoryData.stock_value)}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-600">Out of Stock</span>
                      <span className="text-sm font-semibold text-red-600">{inventoryData.out_of_stock_products}</span>
                    </div>
                    <p className="text-xs text-gray-400">Low-stock alerts require a configured reorder policy.</p>
                  </div>
                ) : <p className="text-sm text-gray-500">Inventory summary unavailable</p>}
              </div>

              <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
                <h3 className="mb-4 text-lg font-semibold text-gray-900">Top Customers</h3>
                <div className="space-y-3">
                  {topCustomers.map(customer => (
                    <div key={customer.id} className="flex items-center justify-between">
                      <span className="truncate text-sm text-gray-600">{customer.name}</span>
                      <span className="text-sm font-semibold">{formatCurrency(customer.revenue)}</span>
                    </div>
                  ))}
                  {topCustomers.length === 0 && <p className="py-4 text-center text-sm text-gray-400">No customer sales in this period</p>}
                </div>
              </div>

              <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
                <h3 className="mb-4 text-lg font-semibold text-gray-900">Key Alerts</h3>
                {inventoryData && inventoryData.out_of_stock_products > 0 ? (
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="mt-0.5 h-4 w-4 text-red-500" />
                    <div>
                      <p className="text-sm font-medium text-gray-900">Out-of-stock products</p>
                      <p className="text-xs text-gray-500">{inventoryData.out_of_stock_products} active products have no stock</p>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-gray-500">{inventoryData ? 'No authoritative inventory alerts' : 'Alert data unavailable'}</p>
                )}
                {stats === null && <p className="mt-3 text-xs text-gray-400">Sales alert facts are unavailable.</p>}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ExecutiveDashboard;
