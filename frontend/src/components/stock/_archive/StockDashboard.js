import React, { useState, useEffect } from 'react';
import {
  Package, AlertTriangle, TrendingDown, Clock,
  DollarSign, BarChart3, Activity, ArrowRight,
  Eye, Filter, Download, RefreshCw, X
} from 'lucide-react';
import { stockApi } from '../../services/api';
import { formatCurrency } from '../../utils/formatters';

const StockDashboard = ({ open = true, onClose }) => {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [metrics, setMetrics] = useState({
    totalValue: 0,
    totalProducts: 0,
    lowStockCount: 0,
    expiringCount: 0,
    deadStockCount: 0,
    stockTurnover: 0
  });
  const [alerts, setAlerts] = useState([]);
  const [recentMovements, setRecentMovements] = useState([]);
  const [stockByCategory, setStockByCategory] = useState([]);
  const [selectedView, setSelectedView] = useState('overview');

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    setLoading(true);
    try {
      // Load all dashboard data in parallel
      const [metricsData, alertsData, movementsData, categoryData] = await Promise.all([
        stockApi.getDashboardMetrics(),
        stockApi.getStockAlerts(),
        stockApi.getRecentMovements({ limit: 10 }),
        stockApi.getStockByCategory()
      ]);

      setMetrics(metricsData.data || metricsData);
      setAlerts(alertsData.data || []);
      setRecentMovements(movementsData.data || []);
      setStockByCategory(categoryData.data || []);
    } catch (error) {
      console.error('Error loading dashboard data:', error);
      // Set mock data for now
      setMetrics({
        totalValue: 1250000,
        totalProducts: 324,
        lowStockCount: 15,
        expiringCount: 8,
        deadStockCount: 3,
        stockTurnover: 12.5
      });
      setAlerts([
        { id: 1, type: 'low_stock', product: 'Paracetamol 500mg', current: 50, reorder: 200 },
        { id: 2, type: 'expiring', product: 'Amoxicillin 250mg', batch: 'B2024-001', expiryDate: '2025-02-15' }
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadDashboardData();
    setRefreshing(false);
  };

  const MetricCard = ({ title, value, icon: Icon, trend, color, onClick }) => (
    <div
      className={`bg-white rounded-lg p-6 shadow-sm border border-gray-200 hover:shadow-md transition-shadow cursor-pointer ${onClick ? 'hover:border-blue-300' : ''}`}
      onClick={onClick}
    >
      <div className="flex items-center justify-between mb-2">
        <div className={`p-3 rounded-lg bg-${color}-50`}>
          <Icon className={`w-6 h-6 text-${color}-600`} />
        </div>
        {trend && (
          <span className={`text-sm font-medium ${trend > 0 ? 'text-green-600' : 'text-red-600'}`}>
            {trend > 0 ? '+' : ''}{trend}%
          </span>
        )}
      </div>
      <h3 className="text-2xl font-bold text-gray-900">{value}</h3>
      <p className="text-sm text-gray-600 mt-1">{title}</p>
    </div>
  );

  const AlertItem = ({ alert }) => {
    const getAlertIcon = () => {
      switch (alert.type) {
        case 'low_stock': return <TrendingDown className="w-5 h-5 text-red-500" />;
        case 'expiring': return <Clock className="w-5 h-5 text-orange-500" />;
        case 'dead_stock': return <Package className="w-5 h-5 text-gray-500" />;
        default: return <AlertTriangle className="w-5 h-5 text-yellow-500" />;
      }
    };

    return (
      <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
        <div className="flex items-center space-x-3">
          {getAlertIcon()}
          <div>
            <p className="font-medium text-gray-900">{alert.product}</p>
            <p className="text-sm text-gray-600">
              {alert.type === 'low_stock' && `Current: ${alert.current} | Reorder: ${alert.reorder}`}
              {alert.type === 'expiring' && `Batch: ${alert.batch} | Expires: ${new Date(alert.expiryDate).toLocaleDateString()}`}
            </p>
          </div>
        </div>
        <button className="text-blue-600 hover:text-blue-700 font-medium text-sm">
          View Details
        </button>
      </div>
    );
  };

  if (!open) return null;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between py-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Stock Dashboard</h1>
              <p className="text-sm text-gray-600">Real-time inventory insights and analytics</p>
            </div>
            <div className="flex items-center space-x-3">
              <button
                onClick={handleRefresh}
                className={`flex items-center space-x-2 px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 ${refreshing ? 'animate-spin' : ''}`}
                disabled={refreshing}
              >
                <RefreshCw className="w-4 h-4" />
                <span>Refresh</span>
              </button>
              <button className="flex items-center space-x-2 px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50">
                <Filter className="w-4 h-4" />
                <span>Filter</span>
              </button>
              <button className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
                <Download className="w-4 h-4" />
                <span>Export</span>
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

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
          </div>
        ) : (
          <>
            {/* Metrics Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-6 mb-8">
              <MetricCard
                title="Total Stock Value"
                value={formatCurrency(metrics.totalValue)}
                icon={DollarSign}
                color="green"
                trend={5.2}
              />
              <MetricCard
                title="Total Products"
                value={metrics.totalProducts}
                icon={Package}
                color="blue"
              />
              <MetricCard
                title="Low Stock Items"
                value={metrics.lowStockCount}
                icon={TrendingDown}
                color="red"
                onClick={() => setSelectedView('low-stock')}
              />
              <MetricCard
                title="Expiring Soon"
                value={metrics.expiringCount}
                icon={Clock}
                color="orange"
                onClick={() => setSelectedView('expiring')}
              />
              <MetricCard
                title="Dead Stock"
                value={metrics.deadStockCount}
                icon={Package}
                color="gray"
              />
              <MetricCard
                title="Stock Turnover"
                value={`${metrics.stockTurnover}x`}
                icon={Activity}
                color="purple"
                trend={-2.1}
              />
            </div>

            {/* Content Area */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Stock Alerts */}
              <div className="lg:col-span-2 bg-white rounded-lg shadow-sm border border-gray-200">
                <div className="p-6 border-b border-gray-200">
                  <div className="flex items-center justify-between">
                    <h2 className="text-lg font-semibold text-gray-900">Critical Alerts</h2>
                    <span className="text-sm text-gray-600">{alerts.length} active alerts</span>
                  </div>
                </div>
                <div className="p-6 space-y-4">
                  {alerts.length > 0 ? (
                    alerts.slice(0, 5).map(alert => (
                      <AlertItem key={alert.id} alert={alert} />
                    ))
                  ) : (
                    <p className="text-center text-gray-500 py-8">No critical alerts at this time</p>
                  )}
                  {alerts.length > 5 && (
                    <button className="w-full text-center py-2 text-blue-600 hover:text-blue-700 font-medium">
                      View All Alerts ({alerts.length})
                    </button>
                  )}
                </div>
              </div>

              {/* Quick Actions */}
              <div className="bg-white rounded-lg shadow-sm border border-gray-200">
                <div className="p-6 border-b border-gray-200">
                  <h2 className="text-lg font-semibold text-gray-900">Quick Actions</h2>
                </div>
                <div className="p-6 space-y-3">
                  <button className="w-full flex items-center justify-between p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
                    <div className="flex items-center space-x-3">
                      <Package className="w-5 h-5 text-blue-600" />
                      <span className="font-medium">Stock Take</span>
                    </div>
                    <ArrowRight className="w-4 h-4 text-gray-400" />
                  </button>
                  <button className="w-full flex items-center justify-between p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
                    <div className="flex items-center space-x-3">
                      <BarChart3 className="w-5 h-5 text-green-600" />
                      <span className="font-medium">Stock Report</span>
                    </div>
                    <ArrowRight className="w-4 h-4 text-gray-400" />
                  </button>
                  <button className="w-full flex items-center justify-between p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors">
                    <div className="flex items-center space-x-3">
                      <Eye className="w-5 h-5 text-purple-600" />
                      <span className="font-medium">Batch Tracking</span>
                    </div>
                    <ArrowRight className="w-4 h-4 text-gray-400" />
                  </button>
                </div>
              </div>
            </div>

            {/* Stock by Category Chart */}
            <div className="mt-6 bg-white rounded-lg shadow-sm border border-gray-200">
              <div className="p-6 border-b border-gray-200">
                <h2 className="text-lg font-semibold text-gray-900">Stock Distribution by Category</h2>
              </div>
              <div className="p-6">
                {stockByCategory.length > 0 ? (
                  <div className="space-y-4">
                    {stockByCategory.map((category, index) => (
                      <div key={index} className="flex items-center justify-between">
                        <div className="flex items-center space-x-3 flex-1">
                          <span className="text-sm font-medium text-gray-700">{category.name}</span>
                          <div className="flex-1 bg-gray-200 rounded-full h-2">
                            <div
                              className="bg-blue-600 h-2 rounded-full"
                              style={{ width: `${(category.value / metrics.totalValue) * 100}%` }}
                            />
                          </div>
                        </div>
                        <span className="text-sm text-gray-600 ml-4">
                          {formatCurrency(category.value)}
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-center text-gray-500 py-8">No category data available</p>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default StockDashboard;