import React, { useState, useEffect } from 'react';
import { 
  Package, 
  Users, 
  ShoppingCart, 
  AlertTriangle,
  Calendar,
  DollarSign,
  FileText,
  Plus,
  ArrowUpRight,
  Bell,
  Star,
  Clock,
  BarChart3,
  ChevronRight,
  TrendingUp,
  Percent,
  Settings,
  Grid,
  PieChart as PieChartIcon,
  LineChart as LineChartIcon,
  Activity,
  Zap,
  Target,
  DollarSign as DollarSignIcon,
  Package as PackageIcon,
  Users as UsersIcon,
  ShoppingCart as ShoppingCartIcon,
  AlertCircle,
  RefreshCw,
  X,
  TrendingDown,
  ChevronDown,
  Download,
  Filter,
  MoreHorizontal,
  Share2,
  ZoomIn,
  Search,
  Eye,
  Check,
  Trash2,
  Truck,
  CreditCard
} from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Area, AreaChart, BarChart, Bar } from 'recharts';
// import NewChallan from './NewChallan'; // Old version
import ModularChallanCreatorV5 from './challan/ModularChallanCreatorV5'; // New improved version
// import { AddSalePage } from './Home';
import BusinessSalesEntry from './BusinessSalesEntry';
import { apiUtils, dashboardApi, ordersApi } from '../services/api';

