import React, { useState, useEffect } from 'react';
import {
  FileText,
  Download,
  Calendar,
  Filter,
  Search,
  ChevronRight,
  IndianRupee,
  TrendingUp,
  AlertTriangle,
  CheckCircle,
  Clock,
  RefreshCw,
  Eye,
  Send,
  Archive,
  BarChart3,
  PieChart,
  Calculator,
  Building,
  ShoppingCart,
  Package,
  Users,
  ArrowUpRight,
  ArrowDownRight,
  Target,
  Zap
} from 'lucide-react';

const GSTReports = () => {
  const [selectedReport, setSelectedReport] = useState('gstr1');
  const [dateRange, setDateRange] = useState('current_month');
  const [customDateRange, setCustomDateRange] = useState({
    from: new Date().toISOString().split('T')[0],
    to: new Date().toISOString().split('T')[0]
  });
  const [loading, setLoading] = useState(false);
  const [reportData, setReportData] = useState(null);

  // GST Report Types
  const gstReports = [
    {
      id: 'gstr1',
      name: 'GSTR-1',
      description: 'Outward supplies (Sales)',
      icon: ShoppingCart,
      color: 'blue',
      dueDate: '11th of next month',
      status: 'pending'
    },
    {
      id: 'gstr3b',
      name: 'GSTR-3B',
      description: 'Monthly summary return',
      icon: FileText,
      color: 'green',
      dueDate: '20th of next month',
      status: 'filed'
    },
    {
      id: 'gstr2a',
      name: 'GSTR-2A',
      description: 'Auto-populated purchases',
      icon: Package,
      color: 'purple',
      dueDate: 'Auto-updated',
      status: 'updated'
    },
    {
      id: 'hsn_summary',
      name: 'HSN Summary',
      description: 'HSN/SAC wise summary',
      icon: BarChart3,
      color: 'orange',
      dueDate: 'With GSTR-1',
      status: 'pending'
    },
    {
      id: 'sales_register',
      name: 'Sales Register',
      description: 'Detailed sales transactions',
      icon: Users,
      color: 'indigo',
      dueDate: 'Internal report',
      status: 'ready'
    },
    {
      id: 'purchase_register',
      name: 'Purchase Register',
      description: 'Purchase transactions',
      icon: Building,
      color: 'red',
      dueDate: 'Internal report',
      status: 'ready'
    }
  ];

  // Sample GST dashboard data
  const gstDashboard = {
    currentMonth: {
      sales: 5600000,
      purchases: 4200000,
      outputTax: 672000,
      inputTax: 504000,
      netTax: 168000,
      itc: 504000
    },
    yearToDate: {
      sales: 45000000,
      purchases: 33000000,
      outputTax: 5400000,
      inputTax: 3960000,
      netTax: 1440000
    },
    compliance: {
      gstr1Filed: true,
      gstr3bFiled: false,
      dueDate: '2024-02-20',
      penalty: 0
    }
  };

  // Sample GSTR-1 data
  const gstr1Data = {
    summary: {
      totalTaxableValue: 5600000,
      totalTax: 672000,
      totalInvoiceValue: 6272000,
      totalInvoices: 347,
      b2bSales: 5200000,
      b2cSales: 400000,
      exports: 0,
      nilRated: 0
    },
    b2bSupplies: [
      {
        gstin: '27AABCU9603R1ZM',
        customerName: 'Rajesh Medical Store',
        invoiceNo: 'INV-2024-001',
        invoiceDate: '2024-01-15',
        invoiceValue: 118000,
        place: 'Rajasthan',
        taxableValue: 100000,
        igst: 0,
        cgst: 9000,
        sgst: 9000,
        cess: 0,
        hsnCode: '30049099'
      },
      {
        gstin: '27AABCU9603R1ZN',
        customerName: 'City Hospital Pharmacy',
        invoiceNo: 'INV-2024-002',
        invoiceDate: '2024-01-16',
        invoiceValue: 295000,
        place: 'Rajasthan',
        taxableValue: 250000,
        igst: 0,
        cgst: 22500,
        sgst: 22500,
        cess: 0,
        hsnCode: '30049099'
      }
    ],
    b2cSupplies: [
      {
        place: 'Rajasthan',
        taxableValue: 350000,
        igst: 0,
        cgst: 31500,
        sgst: 31500,
        cess: 0,
        hsnCode: '30049099'
      },
      {
        place: 'Delhi',
        taxableValue: 50000,
        igst: 9000,
        cgst: 0,
        sgst: 0,
        cess: 0,
        hsnCode: '30049099'
      }
    ],
    hsnSummary: [
      {
        hsnCode: '30049099',
        description: 'Pharmaceutical products',
        uqc: 'NOS',
        quantity: 15420,
        taxableValue: 5200000,
        igst: 9000,
        cgst: 459000,
        sgst: 459000,
        cess: 0,
        rate: 18
      },
      {
        hsnCode: '30059099',
        description: 'Medical devices',
        uqc: 'NOS',
        quantity: 850,
        taxableValue: 400000,
        igst: 0,
        cgst: 24000,
        sgst: 24000,
        cess: 0,
        rate: 12
      }
    ]
  };

  // Sample GSTR-3B data
  const gstr3bData = {
    outwardSupplies: {
      taxableSupplies: {
        taxableValue: 5600000,
        igst: 9000,
        cgst: 459000,
        sgst: 459000,
        cess: 0
      },
      exemptSupplies: {
        taxableValue: 0,
        igst: 0,
        cgst: 0,
        sgst: 0,
        cess: 0
      }
    },
    inputTaxCredit: {
      imports: { igst: 0, cess: 0 },
      inwardSupplies: { igst: 45000, cgst: 225000, sgst: 225000, cess: 0 },
      inwardSuppliesRcm: { igst: 0, cgst: 0, sgst: 0, cess: 0 },
      itcReversed: { igst: 0, cgst: 0, sgst: 0, cess: 0 }
    },
    taxPayable: {
      igst: 0,
      cgst: 234000,
      sgst: 234000,
      cess: 0
    },
    taxPaid: {
      igst: 0,
      cgst: 234000,
      sgst: 234000,
      cess: 0,
      interest: 0,
      penalty: 0,
      fees: 0
    }
  };

  useEffect(() => {
    loadReportData();
  }, [selectedReport, dateRange]);

  const loadReportData = () => {
    setLoading(true);
    
    setTimeout(() => {
      switch (selectedReport) {
        case 'gstr1':
          setReportData(gstr1Data);
          break;
        case 'gstr3b':
          setReportData(gstr3bData);
          break;
        default:
          setReportData(null);
      }
      setLoading(false);
    }, 1000);
  };

  const handleExport = (format) => {
    const fileName = `${selectedReport}_${dateRange}.${format}`;
    alert(`Exporting ${fileName}...`);
  };

  const handleFileGSTR = (reportType) => {
    alert(`Filing ${reportType} with GST portal...`);
  };

  const formatAmount = (amount) => {
    if (amount >= 10000000) {
      return `₹${(amount / 10000000).toFixed(2)}Cr`;
    } else if (amount >= 100000) {
      return `₹${(amount / 100000).toFixed(2)}L`;
    } else if (amount >= 1000) {
      return `₹${(amount / 1000).toFixed(2)}K`;
    }
    return `₹${amount.toLocaleString()}`;
  };

  const renderGSTR1Report = () => (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-white p-6 rounded-lg shadow-sm border">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Total Sales</p>
              <p className="text-2xl font-bold text-gray-900">{formatAmount(reportData.summary.totalInvoiceValue)}</p>
            </div>
            <div className="p-3 bg-blue-50 rounded-lg">
              <TrendingUp className="w-6 h-6 text-blue-600" />
            </div>
          </div>
        </div>
        
        <div className="bg-white p-6 rounded-lg shadow-sm border">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Taxable Value</p>
              <p className="text-2xl font-bold text-gray-900">{formatAmount(reportData.summary.totalTaxableValue)}</p>
            </div>
            <div className="p-3 bg-green-50 rounded-lg">
              <Calculator className="w-6 h-6 text-green-600" />
            </div>
          </div>
        </div>
        
        <div className="bg-white p-6 rounded-lg shadow-sm border">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Total Tax</p>
              <p className="text-2xl font-bold text-gray-900">{formatAmount(reportData.summary.totalTax)}</p>
            </div>
            <div className="p-3 bg-orange-50 rounded-lg">
              <Target className="w-6 h-6 text-orange-600" />
            </div>
          </div>
        </div>
        
        <div className="bg-white p-6 rounded-lg shadow-sm border">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Total Invoices</p>
              <p className="text-2xl font-bold text-gray-900">{reportData.summary.totalInvoices}</p>
            </div>
            <div className="p-3 bg-purple-50 rounded-lg">
              <FileText className="w-6 h-6 text-purple-600" />
            </div>
          </div>
        </div>
      </div>

      {/* B2B Supplies Table */}
      <div className="bg-white rounded-lg shadow-sm border">
        <div className="p-6 border-b">
          <h3 className="text-lg font-semibold">B2B Supplies</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">GSTIN</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Customer</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Invoice No</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Taxable Value</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">IGST</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">CGST</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">SGST</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {reportData.b2bSupplies.map((supply, index) => (
                <tr key={index} className="hover:bg-gray-50">
                  <td className="px-6 py-4 text-sm font-medium text-gray-900">{supply.gstin}</td>
                  <td className="px-6 py-4 text-sm text-gray-900">{supply.customerName}</td>
                  <td className="px-6 py-4 text-sm text-gray-900">{supply.invoiceNo}</td>
                  <td className="px-6 py-4 text-sm text-gray-900">{supply.invoiceDate}</td>
                  <td className="px-6 py-4 text-sm text-gray-900 text-right">₹{supply.taxableValue.toLocaleString()}</td>
                  <td className="px-6 py-4 text-sm text-gray-900 text-right">₹{supply.igst.toLocaleString()}</td>
                  <td className="px-6 py-4 text-sm text-gray-900 text-right">₹{supply.cgst.toLocaleString()}</td>
                  <td className="px-6 py-4 text-sm text-gray-900 text-right">₹{supply.sgst.toLocaleString()}</td>
                  <td className="px-6 py-4 text-sm font-medium text-gray-900 text-right">₹{supply.invoiceValue.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* HSN Summary */}
      <div className="bg-white rounded-lg shadow-sm border">
        <div className="p-6 border-b">
          <h3 className="text-lg font-semibold">HSN Summary</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">HSN Code</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Description</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Quantity</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Taxable Value</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Rate %</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">CGST</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">SGST</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Total Tax</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {reportData.hsnSummary.map((hsn, index) => (
                <tr key={index} className="hover:bg-gray-50">
                  <td className="px-6 py-4 text-sm font-medium text-gray-900">{hsn.hsnCode}</td>
                  <td className="px-6 py-4 text-sm text-gray-900">{hsn.description}</td>
                  <td className="px-6 py-4 text-sm text-gray-900 text-right">{hsn.quantity}</td>
                  <td className="px-6 py-4 text-sm text-gray-900 text-right">₹{hsn.taxableValue.toLocaleString()}</td>
                  <td className="px-6 py-4 text-sm text-gray-900 text-right">{hsn.rate}%</td>
                  <td className="px-6 py-4 text-sm text-gray-900 text-right">₹{hsn.cgst.toLocaleString()}</td>
                  <td className="px-6 py-4 text-sm text-gray-900 text-right">₹{hsn.sgst.toLocaleString()}</td>
                  <td className="px-6 py-4 text-sm font-medium text-gray-900 text-right">₹{(hsn.igst + hsn.cgst + hsn.sgst).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );

  const renderGSTR3BReport = () => (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white p-6 rounded-lg shadow-sm border">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Output Tax</p>
              <p className="text-2xl font-bold text-green-600">{formatAmount(reportData.outwardSupplies.taxableSupplies.cgst + reportData.outwardSupplies.taxableSupplies.sgst + reportData.outwardSupplies.taxableSupplies.igst)}</p>
            </div>
            <div className="p-3 bg-green-50 rounded-lg">
              <ArrowUpRight className="w-6 h-6 text-green-600" />
            </div>
          </div>
        </div>
        
        <div className="bg-white p-6 rounded-lg shadow-sm border">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Input Tax Credit</p>
              <p className="text-2xl font-bold text-blue-600">{formatAmount(reportData.inputTaxCredit.inwardSupplies.cgst + reportData.inputTaxCredit.inwardSupplies.sgst + reportData.inputTaxCredit.inwardSupplies.igst)}</p>
            </div>
            <div className="p-3 bg-blue-50 rounded-lg">
              <ArrowDownRight className="w-6 h-6 text-blue-600" />
            </div>
          </div>
        </div>
        
        <div className="bg-white p-6 rounded-lg shadow-sm border">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Net Tax Payable</p>
              <p className="text-2xl font-bold text-orange-600">{formatAmount(reportData.taxPayable.cgst + reportData.taxPayable.sgst + reportData.taxPayable.igst)}</p>
            </div>
            <div className="p-3 bg-orange-50 rounded-lg">
              <Calculator className="w-6 h-6 text-orange-600" />
            </div>
          </div>
        </div>
      </div>

      {/* GSTR-3B Sections */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Outward Supplies */}
        <div className="bg-white rounded-lg shadow-sm border">
          <div className="p-6 border-b">
            <h3 className="text-lg font-semibold">Outward Supplies</h3>
          </div>
          <div className="p-6">
            <div className="space-y-4">
              <div className="flex justify-between items-center py-2 border-b">
                <span className="text-sm text-gray-600">Taxable Supplies</span>
                <span className="font-medium">{formatAmount(reportData.outwardSupplies.taxableSupplies.taxableValue)}</span>
              </div>
              <div className="grid grid-cols-3 gap-4 text-sm">
                <div className="text-center">
                  <p className="text-gray-600">IGST</p>
                  <p className="font-medium">₹{reportData.outwardSupplies.taxableSupplies.igst.toLocaleString()}</p>
                </div>
                <div className="text-center">
                  <p className="text-gray-600">CGST</p>
                  <p className="font-medium">₹{reportData.outwardSupplies.taxableSupplies.cgst.toLocaleString()}</p>
                </div>
                <div className="text-center">
                  <p className="text-gray-600">SGST</p>
                  <p className="font-medium">₹{reportData.outwardSupplies.taxableSupplies.sgst.toLocaleString()}</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Input Tax Credit */}
        <div className="bg-white rounded-lg shadow-sm border">
          <div className="p-6 border-b">
            <h3 className="text-lg font-semibold">Input Tax Credit</h3>
          </div>
          <div className="p-6">
            <div className="space-y-4">
              <div className="flex justify-between items-center py-2 border-b">
                <span className="text-sm text-gray-600">Inward Supplies</span>
                <span className="font-medium">{formatAmount(reportData.inputTaxCredit.inwardSupplies.cgst + reportData.inputTaxCredit.inwardSupplies.sgst + reportData.inputTaxCredit.inwardSupplies.igst)}</span>
              </div>
              <div className="grid grid-cols-3 gap-4 text-sm">
                <div className="text-center">
                  <p className="text-gray-600">IGST</p>
                  <p className="font-medium">₹{reportData.inputTaxCredit.inwardSupplies.igst.toLocaleString()}</p>
                </div>
                <div className="text-center">
                  <p className="text-gray-600">CGST</p>
                  <p className="font-medium">₹{reportData.inputTaxCredit.inwardSupplies.cgst.toLocaleString()}</p>
                </div>
                <div className="text-center">
                  <p className="text-gray-600">SGST</p>
                  <p className="font-medium">₹{reportData.inputTaxCredit.inwardSupplies.sgst.toLocaleString()}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      {/* Header */}
      <div className="bg-white rounded-lg shadow-sm p-6 mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">GST Reports</h1>
            <p className="text-gray-600">Comprehensive GST reporting and compliance</p>
          </div>
          <div className="flex items-center space-x-3">
            <button
              onClick={() => handleFileGSTR(selectedReport)}
              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 flex items-center"
            >
              <Send className="w-4 h-4 mr-2" />
              File with GST Portal
            </button>
            <button
              onClick={() => handleExport('excel')}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center"
            >
              <Download className="w-4 h-4 mr-2" />
              Export
            </button>
          </div>
        </div>
      </div>

      {/* GST Dashboard */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div className="bg-white p-6 rounded-lg shadow-sm border">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">This Month Sales</p>
              <p className="text-2xl font-bold text-gray-900">{formatAmount(gstDashboard.currentMonth.sales)}</p>
              <p className="text-sm text-green-600">Output Tax: {formatAmount(gstDashboard.currentMonth.outputTax)}</p>
            </div>
            <div className="p-3 bg-green-50 rounded-lg">
              <TrendingUp className="w-6 h-6 text-green-600" />
            </div>
          </div>
        </div>
        
        <div className="bg-white p-6 rounded-lg shadow-sm border">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">This Month Purchases</p>
              <p className="text-2xl font-bold text-gray-900">{formatAmount(gstDashboard.currentMonth.purchases)}</p>
              <p className="text-sm text-blue-600">Input Tax: {formatAmount(gstDashboard.currentMonth.inputTax)}</p>
            </div>
            <div className="p-3 bg-blue-50 rounded-lg">
              <Package className="w-6 h-6 text-blue-600" />
            </div>
          </div>
        </div>
        
        <div className="bg-white p-6 rounded-lg shadow-sm border">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Net Tax Payable</p>
              <p className="text-2xl font-bold text-orange-600">{formatAmount(gstDashboard.currentMonth.netTax)}</p>
              <p className="text-sm text-gray-600">Due: {gstDashboard.compliance.dueDate}</p>
            </div>
            <div className="p-3 bg-orange-50 rounded-lg">
              <Calculator className="w-6 h-6 text-orange-600" />
            </div>
          </div>
        </div>
        
        <div className="bg-white p-6 rounded-lg shadow-sm border">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Compliance Status</p>
              <div className="flex items-center mt-2">
                {gstDashboard.compliance.gstr3bFiled ? (
                  <CheckCircle className="w-5 h-5 text-green-600 mr-2" />
                ) : (
                  <Clock className="w-5 h-5 text-orange-600 mr-2" />
                )}
                <span className="text-sm font-medium">
                  {gstDashboard.compliance.gstr3bFiled ? 'Filed' : 'Pending'}
                </span>
              </div>
            </div>
            <div className="p-3 bg-purple-50 rounded-lg">
              <Shield className="w-6 h-6 text-purple-600" />
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Report Selection Sidebar */}
        <div className="bg-white rounded-lg shadow-sm border h-fit">
          <div className="p-6 border-b">
            <h3 className="text-lg font-semibold">GST Reports</h3>
          </div>
          <div className="p-4">
            <div className="space-y-2">
              {gstReports.map(report => {
                const Icon = report.icon;
                return (
                  <button
                    key={report.id}
                    onClick={() => setSelectedReport(report.id)}
                    className={`w-full text-left p-3 rounded-lg transition-colors ${
                      selectedReport === report.id 
                        ? `bg-${report.color}-50 border-${report.color}-200 border` 
                        : 'hover:bg-gray-50'
                    }`}
                  >
                    <div className="flex items-center">
                      <Icon className={`w-5 h-5 mr-3 ${
                        selectedReport === report.id 
                          ? `text-${report.color}-600` 
                          : 'text-gray-500'
                      }`} />
                      <div className="flex-1">
                        <div className="flex items-center justify-between">
                          <span className="font-medium">{report.name}</span>
                          <span className={`px-2 py-1 text-xs rounded-full ${
                            report.status === 'filed' 
                              ? 'bg-green-100 text-green-700'
                              : report.status === 'pending'
                              ? 'bg-orange-100 text-orange-700'
                              : 'bg-blue-100 text-blue-700'
                          }`}>
                            {report.status}
                          </span>
                        </div>
                        <p className="text-sm text-gray-600">{report.description}</p>
                        <p className="text-xs text-gray-500 mt-1">Due: {report.dueDate}</p>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Report Content */}
        <div className="lg:col-span-3">
          {/* Filters */}
          <div className="bg-white rounded-lg shadow-sm border p-4 mb-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Period</label>
                  <select
                    value={dateRange}
                    onChange={(e) => setDateRange(e.target.value)}
                    className="px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="current_month">Current Month</option>
                    <option value="last_month">Last Month</option>
                    <option value="current_quarter">Current Quarter</option>
                    <option value="last_quarter">Last Quarter</option>
                    <option value="current_year">Current Year</option>
                    <option value="custom">Custom Range</option>
                  </select>
                </div>
                
                {dateRange === 'custom' && (
                  <div className="flex items-center space-x-2">
                    <input
                      type="date"
                      value={customDateRange.from}
                      onChange={(e) => setCustomDateRange(prev => ({ ...prev, from: e.target.value }))}
                      className="px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                    />
                    <span className="text-gray-500">to</span>
                    <input
                      type="date"
                      value={customDateRange.to}
                      onChange={(e) => setCustomDateRange(prev => ({ ...prev, to: e.target.value }))}
                      className="px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                )}
              </div>
              
              <button
                onClick={loadReportData}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center"
              >
                <RefreshCw className="w-4 h-4 mr-2" />
                Refresh
              </button>
            </div>
          </div>

          {/* Report Content */}
          <div className="space-y-6">
            {loading ? (
              <div className="flex items-center justify-center h-64">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
              </div>
            ) : (
              <>
                {selectedReport === 'gstr1' && reportData && renderGSTR1Report()}
                {selectedReport === 'gstr3b' && reportData && renderGSTR3BReport()}
                {!reportData && (
                  <div className="bg-white rounded-lg shadow-sm border p-12 text-center">
                    <FileText className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                    <h3 className="text-lg font-semibold text-gray-900 mb-2">Report Coming Soon</h3>
                    <p className="text-gray-600">This report is under development and will be available soon.</p>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default GSTReports;