import React, { useState, useEffect, useMemo } from 'react';
import { Package, TrendingUp, Star, BarChart3, Search, AlertTriangle, Zap, Loader2, RefreshCw, AlertCircle } from 'lucide-react';
import { Bar, Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  Filler
} from 'chart.js';
import apiClient from '../../services/api/apiClient';
import { formatCurrency } from '../../utils/formatters';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

// Analytics-specific product type - NOT the canonical Product
interface AnalyticsProduct {
  id: string;
  name: string;
  category: string;
  sales: number;
  revenue: number;
  profit: number;
  margin: number;
  stock: number;
  turnover: number;
  trend: 'up' | 'down' | 'stable';
  trendValue: number;
}

interface ProductAnalyticsData {
  products: AnalyticsProduct[];
  categories: string[];
  summary: {
    totalProducts: number;
    highMarginProducts: number;
    fastMovingProducts: number;
    lowStockProducts: number;
    avgMargin: number;
  };
  categoryPerformance: {
    [key: string]: {
      revenue: number;
      profit: number;
      count: number;
    };
  };
  trends: {
    labels: string[];
    revenue: number[];
    margin: number[];
  };
}

const finiteNumber = (value: unknown): number => {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

export const formatAnalyticsPercent = (value: unknown): string => `${finiteNumber(value).toFixed(1)}%`;
export const formatAnalyticsMultiplier = (value: unknown): string => `${finiteNumber(value).toFixed(2)}x`;

export const projectAnalyticsProducts = (rows: unknown): AnalyticsProduct[] => (
  Array.isArray(rows) ? rows : []
).map((row: any) => ({
  id: String(row.id ?? row.product_id ?? ''),
  name: String(row.name ?? row.product_name ?? 'Unnamed product'),
  category: String(row.category ?? 'Uncategorized'),
  sales: finiteNumber(row.sales),
  revenue: finiteNumber(row.revenue),
  profit: finiteNumber(row.profit),
  margin: finiteNumber(row.margin),
  stock: finiteNumber(row.stock),
  turnover: finiteNumber(row.turnover),
  trend: row.trend === 'up' || row.trend === 'down' ? row.trend : 'stable',
  trendValue: finiteNumber(row.trendValue ?? row.trend_value)
}));

const ProductAnalytics: React.FC = () => {
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'revenue' | 'margin' | 'turnover'>('revenue');
  const [view, setView] = useState<'grid' | 'table'>('grid');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [partialWarning, setPartialWarning] = useState<string | null>(null);
  const [data, setData] = useState<ProductAnalyticsData>({
    products: [],
    categories: ['all'],
    summary: { totalProducts: 0, highMarginProducts: 0, fastMovingProducts: 0, lowStockProducts: 0, avgMargin: 0 },
    categoryPerformance: {},
    trends: { labels: [], revenue: [], margin: [] }
  });

  useEffect(() => {
    loadProductData();
  }, []);

  const loadProductData = async () => {
    setLoading(true);
    setError(null);
    setPartialWarning(null);
    try {
      const [productsResult, categoriesResult, analyticsResult] = await Promise.allSettled([
        apiClient.get('/products/analytics/performance'),
        apiClient.get('/products/categories'),
        apiClient.get('/products/analytics/summary')
      ]);
      if (productsResult.status === 'rejected') throw productsResult.reason;
      const unavailable = [
        categoriesResult.status === 'rejected' ? 'category filters' : null,
        analyticsResult.status === 'rejected' ? 'summary metrics' : null,
      ].filter(Boolean);
      if (unavailable.length > 0) {
        setPartialWarning(`Live ${unavailable.join(' and ')} are unavailable; product detail metrics remain current.`);
      }

      const products = projectAnalyticsProducts(productsResult.value.data?.products || []);
      const categories = ['all', ...(categoriesResult.status === 'fulfilled' ? categoriesResult.value.data?.categories || [] : [])];
      const analytics = analyticsResult.status === 'fulfilled' ? analyticsResult.value.data || {} : {};

      setData({
        products,
        categories,
        summary: {
          totalProducts: finiteNumber(analytics.total_products ?? products.length),
          highMarginProducts: finiteNumber(analytics.high_margin_products ?? products.filter(p => p.margin > 25).length),
          fastMovingProducts: finiteNumber(analytics.fast_moving_products ?? products.filter(p => p.turnover > 10).length),
          lowStockProducts: finiteNumber(analytics.low_stock_products ?? products.filter(p => p.stock <= 0).length),
          avgMargin: finiteNumber(analytics.avg_margin ?? (products.length ? products.reduce((acc, p) => acc + p.margin, 0) / products.length : 0))
        },
        categoryPerformance: analytics.category_performance || {},
        trends: analytics.trends || { labels: [], revenue: [], margin: [] }
      });
    } catch (err) {
      console.error('Error loading product data:', err);
      setError('Failed to load product analytics. Please try again.');
      // Set empty state instead of mock data
      setData({
        products: [],
        categories: ['all'],
        summary: { totalProducts: 0, highMarginProducts: 0, fastMovingProducts: 0, lowStockProducts: 0, avgMargin: 0 },
        categoryPerformance: {},
        trends: { labels: [], revenue: [], margin: [] }
      });
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadProductData();
    setRefreshing(false);
  };

  const filteredProducts = useMemo(() => {
    let filtered = data.products;

    if (selectedCategory !== 'all') {
      filtered = filtered.filter(p => p.category === selectedCategory);
    }

    if (searchQuery) {
      filtered = filtered.filter(p =>
        p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.category.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    return [...filtered].sort((a, b) => b[sortBy] - a[sortBy]);
  }, [data.products, selectedCategory, searchQuery, sortBy]);

  const categoryPerformance = useMemo(() => {
    const categoryData = data.categoryPerformance && Object.keys(data.categoryPerformance).length > 0
      ? data.categoryPerformance
      : data.products.reduce((acc, product) => {
        if (!acc[product.category]) {
          acc[product.category] = { revenue: 0, profit: 0, count: 0 };
        }
        acc[product.category].revenue += product.revenue;
        acc[product.category].profit += product.profit;
        acc[product.category].count += 1;
        return acc;
      }, {} as Record<string, { revenue: number; profit: number; count: number }>);

    return {
      labels: Object.keys(categoryData),
      datasets: [
        {
          label: 'Revenue',
          data: Object.values(categoryData).map(d => d.revenue),
          backgroundColor: 'rgba(59, 130, 246, 0.8)',
          borderWidth: 0
        },
        {
          label: 'Profit',
          data: Object.values(categoryData).map(d => d.profit),
          backgroundColor: 'rgba(34, 197, 94, 0.8)',
          borderWidth: 0
        }
      ]
    };
  }, [data.categoryPerformance, data.products]);

  const trendData = useMemo(() => {
    return {
      labels: data.trends.labels,
      datasets: [
        {
          label: 'Top Products Revenue',
          data: data.trends.revenue,
          borderColor: 'rgb(59, 130, 246)',
          backgroundColor: 'rgba(59, 130, 246, 0.1)',
          tension: 0.3,
          fill: true
        },
        {
          label: 'Average Margin %',
          data: data.trends.margin,
          borderColor: 'rgb(34, 197, 94)',
          backgroundColor: 'rgba(34, 197, 94, 0.1)',
          tension: 0.3,
          fill: true,
          yAxisID: 'y1'
        }
      ]
    };
  }, [data.trends]);

  const getTrendIcon = (trend: 'up' | 'down' | 'stable', value: number) => {
    if (!Number.isFinite(value) || value === 0) {
      return <span className="text-gray-500 text-sm" title="No comparison period from canonical API">Trend unavailable</span>;
    }
    if (trend === 'up') {
      return <span className="text-green-600 text-sm flex items-center"><TrendingUp className="h-3 w-3 mr-1" />+{formatAnalyticsPercent(Math.abs(value))}</span>;
    } else if (trend === 'down') {
      return <span className="text-red-600 text-sm flex items-center"><TrendingUp className="h-3 w-3 mr-1 rotate-180" />−{formatAnalyticsPercent(Math.abs(value))}</span>;
    }
    return <span className="text-gray-500 text-sm">{formatAnalyticsPercent(value)}</span>;
  };
  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        {/* Header */}
        <div className="p-6 border-b border-gray-200">
          <div className="flex justify-between items-start">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Product Analytics</h1>
              <p className="text-gray-600 mt-1">Product performance, trends, and profitability analysis</p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleRefresh}
                disabled={refreshing}
                className="min-h-11 px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center gap-2 disabled:opacity-50"
              >
                {refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                Refresh
              </button>
            </div>
          </div>

          {/* Filters */}
          <div className="flex flex-wrap gap-4 mt-6">
            <div className="flex-1 min-w-[200px]">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  type="text"
                  aria-label="Search product analytics"
                  placeholder="Search products..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="min-h-11 w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </div>
            <select
              aria-label="Filter product analytics by category"
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="min-h-11 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            >
              {data.categories.map(cat => (
                <option key={cat} value={cat}>
                  {cat === 'all' ? 'All Categories' : cat}
                </option>
              ))}
            </select>
            <select
              aria-label="Sort product analytics"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="min-h-11 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            >
              <option value="revenue">Sort by Revenue</option>
              <option value="margin">Sort by Margin</option>
              <option value="turnover">Sort by Turnover</option>
            </select>
            <div className="flex gap-2">
              <button
                onClick={() => setView('grid')}
                aria-pressed={view === 'grid'}
                className={`min-h-11 px-3 py-2 rounded-lg ${view === 'grid' ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-white border-gray-300'} border`}
              >
                Grid
              </button>
              <button
                onClick={() => setView('table')}
                aria-pressed={view === 'table'}
                className={`min-h-11 px-3 py-2 rounded-lg ${view === 'table' ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-white border-gray-300'} border`}
              >
                Table
              </button>
            </div>
          </div>
        </div>

        {/* Loading State */}
        {loading && (
          <div className="p-12 text-center">
            <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4 text-blue-600" />
            <p className="text-gray-600">Loading product analytics...</p>
          </div>
        )}

        {/* Error State */}
        {error && (
          <div className="p-6 border-b border-gray-200">
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <div className="flex items-center">
                <AlertCircle className="w-5 h-5 text-red-500 mr-2" />
                <span className="text-red-700">{error}</span>
                <button
                  onClick={() => setError(null)}
                  aria-label="Dismiss product analytics error"
                  className="ml-auto inline-flex min-h-11 min-w-11 items-center justify-center text-red-500 hover:text-red-700"
                >
                  ×
                </button>
              </div>
            </div>
          </div>
        )}

        {partialWarning && !loading && (
          <div className="px-6 pt-6" role="status">
            <div className="flex items-center gap-2 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              <AlertTriangle className="h-5 w-5 shrink-0" />{partialWarning}
            </div>
          </div>
        )}

        {/* Summary Cards */}
        {!loading && (
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4 p-6 border-b border-gray-200">
            <div className="p-4 border border-gray-200 rounded-lg">
              <Package className="h-8 w-8 text-blue-600 mb-2" />
              <p className="text-sm text-gray-600">Total Products</p>
              <p className="text-xl font-bold">{data.summary.totalProducts}</p>
            </div>
            <div className="p-4 border border-gray-200 rounded-lg">
              <Star className="h-8 w-8 text-yellow-600 mb-2" />
              <p className="text-sm text-gray-600">High Margin (&gt;25%)</p>
              <p className="text-xl font-bold">{data.summary.highMarginProducts}</p>
            </div>
            <div className="p-4 border border-gray-200 rounded-lg">
              <Zap className="h-8 w-8 text-green-600 mb-2" />
              <p className="text-sm text-gray-600">Fast Moving (&gt;10)</p>
              <p className="text-xl font-bold">{data.summary.fastMovingProducts}</p>
            </div>
            <div className="p-4 border border-gray-200 rounded-lg">
              <AlertTriangle className="h-8 w-8 text-orange-600 mb-2" />
              <p className="text-sm text-gray-600">Out of Stock</p>
              <p className="text-xl font-bold">{data.summary.lowStockProducts}</p>
            </div>
            <div className="p-4 border border-gray-200 rounded-lg">
              <BarChart3 className="h-8 w-8 text-purple-600 mb-2" />
              <p className="text-sm text-gray-600">Avg Margin</p>
              <p className="text-xl font-bold">
                {formatAnalyticsPercent(data.summary.avgMargin)}
              </p>
            </div>
          </div>
        )}

        {/* Charts */}
        {!loading && data.products.length > 0 && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 p-6 border-b border-gray-200">
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Category Performance</h3>
              <Bar
                data={categoryPerformance}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  plugins: {
                    legend: {
                      position: 'bottom' as const
                    },
                    tooltip: {
                      callbacks: {
                        label: (context) => {
                          return `${context.dataset.label}: ${formatCurrency(context.parsed.y ?? 0)}`;
                        }
                      }
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
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-4">Revenue & Margin Trend</h3>
              {data.trends.labels.length > 0 ? (
                <Line
                  data={trendData}
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
                      type: 'linear' as const,
                      display: true,
                      position: 'left' as const,
                      ticks: {
                        callback: (value) => `₹${(value as number / 100000).toFixed(0)}L`
                      }
                    },
                    y1: {
                      type: 'linear' as const,
                      display: true,
                      position: 'right' as const,
                      grid: {
                        drawOnChartArea: false
                      },
                      ticks: {
                        callback: (value) => `${value}%`
                      }
                    }
                  }
                  }}
                  height={250}
                />
              ) : (
                <div className="flex h-[250px] items-center justify-center rounded-lg border border-dashed border-gray-200 p-6 text-center text-sm text-gray-500">
                  Trend history is unavailable from the canonical API.
                </div>
              )}
            </div>
          </div>
        )}

        {/* Empty State */}
        {!loading && data.products.length === 0 && !error && (
          <div className="p-12 text-center border-b border-gray-200">
            <Package className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No Product Data Found</h3>
            <p className="text-gray-600 mb-4">There are no products to analyze at the moment.</p>
            <button
              onClick={handleRefresh}
              className="min-h-11 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              Refresh Data
            </button>
          </div>
        )}

        {/* Product List */}
        {!loading && data.products.length > 0 && (
          <div className="p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Product Performance Details</h3>

            {view === 'grid' ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredProducts.map(product => (
                  <div key={product.id} className="border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow">
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <h4 className="font-semibold text-gray-900">{product.name}</h4>
                        <p className="text-sm text-gray-500">{product.category}</p>
                      </div>
                      {getTrendIcon(product.trend, product.trendValue)}
                    </div>
                    <div className="grid grid-cols-2 gap-2 mt-3">
                      <div>
                        <p className="text-xs text-gray-500">Revenue</p>
                        <p className="font-semibold">{formatCurrency(product.revenue)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500">Margin</p>
                        <p className="font-semibold">{formatAnalyticsPercent(product.margin)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500">Sales</p>
                        <p className="font-semibold">{product.sales.toLocaleString()}</p>
                      </div>
                      <div>
                        <p className="text-xs text-gray-500">Turnover</p>
                        <p className="font-semibold">{formatAnalyticsMultiplier(product.turnover)}</p>
                      </div>
                    </div>
                    <div className="mt-3 pt-3 border-t border-gray-100">
                      <div className="flex justify-between items-center">
                        <span className="text-xs text-gray-500">Stock Level</span>
                        <span className={`text-sm font-medium ${product.stock <= 0 ? 'text-red-600' :
                              'text-gray-900'
                          }`}>
                          {product.stock.toLocaleString()} units
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-gray-200">
                      <th className="text-left py-3 px-4 text-gray-700">Product</th>
                      <th className="text-left py-3 px-4 text-gray-700">Category</th>
                      <th className="text-right py-3 px-4 text-gray-700">Sales</th>
                      <th className="text-right py-3 px-4 text-gray-700">Revenue</th>
                      <th className="text-right py-3 px-4 text-gray-700">Margin</th>
                      <th className="text-right py-3 px-4 text-gray-700">Stock</th>
                      <th className="text-right py-3 px-4 text-gray-700">Turnover</th>
                      <th className="text-center py-3 px-4 text-gray-700">Trend</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredProducts.map((product, index) => (
                      <tr key={product.id} className={`border-b border-gray-100 hover:bg-gray-50 ${index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}`}>
                        <td className="py-3 px-4 font-medium text-gray-900">{product.name}</td>
                        <td className="py-3 px-4 text-gray-600">{product.category}</td>
                        <td className="py-3 px-4 text-right">{product.sales.toLocaleString()}</td>
                        <td className="py-3 px-4 text-right">{formatCurrency(product.revenue)}</td>
                        <td className="py-3 px-4 text-right">
                          <span className={`font-medium ${product.margin >= 25 ? 'text-green-600' :
                              product.margin >= 20 ? 'text-yellow-600' :
                                'text-red-600'
                            }`}>
                            {formatAnalyticsPercent(product.margin)}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right">
                          <span className={`${product.stock <= 0 ? 'text-red-600' :
                                'text-gray-900'
                            }`}>
                            {product.stock.toLocaleString()}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right">{formatAnalyticsMultiplier(product.turnover)}</td>
                        <td className="py-3 px-4 text-center">
                          {getTrendIcon(product.trend, product.trendValue)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default ProductAnalytics;
