import React, { useState, useEffect } from 'react';
import { 
  BarChart3, TrendingUp, Users, Package, 
  Database, Activity, AlertTriangle, CheckCircle,
  Calendar, Search, Filter, Download, RefreshCw,
  Settings, ArrowRight, Eye, Edit2, Plus, Upload
} from 'lucide-react';
import { DataTable, StatusBadge, SummaryCard } from '../global/ui';
import { productsApi, customersApi, suppliersApi } from '../../services/api';

const MasterDataDashboard = ({ onNavigateToModule }) => {
  const [dashboardData, setDashboardData] = useState({
    summary: {
      totalProducts: 0,
      totalCustomers: 0,
      totalSuppliers: 0,
      activeWarehouses: 0
    },
    recentActivity: [],
    dataQuality: {
      completeness: 0,
      accuracy: 0,
      consistency: 0
    },
    systemHealth: {
      apiStatus: 'unknown',
      syncStatus: 'unknown',
      lastBackup: null
    }
  });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedMetric, setSelectedMetric] = useState('overview');

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      const [productsRes, customersRes, suppliersRes] = await Promise.allSettled([
        productsApi.getAll(),
        customersApi.getAll(),
        suppliersApi.getAll()
      ]);

      // Handle different API response formats safely
      const products = productsRes.status === 'fulfilled' ? 
        (Array.isArray(productsRes.value?.data) ? productsRes.value.data : 
         Array.isArray(productsRes.value?.data?.data) ? productsRes.value.data.data : []) : [];
      
      const customers = customersRes.status === 'fulfilled' ? 
        (Array.isArray(customersRes.value?.data) ? customersRes.value.data : 
         Array.isArray(customersRes.value?.data?.data) ? customersRes.value.data.data : 
         Array.isArray(customersRes.value?.data?.customers) ? customersRes.value.data.customers : []) : [];
      
      const suppliers = suppliersRes.status === 'fulfilled' ? 
        (Array.isArray(suppliersRes.value?.data) ? suppliersRes.value.data : 
         Array.isArray(suppliersRes.value?.data?.data) ? suppliersRes.value.data.data : []) : [];

      setDashboardData({
        summary: {
          totalProducts: products.length,
          totalCustomers: customers.length,
          totalSuppliers: suppliers.length,
          activeWarehouses: 3 // Mock for now
        },
        recentActivity: generateRecentActivity(),
        dataQuality: calculateDataQuality(products, customers, suppliers),
        systemHealth: {
          apiStatus: 'healthy',
          syncStatus: 'synced',
          lastBackup: new Date().toISOString()
        }
      });
    } catch (err) {
      console.error('Error loading dashboard:', err);
      setError('Failed to load dashboard data');
      // Use mock data as fallback
      setDashboardData(getMockDashboardData());
    } finally {
      setIsLoading(false);
    }
  };

  const calculateDataQuality = (products, customers, suppliers) => {
    // Calculate data completeness, accuracy, and consistency metrics
    const allRecords = [...products, ...customers, ...suppliers];
    if (allRecords.length === 0) return { completeness: 100, accuracy: 100, consistency: 100 };

    const completeness = Math.round(
      (allRecords.filter(record => 
        record.name && record.id && record.created_at
      ).length / allRecords.length) * 100
    );

    return {
      completeness: Math.min(completeness, 100),
      accuracy: 98, // Mock for now
      consistency: 95 // Mock for now
    };
  };

  const generateRecentActivity = () => [
    { id: 1, type: 'product', action: 'created', entity: 'Paracetamol 500mg', timestamp: new Date(Date.now() - 1000 * 60 * 30), user: 'John Doe' },
    { id: 2, type: 'customer', action: 'updated', entity: 'ABC Pharmacy', timestamp: new Date(Date.now() - 1000 * 60 * 60), user: 'Jane Smith' },
    { id: 3, type: 'supplier', action: 'created', entity: 'XYZ Pharmaceuticals', timestamp: new Date(Date.now() - 1000 * 60 * 90), user: 'Mike Johnson' },
    { id: 4, type: 'warehouse', action: 'inventory_updated', entity: 'Main Warehouse', timestamp: new Date(Date.now() - 1000 * 60 * 120), user: 'System' }
  ];

  const getMockDashboardData = () => ({
    summary: {
      totalProducts: 1247,
      totalCustomers: 856,
      totalSuppliers: 123,
      activeWarehouses: 3
    },
    recentActivity: generateRecentActivity(),
    dataQuality: {
      completeness: 94,
      accuracy: 98,
      consistency: 95
    },
    systemHealth: {
      apiStatus: 'healthy',
      syncStatus: 'synced',
      lastBackup: new Date().toISOString()
    }
  });

  const summaryCards = [
    {
      title: 'Products',
      value: dashboardData.summary.totalProducts,
      icon: Package,
      color: 'blue',
      trend: '+12%',
      action: () => onNavigateToModule('product-master')
    },
    {
      title: 'Customers',
      value: dashboardData.summary.totalCustomers,
      icon: Users,
      color: 'green',
      trend: '+8%',
      action: () => onNavigateToModule('party-master')
    },
    {
      title: 'Suppliers',
      value: dashboardData.summary.totalSuppliers,
      icon: Database,
      color: 'purple',
      trend: '+3%',
      action: () => onNavigateToModule('party-master')
    },
    {
      title: 'Warehouses',
      value: dashboardData.summary.activeWarehouses,
      icon: Settings,
      color: 'orange',
      trend: '0%',
      action: () => onNavigateToModule('warehouse-master')
    }
  ];

  const dataQualityMetrics = [
    {
      name: 'Data Completeness',
      value: dashboardData.dataQuality.completeness,
      color: dashboardData.dataQuality.completeness >= 90 ? 'green' : dashboardData.dataQuality.completeness >= 75 ? 'yellow' : 'red'
    },
    {
      name: 'Data Accuracy',
      value: dashboardData.dataQuality.accuracy,
      color: dashboardData.dataQuality.accuracy >= 95 ? 'green' : dashboardData.dataQuality.accuracy >= 85 ? 'yellow' : 'red'
    },
    {
      name: 'Data Consistency',
      value: dashboardData.dataQuality.consistency,
      color: dashboardData.dataQuality.consistency >= 90 ? 'green' : dashboardData.dataQuality.consistency >= 80 ? 'yellow' : 'red'
    }
  ];

  const getActivityIcon = (type) => {
    switch (type) {
      case 'product': return Package;
      case 'customer': return Users;
      case 'supplier': return Database;
      case 'warehouse': return Settings;
      default: return Activity;
    }
  };

  const getActivityColor = (action) => {
    switch (action) {
      case 'created': return 'green';
      case 'updated': return 'blue';
      case 'deleted': return 'red';
      case 'inventory_updated': return 'orange';
      default: return 'gray';
    }
  };

  if (isLoading) {
    return (
      <div className="p-6">
        <div className="flex items-center justify-center h-64">
          <RefreshCw className="h-8 w-8 animate-spin text-blue-600" />
          <span className="ml-2 text-gray-600">Loading dashboard...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-center">
            <AlertTriangle className="h-5 w-5 text-red-600 mr-2" />
            <span className="text-red-800">{error}</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Master Data Dashboard</h1>
          <p className="text-gray-600">Overview of your master data and system health</p>
        </div>
        <div className="flex items-center space-x-2">
          <button
            onClick={loadDashboardData}
            className="inline-flex items-center px-3 py-2 border border-gray-300 rounded-md bg-white text-gray-700 hover:bg-gray-50"
          >
            <RefreshCw className="h-4 w-4 mr-1" />
            Refresh
          </button>
          <button className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700">
            <Download className="h-4 w-4 mr-1" />
            Export Report
          </button>
          <button 
            onClick={() => onNavigateToModule('data-validation')}
            className="inline-flex items-center px-4 py-2 bg-orange-600 text-white rounded-md hover:bg-orange-700"
          >
            <AlertTriangle className="h-4 w-4 mr-1" />
            Validate Data
          </button>
          <button 
            onClick={() => onNavigateToModule('bulk-operations')}
            className="inline-flex items-center px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700"
          >
            <Upload className="h-4 w-4 mr-1" />
            Bulk Ops
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {summaryCards.map((card, index) => (
          <SummaryCard
            key={index}
            title={card.title}
            value={card.value}
            icon={card.icon}
            color={card.color}
            trend={card.trend}
            onClick={card.action}
            className="cursor-pointer hover:shadow-lg transition-shadow"
          />
        ))}
      </div>

      {/* System Health */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Data Quality Metrics */}
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">Data Quality</h3>
            <BarChart3 className="h-5 w-5 text-gray-500" />
          </div>
          <div className="space-y-4">
            {dataQualityMetrics.map((metric, index) => (
              <div key={index} className="flex items-center justify-between">
                <span className="text-sm text-gray-600">{metric.name}</span>
                <div className="flex items-center space-x-2">
                  <div className="w-32 bg-gray-200 rounded-full h-2">
                    <div 
                      className={`h-2 rounded-full ${
                        metric.color === 'green' ? 'bg-green-500' :
                        metric.color === 'yellow' ? 'bg-yellow-500' : 'bg-red-500'
                      }`}
                      style={{ width: `${metric.value}%` }}
                    ></div>
                  </div>
                  <span className="text-sm font-medium text-gray-900">{metric.value}%</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* System Health */}
        <div className="bg-white rounded-lg border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">System Health</h3>
            <Activity className="h-5 w-5 text-gray-500" />
          </div>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">API Status</span>
              <StatusBadge 
                status={dashboardData.systemHealth.apiStatus === 'healthy' ? 'active' : 'inactive'} 
                text={dashboardData.systemHealth.apiStatus}
              />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">Sync Status</span>
              <StatusBadge 
                status={dashboardData.systemHealth.syncStatus === 'synced' ? 'active' : 'inactive'} 
                text={dashboardData.systemHealth.syncStatus}
              />
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-gray-600">Last Backup</span>
              <span className="text-sm text-gray-900">
                {dashboardData.systemHealth.lastBackup ? 
                  new Date(dashboardData.systemHealth.lastBackup).toLocaleDateString() : 
                  'Never'
                }
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Recent Activity */}
      <div className="bg-white rounded-lg border border-gray-200">
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold text-gray-900">Recent Activity</h3>
            <button 
              onClick={() => onNavigateToModule('audit-log')}
              className="text-sm text-blue-600 hover:text-blue-800 flex items-center"
            >
              View all <ArrowRight className="h-4 w-4 ml-1" />
            </button>
          </div>
        </div>
        <div className="p-6">
          <div className="space-y-4">
            {dashboardData.recentActivity.map((activity) => {
              const IconComponent = getActivityIcon(activity.type);
              return (
                <div key={activity.id} className="flex items-center space-x-3">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center ${
                    getActivityColor(activity.action) === 'green' ? 'bg-green-100' :
                    getActivityColor(activity.action) === 'blue' ? 'bg-blue-100' :
                    getActivityColor(activity.action) === 'red' ? 'bg-red-100' :
                    getActivityColor(activity.action) === 'orange' ? 'bg-orange-100' : 'bg-gray-100'
                  }`}>
                    <IconComponent className={`h-4 w-4 ${
                      getActivityColor(activity.action) === 'green' ? 'text-green-600' :
                      getActivityColor(activity.action) === 'blue' ? 'text-blue-600' :
                      getActivityColor(activity.action) === 'red' ? 'text-red-600' :
                      getActivityColor(activity.action) === 'orange' ? 'text-orange-600' : 'text-gray-600'
                    }`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-900">
                      <span className="font-medium">{activity.user}</span>
                      {' '}
                      <span className="capitalize">{activity.action}</span>
                      {' '}
                      <span className="font-medium">{activity.entity}</span>
                    </p>
                    <p className="text-xs text-gray-500">
                      {activity.timestamp.toLocaleString()}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};

export default MasterDataDashboard;