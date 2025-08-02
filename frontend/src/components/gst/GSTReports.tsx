import React, { useState, useEffect } from 'react';
import { 
  BarChart3, Download, Calendar, Search, Filter,
  FileText, TrendingUp, TrendingDown, IndianRupee,
  Building, Package, Users, Printer, RefreshCw
} from 'lucide-react';
import { Button, DatePicker, Card, DataTable } from '../global';

interface GSTReportsProps {
  open: boolean;
  onClose: () => void;
}

interface DateRange {
  from: string;
  to: string;
}

interface B2BInvoice {
  gstin: string;
  name: string;
  invoices: number;
  taxableValue: number;
  cgst: number;
  sgst: number;
  igst: number;
}

interface B2CData {
  count: number;
  taxableValue: number;
  cgst: number;
  sgst: number;
  igst: number;
}

interface GSTSummary {
  totalInvoices: number;
  totalTaxableValue: number;
  totalCGST: number;
  totalSGST: number;
  totalIGST: number;
  totalTax: number;
}

interface GSTR1Data {
  b2b: B2BInvoice[];
  b2c: {
    small: B2CData;
    large: B2CData;
  };
  summary: GSTSummary;
}

interface ReportType {
  id: string;
  name: string;
  description: string;
  icon: React.ComponentType<any>;
  color: string;
}

