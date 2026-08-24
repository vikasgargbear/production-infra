import React, { useState, useMemo, useEffect } from 'react';
import { Package, AlertTriangle, TrendingDown, BarChart3, Search, Calendar, Activity, Box, AlertCircle } from 'lucide-react';
import { Line, Bar, Doughnut, Scatter } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler
} from 'chart.js';
import apiClient from '../../services/api/apiClient';
import { format, subDays } from 'date-fns';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

interface InventoryItem {
  id: string;
  name: string;
  category: string;
  batch: string;
  currentStock: number;
  minStock: number;
  maxStock: number;
  value: number;
  expiryDate: string;
  lastRestocked: string;
  turnoverRate: number;
  status: 'Optimal' | 'Low' | 'Critical' | 'Overstocked' | 'Expiring';
  supplier: string;
}

interface StockMovement {
  date: string;
  type: 'In' | 'Out' | 'Adjustment';
  quantity: number;
  reference: string;
}

const numberOrZero = (value: unknown): number => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

export const projectInventoryItems = (payload: unknown): InventoryItem[] => {
  const rows = Array.isArray(payload)
    ? payload
    : Array.isArray((payload as any)?.items)
      ? (payload as any).items
      : Array.isArray((payload as any)?.inventory)
        ? (payload as any).inventory
        : [];

  return rows.map((item: any) => {
    const currentStock = numberOrZero(item.total_quantity_available ?? item.quantity);
    const minStock = numberOrZero(item.min_stock_level);
    const maxStock = numberOrZero(item.max_stock_level);
    const expiryDate = item.expiry_date || '';
    let status: InventoryItem['status'] = 'Optimal';
    if (currentStock <= 0) {
      status = 'Critical';
    } else if (minStock > 0 && currentStock <= minStock) {
      status = currentStock <= minStock * 0.5 ? 'Critical' : 'Low';
    } else if (maxStock > 0 && currentStock >= maxStock) {
      status = 'Overstocked';
    } else if (expiryDate) {
      const daysToExpiry = Math.ceil((new Date(expiryDate).getTime() - Date.now()) / 86_400_000);
      if (Number.isFinite(daysToExpiry) && daysToExpiry <= 30) status = 'Expiring';
    }

    return {
      id: String(item.id ?? item.product_id ?? ''),
      name: String(item.name ?? item.product_name ?? 'Unnamed product'),
      category: String(item.category ?? 'Uncategorized'),
      batch: String(item.batch_number ?? ''),
      currentStock,
      minStock,
      maxStock,
      value: numberOrZero(item.stock_value ?? item.total_value ?? (currentStock * numberOrZero(item.unit_price))),
      expiryDate,
      lastRestocked: item.last_restocked || item.last_purchase_date || '',
      turnoverRate: numberOrZero(item.turnover_rate),
      status,
      supplier: String(item.supplier ?? item.vendor_name ?? '')
    };
  });
};

export const projectStockMovements = (payload: unknown): StockMovement[] => {
  const rows = Array.isArray(payload) ? payload : Array.isArray((payload as any)?.movements) ? (payload as any).movements : [];
  return rows.map((movement: any) => ({
    date: String(movement.date ?? movement.movement_date ?? ''),
    type: movement.type === 'In' || movement.movement_type === 'in'
      ? 'In'
      : movement.type === 'Out' || movement.movement_type === 'out'
        ? 'Out'
        : 'Adjustment',
    quantity: numberOrZero(movement.quantity),
    reference: String(movement.reference ?? movement.reference_number ?? 'No reference')
  }));
};

export const filterInventoryItems = (
  inventory: InventoryItem[],
  selectedCategory: string,
  stockFilter: string,
  searchQuery: string
): InventoryItem[] => {
  const query = searchQuery.trim().toLowerCase();
  return inventory.filter(item => (
    (selectedCategory === 'all' || item.category === selectedCategory)
    && (stockFilter === 'all' || item.status === stockFilter)
    && (!query || item.name.toLowerCase().includes(query) || item.batch.toLowerCase().includes(query))
  ));
};

