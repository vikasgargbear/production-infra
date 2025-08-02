import React, { useState, useEffect } from 'react';
import { 
  FileText, 
  Download, 
  Calendar, 
  Search,
  Filter,
  X,
  TrendingUp,
  Users,
  Package
} from 'lucide-react';
import { salesApi, customersApi, productsApi } from '../../services/api';
import * as XLSX from 'xlsx';

const SalesRegister = ({ open, onClose }) => {
  const [loading, setLoading] = useState(false);
  const [salesData, setSalesData] = useState([]);
  const [filteredData, setFilteredData] = useState([]);
  const [customers, setCustomers] = useState({});
  const [products, setProducts] = useState({});
  const [filters, setFilters] = useState({
    startDate: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0],
    endDate: new Date().toISOString().split('T')[0],
    customer: '',
    product: '',
    invoiceNo: '',
    minAmount: '',
    maxAmount: ''
  });
  const [summary, setSummary] = useState({
    totalSales: 0,
    totalTax: 0,
    totalAmount: 0,
    totalInvoices: 0,
    avgInvoiceValue: 0,
    topCustomers: [],
    topProducts: []
  });

  useEffect(() => {
    if (open) {
      loadData();
    }
  }, [open]);

  useEffect(() => {
    applyFilters();
  }, [salesData, filters]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [salesResponse, customersResponse, productsResponse] = await Promise.all([
        salesApi.getAll(),
        customersApi.getAll(),
        productsApi.getAll()
      ]);

      // Create lookup maps
      const customerMap = {};
      customersResponse.data.forEach(c => {
        customerMap[c.customer_id] = c;
      });
      setCustomers(customerMap);

      const productMap = {};
      productsResponse.data.forEach(p => {
        productMap[p.product_id] = p;
      });
      setProducts(productMap);

      // Process sales data
      const processedSales = (salesResponse.data || []).map(sale => ({
        ...sale,
        customerName: customerMap[sale.customer_id]?.name || 'Unknown',
        customerGSTIN: customerMap[sale.customer_id]?.gstin || '',
        totalTax: (sale.cgst_amount || 0) + (sale.sgst_amount || 0) + (sale.igst_amount || 0),
        netAmount: sale.total_amount + (sale.cgst_amount || 0) + (sale.sgst_amount || 0) + (sale.igst_amount || 0)
      }));

      setSalesData(processedSales);
      calculateSummary(processedSales);
    } catch (error) {
      console.error('Error loading sales data:', error);
    } finally {
      setLoading(false);
    }
  };

  const applyFilters = () => {
    let filtered = [...salesData];

    // Date filter
    if (filters.startDate) {
      filtered = filtered.filter(sale => 
        new Date(sale.invoice_date || sale.created_at) >= new Date(filters.startDate)
      );
    }
    if (filters.endDate) {
      filtered = filtered.filter(sale => 
        new Date(sale.invoice_date || sale.created_at) <= new Date(filters.endDate + 'T23:59:59')
      );
    }

    // Customer filter
    if (filters.customer) {
      filtered = filtered.filter(sale => 
        sale.customerName.toLowerCase().includes(filters.customer.toLowerCase())
      );
    }

    // Invoice number filter
    if (filters.invoiceNo) {
      filtered = filtered.filter(sale => 
        (sale.invoice_no || '').toLowerCase().includes(filters.invoiceNo.toLowerCase())
      );
    }

    // Amount range filter
    if (filters.minAmount) {
      filtered = filtered.filter(sale => sale.netAmount >= parseFloat(filters.minAmount));
    }
    if (filters.maxAmount) {
      filtered = filtered.filter(sale => sale.netAmount <= parseFloat(filters.maxAmount));
    }

    setFilteredData(filtered);
    calculateSummary(filtered);
  };

  const calculateSummary = (data) => {
    const totalSales = data.reduce((sum, sale) => sum + (sale.total_amount || 0), 0);
    const totalTax = data.reduce((sum, sale) => sum + (sale.totalTax || 0), 0);
    const totalAmount = data.reduce((sum, sale) => sum + (sale.netAmount || 0), 0);
    const totalInvoices = data.length;
    const avgInvoiceValue = totalInvoices > 0 ? totalAmount / totalInvoices : 0;

    // Calculate top customers
    const customerSales = {};
    data.forEach(sale => {
      if (!customerSales[sale.customerName]) {
        customerSales[sale.customerName] = 0;
      }
      customerSales[sale.customerName] += sale.netAmount;
    });
    const topCustomers = Object.entries(customerSales)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, amount]) => ({ name, amount }));

    // Calculate top products
    const productSales = {};
    data.forEach(sale => {
      if (sale.items) {
        sale.items.forEach(item => {
          const productName = products[item.product_id]?.product_name || item.product_name || 'Unknown';
          if (!productSales[productName]) {
            productSales[productName] = { quantity: 0, amount: 0 };
          }
          productSales[productName].quantity += item.quantity || 0;
          productSales[productName].amount += item.amount || 0;
        });
      }
    });
    const topProducts = Object.entries(productSales)
      .sort((a, b) => b[1].amount - a[1].amount)
      .slice(0, 5)
      .map(([name, data]) => ({ name, ...data }));

    setSummary({
      totalSales,
      totalTax,
      totalAmount,
      totalInvoices,
      avgInvoiceValue,
      topCustomers,
      topProducts
    });
  };

  const exportToExcel = () => {
    const wb = XLSX.utils.book_new();

    // Summary Sheet
    const summaryData = [
      ['Sales Register Summary'],
      ['Period:', `${filters.startDate} to ${filters.endDate}`],
      [],
      ['Total Sales (Taxable):', `₹${summary.totalSales.toFixed(2)}`],
      ['Total Tax:', `₹${summary.totalTax.toFixed(2)}`],
      ['Total Amount:', `₹${summary.totalAmount.toFixed(2)}`],
      ['Total Invoices:', summary.totalInvoices],
      ['Average Invoice Value:', `₹${summary.avgInvoiceValue.toFixed(2)}`],
      [],
      ['Top Customers:'],
      ...summary.topCustomers.map(c => [c.name, `₹${c.amount.toFixed(2)}`]),
      [],
      ['Top Products:'],
      ...summary.topProducts.map(p => [p.name, `Qty: ${p.quantity}`, `₹${p.amount.toFixed(2)}`])
    ];

    const summarySheet = XLSX.utils.aoa_to_sheet(summaryData);
    XLSX.utils.book_append_sheet(wb, summarySheet, 'Summary');

    // Detailed Sales Sheet
    const salesDetailData = filteredData.map(sale => ({
      'Invoice No': sale.invoice_no || '',
      'Invoice Date': new Date(sale.invoice_date || sale.created_at).toLocaleDateString('en-IN'),
      'Customer Name': sale.customerName,
      'GSTIN': sale.customerGSTIN || '',
      'Taxable Amount': sale.total_amount || 0,
      'CGST': sale.cgst_amount || 0,
      'SGST': sale.sgst_amount || 0,
      'IGST': sale.igst_amount || 0,
      'Total Tax': sale.totalTax || 0,
      'Total Amount': sale.netAmount || 0,
      'Payment Status': sale.payment_status || 'Pending',
      'Place of Supply': sale.place_of_supply || sale.state_code || ''
    }));

    const detailSheet = XLSX.utils.json_to_sheet(salesDetailData);
    XLSX.utils.book_append_sheet(wb, detailSheet, 'Sales Details');

    // Product-wise Sales Sheet
    const productData = [];
    filteredData.forEach(sale => {
      if (sale.items) {
        sale.items.forEach(item => {
          productData.push({
            'Invoice No': sale.invoice_no || '',
            'Date': new Date(sale.invoice_date || sale.created_at).toLocaleDateString('en-IN'),
            'Product': products[item.product_id]?.product_name || item.product_name || 'Unknown',
            'HSN Code': item.hsn_code || '',
            'Batch': item.batch_number || '',
            'Quantity': item.quantity || 0,
            'Rate': item.sale_price || 0,
            'Discount': item.discount || 0,
            'Amount': item.amount || 0,
            'GST %': item.gst_percent || 18
          });
        });
      }
    });

    if (productData.length > 0) {
      const productSheet = XLSX.utils.json_to_sheet(productData);
      XLSX.utils.book_append_sheet(wb, productSheet, 'Product Details');
    }

    const filename = `Sales_Register_${filters.startDate}_to_${filters.endDate}.xlsx`;
    XLSX.writeFile(wb, filename);
  };

  const exportPDF = () => {
    // This would typically generate a PDF report
    // For now, we'll show an alert
    alert('PDF export functionality would be implemented here');
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-7xl m-4 max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="px-8 py-6 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Sales Register</h1>
              <p className="text-gray-600 mt-1">Comprehensive sales transactions and analysis</p>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <X className="w-5 h-5 text-gray-500" />
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="px-8 py-4 border-b border-gray-200 bg-gray-50">
          <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
              <input
                type="date"
                value={filters.startDate}
                onChange={(e) => setFilters({ ...filters, startDate: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">End Date</label>
              <input
                type="date"
                value={filters.endDate}
                onChange={(e) => setFilters({ ...filters, endDate: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Customer</label>
              <input
                type="text"
                placeholder="Search customer..."
                value={filters.customer}
                onChange={(e) => setFilters({ ...filters, customer: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Invoice No</label>
              <input
                type="text"
                placeholder="Search invoice..."
                value={filters.invoiceNo}
                onChange={(e) => setFilters({ ...filters, invoiceNo: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="md:col-span-2 flex items-end space-x-2">
              <button
                onClick={() => setFilters({
                  startDate: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0],
                  endDate: new Date().toISOString().split('T')[0],
                  customer: '',
                  product: '',
                  invoiceNo: '',
                  minAmount: '',
                  maxAmount: ''
                })}
                className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
              >
                Reset
              </button>
              <button
                onClick={exportToExcel}
                className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center space-x-2"
              >
                <Download className="w-4 h-4" />
                <span>Export Excel</span>
              </button>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-8">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
          ) : (
            <div className="space-y-6">
              {/* Summary Cards */}
              <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                <div className="bg-blue-50 rounded-lg p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-blue-600 font-medium">Total Sales</p>
                      <p className="text-2xl font-bold text-blue-900 mt-1">
                        ₹{summary.totalSales.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </p>
                    </div>
                    <TrendingUp className="w-8 h-8 text-blue-500" />
                  </div>
                </div>
                <div className="bg-green-50 rounded-lg p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-green-600 font-medium">Total Tax</p>
                      <p className="text-2xl font-bold text-green-900 mt-1">
                        ₹{summary.totalTax.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </p>
                    </div>
                    <FileText className="w-8 h-8 text-green-500" />
                  </div>
                </div>
                <div className="bg-purple-50 rounded-lg p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-purple-600 font-medium">Total Amount</p>
                      <p className="text-2xl font-bold text-purple-900 mt-1">
                        ₹{summary.totalAmount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </p>
                    </div>
                    <TrendingUp className="w-8 h-8 text-purple-500" />
                  </div>
                </div>
                <div className="bg-orange-50 rounded-lg p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-orange-600 font-medium">Total Invoices</p>
                      <p className="text-2xl font-bold text-orange-900 mt-1">{summary.totalInvoices}</p>
                    </div>
                    <FileText className="w-8 h-8 text-orange-500" />
                  </div>
                </div>
                <div className="bg-cyan-50 rounded-lg p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-cyan-600 font-medium">Avg Invoice</p>
                      <p className="text-2xl font-bold text-cyan-900 mt-1">
                        ₹{summary.avgInvoiceValue.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                      </p>
                    </div>
                    <TrendingUp className="w-8 h-8 text-cyan-500" />
                  </div>
                </div>
              </div>

              {/* Top Customers and Products */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="bg-white rounded-lg border border-gray-200">
                  <div className="px-6 py-4 border-b border-gray-200">
                    <h3 className="text-lg font-semibold text-gray-900 flex items-center">
                      <Users className="w-5 h-5 mr-2" />
                      Top Customers
                    </h3>
                  </div>
                  <div className="p-6">
                    {summary.topCustomers.length > 0 ? (
                      <div className="space-y-3">
                        {summary.topCustomers.map((customer, index) => (
                          <div key={index} className="flex items-center justify-between">
                            <span className="text-sm text-gray-700">{customer.name}</span>
                            <span className="text-sm font-medium text-gray-900">
                              ₹{customer.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-center text-gray-500 py-4">No data available</p>
                    )}
                  </div>
                </div>

                <div className="bg-white rounded-lg border border-gray-200">
                  <div className="px-6 py-4 border-b border-gray-200">
                    <h3 className="text-lg font-semibold text-gray-900 flex items-center">
                      <Package className="w-5 h-5 mr-2" />
                      Top Products
                    </h3>
                  </div>
                  <div className="p-6">
                    {summary.topProducts.length > 0 ? (
                      <div className="space-y-3">
                        {summary.topProducts.map((product, index) => (
                          <div key={index} className="flex items-center justify-between">
                            <div>
                              <span className="text-sm text-gray-700">{product.name}</span>
                              <span className="text-xs text-gray-500 ml-2">Qty: {product.quantity}</span>
                            </div>
                            <span className="text-sm font-medium text-gray-900">
                              ₹{product.amount.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-center text-gray-500 py-4">No data available</p>
                    )}
                  </div>
                </div>
              </div>

              {/* Sales Table */}
              <div className="bg-white rounded-lg border border-gray-200">
                <div className="px-6 py-4 border-b border-gray-200">
                  <h3 className="text-lg font-semibold text-gray-900">Sales Transactions</h3>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b bg-gray-50">
                        <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">Invoice No</th>
                        <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">Date</th>
                        <th className="text-left py-3 px-4 text-sm font-medium text-gray-700">Customer</th>
                        <th className="text-right py-3 px-4 text-sm font-medium text-gray-700">Taxable</th>
                        <th className="text-right py-3 px-4 text-sm font-medium text-gray-700">CGST</th>
                        <th className="text-right py-3 px-4 text-sm font-medium text-gray-700">SGST</th>
                        <th className="text-right py-3 px-4 text-sm font-medium text-gray-700">IGST</th>
                        <th className="text-right py-3 px-4 text-sm font-medium text-gray-700">Total</th>
                        <th className="text-center py-3 px-4 text-sm font-medium text-gray-700">Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredData.slice(0, 20).map((sale, index) => (
                        <tr key={sale.sale_id || index} className="border-b hover:bg-gray-50">
                          <td className="py-3 px-4 text-sm font-medium text-blue-600">
                            {sale.invoice_no || '-'}
                          </td>
                          <td className="py-3 px-4 text-sm">
                            {new Date(sale.invoice_date || sale.created_at).toLocaleDateString('en-IN')}
                          </td>
                          <td className="py-3 px-4 text-sm">
                            <div>
                              <p className="font-medium">{sale.customerName}</p>
                              {sale.customerGSTIN && (
                                <p className="text-xs text-gray-500">{sale.customerGSTIN}</p>
                              )}
                            </div>
                          </td>
                          <td className="py-3 px-4 text-sm text-right">
                            ₹{(sale.total_amount || 0).toFixed(2)}
                          </td>
                          <td className="py-3 px-4 text-sm text-right">
                            ₹{(sale.cgst_amount || 0).toFixed(2)}
                          </td>
                          <td className="py-3 px-4 text-sm text-right">
                            ₹{(sale.sgst_amount || 0).toFixed(2)}
                          </td>
                          <td className="py-3 px-4 text-sm text-right">
                            ₹{(sale.igst_amount || 0).toFixed(2)}
                          </td>
                          <td className="py-3 px-4 text-sm text-right font-medium">
                            ₹{(sale.netAmount || 0).toFixed(2)}
                          </td>
                          <td className="py-3 px-4 text-sm text-center">
                            <span className={`inline-flex px-2 py-1 text-xs rounded-full font-medium ${
                              sale.payment_status === 'paid' 
                                ? 'bg-green-100 text-green-800'
                                : 'bg-yellow-100 text-yellow-800'
                            }`}>
                              {sale.payment_status || 'Pending'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {filteredData.length > 20 && (
                    <div className="px-6 py-3 bg-gray-50 text-center">
                      <p className="text-sm text-gray-600">
                        Showing 20 of {filteredData.length} records. Export to see all.
                      </p>
                    </div>
                  )}
                  {filteredData.length === 0 && (
                    <div className="px-6 py-12 text-center">
                      <p className="text-gray-500">No sales found for the selected filters</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default SalesRegister;