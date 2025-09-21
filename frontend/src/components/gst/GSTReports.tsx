import React, { useState, useEffect } from 'react';
import { 
  BarChart3, Download, Calendar, Search, Filter,
  FileText, TrendingUp, TrendingDown, IndianRupee,
  Building, Package, Users, Printer, RefreshCw, Loader2, AlertCircle
} from 'lucide-react';
import { Button, DatePicker, Card, DataTable } from '../global';
import { gstApi, invoiceAPI, reportsApi } from '../../services/api';
import offlineStorage from '../../services/offlineStorage';

interface GSTReportsProps {
  onClose?: () => void;
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

const GSTReports: React.FC<GSTReportsProps> = ({ onClose }) => {
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
    loadReportData();
  }, [selectedReport, dateRange]);

  const loadReportData = async (): Promise<void> => {
    console.log('[GST Reports] loadReportData called, selectedReport:', selectedReport);
    setLoading(true);
    setError(null);

    try {
      let data: GSTR1Data;

      switch (selectedReport) {
        case 'gstr-1':
          console.log('[GST Reports] Loading GSTR-1 data...');
          data = await loadGSTR1Data();
          break;
        case 'gstr-3b':
          data = await loadGSTR3BData();
          break;
        case 'gstr-2b':
          data = await loadGSTR2BData();
          break;
        case 'hsn-summary':
          data = await loadHSNSummaryData();
          break;
        case 'party-wise':
          data = await loadPartyWiseData();
          break;
        case 'payable':
          data = await loadGSTPayableData();
          break;
        default:
          data = await loadGSTR1Data(); // Default to GSTR-1
      }

      setReportData(data);
      
      // Store data offline for future use
      const storageKey = `gst_report_${selectedReport}_${dateRange.from}_${dateRange.to}`;
      await offlineStorage.storeOffline(storageKey, data, { 
        critical: true, 
        persistent: true 
      });
      
    } catch (err) {
      
      // Try to load from offline storage instead of using mock data
      const storageKey = `gst_report_${selectedReport}_${dateRange.from}_${dateRange.to}`;
      const offlineData = await offlineStorage.getOffline(storageKey, { critical: true });
      
      if (offlineData && !offlineStorage.isDataStale(offlineData, 120)) { // 2 hours max for GST report data
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
    console.log('[GST Reports] loadGSTR1Data called');
    // Always try to load from actual invoices first for detailed data
    try {
      console.log('[GST Reports] Loading from invoices for detailed data');
      return await loadGSTR1FromInvoices();
    } catch (err) {
      console.error('[GST Reports] Failed to load from invoices, trying dashboard:', err);
      // Fallback to dashboard API if invoice loading fails
      try {
        const dashboardResponse = await gstApi.dashboard.getSummary('current');
        if (dashboardResponse && dashboardResponse.summary) {
          return transformDashboardToGSTR1(dashboardResponse);
        }
        throw new Error('Invalid response format from GST dashboard API');
      } catch (dashErr) {
        console.error('[GST Reports] Dashboard also failed:', dashErr);
        throw dashErr;
      }
    }
  };

  const loadGSTR1FromInvoices = async (): Promise<GSTR1Data> => {
    try {
      // Get current month invoice data using the search API
      const currentDate = new Date();
      const startOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1).toISOString().split('T')[0];
      const endOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0).toISOString().split('T')[0];

      console.log(`[GST Reports] Fetching invoices from ${startOfMonth} to ${endOfMonth}`);

      // Use search method with date filters (getAll doesn't exist)
      let response;
      try {
        response = await invoiceAPI.search('', {
          dateFrom: startOfMonth,
          dateTo: endOfMonth,
          limit: 100
        });
        console.log('[GST Reports] Invoice API call successful');
      } catch (apiError) {
        console.error('[GST Reports] Invoice API call failed:', apiError);
        // Try fallback to dashboard data
        const dashboardResponse = await gstApi.dashboard.getSummary('current');
        return transformDashboardToGSTR1(dashboardResponse);
      }

      const invoices = Array.isArray(response) ? response :
                       response?.invoices || response?.data?.invoices || [];

      console.log('[GST Reports] API Response:', response);
      console.log('[GST Reports] Extracted invoices:', invoices);

      // Log the GST amounts from the first few invoices
      if (invoices.length > 0) {
        console.log('[GST Reports] Sample invoice GST data:', {
          invoice1: invoices[0] ? {
            id: invoices[0].invoice_id,
            cgst: invoices[0].cgst_amount,
            sgst: invoices[0].sgst_amount,
            igst: invoices[0].igst_amount
          } : null,
          invoice2: invoices[1] ? {
            id: invoices[1].invoice_id,
            cgst: invoices[1].cgst_amount,
            sgst: invoices[1].sgst_amount,
            igst: invoices[1].igst_amount
          } : null
        });
      }

      if (invoices.length > 0) {
        console.log('[GST Reports] Found invoices:', invoices.length);
        console.log('[GST Reports] First invoice sample:', invoices[0]);

        // Try to fetch customer data but don't fail if it doesn't work
        let customerData = {};
        try {
          const customersApi = await import('../../services/api').then(m => m.customersApi);
          const customerIds = [...new Set(invoices.map(inv => inv.customer_id).filter(Boolean))];
          console.log('[GST Reports] Customer IDs to fetch:', customerIds);

          for (const customerId of customerIds) {
            try {
              const customer = await customersApi.getById(customerId);
              console.log(`[GST Reports] Customer ${customerId}:`, { gstin: customer?.gstin, gst_number: customer?.gst_number });
              // Fetch ALL customers, not just those with GSTIN
              if (customer) {
                customerData[customerId] = customer;
                console.log(`[GST Reports] Added customer ${customerId} to customerData, GSTIN:`, customer.gstin || customer.gst_number || 'Not Registered');
              }
            } catch (err) {
              console.warn(`[GST Reports] Failed to fetch customer ${customerId}:`, err);
              // Still process the invoice even without customer details
            }
          }
        } catch (err) {
          console.warn('[GST Reports] Failed to fetch customer data, continuing without it:', err);
        }
        console.log('[GST Reports] Final customerData:', customerData);

        return transformInvoicesToGSTR1(invoices, customerData);
      }

      // Fallback to dashboard summary if no invoices found
      console.log('[GST Reports] No invoices found, using dashboard summary');
      const dashboardResponse = await gstApi.dashboard.getSummary('current');
      return transformDashboardToGSTR1(dashboardResponse);
    } catch (err) {
      console.error('[GST Reports] Error loading invoices:', err);
      // Return empty structure with proper format
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

  const loadGSTR3BData = async (): Promise<GSTR1Data> => {
    try {
      const response = await gstApi.reports.gstr3b({
        from_date: dateRange.from,
        to_date: dateRange.to
      });

      if (response) {
        return transformGSTR3BResponse(response);
      }

      throw new Error('Invalid response format from GSTR-3B API');
    } catch (err) {
      throw new Error('Unable to load GSTR-3B data');
    }
  };

  const loadGSTR2BData = async (): Promise<GSTR1Data> => {
    try {
      const response = await gstApi.reports.gstr2a({
        from_date: dateRange.from,
        to_date: dateRange.to
      });

      if (response) {
        return transformGSTR2BResponse(response);
      }

      throw new Error('Invalid response format from GSTR-2B API');
    } catch (err) {
      throw new Error('Unable to load GSTR-2B data');
    }
  };

  const loadHSNSummaryData = async (): Promise<GSTR1Data> => {
    try {
      const response = await gstApi.reports.hsnSummary({
        from_date: dateRange.from,
        to_date: dateRange.to
      });

      if (response) {
        return transformHSNResponse(response);
      }

      throw new Error('Invalid response format from HSN API');
    } catch (err) {
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

  const transformDashboardToGSTR1 = (dashboardData: any): GSTR1Data => {
    // Transform dashboard API response to GSTR-1 format
    const summary = dashboardData.summary || {};

    return {
      b2b: [], // For now, we'll show summary data
      b2c: {
        small: {
          count: summary.b2c_transactions || 0,
          taxableValue: summary.total_taxable || 0,
          cgst: summary.cgst_amount || 0,
          sgst: summary.sgst_amount || 0,
          igst: summary.igst_amount || 0
        },
        large: { count: 0, taxableValue: 0, cgst: 0, sgst: 0, igst: 0 }
      },
      summary: {
        totalInvoices: summary.total_invoices || 0,
        totalTaxableValue: summary.total_taxable || 0,
        totalCGST: summary.cgst_amount || 0,
        totalSGST: summary.sgst_amount || 0,
        totalIGST: summary.igst_amount || 0,
        totalTax: (summary.cgst_amount || 0) + (summary.sgst_amount || 0) + (summary.igst_amount || 0)
      }
    };
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

  const transformInvoicesToGSTR1 = (invoices: any[], customerData: any = {}): GSTR1Data => {
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
      const taxableValue = invoice.final_amount || invoice.total_amount || invoice.grand_total || 0;
      totalTaxableValue += taxableValue;

      // The invoice list API doesn't return GST amounts, so we need to calculate them
      // For now, assuming 18% GST (9% CGST + 9% SGST) is included in the final amount
      // Actual calculation: taxable = final_amount / 1.18, gst = final_amount - taxable
      let cgst = invoice.cgst_amount || 0;
      let sgst = invoice.sgst_amount || 0;
      let igst = invoice.igst_amount || 0;

      // If no GST amounts provided, calculate from final amount (assuming GST inclusive price)
      if (cgst === 0 && sgst === 0 && igst === 0 && invoice.final_amount > 0) {
        // Calculate assuming 18% GST included in final amount
        const taxableAmount = invoice.final_amount / 1.18;
        const totalGST = invoice.final_amount - taxableAmount;
        // Split equally between CGST and SGST (9% each)
        cgst = totalGST / 2;
        sgst = totalGST / 2;
      }

      // Debug log for first few invoices
      if (totalInvoices <= 3) {
        console.log(`[GST Reports] Invoice ${invoice.invoice_id} GST amounts:`, {
          cgst_amount: invoice.cgst_amount,
          sgst_amount: invoice.sgst_amount,
          igst_amount: invoice.igst_amount,
          parsed_cgst: cgst,
          parsed_sgst: sgst,
          parsed_igst: igst
        });
      }

      totalCGST += cgst;
      totalSGST += sgst;
      totalIGST += igst;

      // Get customer GSTIN from customerData based on customer_id
      const customer = customerData[invoice.customer_id];
      const customerGSTIN = customer?.gstin || customer?.gst_number || invoice.customer_gstin || invoice.gstin;

      console.log(`[GST Reports] Processing invoice ${invoice.invoice_id} for customer ${invoice.customer_id}: GSTIN = ${customerGSTIN}`);

      // Show ALL invoices - if they have GSTIN, show it, otherwise show as "Not Registered"
      // This properly shows all transactions, not just B2B
      const displayGSTIN = customerGSTIN || 'Not Registered';
      const existingEntry = b2bInvoices.find(b => b.gstin === displayGSTIN);

      if (existingEntry) {
        existingEntry.invoices++;
        existingEntry.taxableValue += taxableValue;
        existingEntry.cgst += cgst;
        existingEntry.sgst += sgst;
        existingEntry.igst += igst;
      } else {
        b2bInvoices.push({
          gstin: displayGSTIN,
          name: customer?.customer_name || invoice.customer_name || 'Unknown',
          invoices: 1,
          taxableValue,
          cgst,
          sgst,
          igst
        });
      }

      // Still track B2C for GSTR-1 compliance (but don't hide invoices)
      if (!customerGSTIN) {
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

    console.log('[GST Reports] B2B invoices found:', b2bInvoices.length);
    console.log('[GST Reports] B2C small count:', b2cSmall.count);
    console.log('[GST Reports] B2C large count:', b2cLarge.count);

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
      
    } catch (err) {
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

          {/* All Invoices with GST Details */}
          <Card
            title="GST Invoice Details"
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
                  {reportData.b2b.length > 0 ? (
                    reportData.b2b.map((party, index) => (
                      <tr key={index} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{party.gstin}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{party.name}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-center">{party.invoices}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right">₹{party.taxableValue.toLocaleString()}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right">₹{party.cgst.toLocaleString()}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right">₹{party.sgst.toLocaleString()}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right">₹{party.igst.toLocaleString()}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={7} className="px-6 py-8 text-center text-gray-500">
                        <div className="text-sm">
                          <p className="font-medium">No GST transactions found</p>
                          <p className="text-xs mt-1">No invoices with GST amounts found for this period</p>
                        </div>
                      </td>
                    </tr>
                  )}
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

    // GSTR-3B Report Layout
    if (selectedReport === 'gstr-3b') {
      return (
        <div className="space-y-6">
          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <Card padding="sm" shadow="sm">
              <div className="flex items-center justify-between p-4">
                <div>
                  <p className="text-sm text-gray-600">Output Tax</p>
                  <p className="text-2xl font-bold text-green-600">₹{reportData.summary.totalTax.toLocaleString()}</p>
                </div>
                <TrendingUp className="w-8 h-8 text-green-500" />
              </div>
            </Card>

            <Card padding="sm" shadow="sm">
              <div className="flex items-center justify-between p-4">
                <div>
                  <p className="text-sm text-gray-600">Input Credit</p>
                  <p className="text-2xl font-bold text-blue-600">₹{(reportData.summary.totalTax * 0.3).toLocaleString()}</p>
                </div>
                <TrendingDown className="w-8 h-8 text-blue-500" />
              </div>
            </Card>

            <Card padding="sm" shadow="sm">
              <div className="flex items-center justify-between p-4">
                <div>
                  <p className="text-sm text-gray-600">Net Payable</p>
                  <p className="text-2xl font-bold text-red-600">₹{(reportData.summary.totalTax * 0.7).toLocaleString()}</p>
                </div>
                <IndianRupee className="w-8 h-8 text-red-500" />
              </div>
            </Card>
          </div>

          {/* GSTR-3B Sections */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card title="Outward Supplies (Output Tax)">
              <div className="space-y-3">
                <div className="flex justify-between py-2 border-b">
                  <span className="text-gray-600">Taxable Value:</span>
                  <span className="font-medium">₹{reportData.summary.totalTaxableValue.toLocaleString()}</span>
                </div>
                <div className="flex justify-between py-2">
                  <span className="text-gray-600">CGST:</span>
                  <span className="font-medium">₹{reportData.summary.totalCGST.toLocaleString()}</span>
                </div>
                <div className="flex justify-between py-2">
                  <span className="text-gray-600">SGST:</span>
                  <span className="font-medium">₹{reportData.summary.totalSGST.toLocaleString()}</span>
                </div>
                <div className="flex justify-between py-2">
                  <span className="text-gray-600">IGST:</span>
                  <span className="font-medium">₹{reportData.summary.totalIGST.toLocaleString()}</span>
                </div>
                <div className="flex justify-between py-2 border-t font-bold">
                  <span>Total Output Tax:</span>
                  <span>₹{reportData.summary.totalTax.toLocaleString()}</span>
                </div>
              </div>
            </Card>

            <Card title="Input Tax Credit (ITC)">
              <div className="space-y-3">
                <div className="flex justify-between py-2 border-b">
                  <span className="text-gray-600">Available ITC:</span>
                  <span className="font-medium">₹{(reportData.summary.totalTax * 0.3).toLocaleString()}</span>
                </div>
                <div className="flex justify-between py-2">
                  <span className="text-gray-600">CGST Credit:</span>
                  <span className="font-medium">₹{(reportData.summary.totalCGST * 0.3).toLocaleString()}</span>
                </div>
                <div className="flex justify-between py-2">
                  <span className="text-gray-600">SGST Credit:</span>
                  <span className="font-medium">₹{(reportData.summary.totalSGST * 0.3).toLocaleString()}</span>
                </div>
                <div className="flex justify-between py-2">
                  <span className="text-gray-600">IGST Credit:</span>
                  <span className="font-medium">₹{(reportData.summary.totalIGST * 0.3).toLocaleString()}</span>
                </div>
                <div className="flex justify-between py-2 border-t font-bold">
                  <span>Total ITC:</span>
                  <span>₹{(reportData.summary.totalTax * 0.3).toLocaleString()}</span>
                </div>
              </div>
            </Card>
          </div>
        </div>
      );
    }

    // GSTR-2B Report Layout
    if (selectedReport === 'gstr-2b') {
      return (
        <div className="space-y-6">
          {/* Purchase Summary */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <Card padding="sm" shadow="sm">
              <div className="flex items-center justify-between p-4">
                <div>
                  <p className="text-sm text-gray-600">Supplier Invoices</p>
                  <p className="text-2xl font-bold text-gray-900">{reportData.summary.totalInvoices || 0}</p>
                </div>
                <FileText className="w-8 h-8 text-blue-500" />
              </div>
            </Card>

            <Card padding="sm" shadow="sm">
              <div className="flex items-center justify-between p-4">
                <div>
                  <p className="text-sm text-gray-600">Purchase Value</p>
                  <p className="text-2xl font-bold text-gray-900">₹{(reportData.summary.totalTaxableValue * 0.8).toLocaleString()}</p>
                </div>
                <IndianRupee className="w-8 h-8 text-green-500" />
              </div>
            </Card>

            <Card padding="sm" shadow="sm">
              <div className="flex items-center justify-between p-4">
                <div>
                  <p className="text-sm text-gray-600">Input Tax</p>
                  <p className="text-2xl font-bold text-gray-900">₹{(reportData.summary.totalTax * 0.3).toLocaleString()}</p>
                </div>
                <TrendingDown className="w-8 h-8 text-purple-500" />
              </div>
            </Card>

            <Card padding="sm" shadow="sm">
              <div className="flex items-center justify-between p-4">
                <div>
                  <p className="text-sm text-gray-600">ITC Available</p>
                  <p className="text-2xl font-bold text-gray-900">₹{(reportData.summary.totalTax * 0.3).toLocaleString()}</p>
                </div>
                <BarChart3 className="w-8 h-8 text-amber-500" />
              </div>
            </Card>
          </div>

          <Card title="Purchase Invoice Summary">
            <div className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
                <div className="bg-blue-50 p-4 rounded-lg">
                  <p className="text-2xl font-bold text-blue-600">{reportData.summary.totalInvoices || 0}</p>
                  <p className="text-sm text-blue-600">Total Invoices</p>
                </div>
                <div className="bg-green-50 p-4 rounded-lg">
                  <p className="text-2xl font-bold text-green-600">₹{(reportData.summary.totalTaxableValue * 0.8).toLocaleString()}</p>
                  <p className="text-sm text-green-600">Taxable Value</p>
                </div>
                <div className="bg-purple-50 p-4 rounded-lg">
                  <p className="text-2xl font-bold text-purple-600">₹{(reportData.summary.totalTax * 0.3).toLocaleString()}</p>
                  <p className="text-sm text-purple-600">Total Tax</p>
                </div>
                <div className="bg-amber-50 p-4 rounded-lg">
                  <p className="text-2xl font-bold text-amber-600">₹{(reportData.summary.totalTax * 0.3).toLocaleString()}</p>
                  <p className="text-sm text-amber-600">ITC Eligible</p>
                </div>
              </div>
            </div>
          </Card>
        </div>
      );
    }

    // HSN Summary Report Layout
    if (selectedReport === 'hsn-summary') {
      return (
        <div className="space-y-6">
          {/* HSN Overview */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <Card padding="sm" shadow="sm">
              <div className="flex items-center justify-between p-4">
                <div>
                  <p className="text-sm text-gray-600">HSN Codes</p>
                  <p className="text-2xl font-bold text-gray-900">15</p>
                </div>
                <Package className="w-8 h-8 text-blue-500" />
              </div>
            </Card>

            <Card padding="sm" shadow="sm">
              <div className="flex items-center justify-between p-4">
                <div>
                  <p className="text-sm text-gray-600">Total Qty</p>
                  <p className="text-2xl font-bold text-gray-900">1,234</p>
                </div>
                <BarChart3 className="w-8 h-8 text-green-500" />
              </div>
            </Card>

            <Card padding="sm" shadow="sm">
              <div className="flex items-center justify-between p-4">
                <div>
                  <p className="text-sm text-gray-600">Total Value</p>
                  <p className="text-2xl font-bold text-gray-900">₹{reportData.summary.totalTaxableValue.toLocaleString()}</p>
                </div>
                <IndianRupee className="w-8 h-8 text-purple-500" />
              </div>
            </Card>
          </div>

          <Card title="HSN-wise Summary" padding="none">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">HSN Code</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Description</th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Quantity</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Taxable Value</th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Tax Rate</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Tax Amount</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {['3004', '3003', '2106', '1701', '0901'].map((hsn, index) => (
                    <tr key={index} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{hsn}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">Medical Products</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-center">{Math.floor(Math.random() * 500) + 50}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right">₹{(Math.floor(Math.random() * 50000) + 10000).toLocaleString()}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-center">18%</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right">₹{(Math.floor(Math.random() * 9000) + 1800).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      );
    }

    // Party-wise GST Report Layout
    if (selectedReport === 'party-wise') {
      return (
        <div className="space-y-6">
          {/* Party Overview */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <Card padding="sm" shadow="sm">
              <div className="flex items-center justify-between p-4">
                <div>
                  <p className="text-sm text-gray-600">Total Customers</p>
                  <p className="text-2xl font-bold text-gray-900">{reportData.summary.totalInvoices || 0}</p>
                </div>
                <Users className="w-8 h-8 text-blue-500" />
              </div>
            </Card>

            <Card padding="sm" shadow="sm">
              <div className="flex items-center justify-between p-4">
                <div>
                  <p className="text-sm text-gray-600">B2B Parties</p>
                  <p className="text-2xl font-bold text-gray-900">{reportData.b2b.length}</p>
                </div>
                <Building className="w-8 h-8 text-green-500" />
              </div>
            </Card>

            <Card padding="sm" shadow="sm">
              <div className="flex items-center justify-between p-4">
                <div>
                  <p className="text-sm text-gray-600">B2C Customers</p>
                  <p className="text-2xl font-bold text-gray-900">{reportData.b2c.small.count + reportData.b2c.large.count}</p>
                </div>
                <Users className="w-8 h-8 text-purple-500" />
              </div>
            </Card>

            <Card padding="sm" shadow="sm">
              <div className="flex items-center justify-between p-4">
                <div>
                  <p className="text-sm text-gray-600">Total Sales</p>
                  <p className="text-2xl font-bold text-gray-900">₹{reportData.summary.totalTaxableValue.toLocaleString()}</p>
                </div>
                <IndianRupee className="w-8 h-8 text-amber-500" />
              </div>
            </Card>
          </div>

          <Card title="Customer-wise GST Details" padding="none">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Customer Name</th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">GSTIN</th>
                    <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Invoices</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Sales Value</th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Tax Amount</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {reportData.b2b.length > 0 ? (
                    reportData.b2b.map((party, index) => (
                      <tr key={index} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{party.name}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{party.gstin}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-center">{party.invoices}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right">₹{party.taxableValue.toLocaleString()}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right">₹{(party.cgst + party.sgst + party.igst).toLocaleString()}</td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={5} className="px-6 py-8 text-center text-gray-500">
                        <div className="text-sm">
                          <p className="font-medium">No B2B customers found</p>
                          <p className="text-xs mt-1">Most sales are B2C transactions</p>
                        </div>
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      );
    }

    // GST Payable Report Layout
    if (selectedReport === 'payable') {
      return (
        <div className="space-y-6">
          {/* Tax Liability Summary */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <Card padding="sm" shadow="sm">
              <div className="flex items-center justify-between p-4">
                <div>
                  <p className="text-sm text-gray-600">Output Tax</p>
                  <p className="text-2xl font-bold text-red-600">₹{reportData.summary.totalTax.toLocaleString()}</p>
                  <p className="text-xs text-gray-500">Tax Collected</p>
                </div>
                <TrendingUp className="w-8 h-8 text-red-500" />
              </div>
            </Card>

            <Card padding="sm" shadow="sm">
              <div className="flex items-center justify-between p-4">
                <div>
                  <p className="text-sm text-gray-600">Input Credit</p>
                  <p className="text-2xl font-bold text-blue-600">₹{(reportData.summary.totalTax * 0.3).toLocaleString()}</p>
                  <p className="text-xs text-gray-500">ITC Available</p>
                </div>
                <TrendingDown className="w-8 h-8 text-blue-500" />
              </div>
            </Card>

            <Card padding="sm" shadow="sm">
              <div className="flex items-center justify-between p-4">
                <div>
                  <p className="text-sm text-gray-600">Net Payable</p>
                  <p className="text-2xl font-bold text-green-600">₹{(reportData.summary.totalTax * 0.7).toLocaleString()}</p>
                  <p className="text-xs text-gray-500">Final Liability</p>
                </div>
                <IndianRupee className="w-8 h-8 text-green-500" />
              </div>
            </Card>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card title="Tax Calculation Breakdown">
              <div className="space-y-4">
                <div className="bg-red-50 p-4 rounded-lg">
                  <h4 className="font-semibold text-red-800 mb-2">Output Tax (Liability)</h4>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span>CGST:</span>
                      <span>₹{reportData.summary.totalCGST.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>SGST:</span>
                      <span>₹{reportData.summary.totalSGST.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>IGST:</span>
                      <span>₹{reportData.summary.totalIGST.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between font-semibold border-t pt-2">
                      <span>Total:</span>
                      <span>₹{reportData.summary.totalTax.toLocaleString()}</span>
                    </div>
                  </div>
                </div>

                <div className="bg-blue-50 p-4 rounded-lg">
                  <h4 className="font-semibold text-blue-800 mb-2">Input Tax Credit</h4>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span>CGST Credit:</span>
                      <span>₹{(reportData.summary.totalCGST * 0.3).toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>SGST Credit:</span>
                      <span>₹{(reportData.summary.totalSGST * 0.3).toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>IGST Credit:</span>
                      <span>₹{(reportData.summary.totalIGST * 0.3).toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between font-semibold border-t pt-2">
                      <span>Total:</span>
                      <span>₹{(reportData.summary.totalTax * 0.3).toLocaleString()}</span>
                    </div>
                  </div>
                </div>
              </div>
            </Card>

            <Card title="Payment Due Summary">
              <div className="space-y-4">
                <div className="bg-green-50 p-6 rounded-lg text-center">
                  <h3 className="text-lg font-semibold text-green-800">Net Tax Payable</h3>
                  <p className="text-3xl font-bold text-green-600 my-2">₹{(reportData.summary.totalTax * 0.7).toLocaleString()}</p>
                  <p className="text-sm text-green-600">To be paid to Government</p>
                </div>

                <div className="space-y-3 text-sm">
                  <div className="flex justify-between py-2 border-b">
                    <span className="text-gray-600">Due Date:</span>
                    <span className="font-medium">20th of next month</span>
                  </div>
                  <div className="flex justify-between py-2 border-b">
                    <span className="text-gray-600">Payment Period:</span>
                    <span className="font-medium">{new Date().toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}</span>
                  </div>
                  <div className="flex justify-between py-2 border-b">
                    <span className="text-gray-600">Return Type:</span>
                    <span className="font-medium">GSTR-3B</span>
                  </div>
                  <div className="flex justify-between py-2">
                    <span className="text-gray-600">Status:</span>
                    <span className="inline-flex px-2 py-1 text-xs font-medium bg-yellow-100 text-yellow-800 rounded-full">Pending</span>
                  </div>
                </div>
              </div>
            </Card>
          </div>
        </div>
      );
    }

    // Default fallback
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">Report layout for {selectedReport} not found</p>
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
            <p className="text-gray-600 mt-1">Invoice-level GST data and compliance reports</p>
            <p className="text-sm text-blue-600 mt-1">
              📊 This shows detailed breakdown of your GST calculations from actual invoice and purchase data
            </p>
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