const fabActions = [
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

const Dashboard = () => {
  const [stats, setStats] = useState({
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

  const [salesData] = useState([
    { month: 'Jan', revenue: 65000, orders: 45 },
    { month: 'Feb', revenue: 75000, orders: 52 },
    { month: 'Mar', revenue: 85000, orders: 61 },
    { month: 'Apr', revenue: 95000, orders: 68 },
    { month: 'May', revenue: 87000, orders: 64 },
    { month: 'Jun', revenue: 110000, orders: 78 },
  ]);

  const [productCategories] = useState([
    { name: 'Tablets', value: 40, color: '#0088FE' },
    { name: 'Syrups', value: 30, color: '#00C49F' },
    { name: 'Injections', value: 20, color: '#FFBB28' },
    { name: 'Others', value: 10, color: '#FF8042' },
  ]);

  const [recentOrders, setRecentOrders] = useState([]);

  const [alertFilter, setAlertFilter] = useState('all');
  const [alerts, setAlerts] = useState([
    {
      id: 1,
      type: 'stock',
      message: 'Low stock alert: Paracetamol 500mg tablets',
      severity: 'high',
      timestamp: '2024-02-20T10:30:00',
      read: false
    },
    {
      id: 2,
      type: 'expiry',
      message: 'Expiry alert: Amoxicillin 250mg capsules expiring in 30 days',
      severity: 'medium',
      timestamp: '2024-02-20T09:15:00',
      read: false
    },
    {
      id: 3,
      type: 'order',
      message: 'New bulk order received from City Hospital',
      severity: 'low',
      timestamp: '2024-02-20T08:45:00',
      read: true
    },
    {
      id: 4,
      type: 'payment',
      message: 'Payment received for Order #12345',
      severity: 'low',
      timestamp: '2024-02-19T16:20:00',
      read: true
    }
  ]);

  const [customKPIs, setCustomKPIs] = useState([
    { id: 1, name: 'Stock Value', value: '₹2.5M', icon: PackageIcon, color: 'blue', trend: '+5.2%' },
    { id: 2, name: 'Low Stock Items', value: '5', icon: AlertCircle, color: 'red', trend: '-2' },
    { id: 3, name: 'Daily Sales', value: '₹45K', icon: DollarSignIcon, color: 'green', trend: '+12.5%' },
    { id: 4, name: 'Monthly Growth', value: '+12.5%', icon: TrendingUp, color: 'purple', trend: '+3.2%' },
    { id: 5, name: 'Profit Margin', value: '32.5%', icon: Percent, color: 'emerald', trend: '+2.1%' },
    { id: 6, name: 'Inventory Turnover', value: '4.2x', icon: RefreshCw, color: 'indigo', trend: '+0.3x' },
    { id: 7, name: 'Prescriptions', value: '128', icon: FileText, color: 'amber', trend: '+15' },
    { id: 8, name: 'Return Rate', value: '1.2%', icon: TrendingDown, color: 'rose', trend: '-0.3%' }
  ]);

  const [isCustomizingKPIs, setIsCustomizingKPIs] = useState(false);
  const [selectedKPIs, setSelectedKPIs] = useState([1, 2, 3, 4]);

  const [chartTimeRange, setChartTimeRange] = useState('monthly');
  const [selectedChart, setSelectedChart] = useState('revenue');
  const [chartData, setChartData] = useState({
    revenue: salesData,
    orders: salesData.map(d => ({ ...d, revenue: d.orders })),
    profit: salesData.map(d => ({ ...d, revenue: d.revenue * 0.32 })),
    customers: salesData.map(d => ({ ...d, revenue: Math.floor(d.orders * 1.2) }))
  });

  const [orderFilter, setOrderFilter] = useState('all');
  const [orderSort, setOrderSort] = useState({ field: 'date', direction: 'desc' });
  const [searchQuery, setSearchQuery] = useState('');

  const [fabOpen, setFabOpen] = useState(false);
  const [panel, setPanel] = useState(null);

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
          ? new Date(b.date) - new Date(a.date)
          : new Date(a.date) - new Date(b.date);
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
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

  const markAsRead = (alertId) => {
    setAlerts(alerts.map(alert => 
      alert.id === alertId ? { ...alert, read: true } : alert
    ));
  };

  const deleteAlert = (alertId) => {
    setAlerts(alerts.filter(alert => alert.id !== alertId));
  };

  const getAlertIcon = (type) => {
    switch (type) {
      case 'stock':
        return PackageIcon;
      case 'expiry':
        return AlertCircle;
      case 'order':
        return ShoppingCart;
      case 'payment':
        return DollarSignIcon;
      default:
        return Bell;
    }
  };

  const getAlertColor = (type, severity) => {
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

  const AlertCard = ({ alert }) => {
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

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    try {
      console.log('Loading dashboard data...');
      
      // Try to get real dashboard stats
      const dashboardStats = await apiUtils.getDashboardStats();
      console.log('Dashboard stats loaded:', dashboardStats);
      
      // Also try to get recent orders for additional calculations
      let recentOrders = [];
      try {
        const ordersResponse = await ordersApi.getAll();
        recentOrders = ordersResponse.data.slice(0, 5); // Get latest 5 orders
        console.log('Recent orders loaded:', recentOrders);
      } catch (ordersError) {
        console.warn('Could not load recent orders:', ordersError.message);
      }
      
      // Calculate additional metrics from orders data
      const today = new Date().toISOString().split('T')[0];
      const todaysOrders = recentOrders.filter(order => 
        order.order_date && order.order_date.startsWith(today)
      );
      const dailySales = todaysOrders.reduce((sum, order) => sum + (order.final_amount || 0), 0);
      
      setStats({
        totalRevenue: dashboardStats.totalRevenue || 0,
        totalOrders: dashboardStats.totalOrders || 0,
        totalProducts: dashboardStats.totalProducts || 0,
        totalCustomers: dashboardStats.totalCustomers || 0,
        pendingPayments: dashboardStats.pendingPayments || 0,
        
        // Calculated metrics
        dailySales: dailySales,
        averageOrderValue: dashboardStats.totalOrders > 0 ? 
          Math.round(dashboardStats.totalRevenue / dashboardStats.totalOrders) : 0,
        
        // Default values for metrics not yet implemented
        expiringSoon: 12,
        stockValue: 250000,
        lowStockItems: 5,
        monthlyGrowth: 12.5,
        customerRetention: 85,
        profitMargin: 23.5,
        inventoryTurnover: 4.2,
        prescriptionCount: 189,
        returnRate: 2.1
      });
      
      // Update recent orders section
      setRecentOrders(recentOrders.map(order => ({
        id: order.order_number || order.order_id || `ORD-${order.order_id}`,
        customer: order.customer_name || 'Unknown Customer',
        amount: order.final_amount || 0,
        status: order.order_status || 'pending',
        date: order.order_date || new Date().toISOString().split('T')[0]
      })));
      
    } catch (error) {
      console.error('Error loading dashboard data:', error);
      
      // Fallback to minimal stats if API fails
      setStats({
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
    }
  };

  const StatCard = ({ title, value, icon: Icon, gradient, trend, trendValue, bgGradient }) => (
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

  const QuickAction = ({ title, description, icon: Icon, gradient, onClick }) => (
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

  const KPICard = ({ kpi }) => {
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
            <button className="text-gray-400 hover:text-gray-600">
              <Settings className="w-4 h-4" />
            </button>
          </div>
        </div>
        <h3 className="text-sm font-medium text-gray-600">{kpi.name}</h3>
        <p className="text-xl font-bold text-gray-900 mt-1">{kpi.value}</p>
      </div>
    );
  };

  const KPICustomizationModal = () => (
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

  const ChartHeader = ({ title, subtitle, onTimeRangeChange, onChartTypeChange }) => (
    <div className="flex items-center justify-between mb-4">
      <div>
        <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
        <p className="text-sm text-gray-500">{subtitle}</p>
      </div>
      <div className="flex items-center space-x-2">
        <div className="flex items-center space-x-1 bg-gray-50 rounded-lg p-1">
          {['daily', 'weekly', 'monthly', 'yearly'].map(range => (
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

  const ChartCard = ({ title, data, type = 'area' }) => (
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
                formatter={(value) => [`₹${value.toLocaleString('en-IN')}`, 'Value']}
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
                formatter={(value) => [`₹${value.toLocaleString('en-IN')}`, 'Value']}
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

  const OrderTable = () => (
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
            {['all', 'pending', 'completed', 'cancelled'].map(status => (
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
  const handleFabAction = (id) => {
    setPanel(id);
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
              <button className="flex items-center space-x-2 px-4 py-2 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition-colors">
                <RefreshCw className="w-4 h-4" />
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
              onClick={() => setIsCustomizingKPIs(true)}
              className="text-sm text-blue-600 hover:text-blue-700 flex items-center"
            >
              <Settings className="w-4 h-4 mr-1" />
              Customize KPIs
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
                  {['all', 'stock', 'expiry', 'order', 'payment'].map(type => (
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