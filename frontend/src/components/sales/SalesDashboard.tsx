import React, { useState, useEffect } from 'react';
import {
  TrendingUp, TrendingDown, Users, Package, IndianRupee, 
  FileText, Clock, Calendar, Filter, Download, RefreshCw,
  ChevronRight, Eye, Edit, Plus, Search, BarChart3, AlertCircle
} from 'lucide-react';
import { Card, Button, StatusBadge, DataTable } from '../global';
import { dashboardApi, reportsApi } from '../../services/api';

interface SalesDashboardProps {
  open?: boolean;
  onClose?: () => void;
}

interface Invoice {
  id: string;
  customer: string;
  amount: number;
  date: string;
  status: string;
}

interface Product {
  name: string;
  sold: number;
  revenue: number;
}

interface SalesTrend {
  month: string;
  sales: number;
}

interface DashboardData {
  stats: {
    totalSales: number;
    totalInvoices: number;
    avgOrderValue: number;
    pendingOrders: number;
    totalCustomers: number;
    newCustomers: number;
    totalSalesChange: number;
    totalInvoicesChange: number;
    totalCustomersChange: number;
    pendingOrdersChange: number;
  };
  recentInvoices: Invoice[];
  topProducts: Product[];
  salesTrend: SalesTrend[];
}

// Quick stats card
const StatsCard: React.FC<{
  title: string;
  value: string | number;
  change?: number;
  icon: React.ElementType;
  color: string;
  subtitle?: string;
}> = ({ title, value, change, icon: Icon, color, subtitle }) => {
  const colorMap = {
    blue: 'bg-sales-500',
    green: 'bg-sales-500', 
    amber: 'bg-warning-500',
    purple: 'bg-primary-500',
    red: 'bg-danger-500',
  };

  return (
    <div className="bg-white p-6 rounded-xl shadow-sm border border-app-200 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <p className="text-sm font-medium text-app-600">{title}</p>
          <p className="text-3xl font-bold text-app-800 mt-2">{value}</p>
          {subtitle && (
            <p className="text-xs text-app-500 mt-1">{subtitle}</p>
          )}
          {change !== undefined && (
            <div className="flex items-center mt-3">
              {change > 0 ? (
                <TrendingUp className="w-4 h-4 text-sales-500 mr-1" />
              ) : (
                <TrendingDown className="w-4 h-4 text-danger-500 mr-1" />
              )}
              <span className={`text-sm font-medium ${change > 0 ? 'text-sales-600' : 'text-danger-600'}`}>
                {Math.abs(change)}%
              </span>
              <span className="text-sm text-app-500 ml-1">vs last month</span>
            </div>
          )}
        </div>
        <div className={`p-3 rounded-lg ${colorMap[color]} bg-opacity-10`}>
          <Icon className={`w-6 h-6 ${color === 'green' ? 'text-sales-600' : color === 'blue' ? 'text-sales-600' : color === 'amber' ? 'text-warning-600' : color === 'purple' ? 'text-primary-600' : 'text-danger-600'}`} />
        </div>
      </div>
    </div>
  );
};

// Action card component
const ActionCard: React.FC<{
  title: string;
  description: string;
  icon: React.ElementType;
  onClick: () => void;
  urgent?: boolean;
}> = ({ title, description, icon: Icon, onClick, urgent = false }) => {
  return (
    <div 
      className={`p-4 rounded-lg border-2 cursor-pointer transition-all hover:shadow-md ${
        urgent 
          ? 'bg-danger-50 border-danger-200 hover:border-danger-300' 
          : 'bg-white border-app-200 hover:border-sales-300'
      }`}
      onClick={onClick}
    >
      <div className="flex items-center">
        <div className={`p-2 rounded-lg ${urgent ? 'bg-danger-100' : 'bg-sales-100'}`}>
          <Icon className={`w-5 h-5 ${urgent ? 'text-danger-600' : 'text-sales-600'}`} />
        </div>
        <div className="ml-3 flex-1">
          <p className={`font-medium ${urgent ? 'text-danger-900' : 'text-app-800'}`}>{title}</p>
          <p className={`text-sm ${urgent ? 'text-danger-600' : 'text-app-600'} mt-0.5`}>{description}</p>
        </div>
        <ChevronRight className={`w-5 h-5 ${urgent ? 'text-danger-400' : 'text-app-400'}`} />
      </div>
    </div>
  );
};