const InventoryReport: React.FC = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [stockFilter, setStockFilter] = useState('all');
  const [view, setView] = useState<'overview' | 'movements' | 'expiry' | 'valuation'>('overview');
  const [loading, setLoading] = useState(true);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [categories, setCategories] = useState<string[]>(['all']);
  const [stockMovements, setStockMovements] = useState<StockMovement[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [optionalWarnings, setOptionalWarnings] = useState<string[]>([]);

  useEffect(() => {
    loadInventoryData();
  }, []);

  const loadInventoryData = async () => {
    setLoading(true);
    setError(null);
    try {
      // Inventory list is authoritative; companion reads may fail independently.
      const [inventoryList, movements, categoryData] = await Promise.allSettled([
        apiClient.get('/inventory/list', {
          params: {
            include_stock_levels: true,
            include_expiry: true,
            include_valuation: true
          }
        }),
        apiClient.get('/inventory/movements', {
          params: {
            date_from: format(subDays(new Date(), 7), 'yyyy-MM-dd'),
            date_to: format(new Date(), 'yyyy-MM-dd')
          }
        }),
        apiClient.get('/inventory/categories')
      ]);

      if (inventoryList.status === 'rejected') throw inventoryList.reason;
      setInventory(projectInventoryItems(inventoryList.value.data));

      const warnings: string[] = [];

      // Set categories from API
      if (categoryData.status === 'fulfilled' && Array.isArray(categoryData.value.data)) {
        setCategories(['all', ...categoryData.value.data.map((cat: any) => cat.name || cat.category_name).filter(Boolean)]);
      } else {
        warnings.push('category filters');
        setCategories(['all']);
      }

      if (movements.status === 'fulfilled') {
        setStockMovements(projectStockMovements(movements.value.data));
      } else {
        warnings.push('stock movements');
        setStockMovements([]);
      }
      setOptionalWarnings(warnings);

    } catch (error) {
      console.error('Error loading inventory data:', error);
      setInventory([]);
      setStockMovements([]);
      setOptionalWarnings([]);
      setError('Live inventory details are unavailable. Please retry.');
    } finally {
      setLoading(false);
    }
  };

  const filteredInventory = useMemo(() => {
    return filterInventoryItems(inventory, selectedCategory, stockFilter, searchQuery);
  }, [inventory, selectedCategory, stockFilter, searchQuery]);

  const stockStatusDistribution = useMemo(() => {
    const statusCounts = inventory.reduce((acc, item) => {
      acc[item.status] = (acc[item.status] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    return {
      labels: Object.keys(statusCounts),
      datasets: [{
        data: Object.values(statusCounts),
        backgroundColor: [
          'rgba(34, 197, 94, 0.8)',  // Optimal
          'rgba(251, 146, 60, 0.8)',  // Low
          'rgba(239, 68, 68, 0.8)',   // Critical
          'rgba(59, 130, 246, 0.8)',  // Overstocked
          'rgba(147, 51, 234, 0.8)'   // Expiring
        ],
        borderWidth: 0
      }]
    };
  }, [inventory]);

  const stockMovementTrend = useMemo(() => {
    if (stockMovements.length === 0) {
      return { labels: [], datasets: [] };
    }

    // Group movements by day
    const dailyMovements = stockMovements.reduce((acc: any, movement: any) => {
      const date = format(new Date(movement.date || movement.movement_date), 'EEE');
      if (!acc[date]) {
        acc[date] = { in: 0, out: 0 };
      }
      if (movement.type === 'In') {
        acc[date].in += movement.quantity || 0;
      } else {
        acc[date].out += Math.abs(movement.quantity || 0);
      }
      return acc;
    }, {});

    const labels = Object.keys(dailyMovements);
    return {
      labels,
      datasets: [
        {
          label: 'Stock In',
          data: labels.map(label => dailyMovements[label].in),
          borderColor: 'rgb(34, 197, 94)',
          backgroundColor: 'rgba(34, 197, 94, 0.1)',
          tension: 0.3,
          fill: true
        },
        {
          label: 'Stock Out',
          data: labels.map(label => dailyMovements[label].out),
          borderColor: 'rgb(239, 68, 68)',
          backgroundColor: 'rgba(239, 68, 68, 0.1)',
          tension: 0.3,
          fill: true
        }
      ]
    };
  }, [stockMovements]);

  const categoryValuation = useMemo(() => {
    const categoryValues = inventory.reduce((acc, item) => {
      acc[item.category] = (acc[item.category] || 0) + item.value;
      return acc;
    }, {} as Record<string, number>);

    return {
      labels: Object.keys(categoryValues),
      datasets: [{
        label: 'Stock Value',
        data: Object.values(categoryValues),
        backgroundColor: 'rgba(59, 130, 246, 0.8)',
        borderWidth: 0
      }]
    };
  }, [inventory]);

  const turnoverAnalysis = useMemo(() => {
    return {
      datasets: [{
        label: 'Products',
        data: inventory.map(item => ({
          x: item.turnoverRate,
          y: item.value / 1000,
          label: item.name
        })),
        backgroundColor: inventory.map(item => {
          if (item.status === 'Critical') return 'rgba(239, 68, 68, 0.6)';
          if (item.status === 'Low') return 'rgba(251, 146, 60, 0.6)';
          if (item.status === 'Overstocked') return 'rgba(59, 130, 246, 0.6)';
          if (item.status === 'Expiring') return 'rgba(147, 51, 234, 0.6)';
          return 'rgba(34, 197, 94, 0.6)';
        }),
        pointRadius: 8,
        pointHoverRadius: 10
      }]
    };
  }, [inventory]);

  const getStatusBadge = (status: string) => {
    const colors = {
      Optimal: 'bg-green-100 text-green-800',
      Low: 'bg-yellow-100 text-yellow-800',
      Critical: 'bg-red-100 text-red-800',
      Overstocked: 'bg-blue-100 text-blue-800',
      Expiring: 'bg-purple-100 text-purple-800'
    };
    return (
      <span className={`px-2 py-1 text-xs font-medium rounded-full ${colors[status as keyof typeof colors]}`}>
        {status}
      </span>
    );
  };

  const getStockLevel = (current: number, min: number, max: number) => {
    if (min <= 0 || max <= min) {
      return <span className="text-xs text-gray-400">Reorder levels unavailable</span>;
    }
    const percentage = ((current - min) / (max - min)) * 100;
    let color = 'bg-green-500';
    if (percentage < 20) color = 'bg-red-500';
    else if (percentage < 40) color = 'bg-yellow-500';
    else if (percentage > 100) color = 'bg-blue-500';
    
    return (
      <div className="w-full bg-gray-200 rounded-full h-2">
        <div
          className={`${color} h-2 rounded-full`}
          style={{ width: `${Math.min(Math.max(percentage, 0), 100)}%` }}
        />
      </div>
    );
  };

  const getDaysUntilExpiry = (expiryDate: string) => {
    if (!expiryDate) return <span className="text-gray-400">—</span>;
    const days = Math.floor((new Date(expiryDate).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
    if (!Number.isFinite(days)) return <span className="text-gray-400">—</span>;
    if (days < 30) return <span className="text-red-600 font-medium">{days} days</span>;
    if (days < 90) return <span className="text-yellow-600">{days} days</span>;
    return <span className="text-gray-600">{days} days</span>;
  };
  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading inventory data...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        {error && (
          <div className="m-6 flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 p-4 text-red-800" role="alert">
            <AlertCircle className="h-5 w-5" />{error}
          </div>
        )}
        {optionalWarnings.length > 0 && (
          <div className="m-6 flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 p-4 text-amber-900" role="status">
            <AlertTriangle className="h-5 w-5" />
            Live {optionalWarnings.join(' and ')} are unavailable; inventory totals and details remain current.
          </div>
        )}
        {/* Header */}
        <div className="p-6 border-b border-gray-200">
          <div className="flex justify-between items-start">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Inventory Report</h1>
              <p className="text-gray-600 mt-1">Stock levels, movement analysis, and expiry tracking</p>
            </div>
          </div>

          {/* View Tabs */}
          <nav aria-label="Inventory report views" className="mt-6 flex gap-4 overflow-x-auto border-b border-gray-200">
            {(['overview', 'movements', 'expiry', 'valuation'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setView(tab)}
                aria-current={view === tab ? 'page' : undefined}
                className={`min-h-11 shrink-0 whitespace-nowrap border-b-2 px-1 pb-3 transition-colors ${
                  view === tab
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-600 hover:text-gray-900'
                }`}
              >
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
              </button>
            ))}
          </nav>

          {/* Filters */}
          <div className="flex flex-wrap gap-4 mt-4">
            <div className="flex-1 min-w-[200px]">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  type="text"
                  aria-label="Search inventory report"
                  placeholder="Search products or batches..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="min-h-11 w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </div>
            <select
              aria-label="Filter inventory report by category"
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="min-h-11 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            >
              {categories.map(cat => (
                <option key={cat} value={cat}>
                  {cat === 'all' ? 'All Categories' : cat}
                </option>
              ))}
            </select>
            <select
              aria-label="Filter inventory report by stock status"
              value={stockFilter}
              onChange={(e) => setStockFilter(e.target.value)}
              className="min-h-11 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            >
              <option value="all">All Status</option>
              <option value="Optimal">Optimal</option>
              <option value="Low">Low Stock</option>
              <option value="Critical">Critical</option>
              <option value="Overstocked">Overstocked</option>
              <option value="Expiring">Expiring Soon</option>
            </select>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4 p-6 border-b border-gray-200">
          <div className="p-4 border border-gray-200 rounded-lg">
            <Package className="h-8 w-8 text-blue-600 mb-2" />
            <p className="text-sm text-gray-600">Total SKUs</p>
            <p className="text-xl font-bold">{inventory.length}</p>
          </div>
          <div className="p-4 border border-gray-200 rounded-lg">
            <BarChart3 className="h-8 w-8 text-green-600 mb-2" />
            <p className="text-sm text-gray-600">Stock Value</p>
            <p className="text-xl font-bold">
              ₹{inventory.reduce((acc, item) => acc + item.value, 0).toLocaleString('en-IN')}
            </p>
          </div>
          <div className="p-4 border border-gray-200 rounded-lg">
            <AlertTriangle className="h-8 w-8 text-yellow-600 mb-2" />
            <p className="text-sm text-gray-600">Low Stock</p>
            <p className="text-xl font-bold">
              {inventory.filter(item => item.status === 'Low' || item.status === 'Critical').length}
            </p>
          </div>
          <div className="p-4 border border-gray-200 rounded-lg">
            <TrendingDown className="h-8 w-8 text-red-600 mb-2" />
            <p className="text-sm text-gray-600">Expiring (30d)</p>
            <p className="text-xl font-bold">
              {inventory.filter(item => {
                if (!item.expiryDate) return false;
                const days = Math.floor((new Date(item.expiryDate).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
                return Number.isFinite(days) && days >= 0 && days <= 30;
              }).length}
            </p>
          </div>
          <div className="p-4 border border-gray-200 rounded-lg">
            <Activity className="h-8 w-8 text-purple-600 mb-2" />
            <p className="text-sm text-gray-600">Avg 30d Stock Out</p>
            <p className="text-xl font-bold">
              {(inventory.length > 0
                ? inventory.reduce((acc, item) => acc + item.turnoverRate, 0) / inventory.length
                : 0).toFixed(1)} units
            </p>
          </div>
        </div>

        {view === 'overview' && (
          <>
            {/* Charts */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 p-6 border-b border-gray-200">
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Stock Status Distribution</h3>
                <Doughnut
                  data={stockStatusDistribution}
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                      legend: {
                        position: 'bottom' as const
                      }
                    }
                  }}
                  height={250}
                />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Stock Movement Trend</h3>
                <Line
                  data={stockMovementTrend}
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                      legend: {
                        position: 'bottom' as const
                      }
                    },
                    scales: {
                      y: {
                        ticks: {
                          callback: (value) => `${(value as number / 1000).toFixed(0)}K`
                        }
                      }
                    }
                  }}
                  height={250}
                />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Category Valuation</h3>
                <Bar
                  data={categoryValuation}
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                      legend: {
                        display: false
                      }
                    },
                    scales: {
                      y: {
                        ticks: {
                          callback: (value) => `₹${(value as number / 1000).toFixed(0)}K`
                        }
                      }
                    }
                  }}
                  height={250}
                />
              </div>
            </div>

            {/* Inventory Table */}
            <div className="p-6">
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Inventory Details</h3>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="text-left py-3 px-4 text-gray-700">Product</th>
                      <th className="text-left py-3 px-4 text-gray-700">Batch</th>
                      <th className="text-center py-3 px-4 text-gray-700">Status</th>
                      <th className="text-left py-3 px-4 text-gray-700">Stock Level</th>
                      <th className="text-right py-3 px-4 text-gray-700">Current</th>
                      <th className="text-right py-3 px-4 text-gray-700">Value</th>
                      <th className="text-right py-3 px-4 text-gray-700">30d Stock Out</th>
                      <th className="text-right py-3 px-4 text-gray-700">Expiry</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredInventory.map((item, index) => (
                      <tr key={item.id} className={`border-b border-gray-100 hover:bg-gray-50 ${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}`}>
                        <td className="py-3 px-4">
                          <div>
                            <p className="font-medium text-gray-900">{item.name}</p>
                            <p className="text-xs text-gray-500">{item.category}</p>
                          </div>
                        </td>
                        <td className="py-3 px-4 text-gray-600">{item.batch}</td>
                        <td className="py-3 px-4 text-center">
                          {getStatusBadge(item.status)}
                        </td>
                        <td className="py-3 px-4">
                          <div className="w-32">
                            {getStockLevel(item.currentStock, item.minStock, item.maxStock)}
                            {item.minStock > 0 && item.maxStock > item.minStock && (
                              <p className="text-xs text-gray-500 mt-1">
                                Min: {item.minStock} | Max: {item.maxStock}
                              </p>
                            )}
                          </div>
                        </td>
                        <td className="py-3 px-4 text-right">
                          <span className={`font-medium ${
                            item.minStock > 0 && item.currentStock < item.minStock ? 'text-red-600' :
                            item.maxStock > item.minStock && item.currentStock > item.maxStock ? 'text-blue-600' :
                            'text-gray-900'
                          }`}>
                            {item.currentStock.toLocaleString()}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right">
                          ₹{item.value.toLocaleString('en-IN')}
                        </td>
                        <td className="py-3 px-4 text-right">
                          {item.turnoverRate.toFixed(1)}
                        </td>
                        <td className="py-3 px-4 text-right">
                          {getDaysUntilExpiry(item.expiryDate)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {view === 'movements' && (
          <div className="p-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Recent Stock Movements</h3>
                <div className="space-y-3">
                  {stockMovements.map((movement, index) => (
                    <div key={index} className="flex items-center justify-between p-3 border border-gray-200 rounded-lg">
                      <div className="flex items-center gap-3">
                        <div className={`p-2 rounded-full ${
                          movement.type === 'In' ? 'bg-green-100' :
                          movement.type === 'Out' ? 'bg-red-100' :
                          'bg-gray-100'
                        }`}>
                          {movement.type === 'In' && <Box className="h-4 w-4 text-green-600" />}
                          {movement.type === 'Out' && <Box className="h-4 w-4 text-red-600" />}
                          {movement.type === 'Adjustment' && <AlertCircle className="h-4 w-4 text-gray-600" />}
                        </div>
                        <div>
                          <p className="font-medium text-gray-900">{movement.reference}</p>
                          <p className="text-xs text-gray-500">
                            {movement.date ? new Date(movement.date).toLocaleString('en-IN') : 'Date unavailable'}
                          </p>
                        </div>
                      </div>
                      <span className={`font-medium ${
                        movement.type === 'In' ? 'text-green-600' :
                        movement.type === 'Out' ? 'text-red-600' :
                        'text-gray-600'
                      }`}>
                        {movement.type === 'In' ? '+' : movement.type === 'Out' ? '−' : ''}{movement.quantity}
                      </span>
                    </div>
                  ))}
                  {stockMovements.length === 0 && (
                    <p className="rounded-lg border border-gray-200 p-4 text-sm text-gray-500">No stock movements found for the last 7 days.</p>
                  )}
                </div>
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-4">30-day Stock Out Analysis</h3>
                <Scatter
                  data={turnoverAnalysis}
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                      legend: {
                        display: false
                      },
                      tooltip: {
                        callbacks: {
                          label: (context) => {
                            const point = context.raw as any;
                            return [`Stock out: ${point.x} units`, `Value: ₹${point.y}K`];
                          }
                        }
                      }
                    },
                    scales: {
                      x: {
                        title: {
                          display: true,
                          text: 'Units issued in 30 days'
                        }
                      },
                      y: {
                        title: {
                          display: true,
                          text: 'Stock Value (₹K)'
                        }
                      }
                    }
                  }}
                  height={400}
                />
              </div>
            </div>
          </div>
        )}

        {view === 'expiry' && (
          <div className="p-6">
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-yellow-600" />
                <p className="text-yellow-800">
                  <span className="font-semibold">
                    {inventory.filter(item => {
                      if (!item.expiryDate) return false;
                      const days = Math.floor((new Date(item.expiryDate).getTime() - Date.now()) / 86_400_000);
                      return Number.isFinite(days) && days >= 0 && days <= 30;
                    }).length} items expiring within 30 days
                  </span>
                </p>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {inventory
                .filter(item => {
                  const days = Math.floor((new Date(item.expiryDate).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
                  return Number.isFinite(days) && days >= 0 && days <= 90;
                })
                .sort((a, b) => new Date(a.expiryDate).getTime() - new Date(b.expiryDate).getTime())
                .map(item => {
                  const days = Math.floor((new Date(item.expiryDate).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
                  return (
                    <div key={item.id} className={`border rounded-lg p-4 ${
                      days <= 30 ? 'border-red-300 bg-red-50' :
                      days <= 60 ? 'border-yellow-300 bg-yellow-50' :
                      'border-gray-200'
                    }`}>
                      <div className="flex justify-between items-start mb-2">
                        <div>
                          <h4 className="font-semibold text-gray-900">{item.name}</h4>
                          <p className="text-sm text-gray-500">Batch: {item.batch}</p>
                        </div>
                        <Calendar className={`h-5 w-5 ${
                          days <= 30 ? 'text-red-600' :
                          days <= 60 ? 'text-yellow-600' :
                          'text-gray-400'
                        }`} />
                      </div>
                      <div className="space-y-2">
                        <div className="flex justify-between">
                          <span className="text-sm text-gray-600">Expires</span>
                          <span className={`text-sm font-medium ${
                            days <= 30 ? 'text-red-600' :
                            days <= 60 ? 'text-yellow-600' :
                            'text-gray-900'
                          }`}>
                            {new Date(item.expiryDate).toLocaleDateString('en-IN')}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-sm text-gray-600">Days Left</span>
                          <span className={`text-sm font-bold ${
                            days <= 30 ? 'text-red-600' :
                            days <= 60 ? 'text-yellow-600' :
                            'text-gray-900'
                          }`}>
                            {days} days
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-sm text-gray-600">Stock</span>
                          <span className="text-sm font-medium">{item.currentStock} units</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-sm text-gray-600">Value at Risk</span>
                          <span className="text-sm font-medium">₹{item.value.toLocaleString('en-IN')}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        )}

        {view === 'valuation' && (
          <div className="p-6">
            <div className="grid grid-cols-1 gap-4 mb-6">
              <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <p className="text-sm text-blue-700">Total Inventory Value</p>
                <p className="text-2xl font-bold text-blue-900">
                  ₹{inventory.reduce((acc, item) => acc + item.value, 0).toLocaleString('en-IN')}
                </p>
              </div>
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Product Valuation</h3>
            <div className="space-y-2">
              {[...inventory]
                .sort((a, b) => b.value - a.value)
                .map((item) => {
                  const totalValue = inventory.reduce((acc, i) => acc + i.value, 0);
                  const percentage = totalValue > 0 ? (item.value / totalValue) * 100 : 0;
                  
                  return (
                    <div key={item.id} className="flex items-center gap-4 p-3 border border-gray-200 rounded-lg">
                      <div className="flex-1">
                        <p className="font-medium text-gray-900">{item.name}</p>
                        <p className="text-xs text-gray-500">{item.category}</p>
                      </div>
                      <div className="text-right">
                        <p className="font-medium">₹{item.value.toLocaleString('en-IN')}</p>
                        <p className="text-xs text-gray-500">{percentage.toFixed(1)}% of total</p>
                      </div>
                    </div>
                  );
                })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default InventoryReport;
