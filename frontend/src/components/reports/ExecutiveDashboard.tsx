import React, { useState, useEffect } from 'react';
import {
  DollarSign, ShoppingCart, Package, Users, TrendingUp,
  AlertTriangle, Calendar, RefreshCw, Download
} from 'lucide-react';
import { format, subDays, startOfMonth } from 'date-fns';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Area, AreaChart
} from 'recharts';
import { ModuleHeader } from '../global';
import apiClient from '../../services/api/apiClient';
import { formatCurrency } from '../../utils/formatters';

interface ExecutiveDashboardProps {
  embedded?: boolean;
  onClose?: () => void;
}

interface MetricCard {
  title: string;
  value: string | number;
  change: number;
  changeType: 'increase' | 'decrease';
  icon: React.ComponentType<any>;
  subtitle: string;
}

const COLORS = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#EC4899'];

const ExecutiveDashboard: React.FC<ExecutiveDashboardProps> = ({ embedded = false, onClose }) => {
  const [dateRange, setDateRange] = useState('30days');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [dashboardData, setDashboardData] = useState<any>({});
  const [metrics, setMetrics] = useState<MetricCard[]>([]);
  const [salesData, setSalesData] = useState<any[]>([]);
  const [inventoryData, setInventoryData] = useState<any>(null);
  const [topProducts, setTopProducts] = useState<any[]>([]);
  const [topCustomers, setTopCustomers] = useState<any[]>([]);

  useEffect(() => {
    loadDashboardData();
  }, [dateRange]);

  const loadDashboardData = async () => {
    setLoading(true);
    try {
      // Calculate date range
      const endDate = new Date();
      let startDate = new Date();

      switch (dateRange) {
        case '7days':
          startDate = subDays(endDate, 7);
          break;
        case '30days':
          startDate = subDays(endDate, 30);
          break;
        case 'month':
          startDate = startOfMonth(endDate);
          break;
        case '90days':
          startDate = subDays(endDate, 90);
          break;
        default:
          startDate = subDays(endDate, 30);
      }

      const dateParams = {
        date_from: format(startDate, 'yyyy-MM-dd'),
        date_to: format(endDate, 'yyyy-MM-dd')
      };

      // Fetch real data from multiple endpoints in parallel
      const [
        dashboardStats,
        salesAnalytics,
        inventorySummary,
        financialSummary,
        topProductsData,
        topCustomersData
      ] = await Promise.all([
        apiClient.get('/dashboard/stats', { params: dateParams }),
        apiClient.get('/dashboard/sales-analytics', { params: dateParams }),
        apiClient.get('/dashboard/inventory-summary', { params: dateParams }),
        apiClient.get('/dashboard/financial-summary', { params: dateParams }),
        apiClient.get('/dashboard/top-products', { params: { ...dateParams, limit: 5 } }),
        apiClient.get('/dashboard/top-customers', { params: { ...dateParams, limit: 5 } })
      ]);

      // Process dashboard stats for metric cards
      const stats = dashboardStats.data || {};
      const financial = financialSummary.data || {};
      const inventory = inventorySummary.data || {};

      const metricsData: MetricCard[] = [
        {
          title: 'Total Revenue',
          value: formatCurrency(stats.total_revenue || financial.total_revenue || 0),
          change: stats.revenue_change || 0,
          changeType: stats.revenue_change >= 0 ? 'increase' : 'decrease',
          icon: DollarSign,
          subtitle: 'This period'
        },
        {
          title: 'Total Orders',
          value: stats.total_orders || stats.total_invoices || 0,
          change: stats.orders_change || 0,
          changeType: stats.orders_change >= 0 ? 'increase' : 'decrease',
          icon: ShoppingCart,
          subtitle: 'Orders placed'
        },
        {
          title: 'Active Products',
          value: inventory.total_products || inventory.active_products || 0,
          change: inventory.products_change || 0,
          changeType: 'increase',
          icon: Package,
          subtitle: 'In inventory'
        },
        {
          title: 'Total Customers',
          value: stats.total_customers || 0,
          change: stats.customers_change || 0,
          changeType: stats.customers_change >= 0 ? 'increase' : 'decrease',
          icon: Users,
          subtitle: 'Registered'
        }
      ];

      setMetrics(metricsData);
      setDashboardData(stats);

      // Process sales analytics for charts
      const salesChartData = (salesAnalytics.data || []).map((item: any) => ({
        date: item.date || item.period,
        revenue: item.revenue || item.total_sales || 0,
        orders: item.orders || item.invoice_count || 0,
        profit: item.profit || (item.revenue * 0.2) || 0
      }));
      setSalesData(salesChartData);

      // Set inventory data
      setInventoryData(inventory);

      // Set top products and customers
      setTopProducts(topProductsData.data || []);
      setTopCustomers(topCustomersData.data || []);

    } catch (error) {
      console.error('Error loading dashboard data:', error);
      // Even if API fails, show empty state instead of mock data
      setMetrics([]);
      setSalesData([]);
      setTopProducts([]);
      setTopCustomers([]);
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadDashboardData();
    setRefreshing(false);
  };

  const handleExport = () => {
    const escape = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`;
    const rows: unknown[][] = [
      ['Executive Dashboard', dateRange],
      [],
      ['Metric', 'Value', 'Change %'],
      ...metrics.map(metric => [metric.title, metric.value, metric.change]),
      [],
      ['Top Product', 'Revenue', 'Sales'],
      ...topProducts.map(product => [product.name, product.revenue || 0, product.sales || 0]),
      [],
      ['Top Customer', 'Revenue', 'Orders'],
      ...topCustomers.map(customer => [customer.name, customer.revenue || 0, customer.orders || 0])
    ];
    const blob = new Blob([rows.map(row => row.map(escape).join(',')).join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `executive-dashboard-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  if (loading && !refreshing) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading executive dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className={embedded ? 'p-6' : 'h-full bg-gray-50'}>
      <div className={embedded ? '' : 'h-full flex flex-col'}>
        {!embedded && (
          <ModuleHeader
            title="Executive Dashboard"
            documentNumber=""
            status=""
            icon={TrendingUp}
            iconColor="text-blue-600"
            onClose={onClose}
            historyType="report"
            additionalActions={[
              {
                label: 'Refresh',
                icon: RefreshCw,
                onClick: handleRefresh,
                variant: 'outline',
                disabled: refreshing
              },
              {
                label: 'Export',
                icon: Download,
                onClick: handleExport,
                variant: 'secondary'
              }
            ] as any}
          />
        )}

        <div className={embedded ? '' : 'flex-1 overflow-y-auto'}>
          <div className="max-w-7xl mx-auto px-6 py-6">
            {/* Date Range Selector */}
            <div className="mb-6 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setDateRange('7days')}
                  className={`px-4 py-2 rounded-lg text-sm font-medium ${
                    dateRange === '7days'
                      ? 'bg-blue-100 text-blue-700'
                      : 'bg-white text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  7 Days
                </button>
                <button
                  onClick={() => setDateRange('30days')}
                  className={`px-4 py-2 rounded-lg text-sm font-medium ${
                    dateRange === '30days'
                      ? 'bg-blue-100 text-blue-700'
                      : 'bg-white text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  30 Days
                </button>
                <button
                  onClick={() => setDateRange('month')}
                  className={`px-4 py-2 rounded-lg text-sm font-medium ${
                    dateRange === 'month'
                      ? 'bg-blue-100 text-blue-700'
                      : 'bg-white text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  This Month
                </button>
                <button
                  onClick={() => setDateRange('90days')}
                  className={`px-4 py-2 rounded-lg text-sm font-medium ${
                    dateRange === '90days'
                      ? 'bg-blue-100 text-blue-700'
                      : 'bg-white text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  90 Days
                </button>
              </div>
              <div className="flex items-center gap-2 text-sm text-gray-500">
                <Calendar className="w-4 h-4" />
                <span>Last updated: {new Date().toLocaleString()}</span>
              </div>
            </div>

            {/* Metric Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
              {metrics.map((metric, index) => {
                const Icon = metric.icon;
                return (
                  <div key={index} className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                    <div className="flex items-center justify-between mb-4">
                      <div className="p-2 bg-gray-50 rounded-lg">
                        <Icon className="w-5 h-5 text-gray-600" />
                      </div>
                      <span
                        className={`text-sm font-medium ${
                          metric.changeType === 'increase' ? 'text-green-600' : 'text-red-600'
                        }`}
                      >
                        {metric.changeType === 'increase' ? '↑' : '↓'} {Math.abs(metric.change)}%
                      </span>
                    </div>
                    <p className="text-2xl font-bold text-gray-900">{metric.value}</p>
                    <p className="text-sm text-gray-600 mt-1">{metric.title}</p>
                    <p className="text-xs text-gray-400 mt-2">{metric.subtitle}</p>
                  </div>
                );
              })}
            </div>

            {/* Charts Row */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
              {/* Revenue Trend */}
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Revenue Trend</h3>
                <ResponsiveContainer width="100%" height={300}>
                  <AreaChart data={salesData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" />
                    <YAxis />
                    <Tooltip formatter={(value) => formatCurrency(Number(value))} />
                    <Area
                      type="monotone"
                      dataKey="revenue"
                      stroke="#3B82F6"
                      fill="#93C5FD"
                      strokeWidth={2}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>

              {/* Top Products */}
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Top Products</h3>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={topProducts.slice(0, 5)}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="product_name" angle={-45} textAnchor="end" height={100} />
                    <YAxis />
                    <Tooltip formatter={(value) => formatCurrency(Number(value))} />
                    <Bar dataKey="revenue" fill="#3B82F6" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Bottom Row */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Inventory Status */}
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Inventory Status</h3>
                <div className="space-y-3">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600">Total Stock Value</span>
                    <span className="text-sm font-semibold">
                      {formatCurrency(inventoryData?.total_stock_value || 0)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600">Low Stock Items</span>
                    <span className="text-sm font-semibold text-amber-600">
                      {inventoryData?.low_stock_count || 0}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600">Out of Stock</span>
                    <span className="text-sm font-semibold text-red-600">
                      {inventoryData?.out_of_stock_count || 0}
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600">Expiring Soon</span>
                    <span className="text-sm font-semibold text-orange-600">
                      {inventoryData?.expiring_soon_count || 0}
                    </span>
                  </div>
                </div>
              </div>

              {/* Top Customers */}
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Top Customers</h3>
                <div className="space-y-3">
                  {topCustomers.slice(0, 5).map((customer, index) => (
                    <div key={index} className="flex justify-between items-center">
                      <span className="text-sm text-gray-600 truncate">
                        {customer.customer_name || customer.name}
                      </span>
                      <span className="text-sm font-semibold">
                        {formatCurrency(customer.total_revenue || customer.total_purchase || 0)}
                      </span>
                    </div>
                  ))}
                  {topCustomers.length === 0 && (
                    <p className="text-sm text-gray-400 text-center py-4">No customer data available</p>
                  )}
                </div>
              </div>

              {/* Key Alerts */}
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Key Alerts</h3>
                <div className="space-y-3">
                  {inventoryData?.low_stock_count > 0 && (
                    <div className="flex items-start gap-3">
                      <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5" />
                      <div>
                        <p className="text-sm font-medium text-gray-900">Low Stock Alert</p>
                        <p className="text-xs text-gray-500">
                          {inventoryData.low_stock_count} items running low
                        </p>
                      </div>
                    </div>
                  )}
                  {dashboardData.pending_payments > 0 && (
                    <div className="flex items-start gap-3">
                      <AlertTriangle className="w-4 h-4 text-orange-500 mt-0.5" />
                      <div>
                        <p className="text-sm font-medium text-gray-900">Pending Payments</p>
                        <p className="text-xs text-gray-500">
                          {formatCurrency(dashboardData.pending_payments_amount || 0)} outstanding
                        </p>
                      </div>
                    </div>
                  )}
                  {inventoryData?.expiring_soon_count > 0 && (
                    <div className="flex items-start gap-3">
                      <AlertTriangle className="w-4 h-4 text-red-500 mt-0.5" />
                      <div>
                        <p className="text-sm font-medium text-gray-900">Expiry Warning</p>
                        <p className="text-xs text-gray-500">
                          {inventoryData.expiring_soon_count} items expiring soon
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ExecutiveDashboard;