const GSTReports: React.FC<GSTReportsProps> = ({ open, onClose }) => {
  const [selectedReport, setSelectedReport] = useState<string>('gstr-1');
  const [dateRange, setDateRange] = useState<DateRange>({
    from: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0],
    to: new Date().toISOString().split('T')[0]
  });
  const [loading, setLoading] = useState<boolean>(false);
  const [reportData, setReportData] = useState<GSTR1Data | null>(null);

  const reportTypes: ReportType[] = [
    {
      id: 'gstr-1',
      name: 'GSTR-1',
      description: 'Outward Supplies',
      icon: TrendingUp,
      color: 'green'
    },
    {
      id: 'gstr-3b',
      name: 'GSTR-3B',
      description: 'Summary Return',
      icon: FileText,
      color: 'blue'
    },
    {
      id: 'gstr-2b',
      name: 'GSTR-2B',
      description: 'Input Tax Credit',
      icon: TrendingDown,
      color: 'purple'
    },
    {
      id: 'hsn-summary',
      name: 'HSN Summary',
      description: 'Product-wise GST',
      icon: Package,
      color: 'amber'
    },
    {
      id: 'party-wise',
      name: 'Party-wise GST',
      description: 'Customer GST details',
      icon: Users,
      color: 'teal'
    },
    {
      id: 'payable',
      name: 'GST Payable',
      description: 'Tax liability',
      icon: IndianRupee,
      color: 'red'
    }
  ];

  // Mock data for demonstration
  const mockGSTR1Data: GSTR1Data = {
    b2b: [
      { gstin: '29AABCT1332L1ZN', name: 'Apollo Hospitals', invoices: 45, taxableValue: 850000, cgst: 76500, sgst: 76500, igst: 0 },
      { gstin: '27AABCT1332L2ZN', name: 'Max Healthcare', invoices: 32, taxableValue: 620000, cgst: 0, sgst: 0, igst: 111600 },
      { gstin: '29AABCT1332L3ZN', name: 'Fortis Hospitals', invoices: 28, taxableValue: 450000, cgst: 40500, sgst: 40500, igst: 0 }
    ],
    b2c: {
      small: { count: 156, taxableValue: 125000, cgst: 11250, sgst: 11250, igst: 0 },
      large: { count: 12, taxableValue: 450000, cgst: 40500, sgst: 40500, igst: 0 }
    },
    summary: {
      totalInvoices: 273,
      totalTaxableValue: 2495000,
      totalCGST: 168750,
      totalSGST: 168750,
      totalIGST: 111600,
      totalTax: 449100
    }
  };

  useEffect(() => {
    // Load initial report data
    loadReportData();
  }, [selectedReport, dateRange]);

  const loadReportData = (): void => {
    setLoading(true);
    // Simulate API call
    setTimeout(() => {
      setReportData(mockGSTR1Data);
      setLoading(false);
    }, 1000);
  };

  const handleExport = (format: 'excel' | 'pdf'): void => {
    console.log(`Exporting ${selectedReport} in ${format} format`);
    alert(`${selectedReport.toUpperCase()} exported successfully!`);
  };

  const renderReportContent = (): React.ReactNode => {
    if (loading) {
      return (
        <div className="flex items-center justify-center h-64">
          <RefreshCw className="w-8 h-8 text-gray-400 animate-spin" />
        </div>
      );
    }

    if (!reportData) {
      return (
        <div className="text-center py-12 text-gray-500">
          No data available for the selected period
        </div>
      );
    }

    // GSTR-1 Report Layout
    if (selectedReport === 'gstr-1') {
      return (
        <div className="space-y-6">
          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <Card padding="sm" shadow="sm">
              <div className="flex items-center justify-between p-4">
                <div>
                  <p className="text-sm text-gray-600">Total Invoices</p>
                  <p className="text-2xl font-bold text-gray-900">{reportData.summary.totalInvoices}</p>
                </div>
                <FileText className="w-8 h-8 text-blue-500" />
              </div>
            </Card>
            
            <Card padding="sm" shadow="sm">
              <div className="flex items-center justify-between p-4">
                <div>
                  <p className="text-sm text-gray-600">Taxable Value</p>
                  <p className="text-2xl font-bold text-gray-900">₹{reportData.summary.totalTaxableValue.toLocaleString()}</p>
                </div>
                <IndianRupee className="w-8 h-8 text-green-500" />
              </div>
            </Card>
            
            <Card padding="sm" shadow="sm">
              <div className="flex items-center justify-between p-4">
                <div>
                  <p className="text-sm text-gray-600">Total GST</p>
                  <p className="text-2xl font-bold text-gray-900">₹{reportData.summary.totalTax.toLocaleString()}</p>
                </div>
                <BarChart3 className="w-8 h-8 text-purple-500" />
              </div>
            </Card>
            
            <Card padding="sm" shadow="sm">
              <div className="flex items-center justify-between p-4">
                <div>
                  <p className="text-sm text-gray-600">IGST Amount</p>
                  <p className="text-2xl font-bold text-gray-900">₹{reportData.summary.totalIGST.toLocaleString()}</p>
                </div>
                <TrendingUp className="w-8 h-8 text-amber-500" />
              </div>
            </Card>
          </div>

          {/* B2B Invoices */}
          <Card
            title="B2B Invoices - Summary"
            padding="none"
          >
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">GSTIN</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Party Name</th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Invoices</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Taxable Value</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">CGST</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">SGST</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">IGST</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {reportData.b2b.map((party, index) => (
                    <tr key={index} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{party.gstin}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{party.name}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-center">{party.invoices}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right">₹{party.taxableValue.toLocaleString()}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right">₹{party.cgst.toLocaleString()}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right">₹{party.sgst.toLocaleString()}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right">₹{party.igst.toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          {/* B2C Summary */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card title="B2C Small (Below ₹2.5L)">
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-gray-600">No. of Invoices:</span>
                  <span className="font-medium">{reportData.b2c.small.count}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Taxable Value:</span>
                  <span className="font-medium">₹{reportData.b2c.small.taxableValue.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Total Tax:</span>
                  <span className="font-medium">₹{(reportData.b2c.small.cgst + reportData.b2c.small.sgst).toLocaleString()}</span>
                </div>
              </div>
            </Card>

            <Card title="B2C Large (Above ₹2.5L)">
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span className="text-gray-600">No. of Invoices:</span>
                  <span className="font-medium">{reportData.b2c.large.count}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Taxable Value:</span>
                  <span className="font-medium">₹{reportData.b2c.large.taxableValue.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Total Tax:</span>
                  <span className="font-medium">₹{(reportData.b2c.large.cgst + reportData.b2c.large.sgst).toLocaleString()}</span>
                </div>
              </div>
            </Card>
          </div>
        </div>
      );
    }

    // Placeholder for other reports
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">Report layout for {selectedReport} coming soon...</p>
      </div>
    );
  };

  return (
    <div className="flex-1 flex flex-col bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">GST Reports</h1>
            <p className="text-gray-600 mt-1">Generate and export GST returns and reports</p>
          </div>
          <div className="flex items-center space-x-3">
            <Button
              onClick={() => handleExport('excel')}
              variant="primary"
              icon={<Download className="w-4 h-4" />}
              className="bg-green-600 hover:bg-green-700"
            >
              Export Excel
            </Button>
            <Button
              onClick={() => handleExport('pdf')}
              variant="primary"
              icon={<Printer className="w-4 h-4" />}
            >
              Print PDF
            </Button>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2">
            <Calendar className="w-5 h-5 text-gray-400" />
            <input
              type="date"
              value={dateRange.from}
              onChange={(e) => setDateRange({ ...dateRange, from: e.target.value })}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            />
            <span className="text-gray-500">to</span>
            <input
              type="date"
              value={dateRange.to}
              onChange={(e) => setDateRange({ ...dateRange, to: e.target.value })}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <Button
            onClick={loadReportData}
            variant="secondary"
            icon={<RefreshCw className="w-4 h-4" />}
          >
            Refresh
          </Button>
        </div>
      </div>

      {/* Report Selection */}
      <div className="bg-white border-b border-gray-200 px-6 py-3">
        <div className="flex space-x-2">
          {reportTypes.map((report) => {
            const Icon = report.icon;
            return (
              <button
                key={report.id}
                onClick={() => setSelectedReport(report.id)}
                className={`
                  px-4 py-2 rounded-lg flex items-center space-x-2 transition-colors
                  ${selectedReport === report.id 
                    ? 'bg-gray-900 text-white' 
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }
                `}
              >
                <Icon className="w-4 h-4" />
                <span>{report.name}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Report Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {renderReportContent()}
      </div>
    </div>
  );
};

export default GSTReports;