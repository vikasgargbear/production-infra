import React, { useState, useEffect } from 'react';
import {
  BarChart3, Download, Filter, Calendar, TrendingUp,
  TrendingDown, Package, AlertTriangle, DollarSign,
  FileText, ChevronRight, X
} from 'lucide-react';
import { stockApi } from '../../services/api';
import { formatCurrency } from '../../utils/formatters';
import { DatePicker, Select, SummaryCard, DataTable } from '../global';

const StockReport = ({ open = true, onClose }) => {
  const [loading, setLoading] = useState(true);
  const [reportType, setReportType] = useState('summary');
  const [dateRange, setDateRange] = useState({
    startDate: new Date(new Date().setMonth(new Date().getMonth() - 1)),
    endDate: new Date()
  });
  const [reportData, setReportData] = useState(null);
  const [summaryData, setSummaryData] = useState({
    totalValue: 0,
    totalProducts: 0,
    lowStockItems: 0,
    expiringItems: 0,
    deadStock: 0,
    fastMoving: 0
  });

  const reportTypes = [
    { value: 'summary', label: 'Stock Summary', icon: BarChart3 },
    { value: 'valuation', label: 'Stock Valuation', icon: DollarSign },
    { value: 'movement', label: 'Movement Analysis', icon: TrendingUp },
    { value: 'expiry', label: 'Expiry Report', icon: AlertTriangle },
    { value: 'abc', label: 'ABC Analysis', icon: Package },
    { value: 'aging', label: 'Stock Aging', icon: Calendar }
  ];

  useEffect(() => {
    loadReportData();
  }, [reportType, dateRange]);

  const loadReportData = async () => {
    setLoading(true);
    try {
      let response;
      
      switch (reportType) {
        case 'summary':
          const [stockData, alerts] = await Promise.all([
            stockApi.getCurrentStock({ include_valuation: true }),
            stockApi.getStockAlerts()
          ]);
          
          const stock = stockData.data || [];
          const alertData = alerts.data || {};
          
          setSummaryData({
            totalValue: stock.reduce((sum, item) => sum + (item.stock_value || 0), 0),
            totalProducts: stock.length,
            lowStockItems: stock.filter(item => item.low_stock).length,
            expiringItems: stock.filter(item => item.expiry_alert).length,
            deadStock: stock.filter(item => item.current_stock === 0).length,
            fastMoving: stock.filter(item => item.movement_rate === 'fast').length
          });
          
          setReportData(stock);
          break;
          
        case 'valuation':
          response = await stockApi.getValuation({
            start_date: dateRange.startDate.toISOString(),
            end_date: dateRange.endDate.toISOString()
          });
          setReportData(response.data);
          break;
          
        case 'movement':
          response = await stockApi.getMovementAnalysis({
            start_date: dateRange.startDate.toISOString(),
            end_date: dateRange.endDate.toISOString()
          });
          setReportData(response.data);
          break;
          
        case 'expiry':
          response = await stockApi.getExpiryReport({
            days_ahead: 180
          });
          setReportData(response.data);
          break;
          
        case 'abc':
          response = await stockApi.getABCAnalysis();
          setReportData(response.data);
          break;
          
        default:
          setReportData([]);
      }
    } catch (error) {
      console.error('Error loading report data:', error);
      setReportData([]);
    } finally {
      setLoading(false);
    }
  };

  const handleExport = async (format = 'excel') => {
    try {
      // For now, export the current report data as CSV
      if (!reportData || (Array.isArray(reportData) && reportData.length === 0)) {
        alert('No data to export');
        return;
      }
      
      let csvContent = '';
      
      // Add headers based on report type
      switch (reportType) {
        case 'valuation':
          csvContent = 'Product Name,Product Code,Current Stock,Unit,MRP,Stock Value\n';
          reportData.forEach(row => {
            csvContent += `"${row.product_name}","${row.product_code}",${row.current_stock},"${row.unit}",${row.mrp},${row.stock_value}\n`;
          });
          break;
        case 'expiry':
          csvContent = 'Product Name,Batch Number,Expiry Date,Quantity,Value,Status\n';
          reportData.forEach(row => {
            const expiryDate = new Date(row.expiry_date);
            const daysToExpiry = Math.floor((expiryDate - new Date()) / (1000 * 60 * 60 * 24));
            const status = daysToExpiry <= 0 ? 'Expired' : daysToExpiry <= 30 ? 'Critical' : daysToExpiry <= 90 ? 'Warning' : 'Safe';
            csvContent += `"${row.product_name}","${row.batch_number}","${expiryDate.toLocaleDateString()}",${row.quantity},${row.value},"${status}"\n`;
          });
          break;
        case 'abc':
          csvContent = 'Product Name,Annual Consumption,Consumption Value,Category,Cumulative %\n';
          reportData.forEach(row => {
            csvContent += `"${row.product_name}",${row.annual_consumption},${row.consumption_value},"${row.category}",${row.cumulative_percentage}%\n`;
          });
          break;
        default:
          csvContent = 'Metric,Value\n';
          if (typeof reportData === 'object' && !Array.isArray(reportData)) {
            Object.entries(reportData).forEach(([key, value]) => {
              csvContent += `"${key}","${value}"\n`;
            });
          }
      }
      
      // Create blob and download
      const blob = new Blob([csvContent], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `stock_${reportType}_report_${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      
      alert('Report exported successfully!');
    } catch (error) {
      console.error('Error exporting report:', error);
      alert('Failed to export report');
    }
  };

  const renderSummaryReport = () => (
    <>
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4 mb-6">
        <SummaryCard
          title="Total Stock Value"
          value={formatCurrency(summaryData.totalValue)}
          icon={DollarSign}
          color="blue"
        />
        <SummaryCard
          title="Total Products"
          value={summaryData.totalProducts}
          icon={Package}
          color="green"
        />
        <SummaryCard
          title="Low Stock Items"
          value={summaryData.lowStockItems}
          icon={TrendingDown}
          color="orange"
        />
        <SummaryCard
          title="Expiring Soon"
          value={summaryData.expiringItems}
          icon={AlertTriangle}
          color="red"
        />
        <SummaryCard
          title="Out of Stock"
          value={summaryData.deadStock}
          icon={Package}
          color="gray"
        />
        <SummaryCard
          title="Fast Moving"
          value={summaryData.fastMoving}
          icon={TrendingUp}
          color="purple"
        />
      </div>

      {/* Category Breakdown */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h3 className="text-lg font-medium text-gray-900 mb-4">Stock by Category</h3>
        <div className="space-y-3">
          {['Tablets', 'Syrups', 'Injections', 'Capsules', 'Others'].map(category => {
            const categoryItems = (reportData || []).filter(item => 
              (item.category || 'Others') === category
            );
            const categoryValue = categoryItems.reduce((sum, item) => 
              sum + (item.stock_value || 0), 0
            );
            const percentage = summaryData.totalValue > 0 
              ? (categoryValue / summaryData.totalValue * 100).toFixed(1)
              : 0;
            
            return (
              <div key={category} className="flex items-center justify-between">
                <div className="flex items-center space-x-3">
                  <span className="text-sm font-medium text-gray-700">{category}</span>
                  <span className="text-sm text-gray-500">
                    ({categoryItems.length} items)
                  </span>
                </div>
                <div className="flex items-center space-x-3">
                  <div className="w-32 bg-gray-200 rounded-full h-2">
                    <div 
                      className="bg-blue-600 h-2 rounded-full"
                      style={{ width: `${percentage}%` }}
                    />
                  </div>
                  <span className="text-sm font-medium text-gray-700 w-16 text-right">
                    {percentage}%
                  </span>
                  <span className="text-sm text-gray-600 w-24 text-right">
                    {formatCurrency(categoryValue)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );

  const renderValuationReport = () => {
    const columns = [
      {
        header: 'Product',
        field: 'product_name',
        render: (row) => (
          <div>
            <div className="font-medium text-gray-900">{row.product_name || row.name}</div>
            <div className="text-sm text-gray-500">{row.product_code || row.code}</div>
          </div>
        )
      },
      {
        header: 'Category',
        field: 'category',
        render: (row) => (
          <span className="px-2 py-1 text-xs font-medium bg-gray-100 text-gray-700 rounded">
            {row.category || 'Uncategorized'}
          </span>
        )
      },
      {
        header: 'Current Stock',
        field: 'current_stock',
        render: (row) => `${row.current_stock || 0} ${row.unit || 'Units'}`
      },
      {
        header: 'Cost Price',
        field: 'cost_price',
        render: (row) => formatCurrency(row.cost_price || 0)
      },
      {
        header: 'Selling Price',
        field: 'selling_price',
        render: (row) => formatCurrency(row.selling_price || row.price || 0)
      },
      {
        header: 'Stock Value',
        field: 'stock_value',
        render: (row) => (
          <div className="text-right font-medium">
            {formatCurrency(row.stock_value || 0)}
          </div>
        )
      }
    ];

    return (
      <DataTable
        columns={columns}
        data={reportData || []}
      />
    );
  };

  const renderExpiryReport = () => {
    const columns = [
      {
        header: 'Product',
        field: 'product_name',
        render: (row) => (
          <div>
            <div className="font-medium text-gray-900">{row.product_name}</div>
            <div className="text-sm text-gray-500">{row.batch_number}</div>
          </div>
        )
      },
      {
        header: 'Expiry Date',
        field: 'expiry_date',
        render: (row) => {
          const expiryDate = new Date(row.expiry_date);
          const today = new Date();
          const daysToExpiry = Math.floor((expiryDate - today) / (1000 * 60 * 60 * 24));
          
          return (
            <div>
              <div className="font-medium">{expiryDate.toLocaleDateString()}</div>
              <div className={`text-sm ${
                daysToExpiry <= 0 ? 'text-red-600' :
                daysToExpiry <= 30 ? 'text-orange-600' :
                daysToExpiry <= 90 ? 'text-yellow-600' :
                'text-gray-600'
              }`}>
                {daysToExpiry <= 0 ? 'Expired' : `${daysToExpiry} days`}
              </div>
            </div>
          );
        }
      },
      {
        header: 'Quantity',
        field: 'quantity',
        render: (row) => `${row.quantity || 0} ${row.unit || 'Units'}`
      },
      {
        header: 'Value',
        field: 'value',
        render: (row) => formatCurrency(row.value || 0)
      },
      {
        header: 'Status',
        field: 'status',
        render: (row) => {
          const expiryDate = new Date(row.expiry_date);
          const today = new Date();
          const daysToExpiry = Math.floor((expiryDate - today) / (1000 * 60 * 60 * 24));
          
          const status = daysToExpiry <= 0 ? 'Expired' :
                        daysToExpiry <= 30 ? 'Critical' :
                        daysToExpiry <= 90 ? 'Warning' : 'Safe';
          
          const colors = {
            Expired: 'red',
            Critical: 'orange',
            Warning: 'yellow',
            Safe: 'green'
          };
          
          return (
            <span className={`px-2 py-1 text-xs font-medium bg-${colors[status]}-100 text-${colors[status]}-800 rounded`}>
              {status}
            </span>
          );
        }
      }
    ];

    return (
      <DataTable
        columns={columns}
        data={reportData || []}
      />
    );
  };

  const renderReportContent = () => {
    switch (reportType) {
      case 'summary':
        return renderSummaryReport();
      case 'valuation':
        return renderValuationReport();
      case 'expiry':
        return renderExpiryReport();
      default:
        return (
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-12 text-center">
            <FileText className="w-12 h-12 text-gray-400 mx-auto mb-3" />
            <p className="text-gray-600">Report coming soon</p>
          </div>
        );
    }
  };

  if (!open) return null;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="bg-white shadow-sm border-b border-gray-200 flex-shrink-0">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between py-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Stock Reports</h1>
              <p className="text-sm text-gray-600">Analyze inventory performance and trends</p>
            </div>
            <button
              onClick={onClose}
              className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto bg-gray-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          {/* Report Type Selection */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4 mb-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <div className="flex space-x-2">
                  {reportTypes.map(type => (
                    <button
                      key={type.value}
                      onClick={() => setReportType(type.value)}
                      className={`flex items-center space-x-2 px-4 py-2 rounded-lg transition-colors ${
                        reportType === type.value
                          ? 'bg-blue-50 text-blue-700 border border-blue-300'
                          : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
                      }`}
                    >
                      <type.icon className="w-4 h-4" />
                      <span>{type.label}</span>
                    </button>
                  ))}
                </div>
              </div>
              
              <div className="flex items-center space-x-3">
                {reportType !== 'summary' && reportType !== 'abc' && (
                  <>
                  <DatePicker
                    value={dateRange.startDate}
                    onChange={(date) => setDateRange({...dateRange, startDate: date})}
                    placeholder="Start Date"
                  />
                  <span className="text-gray-500">to</span>
                  <DatePicker
                    value={dateRange.endDate}
                    onChange={(date) => setDateRange({...dateRange, endDate: date})}
                    placeholder="End Date"
                  />
                  </>
                )}
                <button
                  onClick={() => handleExport('csv')}
                  className="flex items-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  <Download className="w-4 h-4" />
                  <span>Export</span>
                </button>
              </div>
            </div>
          </div>

          {/* Report Content */}
          {loading ? (
            <div className="flex items-center justify-center h-64">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
            </div>
          ) : (
            renderReportContent()
          )}
        </div>
      </div>
    </div>
  );
};

export default StockReport;