const SalesDashboard: React.FC<SalesDashboardProps> = () => {
  const [selectedPeriod, setSelectedPeriod] = useState('month');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // Real data state
  const [dashboardData, setDashboardData] = useState<DashboardData>({
    stats: {
      totalSales: 0,
      totalInvoices: 0,
      avgOrderValue: 0,
      pendingOrders: 0,
      totalCustomers: 0,
      newCustomers: 0,
      totalSalesChange: 0,
      totalInvoicesChange: 0,
      totalCustomersChange: 0,
      pendingOrdersChange: 0,
    },
    recentInvoices: [],
    topProducts: [],
    salesTrend: [],
  });

  // Fetch sales dashboard data from APIs
  const fetchSalesData = async () => {
    try {
      setLoading(true);
      setError(null);

      // Fetch all sales data in parallel
      const [
        statsResponse,
        recentInvoicesResponse,
        topProductsResponse,
        salesTrendResponse
      ] = await Promise.all([
        dashboardApi.getStats(),
        dashboardApi.getRecentOrders(10),
        dashboardApi.getTopProducts(10),
        reportsApi.sales.trends({ period: selectedPeriod })
      ]);

      // Update stats
      if (statsResponse.data) {
        setDashboardData(prev => ({
          ...prev,
          stats: {
            totalSales: statsResponse.data.totalRevenue || 0,
            totalInvoices: statsResponse.data.totalOrders || 0,
            avgOrderValue: statsResponse.data.totalOrders > 0 ? 
              Math.round(statsResponse.data.totalRevenue / statsResponse.data.totalOrders) : 0,
            pendingOrders: statsResponse.data.pendingOrders || 0,
            totalCustomers: statsResponse.data.totalCustomers || 0,
            newCustomers: statsResponse.data.newCustomers || 0,
            totalSalesChange: statsResponse.data.totalSalesChange || 0,
            totalInvoicesChange: statsResponse.data.totalInvoicesChange || 0,
            totalCustomersChange: statsResponse.data.totalCustomersChange || 0,
            pendingOrdersChange: statsResponse.data.pendingOrdersChange || 0,
          }
        }));
      }

      // Update recent invoices
      if (recentInvoicesResponse.data?.orders) {
        const invoices = recentInvoicesResponse.data.orders.map((order: any) => ({
          id: order.order_number || order.order_id || `ORD-${order.order_id}`,
          customer: order.customer_name || 'Unknown Customer',
          amount: order.final_amount || 0,
          date: order.order_date || new Date().toISOString().split('T')[0],
          status: order.order_status || 'pending'
        }));
        setDashboardData(prev => ({ ...prev, recentInvoices: invoices }));
      }

      // Update top products
      if (topProductsResponse.data?.products) {
        const products = topProductsResponse.data.products.map((product: any) => ({
          name: product.product_name || product.name,
          sold: product.sold || product.quantity || 0,
          revenue: product.revenue || product.total_amount || 0
        }));
        setDashboardData(prev => ({ ...prev, topProducts: products }));
      }

      // Update sales trend
      if (salesTrendResponse.data?.trends) {
        const trends = salesTrendResponse.data.trends.map((trend: any) => ({
          month: trend.month || trend.period,
          sales: trend.sales || trend.revenue || 0
        }));
        setDashboardData(prev => ({ ...prev, salesTrend: trends }));
      }

    } catch (error) {
      console.error('Error fetching sales data:', error);
      setError('Failed to load sales data. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Refresh data
  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchSalesData();
    setRefreshing(false);
  };

  // Load data on component mount and period change
  useEffect(() => {
    fetchSalesData();
  }, [selectedPeriod]);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      minimumFractionDigits: 0,
    }).format(amount);
  };

  const getStatusColor = (status: string): 'solid' | 'light' | 'outline' => {
    return 'light'; // Always use light variant for status badges
  };

  return (
    <div className="min-h-screen bg-app-50">
      {/* Header */}
      <div className="bg-white border-b border-app-200 sticky top-0 z-10">
        <div className="px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-app-800">Sales Dashboard</h1>
              <p className="text-sm text-app-500 mt-1">
                {new Date().toLocaleDateString('en-IN', { 
                  weekday: 'long', 
                  year: 'numeric', 
                  month: 'long', 
                  day: 'numeric' 
                })}
              </p>
            </div>
            <div className="flex items-center space-x-3">
              <select
                value={selectedPeriod}
                onChange={(e) => setSelectedPeriod(e.target.value)}
                className="px-4 py-2 border border-app-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-sales-500"
              >
                <option value="today">Today</option>
                <option value="week">This Week</option>
                <option value="month">This Month</option>
                <option value="quarter">This Quarter</option>
                <option value="year">This Year</option>
              </select>
              <Button
                variant="outline"
                size="sm"
                icon={<RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />}
                iconPosition="left"
                onClick={handleRefresh}
                disabled={loading || refreshing}
              >
                Refresh
              </Button>
              <Button
                variant="primary"
                size="sm"
                icon={<Plus className="w-4 h-4" />}
                iconPosition="left"
              >
                New Invoice
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="px-6 py-6 max-w-7xl mx-auto">
        {/* Error State */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
            <div className="flex items-center">
              <AlertCircle className="w-5 h-5 text-red-600 mr-2" />
              <span className="text-red-800">{error}</span>
            </div>
          </div>
        )}

        {/* Loading State */}
        {loading && (
          <div className="mb-6 p-8 text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-sales-600 mx-auto mb-4"></div>
            <p className="text-app-600">Loading sales data...</p>
          </div>
        )}

        {/* Key Metrics */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
          <StatsCard
            title="Total Sales"
            value={formatCurrency(dashboardData.stats.totalSales)}
            change={dashboardData.stats.totalSalesChange}
            icon={IndianRupee}
            color="green"
            subtitle="This month"
          />
          <StatsCard
            title="Total Invoices"
            value={dashboardData.stats.totalInvoices}
            change={dashboardData.stats.totalInvoicesChange}
            icon={FileText}
            color="blue"
            subtitle={`Avg: ${formatCurrency(dashboardData.stats.avgOrderValue)}`}
          />
          <StatsCard
            title="Active Customers"
            value={dashboardData.stats.totalCustomers}
            change={dashboardData.stats.totalCustomersChange}
            icon={Users}
            color="purple"
            subtitle={`+${dashboardData.stats.newCustomers} new`}
          />
          <StatsCard
            title="Pending Orders"
            value={dashboardData.stats.pendingOrders}
            change={dashboardData.stats.pendingOrdersChange}
            icon={Clock}
            color="amber"
            subtitle="Need attention"
          />
        </div>

        {/* Quick Actions */}
        <div className="bg-white rounded-xl shadow-sm border border-app-200 p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-app-800">Quick Actions</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <ActionCard
              title="Create Invoice"
              description="Generate new sales invoice"
              icon={FileText}
              onClick={() => console.log('Create Invoice')}
            />
            <ActionCard
              title="Record Payment"
              description="Update payment status"
              icon={IndianRupee}
              onClick={() => console.log('Record Payment')}
            />
            <ActionCard
              title="Overdue Follow-up"
              description="3 invoices overdue"
              icon={Clock}
              onClick={() => console.log('Overdue Follow-up')}
              urgent={true}
            />
            <ActionCard
              title="Sales Reports"
              description="View detailed analytics"
              icon={BarChart3}
              onClick={() => console.log('Sales Reports')}
            />
          </div>
        </div>

        {/* Recent Activity and Top Products */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
          {/* Recent Invoices */}
          <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-app-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-app-800">Recent Invoices</h2>
              <Button variant="ghost" size="sm">
                View All
              </Button>
            </div>
            <div className="space-y-3">
              {dashboardData.recentInvoices.map((invoice) => (
                <div key={invoice.id} className="flex items-center p-3 bg-app-50 rounded-lg hover:bg-app-100 transition-colors">
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <p className="font-medium text-app-800">{invoice.id}</p>
                      <StatusBadge 
                        status={invoice.status}
                        variant={getStatusColor(invoice.status)}
                      />
                    </div>
                    <p className="text-sm text-app-600 mt-0.5">{invoice.customer}</p>
                    <div className="flex items-center justify-between mt-1">
                      <span className="text-sm font-medium text-app-800">
                        {formatCurrency(invoice.amount)}
                      </span>
                      <span className="text-xs text-app-500">{invoice.date}</span>
                    </div>
                  </div>
                  <div className="ml-3 flex space-x-1">
                    <Button variant="ghost" size="sm">
                      <Eye className="w-4 h-4" />
                    </Button>
                    <Button variant="ghost" size="sm">
                      <Edit className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Top Products */}
          <div className="bg-white rounded-xl shadow-sm border border-app-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-app-800">Top Products</h2>
            </div>
            <div className="space-y-4">
              {dashboardData.topProducts.map((product, index) => (
                <div key={product.name} className="flex items-center">
                  <div className="w-8 h-8 rounded-full bg-sales-100 flex items-center justify-center text-sm font-medium text-sales-600">
                    {index + 1}
                  </div>
                  <div className="flex-1 ml-3">
                    <p className="text-sm font-medium text-app-800">{product.name}</p>
                    <div className="flex items-center justify-between mt-1">
                      <span className="text-xs text-app-500">{product.sold} units</span>
                      <span className="text-sm font-medium text-app-800">
                        {formatCurrency(product.revenue)}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Sales Trend Chart */}
        <div className="bg-white rounded-xl shadow-sm border border-app-200 p-6">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-lg font-semibold text-app-800">Sales Trend</h2>
            <div className="flex items-center space-x-2">
              <Button variant="ghost" size="sm">
                <Download className="w-4 h-4 mr-2" />
                Export
              </Button>
            </div>
          </div>
          <div className="h-64 flex items-end space-x-4">
            {dashboardData.salesTrend.map((item) => {
              const maxSales = Math.max(...dashboardData.salesTrend.map(s => s.sales));
              const height = (item.sales / maxSales) * 200;
              return (
                <div key={item.month} className="flex-1 flex flex-col items-center">
                  <div 
                    className="w-full bg-sales-500 rounded-t-lg transition-all hover:bg-sales-600"
                    style={{ height: `${height}px` }}
                  />
                  <p className="text-sm text-app-600 mt-2">{item.month}</p>
                  <p className="text-xs text-app-500">{formatCurrency(item.sales)}</p>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

export default SalesDashboard;