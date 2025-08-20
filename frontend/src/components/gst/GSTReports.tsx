import React, { useState, useEffect } from 'react';
import { 
  BarChart3, Download, Calendar, Search, Filter,
  FileText, TrendingUp, TrendingDown, IndianRupee,
  Building, Package, Users, Printer, RefreshCw, Loader2, AlertCircle
} from 'lucide-react';
import { Button, DatePicker, Card, DataTable } from '../global';
import { reportsApi } from '../../services/api/modules/reports.api';
import { invoicesApi } from '../../services/api/modules/invoices.api';
import offlineStorage from '../../services/offlineStorage';

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
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
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

  useEffect(() => {
    if (open) {
      loadReportData();
    }
  }, [open, selectedReport, dateRange]);

  const loadReportData = async (): Promise<void> => {
    setLoading(true);
    setError(null);
    
    try {
      let data: GSTR1Data;
      
      switch (selectedReport) {
        case 'gstr1':
          data = await loadGSTR1Data();
          break;
        case 'gstr3b':
          data = await loadGSTR3BData();
          break;
        case 'gstr2b':
          data = await loadGSTR2BData();
          break;
        case 'hsn':
          data = await loadHSNSummaryData();
          break;
        case 'gst-payable':
          data = await loadGSTPayableData();
          break;
        default:
          throw new Error(`Unknown report type: ${selectedReport}`);
      }

      setReportData(data);
      
      // Store data offline for future use
      const storageKey = `gst_report_${selectedReport}_${dateRange.from}_${dateRange.to}`;
      await offlineStorage.storeOffline(storageKey, data, { 
        critical: true, 
        persistent: true 
      });
      
    } catch (err) {
      console.error('Error loading GST report data:', err);
      
      // Try to load from offline storage instead of using mock data
      const storageKey = `gst_report_${selectedReport}_${dateRange.from}_${dateRange.to}`;
      const offlineData = await offlineStorage.getOffline(storageKey, { critical: true });
      
      if (offlineData && !offlineStorage.isDataStale(offlineData, 120)) { // 2 hours max for GST report data
        console.log('📱 Using offline GST report data');
        setReportData(offlineData.data);
        
        // Show offline indicator
        setError('Currently using offline data. Some information may be outdated.');
      } else {
        // No offline data available - show proper error instead of mock data
        setError('Unable to load GST report data. Please check your connection and try again.');
        setReportData(null);
      }
    } finally {
      setLoading(false);
    }
  };

  const loadGSTR1Data = async (): Promise<GSTR1Data> => {
    try {
      const response = await reportsApi.tax.gstR1({
        from_date: dateRange.from,
        to_date: dateRange.to
      });
      
      if (response.data) {
        return transformGSTR1Response(response.data);
      }
      
      throw new Error('Invalid response format from GSTR-1 API');
    } catch (err) {
      console.warn('GSTR-1 API failed, trying invoice data fallback:', err);
      return await loadGSTR1FromInvoices();
    }
  };

  const loadGSTR1FromInvoices = async (): Promise<GSTR1Data> => {
    try {
      const response = await invoicesApi.getAll({
        from_date: dateRange.from,
        to_date: dateRange.to,
        limit: 1000
      });

      if (response.data?.invoices) {
        return transformInvoicesToGSTR1(response.data.invoices);
      }

      throw new Error('No invoice data available');
    } catch (err) {
      console.warn('Invoice API failed, no fallback data available:', err);
      throw new Error('Unable to load GSTR-1 data from any source');
    }
  };

  const loadGSTR3BData = async (): Promise<GSTR1Data> => {
    try {
      const response = await reportsApi.tax.gstR3B({
        from_date: dateRange.from,
        to_date: dateRange.to
      });
      
      if (response.data) {
        return transformGSTR3BResponse(response.data);
      }
      
      throw new Error('Invalid response format from GSTR-3B API');
    } catch (err) {
      console.warn('GSTR-3B API failed:', err);
      throw new Error('Unable to load GSTR-3B data');
    }
  };

  const loadGSTR2BData = async (): Promise<GSTR1Data> => {
    try {
      const response = await reportsApi.tax.gstR2({
        from_date: dateRange.from,
        to_date: dateRange.to
      });
      
      if (response.data) {
        return transformGSTR2BResponse(response.data);
      }
      
      throw new Error('Invalid response format from GSTR-2B API');
    } catch (err) {
      console.warn('GSTR-2B API failed:', err);
      throw new Error('Unable to load GSTR-2B data');
    }
  };

  const loadHSNSummaryData = async (): Promise<GSTR1Data> => {
    try {
      const response = await reportsApi.tax.hsn({
        from_date: dateRange.from,
        to_date: dateRange.to
      });
      
      if (response.data) {
        return transformHSNResponse(response.data);
      }
      
      throw new Error('Invalid response format from HSN API');
    } catch (err) {
      console.warn('HSN API failed:', err);
      throw new Error('Unable to load HSN summary data');
    }
  };

  const loadPartyWiseData = async (): Promise<GSTR1Data> => {
    try {
      const response = await reportsApi.tax.gstSummary({
        from_date: dateRange.from,
        to_date: dateRange.to,
        group_by: 'party'
      });
      
      if (response.data) {
        return transformPartyWiseResponse(response.data);
      }
      
      throw new Error('Invalid response format from party-wise API');
    } catch (err) {
      console.warn('Party-wise API failed, using fallback:', err);
      // Return empty data structure instead of mock data
      return {
        b2b: [],
        b2c: {
          small: { count: 0, taxableValue: 0, cgst: 0, sgst: 0, igst: 0 },
          large: { count: 0, taxableValue: 0, cgst: 0, sgst: 0, igst: 0 }
        },
        summary: {
          totalInvoices: 0,
          totalTaxableValue: 0,
          totalCGST: 0,
          totalSGST: 0,
          totalIGST: 0,
          totalTax: 0
        }
      };
    }
  };

  const loadGSTPayableData = async (): Promise<GSTR1Data> => {
    try {
      const response = await reportsApi.tax.gstSummary({
        from_date: dateRange.from,
        to_date: dateRange.to,
        type: 'payable'
      });
      
      if (response.data) {
        return transformGSTPayableResponse(response.data);
      }
      
      throw new Error('Invalid response format from GST payable API');
    } catch (err) {
      console.warn('GST payable API failed, using fallback:', err);
      // Return empty data structure instead of mock data
      return {
        b2b: [],
        b2c: {
          small: { count: 0, taxableValue: 0, cgst: 0, sgst: 0, igst: 0 },
          large: { count: 0, taxableValue: 0, cgst: 0, sgst: 0, igst: 0 }
        },
        summary: {
          totalInvoices: 0,
          totalTaxableValue: 0,
          totalCGST: 0,
          totalSGST: 0,
          totalIGST: 0,
          totalTax: 0
        }
      };
    }
  };

  const transformGSTR1Response = (data: any): GSTR1Data => {
    // Transform API response to our interface
    return {
      b2b: data.b2b || [],
      b2c: {
        small: data.b2c?.small || { count: 0, taxableValue: 0, cgst: 0, sgst: 0, igst: 0 },
        large: data.b2c?.large || { count: 0, taxableValue: 0, cgst: 0, sgst: 0, igst: 0 }
      },
      summary: data.summary || {
        totalInvoices: 0,
        totalTaxableValue: 0,
        totalCGST: 0,
        totalSGST: 0,
        totalIGST: 0,
        totalTax: 0
      }
    };
  };

  const transformInvoicesToGSTR1 = (invoices: any[]): GSTR1Data => {
    // Transform invoice data to GSTR-1 format
    const b2bInvoices: B2BInvoice[] = [];
    const b2cSmall: B2CData = { count: 0, taxableValue: 0, cgst: 0, sgst: 0, igst: 0 };
    const b2cLarge: B2CData = { count: 0, taxableValue: 0, cgst: 0, sgst: 0, igst: 0 };

    let totalInvoices = 0;
    let totalTaxableValue = 0;
    let totalCGST = 0;
    let totalSGST = 0;
    let totalIGST = 0;

    invoices.forEach(invoice => {
      totalInvoices++;
      const taxableValue = invoice.total_amount || invoice.grand_total || 0;
      totalTaxableValue += taxableValue;

      const cgst = invoice.cgst_amount || 0;
      const sgst = invoice.sgst_amount || 0;
      const igst = invoice.igst_amount || 0;

      totalCGST += cgst;
      totalSGST += sgst;
      totalIGST += igst;

      // Categorize as B2B or B2C based on GSTIN
      if (invoice.customer_gstin || invoice.gstin) {
        // B2B - has GSTIN
        const existingB2B = b2bInvoices.find(b => b.gstin === (invoice.customer_gstin || invoice.gstin));
        if (existingB2B) {
          existingB2B.invoices++;
          existingB2B.taxableValue += taxableValue;
          existingB2B.cgst += cgst;
          existingB2B.sgst += sgst;
          existingB2B.igst += igst;
        } else {
          b2bInvoices.push({
            gstin: invoice.customer_gstin || invoice.gstin,
            name: invoice.customer_name || 'Unknown',
            invoices: 1,
            taxableValue,
            cgst,
            sgst,
            igst
          });
        }
      } else {
        // B2C - no GSTIN
        if (taxableValue <= 250000) {
          b2cSmall.count++;
          b2cSmall.taxableValue += taxableValue;
          b2cSmall.cgst += cgst;
          b2cSmall.sgst += sgst;
          b2cSmall.igst += igst;
        } else {
          b2cLarge.count++;
          b2cLarge.taxableValue += taxableValue;
          b2cLarge.cgst += cgst;
          b2cLarge.sgst += sgst;
          b2cLarge.igst += igst;
        }
      }
    });

    return {
      b2b: b2bInvoices,
      b2c: { small: b2cSmall, large: b2cLarge },
      summary: {
        totalInvoices,
        totalTaxableValue,
        totalCGST,
        totalSGST,
        totalIGST,
        totalTax: totalCGST + totalSGST + totalIGST
      }
    };
  };

  const transformGSTR3BResponse = (data: any): GSTR1Data => {
    // Transform GSTR-3B response
    return transformGSTR1Response(data);
  };

  const transformGSTR2BResponse = (data: any): GSTR1Data => {
    // Transform GSTR-2B response
    return transformGSTR1Response(data);
  };

  const transformHSNResponse = (data: any): GSTR1Data => {
    // Transform HSN response
    return transformGSTR1Response(data);
  };

  const transformPartyWiseResponse = (data: any): GSTR1Data => {
    // Transform party-wise response
    return transformGSTR1Response(data);
  };

  const transformGSTPayableResponse = (data: any): GSTR1Data => {
    // Transform GST payable response
    return transformGSTR1Response(data);
  };

  const handleRefresh = async (): Promise<void> => {
    setRefreshing(true);
    await loadReportData();
    setRefreshing(false);
  };

  const handleExport = async (format: 'excel' | 'pdf'): Promise<void> => {
    try {
      setLoading(true);
      
      const response = await reportsApi.export(selectedReport, {
        from_date: dateRange.from,
        to_date: dateRange.to
      }, format);
      
      // Create download link
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `${selectedReport}-${dateRange.from}-${dateRange.to}.${format}`);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      
      console.log(`${selectedReport.toUpperCase()} exported successfully in ${format} format`);
    } catch (err) {
      console.error('Export failed:', err);
      alert(`Export failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  };

  const renderReportContent = (): React.ReactNode => {
    if (loading) {
      return (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 text-gray-400 animate-spin" />
        </div>
      );
    }

    if (error) {
      return (
        <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
          <AlertCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-red-800 mb-2">Error Loading Report</h3>
          <p className="text-red-700 mb-4">{error}</p>
          <Button
            onClick={handleRefresh}
            variant="secondary"
            icon={<RefreshCw className="w-4 h-4" />}
          >
            Retry
          </Button>
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
              disabled={loading}
            >
              Export Excel
            </Button>
            <Button
              onClick={() => handleExport('pdf')}
              variant="primary"
              icon={<Printer className="w-4 h-4" />}
              disabled={loading}
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
            onClick={handleRefresh}
            variant="secondary"
            icon={refreshing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
            disabled={refreshing || loading}
          >
            {refreshing ? 'Refreshing...' : 'Refresh'}
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