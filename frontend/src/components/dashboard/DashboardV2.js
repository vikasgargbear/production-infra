import React, { useState, useEffect, useCallback } from 'react';
import { 
  LayoutDashboard, Package, Users, ShoppingCart, AlertTriangle,
  Calendar, DollarSign, FileText, Plus, ArrowUpRight, Bell,
  TrendingUp, Activity, BarChart3, PieChart, Clock, RefreshCw,
  Download, ChevronDown, Eye, MoreHorizontal, Filter, Search,
  CreditCard, Truck, Receipt, TrendingDown, Building, Target
} from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart as RechartsPie, Pie, Cell, Area, AreaChart, BarChart, Bar } from 'recharts';
import { ModuleHeader } from '../global';
import { dashboardApi, ordersApi, invoicesApi, customersApi, productsApi } from '../../services/api';

const DashboardV2 = () => {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedPeriod, setSelectedPeriod] = useState('today');
  const [stats, setStats] = useState({
    revenue: { value: 0, change: 0, trend: 'up' },
    orders: { value: 0, change: 0, trend: 'up' },
    customers: { value: 0, change: 0, trend: 'up' },
    products: { value: 0, change: 0, trend: 'neutral' }
  });
  
  const [kpiData, setKpiData] = useState([
    { id: 1, title: 'Daily Sales', value: '₹0', change: '+0%', icon: DollarSign, color: 'blue' },
    { id: 2, title: 'Pending Orders', value: '0', change: '0', icon: Clock, color: 'orange' },
    { id: 3, title: 'Low Stock Items', value: '0', change: '-0', icon: AlertTriangle, color: 'red' },
    { id: 4, title: 'Active Customers', value: '0', change: '+0', icon: Users, color: 'green' },
    { id: 5, title: 'Avg Order Value', value: '₹0', change: '+0%', icon: Receipt, color: 'purple' },
    { id: 6, title: 'Stock Value', value: '₹0', change: '+0%', icon: Package, color: 'indigo' }
  ]);

  const [recentActivities, setRecentActivities] = useState([]);
  const [salesTrend, setSalesTrend] = useState([]);
  const [categoryDistribution, setCategoryDistribution] = useState([]);
  const [topProducts, setTopProducts] = useState([]);
  const [alerts, setAlerts] = useState([]);

  // Quick actions configuration
  const quickActions = [
    { id: 'new-invoice', label: 'New Invoice', icon: Receipt, color: 'blue', path: '/sales' },
    { id: 'add-product', label: 'Add Product', icon: Package, color: 'green', path: '/products' },
    { id: 'create-order', label: 'Create Order', icon: ShoppingCart, color: 'purple', path: '/sales' },
    { id: 'add-customer', label: 'Add Customer', icon: Users, color: 'orange', path: '/customers' }
  ];

  // Fetch dashboard data
  const fetchDashboardData = useCallback(async () => {
    try {
      // Simulate API calls - replace with actual API endpoints
      const [invoicesRes, ordersRes, customersRes, productsRes] = await Promise.all([
        invoicesApi.getAll(),
        ordersApi.getAll(),
        customersApi.getAll(),
        productsApi.getAll()
      ]);

      // Calculate stats
      const invoices = invoicesRes.data || [];
      const orders = ordersRes.data || [];
      const customers = customersRes.data || [];
      const products = productsRes.data || [];

      // Calculate revenue
      const totalRevenue = invoices.reduce((sum, inv) => sum + (inv.total_amount || 0), 0);
      const todayRevenue = invoices
        .filter(inv => new Date(inv.invoice_date).toDateString() === new Date().toDateString())
        .reduce((sum, inv) => sum + (inv.total_amount || 0), 0);

      // Update stats
      setStats({
        revenue: { 
          value: totalRevenue, 
          change: 12.5, // Mock change percentage
          trend: 'up' 
        },
        orders: { 
          value: orders.length, 
          change: 8.3,
          trend: 'up' 
        },
        customers: { 
          value: customers.length, 
          change: 15.2,
          trend: 'up' 
        },
        products: { 
          value: products.length, 
          change: 0,
          trend: 'neutral' 
        }
      });

      // Update KPIs
      setKpiData([
        { 
          id: 1, 
          title: 'Daily Sales', 
          value: `₹${todayRevenue.toLocaleString('en-IN')}`, 
          change: '+15%', 
          icon: DollarSign, 
          color: 'blue' 
        },
        { 
          id: 2, 
          title: 'Pending Orders', 
          value: orders.filter(o => o.order_status === 'pending').length.toString(), 
          change: orders.filter(o => o.order_status === 'pending').length.toString(), 
          icon: Clock, 
          color: 'orange' 
        },
        { 
          id: 3, 
          title: 'Low Stock Items', 
          value: products.filter(p => p.current_stock < p.min_stock_level).length.toString(), 
          change: `-${products.filter(p => p.current_stock < p.min_stock_level).length}`, 
          icon: AlertTriangle, 
          color: 'red' 
        },
        { 
          id: 4, 
          title: 'Active Customers', 
          value: customers.filter(c => c.status === 'active').length.toString(), 
          change: '+5', 
          icon: Users, 
          color: 'green' 
        },
        { 
          id: 5, 
          title: 'Avg Order Value', 
          value: `₹${orders.length > 0 ? Math.round(totalRevenue / orders.length).toLocaleString('en-IN') : 0}`, 
          change: '+8%', 
          icon: Receipt, 
          color: 'purple' 
        },
        { 
          id: 6, 
          title: 'Stock Value', 
          value: `₹${products.reduce((sum, p) => sum + (p.current_stock * p.mrp || 0), 0).toLocaleString('en-IN')}`, 
          change: '+5%', 
          icon: Package, 
          color: 'indigo' 
        }
      ]);

      // Generate sales trend data (mock)
      const last7Days = Array.from({ length: 7 }, (_, i) => {
        const date = new Date();
        date.setDate(date.getDate() - (6 - i));
        return {
          date: date.toLocaleDateString('en-IN', { weekday: 'short' }),
          sales: Math.floor(Math.random() * 50000) + 20000,
          orders: Math.floor(Math.random() * 50) + 20
        };
      });
      setSalesTrend(last7Days);

      // Category distribution (mock)
      const categories = [
        { name: 'Tablets', value: 40, color: '#3B82F6' },
        { name: 'Syrups', value: 25, color: '#10B981' },
        { name: 'Injections', value: 20, color: '#F59E0B' },
        { name: 'Ointments', value: 10, color: '#8B5CF6' },
        { name: 'Others', value: 5, color: '#6B7280' }
      ];
      setCategoryDistribution(categories);

      // Top products (mock)
      const topProds = products
        .sort((a, b) => (b.current_stock * b.mrp) - (a.current_stock * a.mrp))
        .slice(0, 5)
        .map(p => ({
          id: p.product_id,
          name: p.product_name,
          sales: Math.floor(Math.random() * 100) + 50,
          revenue: p.current_stock * p.mrp,
          stock: p.current_stock
        }));
      setTopProducts(topProds);

      // Recent activities
      const activities = [
        { id: 1, type: 'order', message: 'New order #1234 received', time: '2 mins ago', icon: ShoppingCart },
        { id: 2, type: 'payment', message: 'Payment received for Invoice #5678', time: '15 mins ago', icon: CreditCard },
        { id: 3, type: 'customer', message: 'New customer registered', time: '1 hour ago', icon: Users },
        { id: 4, type: 'stock', message: 'Low stock alert for Paracetamol', time: '2 hours ago', icon: AlertTriangle },
        { id: 5, type: 'invoice', message: 'Invoice #9012 generated', time: '3 hours ago', icon: Receipt }
      ];
      setRecentActivities(activities);

      // Alerts
      const alertsList = [
        { id: 1, type: 'stock', severity: 'high', message: 'Critical: 5 items out of stock', icon: Package },
        { id: 2, type: 'expiry', severity: 'medium', message: 'Warning: 12 items expiring within 30 days', icon: Calendar },
        { id: 3, type: 'payment', severity: 'low', message: 'Info: 3 pending payments', icon: CreditCard }
      ];
      setAlerts(alertsList);

    } catch (error) {
      console.error('Error loading dashboard data:', error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [selectedPeriod]);

  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  const handleRefresh = () => {
    setRefreshing(true);
    fetchDashboardData();
  };

  const handleQuickAction = (path) => {
    window.location.href = path;
  };

  // Render stat card
  const StatCard = ({ title, value, change, trend, icon: Icon, gradient }) => (
    <div className="bg-white rounded-lg p-6 border border-gray-200 hover:shadow-lg transition-shadow">
      <div className="flex items-center justify-between mb-4">
        <div className={`p-3 rounded-lg bg-gradient-to-r ${gradient}`}>
          <Icon className="w-6 h-6 text-white" />
        </div>
        {trend !== 'neutral' && (
          <div className="flex items-center gap-1">
            {trend === 'up' ? (
              <TrendingUp className="w-4 h-4 text-green-500" />
            ) : (
              <TrendingDown className="w-4 h-4 text-red-500" />
            )}
            <span className={`text-sm font-medium ${
              trend === 'up' ? 'text-green-600' : 'text-red-600'
            }`}>
              {change}%
            </span>
          </div>
        )}
      </div>
      <p className="text-sm text-gray-600 mb-1">{title}</p>
      <p className="text-2xl font-bold text-gray-900">{value}</p>
    </div>
  );

  // Render KPI card
  const KPICard = ({ kpi }) => {
    const Icon = kpi.icon;
    return (
      <div className="bg-white rounded-lg p-4 border border-gray-200 hover:shadow-md transition-shadow">
        <div className="flex items-center justify-between mb-3">
          <div className={`p-2 rounded-lg bg-${kpi.color}-50`}>
            <Icon className={`w-5 h-5 text-${kpi.color}-600`} />
          </div>
          <span className={`text-xs font-medium ${
            kpi.change.startsWith('+') ? 'text-green-600' : 
            kpi.change.startsWith('-') ? 'text-red-600' : 'text-gray-600'
          }`}>
            {kpi.change}
          </span>
        </div>
        <p className="text-xs text-gray-600">{kpi.title}</p>
        <p className="text-lg font-bold text-gray-900 mt-1">{kpi.value}</p>
      </div>
    );
  };

  // Render activity item
  const ActivityItem = ({ activity }) => {
    const Icon = activity.icon;
    return (
      <div className="flex items-start gap-3 py-3">
        <div className="p-2 rounded-lg bg-gray-100">
          <Icon className="w-4 h-4 text-gray-600" />
        </div>
        <div className="flex-1">
          <p className="text-sm text-gray-900">{activity.message}</p>
          <p className="text-xs text-gray-500 mt-0.5">{activity.time}</p>
        </div>
      </div>
    );
  };

  // Render alert item
  const AlertItem = ({ alert }) => {
    const Icon = alert.icon;
    const colors = {
      high: 'red',
      medium: 'orange',
      low: 'blue'
    };
    const color = colors[alert.severity];
    
    return (
      <div className={`p-3 rounded-lg border border-${color}-200 bg-${color}-50`}>
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-lg bg-${color}-100`}>
            <Icon className={`w-4 h-4 text-${color}-600`} />
          </div>
          <p className={`text-sm text-${color}-900`}>{alert.message}</p>
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-gray-50">
      {/* Header */}
      <ModuleHeader
        title="Dashboard"
        icon={LayoutDashboard}
        iconColor="text-blue-600"
        actions={[
          {
            label: "Refresh",
            onClick: handleRefresh,
            icon: RefreshCw,
            variant: "default",
            loading: refreshing
          }
        ]}
      />

      {/* Period Selector */}
      <div className="px-6 py-3 bg-white border-b border-gray-200">
        <div className="flex items-center gap-2">
          {['today', 'week', 'month', 'year'].map((period) => (
            <button
              key={period}
              onClick={() => setSelectedPeriod(period)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                selectedPeriod === period
                  ? 'bg-blue-100 text-blue-700'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              {period.charAt(0).toUpperCase() + period.slice(1)}
            </button>
          ))}
          <div className="ml-auto flex items-center text-sm text-gray-500">
            <Calendar className="w-4 h-4 mr-1" />
            {new Date().toLocaleDateString('en-IN', { 
              weekday: 'short', 
              day: 'numeric',
              month: 'short',
              year: 'numeric'
            })}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {/* Main Stats */}
        <div className="grid grid-cols-4 gap-4 mb-6">
          <StatCard
            title="Total Revenue"
            value={`₹${stats.revenue.value.toLocaleString('en-IN')}`}
            change={stats.revenue.change}
            trend={stats.revenue.trend}
            icon={DollarSign}
            gradient="from-green-500 to-green-600"
          />
          <StatCard
            title="Total Orders"
            value={stats.orders.value}
            change={stats.orders.change}
            trend={stats.orders.trend}
            icon={ShoppingCart}
            gradient="from-blue-500 to-blue-600"
          />
          <StatCard
            title="Total Customers"
            value={stats.customers.value}
            change={stats.customers.change}
            trend={stats.customers.trend}
            icon={Users}
            gradient="from-purple-500 to-purple-600"
          />
          <StatCard
            title="Total Products"
            value={stats.products.value}
            change={stats.products.change}
            trend={stats.products.trend}
            icon={Package}
            gradient="from-orange-500 to-orange-600"
          />
        </div>

        {/* Quick Actions */}
        <div className="mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-3">Quick Actions</h2>
          <div className="grid grid-cols-4 gap-4">
            {quickActions.map((action) => {
              const Icon = action.icon;
              return (
                <button
                  key={action.id}
                  onClick={() => handleQuickAction(action.path)}
                  className="bg-white rounded-lg p-4 border border-gray-200 hover:shadow-md transition-all group"
                >
                  <div className="flex items-center gap-3">
                    <div className={`p-3 rounded-lg bg-${action.color}-50 group-hover:bg-${action.color}-100 transition-colors`}>
                      <Icon className={`w-5 h-5 text-${action.color}-600`} />
                    </div>
                    <span className="text-sm font-medium text-gray-900">{action.label}</span>
                    <ArrowUpRight className="w-4 h-4 text-gray-400 ml-auto group-hover:text-gray-600" />
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* KPIs */}
        <div className="mb-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-3">Key Performance Indicators</h2>
          <div className="grid grid-cols-6 gap-4">
            {kpiData.map((kpi) => (
              <KPICard key={kpi.id} kpi={kpi} />
            ))}
          </div>
        </div>

        {/* Charts Row */}
        <div className="grid grid-cols-3 gap-6 mb-6">
          {/* Sales Trend */}
          <div className="col-span-2 bg-white rounded-lg p-6 border border-gray-200">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Sales Trend</h3>
              <button className="text-gray-400 hover:text-gray-600">
                <MoreHorizontal className="w-5 h-5" />
              </button>
            </div>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={salesTrend} margin={{ top: 5, right: 5, left: 0, bottom: 5 }}>
                  <defs>
                    <linearGradient id="colorSales" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.2}/>
                      <stop offset="95%" stopColor="#3B82F6" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="date" axisLine={false} tickLine={false} />
                  <YAxis axisLine={false} tickLine={false} />
                  <CartesianGrid vertical={false} stroke="#f0f0f0" strokeDasharray="3 3" />
                  <Tooltip />
                  <Area 
                    type="monotone" 
                    dataKey="sales" 
                    stroke="#3B82F6" 
                    fillOpacity={1}
                    fill="url(#colorSales)" 
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Category Distribution */}
          <div className="bg-white rounded-lg p-6 border border-gray-200">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Categories</h3>
              <button className="text-gray-400 hover:text-gray-600">
                <MoreHorizontal className="w-5 h-5" />
              </button>
            </div>
            <div className="h-48">
              <ResponsiveContainer width="100%" height="100%">
                <RechartsPie>
                  <Pie
                    data={categoryDistribution}
                    cx="50%"
                    cy="50%"
                    innerRadius={40}
                    outerRadius={70}
                    paddingAngle={2}
                    dataKey="value"
                  >
                    {categoryDistribution.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                </RechartsPie>
              </ResponsiveContainer>
            </div>
            <div className="mt-4 space-y-2">
              {categoryDistribution.map((category, index) => (
                <div key={index} className="flex items-center justify-between text-sm">
                  <div className="flex items-center gap-2">
                    <div 
                      className="w-3 h-3 rounded-full" 
                      style={{ backgroundColor: category.color }}
                    />
                    <span className="text-gray-600">{category.name}</span>
                  </div>
                  <span className="font-medium text-gray-900">{category.value}%</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Bottom Row */}
        <div className="grid grid-cols-3 gap-6">
          {/* Top Products */}
          <div className="bg-white rounded-lg p-6 border border-gray-200">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Top Products</h3>
              <button className="text-sm text-blue-600 hover:text-blue-700">
                View All
              </button>
            </div>
            <div className="space-y-3">
              {topProducts.map((product, index) => (
                <div key={product.id} className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-medium text-gray-500 w-6">#{index + 1}</span>
                    <div>
                      <p className="text-sm font-medium text-gray-900">{product.name}</p>
                      <p className="text-xs text-gray-500">{product.sales} units sold</p>
                    </div>
                  </div>
                  <span className="text-sm font-medium text-gray-900">₹{product.revenue.toLocaleString('en-IN')}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Recent Activities */}
          <div className="bg-white rounded-lg p-6 border border-gray-200">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Recent Activity</h3>
              <button className="text-sm text-blue-600 hover:text-blue-700">
                View All
              </button>
            </div>
            <div className="space-y-1">
              {recentActivities.map((activity) => (
                <ActivityItem key={activity.id} activity={activity} />
              ))}
            </div>
          </div>

          {/* Alerts */}
          <div className="bg-white rounded-lg p-6 border border-gray-200">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900">Alerts</h3>
              <span className="px-2 py-1 bg-red-100 text-red-600 text-xs font-medium rounded-full">
                {alerts.length}
              </span>
            </div>
            <div className="space-y-3">
              {alerts.map((alert) => (
                <AlertItem key={alert.id} alert={alert} />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DashboardV2;