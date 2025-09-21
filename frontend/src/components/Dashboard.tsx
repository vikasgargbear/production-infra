import React, { useState, useEffect, useMemo } from 'react';
import {
  Bell, Package, DollarSign, ShoppingCart, Truck, CreditCard,
  TrendingUp, TrendingDown, AlertCircle, FileText, RefreshCw, Percent,
  Plus, Settings, BarChart3, Calendar, Filter, Search,
  Eye, Download, Mail, MessageSquare, Phone, MapPin, Clock, Users,
  Activity, Zap, CheckCircle, XCircle, AlertTriangle, Play, Pause,
  File, ArrowRight, Trash2, Check, ArrowUpRight, Share2, X,
  ChevronDown, MoreHorizontal
} from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Area, AreaChart, BarChart, Bar } from 'recharts';
// import NewChallan from './NewChallan'; // Old version
import ModularChallanCreatorV5 from './challan/ModularChallanCreatorV5'; // New improved version
// import { AddSalePage } from './Home';
import BusinessSalesEntry from './BusinessSalesEntry';
import { apiUtils, dashboardApi, ordersApi, invoiceAPI, salesApi, purchasesAPI, productsApi, customersApi } from '../services/api';
import { Button, StatusBadge, DataTable, DatePicker, ModuleHeader } from './global';

// Type definitions
interface DashboardStats {
  totalRevenue: number;
  totalOrders: number;
  totalProducts: number;
  totalCustomers: number;
  expiringSoon: number;
  pendingPayments: number;
  stockValue: number;
  lowStockItems: number;
  dailySales: number;
  monthlyGrowth: number;
  customerRetention: number;
  averageOrderValue: number;
  profitMargin: number;
  inventoryTurnover: number;
  prescriptionCount: number;
  returnRate: number;
}

interface SalesDataPoint {
  month: string;
  revenue: number;
  orders: number;
}

interface ProductCategory {
  name: string;
  value: number;
  color: string;
}

interface Order {
  id: string;
  customer: string;
  amount: number;
  status: string;
  date: string;
}

interface Alert {
  id: number;
  type: 'stock' | 'expiry' | 'order' | 'payment';
  message: string;
  severity: 'high' | 'medium' | 'low';
  timestamp: string;
  read: boolean;
}

interface CustomKPI {
  id: number;
  name: string;
  value: string;
  icon: React.ElementType;
  color: string;
  trend: string;
}

interface FabAction {
  id: string;
  label: string;
  icon: React.ElementType;
  color: string;
}

interface ChartData {
  revenue: SalesDataPoint[];
  orders: SalesDataPoint[];
  profit: SalesDataPoint[];
  customers: SalesDataPoint[];
}

interface OrderSort {
  field: 'date' | 'amount';
  direction: 'asc' | 'desc';
}

type AlertFilter = 'all' | 'stock' | 'expiry' | 'order' | 'payment';
type OrderFilter = 'all' | 'pending' | 'completed' | 'cancelled';
type ChartTimeRange = 'daily' | 'weekly' | 'monthly' | 'yearly';
type ChartType = 'area' | 'bar';
type SelectedChart = 'revenue' | 'orders' | 'profit' | 'customers';
type PanelType = 'add-sale' | 'create-challan' | 'add-purchase' | 'add-payment' | null;

// Props interfaces
interface StatCardProps {
  title: string;
  value: string | number;
  icon: React.ElementType;
  gradient: string;
  trend?: 'up' | 'down';
  trendValue?: string;
  bgGradient: string;
}

interface QuickActionProps {
  title: string;
  description: string;
  icon: React.ElementType;
  gradient: string;
  onClick: () => void;
}

interface KPICardProps {
  kpi: CustomKPI;
}

interface AlertCardProps {
  alert: Alert;
}

interface ChartHeaderProps {
  title: string;
  subtitle: string;
  onTimeRangeChange: (range: ChartTimeRange) => void;
  onChartTypeChange?: (type: ChartType) => void;
}

interface ChartCardProps {
  title: string;
  data: SalesDataPoint[];
  type?: ChartType;
}

const fabActions: FabAction[] = [
  {
    id: 'add-sale',
    label: 'Add Sale',
    icon: ShoppingCart,
    color: 'bg-green-500',
  },
  {
    id: 'create-challan',
    label: 'Create Challan',
    icon: Truck,
    color: 'bg-blue-500',
  },
  {
    id: 'add-purchase',
    label: 'Add Purchase',
    icon: Package,
    color: 'bg-gray-600',
  },
  {
    id: 'add-payment',
    label: 'Add Payment',
    icon: CreditCard,
    color: 'bg-teal-500',
  },
];

