import React, { useState, useMemo } from 'react';
import { Package, AlertTriangle, TrendingDown, BarChart3, Download, Search, Filter, Calendar, Activity, Box, AlertCircle } from 'lucide-react';
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

const InventoryReport: React.FC = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [stockFilter, setStockFilter] = useState('all');
  const [view, setView] = useState<'overview' | 'movements' | 'expiry' | 'valuation'>('overview');

  const inventory: InventoryItem[] = [
    { id: '1', name: 'Paracetamol 500mg', category: 'Analgesics', batch: 'B2024-001', currentStock: 5000, minStock: 1000, maxStock: 10000, value: 25000, expiryDate: '2025-06-15', lastRestocked: '2024-01-15', turnoverRate: 12.5, status: 'Optimal', supplier: 'Cipla Ltd' },
    { id: '2', name: 'Amoxicillin 250mg', category: 'Antibiotics', batch: 'B2024-002', currentStock: 800, minStock: 1500, maxStock: 5000, value: 32000, expiryDate: '2024-12-20', lastRestocked: '2024-01-10', turnoverRate: 8.3, status: 'Low', supplier: 'Sun Pharma' },
    { id: '3', name: 'Insulin Glargine', category: 'Diabetes', batch: 'B2024-003', currentStock: 200, minStock: 500, maxStock: 1500, value: 48000, expiryDate: '2024-03-10', lastRestocked: '2023-12-20', turnoverRate: 6.8, status: 'Critical', supplier: 'Biocon' },
    { id: '4', name: 'Vitamin C 1000mg', category: 'Vitamins', batch: 'B2024-004', currentStock: 8000, minStock: 2000, maxStock: 6000, value: 16000, expiryDate: '2025-12-01', lastRestocked: '2024-01-25', turnoverRate: 22.3, status: 'Overstocked', supplier: 'Mankind Pharma' },
    { id: '5', name: 'Omeprazole 20mg', category: 'Gastro', batch: 'B2024-005', currentStock: 3500, minStock: 1000, maxStock: 5000, value: 28000, expiryDate: '2024-02-28', lastRestocked: '2024-01-05', turnoverRate: 15.2, status: 'Expiring', supplier: 'Dr. Reddy\'s' },
    { id: '6', name: 'Metformin 500mg', category: 'Diabetes', batch: 'B2024-006', currentStock: 4200, minStock: 2000, maxStock: 8000, value: 21000, expiryDate: '2024-09-15', lastRestocked: '2024-01-20', turnoverRate: 10.1, status: 'Optimal', supplier: 'Glenmark' },
    { id: '7', name: 'Atorvastatin 10mg', category: 'Cardiac', batch: 'B2024-007', currentStock: 2500, minStock: 1000, maxStock: 4000, value: 37500, expiryDate: '2024-11-30', lastRestocked: '2024-01-12', turnoverRate: 9.2, status: 'Optimal', supplier: 'Torrent Pharma' },
    { id: '8', name: 'Salbutamol Inhaler', category: 'Respiratory', batch: 'B2024-008', currentStock: 450, minStock: 800, maxStock: 2000, value: 22500, expiryDate: '2024-08-20', lastRestocked: '2023-12-15', turnoverRate: 11.4, status: 'Low', supplier: 'Lupin Ltd' },
  ];

  const categories = ['all', 'Analgesics', 'Antibiotics', 'Diabetes', 'Vitamins', 'Gastro', 'Cardiac', 'Respiratory'];

  const filteredInventory = useMemo(() => {
    let filtered = inventory;
    
    if (selectedCategory !== 'all') {
      filtered = filtered.filter(item => item.category === selectedCategory);
    }
    
    if (stockFilter !== 'all') {
      filtered = filtered.filter(item => item.status === stockFilter);
    }
    
    if (searchQuery) {
      filtered = filtered.filter(item => 
        item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        item.batch.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }
    
    return filtered;
  }, [selectedCategory, stockFilter, searchQuery]);

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
  }, []);

  const stockMovementTrend = useMemo(() => {
    const labels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
    return {
      labels,
      datasets: [
        {
          label: 'Stock In',
          data: [12000, 15000, 8000, 18000, 22000, 10000, 5000],
          borderColor: 'rgb(34, 197, 94)',
          backgroundColor: 'rgba(34, 197, 94, 0.1)',
          tension: 0.3,
          fill: true
        },
        {
          label: 'Stock Out',
          data: [10000, 12000, 11000, 14000, 18000, 8000, 4000],
          borderColor: 'rgb(239, 68, 68)',
          backgroundColor: 'rgba(239, 68, 68, 0.1)',
          tension: 0.3,
          fill: true
        }
      ]
    };
  }, []);

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
  }, []);

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
  }, []);

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
    const days = Math.floor((new Date(expiryDate).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
    if (days < 30) return <span className="text-red-600 font-medium">{days} days</span>;
    if (days < 90) return <span className="text-yellow-600">{days} days</span>;
    return <span className="text-gray-600">{days} days</span>;
  };
  return (
    <div className="p-6 bg-gray-50 min-h-screen">
      <div className="bg-white rounded-lg shadow-sm border border-gray-200">
        {/* Header */}
        <div className="p-6 border-b border-gray-200">
          <div className="flex justify-between items-start">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Inventory Report</h1>
              <p className="text-gray-600 mt-1">Stock levels, movement analysis, and expiry tracking</p>
            </div>
            <button className="px-4 py-2 text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center gap-2">
              <Download className="h-4 w-4" />
              Export Report
            </button>
          </div>

          {/* View Tabs */}
          <div className="flex gap-4 mt-6 border-b border-gray-200">
            {(['overview', 'movements', 'expiry', 'valuation'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setView(tab)}
                className={`pb-3 px-1 border-b-2 transition-colors ${
                  view === tab
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-600 hover:text-gray-900'
                }`}
              >
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
              </button>
            ))}
          </div>

          {/* Filters */}
          <div className="flex flex-wrap gap-4 mt-4">
            <div className="flex-1 min-w-[200px]">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  type="text"
                  placeholder="Search products or batches..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
            </div>
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            >
              {categories.map(cat => (
                <option key={cat} value={cat}>
                  {cat === 'all' ? 'All Categories' : cat}
                </option>
              ))}
            </select>
            <select
              value={stockFilter}
              onChange={(e) => setStockFilter(e.target.value)}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
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
                const days = Math.floor((new Date(item.expiryDate).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
                return days <= 30;
              }).length}
            </p>
          </div>
          <div className="p-4 border border-gray-200 rounded-lg">
            <Activity className="h-8 w-8 text-purple-600 mb-2" />
            <p className="text-sm text-gray-600">Avg Turnover</p>
            <p className="text-xl font-bold">
              {(inventory.reduce((acc, item) => acc + item.turnoverRate, 0) / inventory.length).toFixed(1)}x
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
                      <th className="text-right py-3 px-4 text-gray-700">Turnover</th>
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
                            <p className="text-xs text-gray-500 mt-1">
                              Min: {item.minStock} | Max: {item.maxStock}
                            </p>
                          </div>
                        </td>
                        <td className="py-3 px-4 text-right">
                          <span className={`font-medium ${
                            item.currentStock < item.minStock ? 'text-red-600' :
                            item.currentStock > item.maxStock ? 'text-blue-600' :
                            'text-gray-900'
                          }`}>
                            {item.currentStock.toLocaleString()}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right">
                          ₹{item.value.toLocaleString('en-IN')}
                        </td>
                        <td className="py-3 px-4 text-right">
                          {item.turnoverRate.toFixed(1)}x
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
                  {[
                    { date: '2024-01-30 10:30 AM', type: 'In', quantity: 500, reference: 'PO-2024-089 - Paracetamol' },
                    { date: '2024-01-30 09:15 AM', type: 'Out', quantity: 200, reference: 'INV-2024-145 - Apollo Pharmacy' },
                    { date: '2024-01-29 04:45 PM', type: 'Adjustment', quantity: -50, reference: 'Damaged Stock - Insulin' },
                    { date: '2024-01-29 02:30 PM', type: 'In', quantity: 1000, reference: 'PO-2024-088 - Vitamin C' },
                    { date: '2024-01-29 11:00 AM', type: 'Out', quantity: 350, reference: 'INV-2024-144 - City Hospital' },
                  ].map((movement, index) => (
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
                          <p className="text-xs text-gray-500">{movement.date}</p>
                        </div>
                      </div>
                      <span className={`font-medium ${
                        movement.type === 'In' ? 'text-green-600' :
                        movement.type === 'Out' ? 'text-red-600' :
                        'text-gray-600'
                      }`}>
                        {movement.type === 'In' ? '+' : ''}{movement.quantity}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Turnover Analysis</h3>
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
                            return [`Turnover: ${point.x}x`, `Value: ₹${point.y}K`];
                          }
                        }
                      }
                    },
                    scales: {
                      x: {
                        title: {
                          display: true,
                          text: 'Turnover Rate'
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
                  <span className="font-semibold">2 items expiring within 30 days</span> - Immediate attention required
                </p>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {inventory
                .filter(item => {
                  const days = Math.floor((new Date(item.expiryDate).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24));
                  return days <= 90;
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
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
              <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <p className="text-sm text-blue-700">Total Inventory Value</p>
                <p className="text-2xl font-bold text-blue-900">
                  ₹{inventory.reduce((acc, item) => acc + item.value, 0).toLocaleString('en-IN')}
                </p>
              </div>
              <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                <p className="text-sm text-green-700">Fast Moving Value</p>
                <p className="text-2xl font-bold text-green-900">
                  ₹{inventory.filter(item => item.turnoverRate > 10).reduce((acc, item) => acc + item.value, 0).toLocaleString('en-IN')}
                </p>
              </div>
              <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                <p className="text-sm text-yellow-700">Slow Moving Value</p>
                <p className="text-2xl font-bold text-yellow-900">
                  ₹{inventory.filter(item => item.turnoverRate < 10).reduce((acc, item) => acc + item.value, 0).toLocaleString('en-IN')}
                </p>
              </div>
              <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-sm text-red-700">Dead Stock Value</p>
                <p className="text-2xl font-bold text-red-900">
                  ₹{inventory.filter(item => item.turnoverRate < 5).reduce((acc, item) => acc + item.value, 0).toLocaleString('en-IN')}
                </p>
              </div>
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-4">ABC Analysis</h3>
            <div className="space-y-2">
              {inventory
                .sort((a, b) => b.value - a.value)
                .map((item, index) => {
                  const totalValue = inventory.reduce((acc, i) => acc + i.value, 0);
                  const percentage = (item.value / totalValue) * 100;
                  const category = index < 2 ? 'A' : index < 5 ? 'B' : 'C';
                  const categoryColor = category === 'A' ? 'bg-green-500' : category === 'B' ? 'bg-yellow-500' : 'bg-gray-400';
                  
                  return (
                    <div key={item.id} className="flex items-center gap-4 p-3 border border-gray-200 rounded-lg">
                      <span className={`px-2 py-1 text-xs font-bold text-white rounded ${categoryColor}`}>
                        {category}
                      </span>
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