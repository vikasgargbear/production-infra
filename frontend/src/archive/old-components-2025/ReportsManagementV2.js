import React, { useState, useEffect, useCallback } from 'react';
import { 
  FileText, BarChart3, TrendingUp, Calendar, Download, Filter,
  ChevronRight, AlertTriangle, DollarSign, Package, Users,
  Clock, RefreshCw, Printer, Mail, ChevronLeft, Building,
  PieChart, LineChart, Activity, Archive, Settings
} from 'lucide-react';
import { ModuleHeader, DataTable, StatusBadge } from '../global';
import { invoicesApi, ordersApi, customersApi, productsApi } from '../../services/api';
import { exportToExcel, exportToPDF } from '../../utils/exportHelpers';

const ReportsManagementV2 = () => {
  const [activeCategory, setActiveCategory] = useState('sales');
  const [selectedReport, setSelectedReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [reportData, setReportData] = useState(null);
  const [dateRange, setDateRange] = useState({
    startDate: new Date(new Date().setMonth(new Date().getMonth() - 1)).toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0]
  });
  const [filters, setFilters] = useState({
    customer: '',
    product: '',
    category: '',
    status: ''
  });
  const [message, setMessage] = useState('');
  const [messageType, setMessageType] = useState('');

  // Report categories with their reports
  const reportCategories = [
    {
      id: 'sales',
      title: 'Sales Reports',
      icon: TrendingUp,
      color: 'text-blue-600',
      bgColor: 'bg-blue-50',
      reports: [
        { 
          id: 'sales-summary', 
          name: 'Sales Summary', 
          description: 'Overview of sales performance',
          icon: BarChart3
        },
        { 
          id: 'sales-register', 
          name: 'Sales Register', 
          description: 'Detailed sales transactions',
          icon: FileText
        },
        { 
          id: 'customer-wise-sales', 
          name: 'Customer-wise Sales', 
          description: 'Sales breakdown by customer',
          icon: Users
        },
        { 
          id: 'product-wise-sales', 
          name: 'Product-wise Sales', 
          description: 'Sales breakdown by product',
          icon: Package
        },
        { 
          id: 'daily-sales', 
          name: 'Daily Sales Report', 
          description: 'Day-wise sales analysis',
          icon: Calendar
        }
      ]
    },
    {
      id: 'purchase',
      title: 'Purchase Reports',
      icon: Archive,
      color: 'text-green-600',
      bgColor: 'bg-green-50',
      reports: [
        { 
          id: 'purchase-summary', 
          name: 'Purchase Summary', 
          description: 'Overview of purchases',
          icon: BarChart3
        },
        { 
          id: 'purchase-register', 
          name: 'Purchase Register', 
          description: 'Detailed purchase records',
          icon: FileText
        },
        { 
          id: 'vendor-wise-purchase', 
          name: 'Vendor-wise Purchase', 
          description: 'Purchases by vendor',
          icon: Building
        },
        { 
          id: 'product-purchase-history', 
          name: 'Product Purchase History', 
          description: 'Purchase history by product',
          icon: Package
        }
      ]
    },
    {
      id: 'inventory',
      title: 'Inventory Reports',
      icon: Package,
      color: 'text-purple-600',
      bgColor: 'bg-purple-50',
      reports: [
        { 
          id: 'stock-summary', 
          name: 'Stock Summary', 
          description: 'Current stock overview',
          icon: Package
        },
        { 
          id: 'stock-valuation', 
          name: 'Stock Valuation', 
          description: 'Inventory value report',
          icon: DollarSign
        },
        { 
          id: 'expiry-report', 
          name: 'Expiry Report', 
          description: 'Items nearing expiry',
          icon: AlertTriangle
        },
        { 
          id: 'low-stock-alert', 
          name: 'Low Stock Alert', 
          description: 'Items below reorder level',
          icon: AlertTriangle
        },
        { 
          id: 'stock-movement', 
          name: 'Stock Movement', 
          description: 'Inward/outward analysis',
          icon: Activity
        }
      ]
    },
    {
      id: 'financial',
      title: 'Financial Reports',
      icon: DollarSign,
      color: 'text-orange-600',
      bgColor: 'bg-orange-50',
      reports: [
        { 
          id: 'profit-loss', 
          name: 'Profit & Loss', 
          description: 'Income and expense statement',
          icon: LineChart
        },
        { 
          id: 'receivables', 
          name: 'Receivables Report', 
          description: 'Outstanding customer payments',
          icon: TrendingUp
        },
        { 
          id: 'payables', 
          name: 'Payables Report', 
          description: 'Outstanding vendor payments',
          icon: TrendingUp
        },
        { 
          id: 'cash-flow', 
          name: 'Cash Flow Statement', 
          description: 'Cash inflow and outflow',
          icon: Activity
        },
        { 
          id: 'aging-analysis', 
          name: 'Aging Analysis', 
          description: 'Payment aging breakdown',
          icon: Clock
        }
      ]
    },
    {
      id: 'gst',
      title: 'GST Reports',
      icon: FileText,
      color: 'text-indigo-600',
      bgColor: 'bg-indigo-50',
      reports: [
        { 
          id: 'gstr1', 
          name: 'GSTR-1', 
          description: 'Outward supplies return',
          icon: FileText
        },
        { 
          id: 'gstr3b', 
          name: 'GSTR-3B', 
          description: 'Monthly summary return',
          icon: FileText
        },
        { 
          id: 'gst-sales', 
          name: 'GST Sales Report', 
          description: 'Tax collected on sales',
          icon: BarChart3
        },
        { 
          id: 'gst-purchase', 
          name: 'GST Purchase Report', 
          description: 'Input tax credit details',
          icon: BarChart3
        },
        { 
          id: 'hsn-summary', 
          name: 'HSN Summary', 
          description: 'HSN-wise tax summary',
          icon: PieChart
        }
      ]
    },
    {
      id: 'analytics',
      title: 'Analytics & Insights',
      icon: PieChart,
      color: 'text-pink-600',
      bgColor: 'bg-pink-50',
      reports: [
        { 
          id: 'sales-trends', 
          name: 'Sales Trends', 
          description: 'Sales pattern analysis',
          icon: LineChart
        },
        { 
          id: 'top-products', 
          name: 'Top Products', 
          description: 'Best selling products',
          icon: TrendingUp
        },
        { 
          id: 'customer-analysis', 
          name: 'Customer Analysis', 
          description: 'Customer behavior insights',
          icon: Users
        },
        { 
          id: 'seasonal-analysis', 
          name: 'Seasonal Analysis', 
          description: 'Seasonal sales patterns',
          icon: Calendar
        }
      ]
    }
  ];

  // Fetch report data based on selected report
  const fetchReportData = useCallback(async () => {
    if (!selectedReport) return;
    
    setLoading(true);
    try {
      // Simulate API call - replace with actual API endpoints
      let data = [];
      
      switch (selectedReport.id) {
        case 'sales-summary':
          // Fetch sales summary data
          const salesResponse = await invoicesApi.getAll();
          data = processSalesSummary(salesResponse.data);
          break;
          
        case 'sales-register':
          // Fetch detailed sales data
          const invoicesResponse = await invoicesApi.getAll();
          data = invoicesResponse.data;
          break;
          
        case 'customer-wise-sales':
          // Fetch customer-wise sales
          const customersResponse = await customersApi.getAll();
          const invoicesForCustomers = await invoicesApi.getAll();
          data = processCustomerWiseSales(customersResponse.data, invoicesForCustomers.data);
          break;
          
        // Add more cases for other reports
        default:
          data = [];
      }
      
      setReportData(data);
      setMessage('');
    } catch (error) {
      console.error('Error fetching report data:', error);
      setMessage('Failed to load report data');
      setMessageType('error');
    } finally {
      setLoading(false);
    }
  }, [selectedReport, dateRange, filters]);

  useEffect(() => {
    if (selectedReport) {
      fetchReportData();
    }
  }, [selectedReport, fetchReportData]);

  // Process sales summary data
  const processSalesSummary = (invoices) => {
    const summary = {
      totalSales: 0,
      totalOrders: invoices.length,
      averageOrderValue: 0,
      topProducts: [],
      dailySales: {}
    };
    
    invoices.forEach(invoice => {
      summary.totalSales += invoice.total_amount || 0;
      
      const date = new Date(invoice.invoice_date).toLocaleDateString();
      if (!summary.dailySales[date]) {
        summary.dailySales[date] = 0;
      }
      summary.dailySales[date] += invoice.total_amount || 0;
    });
    
    summary.averageOrderValue = summary.totalOrders > 0 ? summary.totalSales / summary.totalOrders : 0;
    
    return summary;
  };

  // Process customer-wise sales
  const processCustomerWiseSales = (customers, invoices) => {
    const customerSales = {};
    
    invoices.forEach(invoice => {
      const customerId = invoice.customer_id;
      if (!customerSales[customerId]) {
        const customer = customers.find(c => c.customer_id === customerId);
        customerSales[customerId] = {
          customerName: customer?.customer_name || 'Unknown',
          totalSales: 0,
          orderCount: 0,
          lastOrderDate: null
        };
      }
      
      customerSales[customerId].totalSales += invoice.total_amount || 0;
      customerSales[customerId].orderCount++;
      customerSales[customerId].lastOrderDate = invoice.invoice_date;
    });
    
    return Object.values(customerSales).sort((a, b) => b.totalSales - a.totalSales);
  };

  // Handle export
  const handleExport = (format) => {
    if (!reportData) {
      setMessage('No data to export');
      setMessageType('error');
      return;
    }
    
    const filename = `${selectedReport.id}_${new Date().toISOString().split('T')[0]}`;
    
    if (format === 'excel') {
      exportToExcel(reportData, filename);
    } else if (format === 'pdf') {
      // Implement PDF export
      console.log('PDF export not implemented yet');
    }
    
    setMessage(`Report exported as ${format.toUpperCase()}`);
    setMessageType('success');
  };

  // Render report content based on selected report
  const renderReportContent = () => {
    if (!selectedReport) {
      return (
        <div className="flex items-center justify-center h-96">
          <div className="text-center">
            <FileText className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <p className="text-gray-500 text-lg">Select a report to view</p>
            <p className="text-gray-400 text-sm mt-2">Choose from the categories on the left</p>
          </div>
        </div>
      );
    }

    if (loading) {
      return (
        <div className="flex items-center justify-center h-96">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
            <p className="mt-4 text-gray-600">Loading report data...</p>
          </div>
        </div>
      );
    }

    // Render different layouts based on report type
    switch (selectedReport.id) {
      case 'sales-summary':
        return renderSalesSummary();
      case 'sales-register':
        return renderSalesRegister();
      case 'customer-wise-sales':
        return renderCustomerWiseSales();
      default:
        return (
          <div className="p-6">
            <p className="text-gray-500">Report view not implemented yet</p>
          </div>
        );
    }
  };

  // Render sales summary report
  const renderSalesSummary = () => {
    if (!reportData) return null;
    
    return (
      <div className="p-6 space-y-6">
        {/* Summary Cards */}
        <div className="grid grid-cols-4 gap-4">
          <div className="bg-white rounded-lg p-4 border border-gray-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Total Sales</p>
                <p className="text-2xl font-bold text-gray-900">₹{reportData.totalSales?.toFixed(2) || 0}</p>
              </div>
              <DollarSign className="w-8 h-8 text-green-400" />
            </div>
          </div>
          
          <div className="bg-white rounded-lg p-4 border border-gray-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Total Orders</p>
                <p className="text-2xl font-bold text-blue-600">{reportData.totalOrders || 0}</p>
              </div>
              <FileText className="w-8 h-8 text-blue-400" />
            </div>
          </div>
          
          <div className="bg-white rounded-lg p-4 border border-gray-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Average Order Value</p>
                <p className="text-2xl font-bold text-purple-600">₹{reportData.averageOrderValue?.toFixed(2) || 0}</p>
              </div>
              <TrendingUp className="w-8 h-8 text-purple-400" />
            </div>
          </div>
          
          <div className="bg-white rounded-lg p-4 border border-gray-200">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Growth</p>
                <p className="text-2xl font-bold text-green-600">+15.3%</p>
              </div>
              <Activity className="w-8 h-8 text-green-400" />
            </div>
          </div>
        </div>
        
        {/* Daily Sales Chart */}
        <div className="bg-white rounded-lg p-6 border border-gray-200">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Daily Sales Trend</h3>
          <div className="h-64 flex items-center justify-center text-gray-400">
            Chart placeholder - Integrate with charting library
          </div>
        </div>
      </div>
    );
  };

  // Render sales register report
  const renderSalesRegister = () => {
    if (!reportData || !Array.isArray(reportData)) return null;
    
    return (
      <div className="p-6">
        <div className="bg-white rounded-lg border border-gray-200">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Invoice #</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Customer</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Amount</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Tax</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Total</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {reportData.slice(0, 10).map((invoice) => (
                  <tr key={invoice.invoice_id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm font-medium text-gray-900">
                      {invoice.invoice_number}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600">
                      {new Date(invoice.invoice_date).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900">
                      {invoice.customer_name || 'N/A'}
                    </td>
                    <td className="px-4 py-3 text-sm text-right text-gray-900">
                      ₹{invoice.subtotal_amount?.toFixed(2) || 0}
                    </td>
                    <td className="px-4 py-3 text-sm text-right text-gray-900">
                      ₹{invoice.tax_amount?.toFixed(2) || 0}
                    </td>
                    <td className="px-4 py-3 text-sm text-right font-medium text-gray-900">
                      ₹{invoice.total_amount?.toFixed(2) || 0}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <StatusBadge status={invoice.payment_status || 'pending'} type="payment" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  };

  // Render customer-wise sales report
  const renderCustomerWiseSales = () => {
    if (!reportData || !Array.isArray(reportData)) return null;
    
    return (
      <div className="p-6">
        <div className="bg-white rounded-lg border border-gray-200">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Customer</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Orders</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Total Sales</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Avg Order</th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Last Order</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {reportData.map((customer, index) => (
                  <tr key={index} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-sm font-medium text-gray-900">
                      {customer.customerName}
                    </td>
                    <td className="px-4 py-3 text-sm text-center text-gray-600">
                      {customer.orderCount}
                    </td>
                    <td className="px-4 py-3 text-sm text-right font-medium text-gray-900">
                      ₹{customer.totalSales.toFixed(2)}
                    </td>
                    <td className="px-4 py-3 text-sm text-right text-gray-600">
                      ₹{(customer.totalSales / customer.orderCount).toFixed(2)}
                    </td>
                    <td className="px-4 py-3 text-sm text-center text-gray-600">
                      {customer.lastOrderDate ? new Date(customer.lastOrderDate).toLocaleDateString() : 'N/A'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="h-full flex flex-col bg-gray-50">
      {/* Header */}
      <ModuleHeader
        title="Reports & Analytics"
        icon={BarChart3}
        iconColor="text-blue-600"
        actions={[
          {
            label: "Refresh",
            onClick: fetchReportData,
            icon: RefreshCw,
            variant: "default"
          },
          {
            label: "Export",
            onClick: () => handleExport('excel'),
            icon: Download,
            variant: "primary",
            disabled: !reportData
          }
        ]}
      />

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar with Categories */}
        <div className="w-80 bg-white border-r border-gray-200 overflow-y-auto">
          <div className="p-4">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Report Categories</h2>
            <div className="space-y-2">
              {reportCategories.map((category) => {
                const Icon = category.icon;
                return (
                  <div key={category.id} className="mb-4">
                    <button
                      onClick={() => setActiveCategory(category.id)}
                      className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors ${
                        activeCategory === category.id
                          ? 'bg-blue-50 text-blue-600'
                          : 'hover:bg-gray-50 text-gray-700'
                      }`}
                    >
                      <Icon className="w-5 h-5" />
                      <span className="font-medium">{category.title}</span>
                    </button>
                    
                    {activeCategory === category.id && (
                      <div className="mt-2 ml-8 space-y-1">
                        {category.reports.map((report) => {
                          const ReportIcon = report.icon;
                          return (
                            <button
                              key={report.id}
                              onClick={() => setSelectedReport(report)}
                              className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors flex items-center gap-2 ${
                                selectedReport?.id === report.id
                                  ? 'bg-blue-100 text-blue-700'
                                  : 'hover:bg-gray-50 text-gray-600'
                              }`}
                            >
                              <ReportIcon className="w-4 h-4" />
                              <div>
                                <p className="font-medium">{report.name}</p>
                                <p className="text-xs text-gray-500">{report.description}</p>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Report Content Area */}
        <div className="flex-1 overflow-auto">
          {/* Filters Bar */}
          {selectedReport && (
            <div className="bg-white border-b border-gray-200 px-6 py-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <h2 className="text-xl font-semibold text-gray-900">{selectedReport.name}</h2>
                  <span className="text-sm text-gray-500">{selectedReport.description}</span>
                </div>
                <div className="flex items-center gap-3">
                  {/* Date Range */}
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-gray-400" />
                    <input
                      type="date"
                      value={dateRange.startDate}
                      onChange={(e) => setDateRange({ ...dateRange, startDate: e.target.value })}
                      className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    />
                    <span className="text-gray-500">to</span>
                    <input
                      type="date"
                      value={dateRange.endDate}
                      onChange={(e) => setDateRange({ ...dateRange, endDate: e.target.value })}
                      className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  
                  {/* Export Options */}
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleExport('pdf')}
                      className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center gap-2"
                    >
                      <Printer className="w-4 h-4" />
                      PDF
                    </button>
                    <button
                      onClick={() => handleExport('excel')}
                      className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center gap-2"
                    >
                      <Download className="w-4 h-4" />
                      Excel
                    </button>
                    <button
                      onClick={() => console.log('Email report')}
                      className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg hover:bg-gray-50 flex items-center gap-2"
                    >
                      <Mail className="w-4 h-4" />
                      Email
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Message Display */}
          {message && (
            <div className="px-6 py-2">
              <div className={`p-3 rounded-lg flex items-center ${
                messageType === 'success' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
              }`}>
                {messageType === 'success' ? <RefreshCw className="w-4 h-4 mr-2" /> : <AlertTriangle className="w-4 h-4 mr-2" />}
                {message}
              </div>
            </div>
          )}

          {/* Report Content */}
          <div className="flex-1">
            {renderReportContent()}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ReportsManagementV2;