const Dashboard: React.FC = () => {
  const [stats, setStats] = useState<DashboardStats>({
    totalRevenue: 0,
    totalOrders: 0,
    totalProducts: 0,
    totalCustomers: 0,
    expiringSoon: 0,
    pendingPayments: 0,
    stockValue: 0,
    lowStockItems: 0,
    dailySales: 0,
    monthlyGrowth: 0,
    customerRetention: 0,
    averageOrderValue: 0,
    profitMargin: 0,
    inventoryTurnover: 0,
    prescriptionCount: 0,
    returnRate: 0
  });

  // Real data state
  const [salesData, setSalesData] = useState<SalesDataPoint[]>([]);
  const [productCategories, setProductCategories] = useState<ProductCategory[]>([]);
  const [recentOrders, setRecentOrders] = useState<Order[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [customKPIs, setCustomKPIs] = useState<CustomKPI[]>([]);
  const [chartData, setChartData] = useState<ChartData>({
    revenue: [],
    orders: [],
    profit: [],
    customers: []
  });

  // Loading and error states
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const [alertFilter, setAlertFilter] = useState<AlertFilter>('all');

  const [isCustomizingKPIs, setIsCustomizingKPIs] = useState<boolean>(false);
  const [selectedKPIs, setSelectedKPIs] = useState<number[]>([1, 2, 3, 4]);

  const [chartTimeRange, setChartTimeRange] = useState<ChartTimeRange>('monthly');
  const [selectedChart, setSelectedChart] = useState<SelectedChart>('revenue');

  const [orderFilter, setOrderFilter] = useState<OrderFilter>('all');
  const [orderSort, setOrderSort] = useState<OrderSort>({ field: 'date', direction: 'desc' });
  const [searchQuery, setSearchQuery] = useState<string>('');

  const [fabOpen, setFabOpen] = useState<boolean>(false);
  const [panel, setPanel] = useState<PanelType>(null);

  const filteredOrders = recentOrders
    .filter(order => {
      if (orderFilter === 'all') return true;
      return order.status.toLowerCase() === orderFilter;
    })
    .filter(order => {
      if (!searchQuery) return true;
      return (
        order.customer.toLowerCase().includes(searchQuery.toLowerCase()) ||
        order.id.toLowerCase().includes(searchQuery.toLowerCase())
      );
    })
    .sort((a, b) => {
      if (orderSort.field === 'date') {
        return orderSort.direction === 'desc'
          ? new Date(b.date).getTime() - new Date(a.date).getTime()
          : new Date(a.date).getTime() - new Date(b.date).getTime();
      }
      if (orderSort.field === 'amount') {
        return orderSort.direction === 'desc'
          ? b.amount - a.amount
          : a.amount - b.amount;
      }
      return 0;
    });

  const filteredAlerts = alerts
    .filter(alert => {
      if (alertFilter === 'all') return true;
      return alert.type === alertFilter;
    })
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  const markAsRead = (alertId: number): void => {
    setAlerts(alerts.map(alert =>
      alert.id === alertId ? { ...alert, read: true } : alert
    ));
  };

  const deleteAlert = (alertId: number): void => {
    setAlerts(alerts.filter(alert => alert.id !== alertId));
  };

  const getAlertIcon = (type: Alert['type']): React.ElementType => {
    switch (type) {
      case 'stock':
        return Package;
      case 'expiry':
        return AlertCircle;
      case 'order':
        return ShoppingCart;
      case 'payment':
        return DollarSign;
      default:
        return Bell;
    }
  };

  const getAlertColor = (type: Alert['type'], severity: Alert['severity']): string => {
    const colors = {
      stock: {
        high: 'red',
        medium: 'orange',
        low: 'yellow'
      },
      expiry: {
        high: 'red',
        medium: 'orange',
        low: 'yellow'
      },
      order: {
        high: 'green',
        medium: 'blue',
        low: 'gray'
      },
      payment: {
        high: 'green',
        medium: 'blue',
        low: 'gray'
      }
    };
    return colors[type]?.[severity] || 'gray';
  };

  const AlertCard: React.FC<AlertCardProps> = ({ alert }) => {
    const color = getAlertColor(alert.type, alert.severity);
    const IconComponent = getAlertIcon(alert.type);
    const timeAgo = new Date(alert.timestamp).toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: 'numeric',
      hour12: true
    });

    return (
      <div className={`bg-white rounded-lg border border-gray-100 p-4 ${
        !alert.read ? 'border-l-4 border-l-blue-500' : ''
      }`}>
        <div className="flex items-start justify-between">
          <div className="flex items-start space-x-3">
            <div className={`p-2 rounded-lg bg-${color}-50`}>
              <IconComponent className={`w-5 h-5 text-${color}-500`} />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-900">{alert.message}</p>
              <p className="text-xs text-gray-500 mt-1">{timeAgo}</p>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            {!alert.read && (
              <button
                onClick={() => markAsRead(alert.id)}
                className="p-1 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-50"
              >
                <Check className="w-4 h-4" />
              </button>
            )}
            <button
              onClick={() => deleteAlert(alert.id)}
              className="p-1 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-50"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    );
  };

  // Fetch dashboard data from APIs
  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      setError(null);

      // Fetch all dashboard data in parallel using existing APIs
      const [
        statsResponse,
        invoicesResponse,
        recentOrdersResponse,
        revenueResponse,
        topProductsResponse,
        inventoryAlertsResponse,
        pendingPaymentsResponse,
        productsResponse,
        customersResponse
      ] = await Promise.all([
        dashboardApi.getStats(),
        invoiceAPI.getAll({ limit: 10 }).catch(() => ({ data: [] })), // Get recent invoices
        dashboardApi.getRecentOrders(10),
        dashboardApi.getRevenueData('monthly'),
        dashboardApi.getTopProducts(10),
        dashboardApi.getInventoryAlerts(),
        dashboardApi.getPendingPayments(),
        productsApi.getAll().catch(() => ({ data: [] })), // Get all products
        customersApi.getAll().catch(() => ({ data: [] })) // Get all customers
      ]);

      // Calculate stats from actual data
      const backendStats = statsResponse.data || {};
      const invoices = invoicesResponse.data || [];
      const products = productsResponse.data || [];
      const customers = customersResponse.data || [];

      // Calculate total revenue from invoices
      const totalRevenue = invoices.reduce((sum: number, invoice: any) =>
        sum + (invoice.final_amount || 0), 0);

      // Calculate today's sales from invoices
      const today = new Date().toDateString();
      const dailySales = invoices
        .filter((invoice: any) => new Date(invoice.invoice_date).toDateString() === today)
        .reduce((sum: number, invoice: any) => sum + (invoice.final_amount || 0), 0);

      setStats({
        totalRevenue: totalRevenue || backendStats.revenue_this_month || 0,
        totalOrders: invoices.length || backendStats.orders_this_month || 0,
        totalProducts: products.length || backendStats.total_products || 0,
        totalCustomers: customers.length || backendStats.total_customers || 0,
        expiringSoon: backendStats.expiring_soon || 0,
        pendingPayments: pendingPaymentsResponse.data?.summary?.total_receivables || 0,
        stockValue: 0, // Not available in current API
        lowStockItems: backendStats.low_stock_products || 0,
        dailySales: dailySales,
        monthlyGrowth: 0, // Calculate if needed
        customerRetention: 0, // Calculate if needed
        averageOrderValue: invoices.length > 0 ? totalRevenue / invoices.length : 0,
        profitMargin: 0, // Calculate if needed
        inventoryTurnover: 0, // Calculate if needed
        prescriptionCount: 0, // Calculate if needed
        returnRate: 0 // Calculate if needed
      });

          // Update recent orders - use both orders and invoices
      const allOrders: Order[] = [];

      // Add orders from dashboard API
      if (recentOrdersResponse.data && Array.isArray(recentOrdersResponse.data)) {
        const mappedOrders = recentOrdersResponse.data.map((order: any) => ({
          id: order.order_id || order.id,
          customer: order.customer_name || 'Unknown Customer',
          amount: order.final_amount || 0,
          status: order.order_status === 'confirmed' ? 'Completed' :
                  order.order_status === 'pending' ? 'Pending' : 'Cancelled',
          date: new Date(order.order_date).toLocaleDateString('en-IN')
        }));
        allOrders.push(...mappedOrders);
      }

      // Add recent invoices
      if (invoices && Array.isArray(invoices)) {
        const recentInvoices = invoices.slice(0, 10).map((invoice: any) => ({
          id: invoice.invoice_number || invoice.invoice_id,
          customer: invoice.customer_name || 'Unknown Customer',
          amount: invoice.final_amount || 0,
          status: invoice.payment_status === 'paid' ? 'Completed' :
                  invoice.payment_status === 'partial' ? 'Pending' : 'Pending',
          date: new Date(invoice.invoice_date || invoice.created_at).toLocaleDateString('en-IN')
        }));
        allOrders.push(...recentInvoices);
      }

      // Sort by date and take most recent
      allOrders.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
      setRecentOrders(allOrders.slice(0, 15));

      // Update sales data - create from invoices if revenue API fails
      let mappedSalesData: SalesDataPoint[] = [];
      if (revenueResponse.data && Array.isArray(revenueResponse.data)) {
        mappedSalesData = revenueResponse.data.map((item: any) => ({
          month: new Date(item.period).toLocaleDateString('en-IN', { month: 'short' }),
          revenue: item.revenue || 0,
          orders: item.order_count || 0
        }));
      } else if (invoices && Array.isArray(invoices)) {
        // Group invoices by month for chart data
        const monthlyData: { [key: string]: { revenue: number, orders: number } } = {};

        invoices.forEach((invoice: any) => {
          const date = new Date(invoice.invoice_date || invoice.created_at);
          const monthKey = date.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' });

          if (!monthlyData[monthKey]) {
            monthlyData[monthKey] = { revenue: 0, orders: 0 };
          }

          monthlyData[monthKey].revenue += invoice.final_amount || 0;
          monthlyData[monthKey].orders += 1;
        });

        mappedSalesData = Object.keys(monthlyData).map(month => ({
          month: month.split(' ')[0], // Just month name
          revenue: monthlyData[month].revenue,
          orders: monthlyData[month].orders
        }));
      }
      setSalesData(mappedSalesData);

      // Update product categories from top products
      if (topProductsResponse.data && Array.isArray(topProductsResponse.data)) {
        const categories = topProductsResponse.data.reduce((acc: any, product: any) => {
          const category = product.brand || 'Others';
          const existing = acc.find((c: any) => c.name === category);
          if (existing) {
            existing.value += product.total_quantity_sold || 0;
          } else {
            acc.push({
              name: category,
              value: product.total_quantity_sold || 0,
              color: getRandomColor()
            });
          }
          return acc;
        }, []);

        // Convert to percentages
        const total = categories.reduce((sum: number, cat: any) => sum + cat.value, 0);
        const categoriesWithPercentages = categories.map((cat: any) => ({
          ...cat,
          value: total > 0 ? Math.round((cat.value / total) * 100) : 0
        }));
        setProductCategories(categoriesWithPercentages);
      }

      // Create mock alerts based on real data
      const newAlerts = [];
      if (backendStats.low_stock_products > 0) {
        newAlerts.push({
          id: 1,
          type: 'stock' as const,
          message: `${backendStats.low_stock_products} products are running low on stock`,
          severity: 'high' as const,
          timestamp: new Date().toISOString(),
          read: false
        });
      }
      if (backendStats.expiring_soon > 0) {
        newAlerts.push({
          id: 2,
          type: 'expiry' as const,
          message: `${backendStats.expiring_soon} products expiring within 30 days`,
          severity: 'medium' as const,
          timestamp: new Date().toISOString(),
          read: false
        });
      }
      setAlerts(newAlerts);

      // Update custom KPIs based on real data
      updateCustomKPIs(statsResponse.data, pendingPaymentsResponse.data, null);

      // Update chart data
      updateChartData(mappedSalesData || []);

    } catch (error) {
      setError('Failed to load dashboard data. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Update custom KPIs with real data
  const updateCustomKPIs = (statsData: any, pendingPaymentsData: any, expiringProductsData: any) => {
    const newKPIs: CustomKPI[] = [
      {
        id: 1,
        name: 'Stock Value',
        value: formatCurrency(statsData?.stockValue || 0),
        icon: Package,
        color: 'blue',
        trend: statsData?.stockValueTrend || '0%'
      },
      {
        id: 2,
        name: 'Low Stock Items',
        value: (statsData?.lowStockItems || 0).toString(),
        icon: AlertCircle,
        color: 'red',
        trend: statsData?.lowStockItemsTrend || '0'
      },
      {
        id: 3,
        name: 'Daily Sales',
        value: formatCurrency(statsData?.dailySales || 0),
        icon: DollarSign,
        color: 'green',
        trend: statsData?.dailySalesTrend || '0%'
      },
      {
        id: 4,
        name: 'Monthly Growth',
        value: `${statsData?.monthlyGrowth || 0}%`,
        icon: TrendingUp,
        color: 'purple',
        trend: statsData?.monthlyGrowthTrend || '0%'
      },
      {
        id: 5,
        name: 'Profit Margin',
        value: `${statsData?.profitMargin || 0}%`,
        icon: Percent,
        color: 'emerald',
        trend: statsData?.profitMarginTrend || '0%'
      },
      {
        id: 6,
        name: 'Inventory Turnover',
        value: `${statsData?.inventoryTurnover || 0}x`,
        icon: RefreshCw,
        color: 'indigo',
        trend: statsData?.inventoryTurnoverTrend || '0x'
      },
      {
        id: 7,
        name: 'Prescriptions',
        value: (statsData?.prescriptionCount || 0).toString(),
        icon: FileText,
        color: 'amber',
        trend: statsData?.prescriptionCountTrend || '0'
      },
      {
        id: 8,
        name: 'Return Rate',
        value: `${statsData?.returnRate || 0}%`,
        icon: TrendingDown,
        color: 'rose',
        trend: statsData?.returnRateTrend || '0%'
      }
    ];
    setCustomKPIs(newKPIs);
  };

  // Update chart data with real data
  const updateChartData = (revenueData: SalesDataPoint[]) => {
    setChartData({
      revenue: revenueData,
      orders: revenueData.map(d => ({ ...d, revenue: d.orders })),
      profit: revenueData.map(d => ({ ...d, revenue: d.revenue * (stats.profitMargin / 100) })),
      customers: revenueData.map(d => ({ ...d, revenue: Math.floor(d.orders * (stats.customerRetention / 100)) }))
    });
  };

  // Helper function to get chart colors from theme or API
  const getChartColors = () => {
    // These could come from a theme API or user preferences
    return ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8', '#82CA9D'];
  };

  // Helper function to get random colors for charts
  const getRandomColor = () => {
    const colors = getChartColors();
    return colors[Math.floor(Math.random() * colors.length)];
  };

  // Helper function to format currency
  const formatCurrency = (amount: number) => {
    if (amount >= 1000000) {
      return `₹${(amount / 1000000).toFixed(1)}M`;
    } else if (amount >= 1000) {
      return `₹${(amount / 1000).toFixed(1)}K`;
    }
    return `₹${amount.toFixed(0)}`;
  };

  // Refresh dashboard data
  const handleRefresh = async () => {
    setRefreshing(true);
    await fetchDashboardData();
    setRefreshing(false);
  };

  // Load data on component mount
  useEffect(() => {
    fetchDashboardData();
  }, []);

  const StatCard: React.FC<StatCardProps> = ({ title, value, icon: Icon, gradient, trend, trendValue, bgGradient }) => (
    <div className={`relative overflow-hidden rounded-2xl bg-gradient-to-br ${bgGradient} border border-white/20 shadow-xl shadow-gray-200/30 p-6 transition-all duration-300 hover:scale-105 hover:shadow-2xl group`}>
      <div className={`absolute top-0 right-0 w-32 h-32 bg-gradient-to-br ${gradient} opacity-10 rounded-full transform translate-x-16 -translate-y-16`}></div>

      <div className="relative z-10">
        <div className="flex items-center justify-between mb-4">
          <div className={`p-3 rounded-xl bg-gradient-to-br ${gradient} shadow-lg shadow-gray-300/30`}>
            <Icon className="w-6 h-6 text-white" />
          </div>
          {trend && (
            <div className="flex items-center space-x-1">
              <ArrowUpRight className={`w-4 h-4 ${trend === 'up' ? 'text-green-500' : 'text-red-500'}`} />
              <span className={`text-sm font-semibold ${trend === 'up' ? 'text-green-600' : 'text-red-600'}`}>
                {trendValue}%
              </span>
            </div>
          )}
        </div>

        <div>
          <p className="text-sm font-medium text-gray-600 mb-1">{title}</p>
          <p className="text-3xl font-bold text-gray-900">{value}</p>
        </div>
      </div>
    </div>
  );

  const QuickAction: React.FC<QuickActionProps> = ({ title, description, icon: Icon, gradient, onClick }) => (
    <button
      onClick={onClick}
      className="group relative overflow-hidden bg-white rounded-2xl border border-gray-100 hover:border-gray-200 p-4 transition-all duration-300 hover:scale-105 hover:shadow-lg text-left w-full"
    >
      <div className="flex items-center space-x-4">
        <div className={`p-3 rounded-xl bg-gradient-to-br ${gradient} shadow-lg shadow-gray-300/30 group-hover:scale-110 transition-transform duration-300`}>
          <Icon className="w-5 h-5 text-white" />
        </div>
        <div className="flex-1">
          <p className="text-sm font-semibold text-gray-900">{title}</p>
          <p className="text-xs text-gray-500">{description}</p>
        </div>
        <ArrowUpRight className="w-4 h-4 text-gray-400 group-hover:text-gray-600 group-hover:transform group-hover:translate-x-1 group-hover:-translate-y-1 transition-all duration-300" />
      </div>
    </button>
  );

  const KPICard: React.FC<KPICardProps> = ({ kpi }) => {
    const Icon = kpi.icon;
    return (
      <div className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm hover:shadow-md transition-all duration-300">
        <div className="flex items-center justify-between mb-2">
          <div className={`p-2 rounded-lg bg-${kpi.color}-50`}>
            <Icon className={`w-5 h-5 text-${kpi.color}-500`} />
          </div>
          <div className="flex items-center space-x-2">
            <span className={`text-xs font-medium ${
              kpi.trend.startsWith('+') ? 'text-green-600' : 'text-red-600'
            }`}>
              {kpi.trend}
            </span>
            <button
              className="text-gray-400 hover:text-gray-600"
              onClick={() => {
                // Navigate to Master with GST Configuration tab active
                window.dispatchEvent(new CustomEvent('navigateToMaster', {
                  detail: { module: 'tax-master', tab: 'gst-config' }
                }));
                // Navigate to master tab
                if (window.location.pathname === '/') {
                  window.dispatchEvent(new CustomEvent('navigate', {
                    detail: { tab: 'master' }
                  }));
                }
              }}
            >
              <Settings className="w-4 h-4" />
            </button>
          </div>
        </div>
        <h3 className="text-sm font-medium text-gray-600">{kpi.name}</h3>
        <p className="text-xl font-bold text-gray-900 mt-1">{kpi.value}</p>
      </div>
    );
  };

  const KPICustomizationModal: React.FC = () => (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl p-6 w-full max-w-2xl">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold text-gray-900">Customize KPIs</h3>
          <button
            onClick={() => setIsCustomizingKPIs(false)}
            className="text-gray-400 hover:text-gray-600"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="grid grid-cols-2 gap-4">
          {customKPIs.map(kpi => (
            <div
              key={kpi.id}
              className={`p-3 rounded-lg border cursor-pointer transition-all ${
                selectedKPIs.includes(kpi.id)
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
              onClick={() => {
                if (selectedKPIs.includes(kpi.id)) {
                  setSelectedKPIs(selectedKPIs.filter(id => id !== kpi.id));
                } else if (selectedKPIs.length < 4) {
                  setSelectedKPIs([...selectedKPIs, kpi.id]);
                }
              }}
            >
              <div className="flex items-center space-x-3">
                <div className={`p-2 rounded-lg bg-${kpi.color}-50`}>
                  <kpi.icon className={`w-4 h-4 text-${kpi.color}-500`} />
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900">{kpi.name}</p>
                  <p className="text-xs text-gray-500">{kpi.value}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-6 flex justify-end space-x-3">
          <button
            onClick={() => setIsCustomizingKPIs(false)}
            className="px-4 py-2 text-sm font-medium text-gray-700 hover:text-gray-900"
          >
            Cancel
          </button>
          <button
            onClick={() => setIsCustomizingKPIs(false)}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700"
          >
            Save Changes
          </button>
        </div>
      </div>
    </div>
  );

  const ChartHeader: React.FC<ChartHeaderProps> = ({ title, subtitle, onTimeRangeChange, onChartTypeChange }) => (
    <div className="flex items-center justify-between mb-4">
      <div>
        <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
        <p className="text-sm text-gray-500">{subtitle}</p>
      </div>
      <div className="flex items-center space-x-2">
        <div className="flex items-center space-x-1 bg-gray-50 rounded-lg p-1">
          {(['daily', 'weekly', 'monthly', 'yearly'] as ChartTimeRange[]).map(range => (
            <button
              key={range}
              onClick={() => onTimeRangeChange(range)}
              className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${
                chartTimeRange === range
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-900'
              }`}
            >
              {range.charAt(0).toUpperCase() + range.slice(1)}
            </button>
          ))}
        </div>
        <button className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-50">
          <Download className="w-4 h-4" />
        </button>
        <button className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-50">
          <Share2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  );

  const ChartCard: React.FC<ChartCardProps> = ({ title, data, type = 'area' }) => (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
      <ChartHeader
        title={title}
        subtitle="Last 6 months performance"
        onTimeRangeChange={setChartTimeRange}
      />
      <div className="h-[300px]">
        <ResponsiveContainer width="100%" height="100%">
          {type === 'area' ? (
            <AreaChart data={data} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
              <defs>
                <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.2}/>
                  <stop offset="95%" stopColor="#3B82F6" stopOpacity={0.0}/>
                </linearGradient>
              </defs>
              <XAxis
                dataKey="month"
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 12 }}
                tickMargin={10}
              />
              <YAxis
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 12 }}
                tickFormatter={(value) => `₹${(value/1000).toFixed(0)}K`}
                tickMargin={10}
              />
              <CartesianGrid vertical={false} stroke="#f0f0f0" strokeDasharray="3 3" />
              <Tooltip
                formatter={(value) => [`₹${(value as number).toLocaleString('en-IN')}`, 'Value']}
                contentStyle={{
                  backgroundColor: 'white',
                  border: '1px solid #e5e7eb',
                  borderRadius: '8px',
                  boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
                  fontSize: '12px',
                  padding: '8px 12px'
                }}
              />
              <Area
                type="monotone"
                dataKey="revenue"
                stroke="#3B82F6"
                strokeWidth={2}
                fillOpacity={1}
                fill="url(#colorRevenue)"
                dot={{ fill: '#3B82F6', strokeWidth: 2, r: 4 }}
                activeDot={{ r: 6, stroke: '#3B82F6', strokeWidth: 2 }}
              />
            </AreaChart>
          ) : (
            <BarChart data={data} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
              <XAxis
                dataKey="month"
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 12 }}
                tickMargin={10}
              />
              <YAxis
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 12 }}
                tickFormatter={(value) => `₹${(value/1000).toFixed(0)}K`}
                tickMargin={10}
              />
              <CartesianGrid vertical={false} stroke="#f0f0f0" strokeDasharray="3 3" />
              <Tooltip
                formatter={(value) => [`₹${(value as number).toLocaleString('en-IN')}`, 'Value']}
                contentStyle={{
                  backgroundColor: 'white',
                  border: '1px solid #e5e7eb',
                  borderRadius: '8px',
                  boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
                  fontSize: '12px',
                  padding: '8px 12px'
                }}
              />
              <Bar
                dataKey="revenue"
                fill="#3B82F6"
                radius={[4, 4, 0, 0]}
                maxBarSize={40}
              />
            </BarChart>
          )}
        </ResponsiveContainer>
      </div>
    </div>
  );

  const OrderTable: React.FC = () => (
    <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-lg font-semibold text-gray-900">Recent Orders</h3>
        <div className="flex items-center space-x-2">
          <div className="relative">
            <input
              type="text"
              placeholder="Search orders..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 pr-4 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-2.5" />
          </div>
          <div className="flex items-center space-x-1 bg-gray-50 rounded-lg p-1">
            {(['all', 'pending', 'completed', 'cancelled'] as OrderFilter[]).map(status => (
              <button
                key={status}
                onClick={() => setOrderFilter(status)}
                className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${
                  orderFilter === status
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-500 hover:text-gray-900'
                }`}
              >
                {status.charAt(0).toUpperCase() + status.slice(1)}
              </button>
            ))}
          </div>
          <button className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-50">
            <Download className="w-4 h-4" />
          </button>
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="text-left text-sm font-medium text-gray-500 border-b border-gray-100">
              <th className="pb-3 px-4">
                <button
                  onClick={() => setOrderSort({
                    field: 'date',
                    direction: orderSort.field === 'date' && orderSort.direction === 'desc' ? 'asc' : 'desc'
                  })}
                  className="flex items-center space-x-1"
                >
                  <span>Date</span>
                  {orderSort.field === 'date' && (
                    <ChevronDown className={`w-4 h-4 transition-transform ${
                      orderSort.direction === 'asc' ? 'rotate-180' : ''
                    }`} />
                  )}
                </button>
              </th>
              <th className="pb-3 px-4">Order ID</th>
              <th className="pb-3 px-4">Customer</th>
              <th className="pb-3 px-4">
                <button
                  onClick={() => setOrderSort({
                    field: 'amount',
                    direction: orderSort.field === 'amount' && orderSort.direction === 'desc' ? 'asc' : 'desc'
                  })}
                  className="flex items-center space-x-1"
                >
                  <span>Amount</span>
                  {orderSort.field === 'amount' && (
                    <ChevronDown className={`w-4 h-4 transition-transform ${
                      orderSort.direction === 'asc' ? 'rotate-180' : ''
                    }`} />
                  )}
                </button>
              </th>
              <th className="pb-3 px-4">Status</th>
              <th className="pb-3 px-4">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredOrders.map((order, index) => (
              <tr key={index} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                <td className="py-3 px-4 text-sm text-gray-900">{order.date}</td>
                <td className="py-3 px-4 text-sm text-gray-900">{order.id}</td>
                <td className="py-3 px-4 text-sm text-gray-900">{order.customer}</td>
                <td className="py-3 px-4 text-sm text-gray-900">₹{order.amount.toLocaleString('en-IN')}</td>
                <td className="py-3 px-4">
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                    order.status === 'Completed' ? 'bg-green-100 text-green-800' :
                    order.status === 'Pending' ? 'bg-yellow-100 text-yellow-800' :
                    'bg-red-100 text-red-800'
                  }`}>
                    {order.status}
                  </span>
                </td>
                <td className="py-3 px-4">
                  <div className="flex items-center space-x-2">
                    <button className="p-1 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100">
                      <Eye className="w-4 h-4" />
                    </button>
                    <button className="p-1 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100">
                      <Download className="w-4 h-4" />
                    </button>
                    <button className="p-1 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-100">
                      <MoreHorizontal className="w-4 h-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-4 flex items-center justify-between">
        <div className="text-sm text-gray-500">
          Showing {filteredOrders.length} of {recentOrders.length} orders
        </div>
        <div className="flex items-center space-x-2">
          <button className="px-3 py-1 text-sm text-gray-600 hover:text-gray-900 disabled:opacity-50 disabled:cursor-not-allowed">
            Previous
          </button>
          <button className="px-3 py-1 text-sm text-gray-600 hover:text-gray-900 disabled:opacity-50 disabled:cursor-not-allowed">
            Next
          </button>
        </div>
      </div>
    </div>
  );

  // FAB and Slide-in Panel logic
  const handleFabAction = (id: string): void => {
    setPanel(id as PanelType);
    setFabOpen(false);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-100 sticky top-0 z-10 shadow-sm">
        <div className="px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                Dashboard
              </h1>
              <p className="text-gray-500 text-sm">Welcome back! Here's your business overview.</p>
            </div>

            <div className="flex items-center space-x-4">
              <button
                onClick={handleRefresh}
                className="flex items-center space-x-2 px-4 py-2 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition-colors"
                disabled={loading || refreshing}
              >
                                 <RefreshCw className={`w-4 h-4 ${loading || refreshing ? 'animate-spin' : ''}`} />
                <span className="text-sm font-medium">Refresh</span>
              </button>

              <div className="flex items-center space-x-1 text-sm text-gray-500 bg-gray-50 px-3 py-1.5 rounded-lg border border-gray-100">
                <Calendar className="w-4 h-4" />
                <span>{new Date().toLocaleDateString('en-IN', {
                  weekday: 'short',
                  month: 'short',
                  day: 'numeric'
                })}</span>
              </div>

              <button className="relative p-2 bg-gray-50 hover:bg-gray-100 rounded-lg transition-colors border border-gray-100">
                <Bell className="w-5 h-5 text-gray-600" />
                <div className="absolute -top-1 -right-1 w-2 h-2 bg-red-500 rounded-full"></div>
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="px-6 py-6">
        {/* Quick Actions */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <QuickAction
            title="New Bill"
            description="Create a new customer bill"
            icon={ShoppingCart}
            gradient="from-blue-500 to-blue-600"
            onClick={() => {}}
          />
          <QuickAction
            title="Add Purchase"
            description="Record new inventory purchase"
            icon={Package}
            gradient="from-green-500 to-green-600"
            onClick={() => {}}
          />
          <QuickAction
            title="Daily Report"
            description="View today's sales report"
            icon={FileText}
            gradient="from-purple-500 to-purple-600"
            onClick={() => {}}
          />
          <QuickAction
            title="Stock Alert"
            description="Check low stock items"
            icon={AlertTriangle}
            gradient="from-red-500 to-red-600"
            onClick={() => {}}
          />
        </div>

        {/* Main Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <StatCard
            title="Total Revenue"
            value={`₹${stats.totalRevenue.toLocaleString('en-IN')}`}
            icon={DollarSign}
            gradient="from-green-500 to-green-600"
            trend="up"
            trendValue="12.5"
            bgGradient="from-white to-gray-50"
          />
          <StatCard
            title="Total Orders"
            value={stats.totalOrders}
            icon={ShoppingCart}
            gradient="from-blue-500 to-blue-600"
            trend="up"
            trendValue="8.3"
            bgGradient="from-white to-gray-50"
          />
          <StatCard
            title="Total Products"
            value={stats.totalProducts}
            icon={Package}
            gradient="from-purple-500 to-purple-600"
            bgGradient="from-white to-gray-50"
          />
          <StatCard
            title="Total Customers"
            value={stats.totalCustomers}
            icon={Users}
            gradient="from-orange-500 to-orange-600"
            trend="up"
            trendValue="15.2"
            bgGradient="from-white to-gray-50"
          />
        </div>

        {/* Custom KPIs */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold text-gray-900">Key Performance Indicators</h2>
            <button
              onClick={() => {
                // Navigate to Master with GST Configuration tab active
                window.dispatchEvent(new CustomEvent('navigateToMaster', {
                  detail: { module: 'tax-master', tab: 'gst-config' }
                }));
                // Navigate to master tab
                if (window.location.pathname === '/') {
                  window.dispatchEvent(new CustomEvent('navigate', {
                    detail: { tab: 'master' }
                  }));
                }
              }}
              className="text-sm text-blue-600 hover:text-blue-700 flex items-center"
            >
              <Settings className="w-4 h-4 mr-1" />
              Tax Settings
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {customKPIs
              .filter(kpi => selectedKPIs.includes(kpi.id))
              .map(kpi => (
                <KPICard key={kpi.id} kpi={kpi} />
              ))}
          </div>
        </div>

        {/* Charts Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
          <ChartCard
            title="Revenue Trend"
            data={chartData.revenue}
            type="area"
          />
          <ChartCard
            title="Order Volume"
            data={chartData.orders}
            type="bar"
          />
        </div>

        {/* Product Categories */}
        <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">Product Categories</h3>
            <div className="flex items-center space-x-2">
              <button className="text-sm text-blue-600 flex items-center">
                <span>Live</span>
                <div className="w-1.5 h-1.5 bg-blue-500 rounded-full animate-pulse ml-1"></div>
              </button>
              <button className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-50">
                <Download className="w-4 h-4" />
              </button>
            </div>
          </div>
          <div className="flex items-center">
            <div className="w-1/2">
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={productCategories}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={90}
                    fill="#8884d8"
                    dataKey="value"
                    paddingAngle={2}
                  >
                    {productCategories.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value) => [`${value}%`, 'Share']}
                    contentStyle={{
                      backgroundColor: 'white',
                      border: '1px solid #e5e7eb',
                      borderRadius: '8px',
                      boxShadow: '0 4px 6px rgba(0,0,0,0.1)',
                      fontSize: '12px',
                      padding: '8px 12px'
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="w-1/2 pl-6">
              <div className="space-y-4">
                {productCategories.map((category, index) => (
                  <div key={index} className="flex items-center">
                    <div
                      className="w-3 h-3 rounded-full mr-3"
                      style={{ backgroundColor: category.color }}
                    />
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-gray-900">{category.name}</span>
                        <span className="text-sm text-gray-500">{category.value}%</span>
                      </div>
                      <div className="mt-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${category.value}%`,
                            backgroundColor: category.color
                          }}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Recent Orders */}
        <div className="mb-6">
          <OrderTable />
        </div>

        {/* Recent Alerts */}
        <div className="mb-6">
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Recent Alerts</h3>
              <div className="flex items-center space-x-2">
                <div className="flex items-center space-x-1 bg-gray-50 rounded-lg p-1">
                  {(['all', 'stock', 'expiry', 'order', 'payment'] as AlertFilter[]).map(type => (
                    <button
                      key={type}
                      onClick={() => setAlertFilter(type)}
                      className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${
                        alertFilter === type
                          ? 'bg-white text-gray-900 shadow-sm'
                          : 'text-gray-500 hover:text-gray-900'
                      }`}
                    >
                      {type.charAt(0).toUpperCase() + type.slice(1)}
                    </button>
                  ))}
                </div>
                <button className="p-2 text-gray-400 hover:text-gray-600 rounded-lg hover:bg-gray-50">
                  <Bell className="w-4 h-4" />
                </button>
              </div>
            </div>
            <div className="space-y-3">
              {filteredAlerts.map(alert => (
                <AlertCard key={alert.id} alert={alert} />
              ))}
            </div>
            {filteredAlerts.length === 0 && (
              <div className="text-center py-8">
                <Bell className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                <p className="text-gray-500">No alerts found</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {isCustomizingKPIs && <KPICustomizationModal />}

      {/* Floating Action Button */}
      <div className="fixed bottom-6 right-6 z-40 flex flex-col items-end space-y-3">
        {fabOpen && fabActions.map((action, idx) => {
          const Icon = action.icon;
          return (
            <button
              key={action.id}
              onClick={() => handleFabAction(action.id)}
              className={`flex items-center px-4 py-2 mb-2 rounded-full shadow-lg text-white ${action.color} transition-transform duration-200 transform hover:scale-105`}
              style={{
                opacity: fabOpen ? 1 : 0,
                transitionDelay: `${idx * 50}ms`,
              }}
              title={action.label}
            >
              <Icon className="w-5 h-5 mr-2" />
              <span className="font-medium text-sm hidden sm:inline">{action.label}</span>
            </button>
          );
        })}
        <button
          onClick={() => setFabOpen((open) => !open)}
          className="w-16 h-16 rounded-full bg-black text-white flex items-center justify-center shadow-2xl hover:bg-gray-900 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
          aria-label="Quick Actions"
        >
          <Plus className={`w-8 h-8 transition-transform duration-200 ${fabOpen ? 'rotate-45' : ''}`} />
        </button>
      </div>

      {/* Slide-in Panels for each action */}
      <BusinessSalesEntry open={panel === 'add-sale'} onClose={() => setPanel(null)} />
      <ModularChallanCreatorV5 open={panel === 'create-challan'} onClose={() => setPanel(null)} />
    </div>
  );
};

export default Dashboard;