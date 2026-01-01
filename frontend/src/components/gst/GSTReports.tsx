import React, { useState, useEffect } from 'react';
import {
  BarChart3, Download, Calendar, Search, Filter,
  FileText, TrendingUp, TrendingDown, IndianRupee,
  Building, Package, Users, Printer, RefreshCw, Loader2, AlertCircle
} from 'lucide-react';
import { Button, DatePicker, Card, DataTable } from '../global';
import { gstApi, invoiceAPI, purchasesAPI, reportsApi, apiClient } from '../../services/api';
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
  creditAdjustment?: number;
  debitAdjustment?: number;
  netAdjustment?: number;
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
  const [selectedPeriod, setSelectedPeriod] = useState<string>('current');
  const [dateRange, setDateRange] = useState<DateRange>({
    from: new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0],
    to: new Date().toISOString().split('T')[0]
  });
  const [loading, setLoading] = useState<boolean>(false);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [reportData, setReportData] = useState<GSTR1Data | null>(null);
  const [isLoadingData, setIsLoadingData] = useState<boolean>(false);
  const [purchaseData, setPurchaseData] = useState<any[]>([]);
  const [inputCreditAmount, setInputCreditAmount] = useState<number>(0);
  const [inputCreditBreakdown, setInputCreditBreakdown] = useState<{
    cgst: number;
    sgst: number;
    igst: number;
  }>({ cgst: 0, sgst: 0, igst: 0 });

  // Pagination state for supplier invoices
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(25);
  const [totalInvoices, setTotalInvoices] = useState<number>(0);
  const [hsnSummaryData, setHsnSummaryData] = useState<any[]>([]);
  const [invoiceDataCache, setInvoiceDataCache] = useState<any[]>([]);
  const [invoiceCacheKey, setInvoiceCacheKey] = useState<string>('');

  // Credit/Debit Notes state
  const [creditDebitNotesData, setCreditDebitNotesData] = useState<any[]>([]);
  const [creditDebitSummary, setCreditDebitSummary] = useState<{
    totalCreditNotes: number;
    totalDebitNotes: number;
    totalCreditAmount: number;
    totalDebitAmount: number;
    netAdjustment: number;
    netTaxAdjustment: number;
  }>({
    totalCreditNotes: 0,
    totalDebitNotes: 0,
    totalCreditAmount: 0,
    totalDebitAmount: 0,
    netAdjustment: 0,
    netTaxAdjustment: 0
  });

  // Credit Notes pagination state
  const [creditNotesCurrentPage, setCreditNotesCurrentPage] = useState<number>(1);
  const [creditNotesPageSize, setCreditNotesPageSize] = useState<number>(25);

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

  // Calculate date range based on selected period (using Indian Financial Year: April 1 - March 31)
  const calculateDateRange = (period: string): DateRange => {
    const now = new Date();
    let fromDate, toDate;

    if (period === 'current') {
      // Current month
      fromDate = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
      toDate = now.toISOString().split('T')[0];
    } else if (period === 'previous') {
      // Previous month
      fromDate = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString().split('T')[0];
      toDate = new Date(now.getFullYear(), now.getMonth(), 0).toISOString().split('T')[0];
    } else if (period === 'quarter') {
      // Current financial quarter (based on Indian FY starting April 1)
      const currentMonth = now.getMonth(); // 0-11
      const currentYear = now.getFullYear();

      // Determine financial year start
      const fyStartYear = currentMonth >= 3 ? currentYear : currentYear - 1; // April = month 3

      // Calculate quarter within financial year
      const fyMonth = currentMonth >= 3 ? currentMonth - 3 : currentMonth + 9; // 0-11 within FY
      const quarter = Math.floor(fyMonth / 3); // 0-3

      const quarterStartMonth = quarter * 3 + 3; // Convert back to calendar month
      const quarterStartYear = quarterStartMonth >= 12 ? fyStartYear + 1 : fyStartYear;
      const adjustedQuarterMonth = quarterStartMonth >= 12 ? quarterStartMonth - 12 : quarterStartMonth;

      fromDate = new Date(quarterStartYear, adjustedQuarterMonth, 1).toISOString().split('T')[0];
      toDate = now.toISOString().split('T')[0];
    } else if (period === 'year') {
      // Current financial year (April 1 to March 31)
      const currentMonth = now.getMonth(); // 0-11 (April = 3)
      const currentYear = now.getFullYear();

      if (currentMonth >= 3) {
        // We're in Apr-Dec, so FY started in April of current year
        fromDate = new Date(currentYear, 3, 1).toISOString().split('T')[0]; // April 1st current year
      } else {
        // We're in Jan-Mar, so FY started in April of previous year
        fromDate = new Date(currentYear - 1, 3, 1).toISOString().split('T')[0]; // April 1st previous year
      }
      toDate = now.toISOString().split('T')[0];
    } else {
      // Default to current month
      fromDate = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
      toDate = now.toISOString().split('T')[0];
    }

    console.log(`[GST Reports] calculateDateRange for period '${period}' (Indian FY):`, { from: fromDate, to: toDate });
    return { from: fromDate, to: toDate };
  };

  // Update date range when period changes and clear cache
  useEffect(() => {
    if (selectedPeriod !== 'custom') {
      const newDateRange = calculateDateRange(selectedPeriod);
      setDateRange(newDateRange);
    }
    // Clear cache when date range changes
    setInvoiceDataCache([]);
    setInvoiceCacheKey('');
  }, [selectedPeriod]);

  useEffect(() => {
    setCurrentPage(1); // Reset pagination when report changes
    const timeoutId = setTimeout(() => {
      loadReportData();
    }, 300); // Debounce to prevent rapid successive calls

    return () => clearTimeout(timeoutId);
  }, [selectedReport, dateRange.from, dateRange.to]); // Use specific date values instead of the entire dateRange object

  // Load paginated data for GSTR-2B when pagination state changes (but not on initial load)
  useEffect(() => {
    if (selectedReport === 'gstr-2b' && reportData && totalInvoices > 0 && currentPage > 1) {
      loadPaginatedGSTR2BData(currentPage, pageSize);
    }
  }, [currentPage]);

  // Handle page size changes
  useEffect(() => {
    if (selectedReport === 'gstr-2b' && reportData && totalInvoices > 0 && pageSize !== 25) {
      loadPaginatedGSTR2BData(1, pageSize);
    }
  }, [pageSize]);

  // Reapply credit/debit note adjustments when notes data changes
  useEffect(() => {
    if (reportData && creditDebitNotesData.length > 0) {
      console.log('[GST Reports] Reapplying adjustments due to notes data change');
      const adjustedSummary = applyNoteAdjustments(reportData.summary, creditDebitNotesData);
      setReportData(prev => prev ? {
        ...prev,
        summary: adjustedSummary
      } : null);
    }
  }, [creditDebitNotesData]);

  const loadReportData = async (): Promise<void> => {
    console.log('[GST Reports] loadReportData called, selectedReport:', selectedReport);

    // Prevent multiple simultaneous loads
    if (isLoadingData) {
      console.log('[GST Reports] Already loading data, skipping...');
      return;
    }

    setLoading(true);
    setIsLoadingData(true);
    setError(null);

    try {
      let data: GSTR1Data;

      // Load additional data in parallel for better performance
      const additionalDataPromises: Promise<any>[] = [];

      // Load purchase data for Input Credit calculation (for GSTR-3B and other reports that need it)
      if (['gstr-3b', 'gstr-2b', 'payable'].includes(selectedReport)) {
        additionalDataPromises.push(loadPurchaseInvoicesForInputCredit());
      }

      // Load credit/debit notes for GST reports
      if (['gstr-1', 'gstr-3b'].includes(selectedReport)) {
        additionalDataPromises.push(loadCreditDebitNotes());
      }

      // Load HSN summary data for HSN report
      if (selectedReport === 'hsn-summary') {
        additionalDataPromises.push(loadAdditionalHSNData());
      }

      // Load all additional data in parallel
      if (additionalDataPromises.length > 0) {
        await Promise.all(additionalDataPromises);
      }

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
      setIsLoadingData(false);
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
        const dashboardResponse = await gstApi.dashboard.getSummary('current') as any;
        if (dashboardResponse && (dashboardResponse as any).summary) {
          return transformDashboardToGSTR1(dashboardResponse);
        }
        throw new Error('Invalid response format from GST dashboard API');
      } catch (dashErr) {
        console.error('[GST Reports] Dashboard also failed:', dashErr);
        throw dashErr;
      }
    }
  };

  const loadInvoiceDataOnce = async (): Promise<any[]> => {
    const currentCacheKey = `${dateRange.from}_${dateRange.to}`;

    // Return cached data if available and valid
    if (invoiceCacheKey === currentCacheKey && invoiceDataCache.length > 0) {
      console.log(`[GST Reports] Using cached invoice data: ${invoiceDataCache.length} invoices`);
      return invoiceDataCache;
    }

    try {
      console.log(`[GST Reports] Loading invoice data for period ${dateRange.from} to ${dateRange.to}`);
      const response = await invoiceAPI.search({
        dateFrom: dateRange.from,
        dateTo: dateRange.to,
        limit: 5000
      });

      const invoices = Array.isArray(response) ? response :
        response?.invoices || response?.data?.invoices || [];

      console.log(`[GST Reports] Loaded ${invoices.length} invoices - caching for reuse`);
      setInvoiceDataCache(invoices);
      setInvoiceCacheKey(currentCacheKey);
      return invoices;
    } catch (err) {
      console.error('[GST Reports] Failed to load invoice data:', err);
      return [];
    }
  };

  const loadAdditionalHSNData = async (): Promise<void> => {
    try {
      console.log(`[GST Reports] Loading HSN summary data from cached invoices`);

      // Use cached invoice data
      const invoices = await loadInvoiceDataOnce();

      // Group by HSN code and calculate totals
      const hsnGroups: { [hsn: string]: any } = {};

      invoices.forEach(invoice => {
        const items = invoice.items || [];
        items.forEach((item: any) => {
          const hsn = item.hsn_code || item.hsn || item.product_hsn || 'N/A';
          const quantity = item.quantity || 0;
          const rate = item.rate || item.unit_price || item.price || 0;
          const taxableValue = quantity * rate;
          const taxRate = item.tax_percent || item.gst_percent || 18;
          const taxAmount = (taxableValue * taxRate) / 100;

          if (!hsnGroups[hsn]) {
            hsnGroups[hsn] = {
              hsn_code: hsn,
              description: item.product_name || item.name || 'Product',
              quantity: 0,
              taxable_value: 0,
              tax_rate: taxRate,
              tax_amount: 0
            };
          }

          hsnGroups[hsn].quantity += quantity;
          hsnGroups[hsn].taxable_value += taxableValue;
          hsnGroups[hsn].tax_amount += taxAmount;
        });
      });

      const hsnArray = Object.values(hsnGroups);
      console.log(`[GST Reports] Calculated HSN summary for ${hsnArray.length} HSN codes`);
      setHsnSummaryData(hsnArray);

    } catch (err) {
      console.error('[GST Reports] Failed to load HSN summary data:', err);
      setHsnSummaryData([]);
    }
  };

  const loadPurchaseInvoicesForInputCredit = async (): Promise<void> => {
    try {
      console.log(`[GST Reports] Fetching purchase invoices from ${dateRange.from} to ${dateRange.to} for Input Credit calculation`);

      // Use purchasesAPI search with date filters
      const response = await purchasesAPI.search({
        dateFrom: dateRange.from,
        dateTo: dateRange.to,
        limit: 5000
      });

      const purchases = Array.isArray(response) ? response :
        response?.data?.purchases || response?.data || [];

      console.log(`[GST Reports] Found ${purchases.length} purchase invoices for Input Credit calculation`);

      // Calculate total Input Credit from purchase invoices
      let totalInputCredit = 0;
      let totalCGSTCredit = 0;
      let totalSGSTCredit = 0;
      let totalIGSTCredit = 0;

      purchases.forEach(purchase => {
        // Get GST amounts from purchase data
        const cgst = purchase.cgst_amount || 0;
        const sgst = purchase.sgst_amount || 0;
        const igst = purchase.igst_amount || 0;

        // Input Credit is the total GST paid on purchases
        totalCGSTCredit += cgst;
        totalSGSTCredit += sgst;
        totalIGSTCredit += igst;
        totalInputCredit += cgst + sgst + igst;
      });

      console.log(`[GST Reports] Calculated Input Credit: ₹${totalInputCredit.toLocaleString()} (CGST: ₹${totalCGSTCredit}, SGST: ₹${totalSGSTCredit}, IGST: ₹${totalIGSTCredit})`);

      setPurchaseData(purchases);
      setInputCreditAmount(totalInputCredit);
      setInputCreditBreakdown({
        cgst: totalCGSTCredit,
        sgst: totalSGSTCredit,
        igst: totalIGSTCredit
      });

    } catch (err) {
      console.error('[GST Reports] Failed to load purchase invoices for Input Credit:', err);
      // Set to 0 instead of using fallback calculation
      setInputCreditAmount(0);
      setPurchaseData([]);
      setInputCreditBreakdown({ cgst: 0, sgst: 0, igst: 0 });
    }
  };

  const loadCreditDebitNotes = async (): Promise<void> => {
    try {
      console.log(`[GST Reports] Loading credit/debit notes from ${dateRange.from} to ${dateRange.to}`);

      const response = await gstApi.reports.creditDebitNotes({
        from_date: dateRange.from,
        to_date: dateRange.to,
        note_type: 'all'
      });

      console.log('[GST Reports] Credit/Debit Notes API Response:', response);

      const notes = response.notes || [];
      const summary = response.summary || {};

      console.log(`[GST Reports] Found ${notes.length} credit/debit notes`);

      // Debug: Check the structure of the first note
      if (notes.length > 0) {
        console.log('[GST Reports] Sample note structure:', notes[0]);
        console.log('[GST Reports] Credit notes count:', notes.filter(n => n.note_type === 'credit').length);
        console.log('[GST Reports] Debit notes count:', notes.filter(n => n.note_type === 'debit').length);
      }

      setCreditDebitNotesData(notes);
      setCreditDebitSummary({
        totalCreditNotes: summary.totalCreditNotes || 0,
        totalDebitNotes: summary.totalDebitNotes || 0,
        totalCreditAmount: summary.totalCreditAmount || 0,
        totalDebitAmount: summary.totalDebitAmount || 0,
        netAdjustment: summary.netAdjustment || 0,
        netTaxAdjustment: summary.netTaxAdjustment || 0
      });

    } catch (err) {
      console.error('[GST Reports] Failed to load credit/debit notes:', err);
      setCreditDebitNotesData([]);
      setCreditDebitSummary({
        totalCreditNotes: 0,
        totalDebitNotes: 0,
        totalCreditAmount: 0,
        totalDebitAmount: 0,
        netAdjustment: 0,
        netTaxAdjustment: 0
      });
    }
  };

  const loadGSTR1FromInvoices = async (): Promise<GSTR1Data> => {
    try {
      // Use cached invoice data to avoid duplicate API calls
      console.log(`[GST Reports] Loading GSTR1 data from cached invoices`);

      let invoices;
      try {
        invoices = await loadInvoiceDataOnce();
        console.log('[GST Reports] Using cached invoice data for GSTR1');
      } catch (apiError) {
        console.error('[GST Reports] Failed to load invoice data:', apiError);
        // Try fallback to dashboard data
        const dashboardResponse = await gstApi.dashboard.getSummary(selectedPeriod);
        return transformDashboardToGSTR1(dashboardResponse);
      }

      console.log(`[GST Reports] Found ${invoices.length} invoices for period ${dateRange.from} to ${dateRange.to}`);

      // Debug: Show unique customers and their names
      const uniqueCustomers = [...new Set(invoices.map(inv => inv.customer_id))];
      const customerSample = uniqueCustomers.map(id => {
        const sampleInv = invoices.find(inv => inv.customer_id === id);
        return `${sampleInv?.customer_name} (ID: ${id})`;
      });
      console.log(`[GST Reports] Unique customers: ${uniqueCustomers.length}`);
      console.log(`[GST Reports] Customer list: ${customerSample.join(', ')}`);

      // Quick sample check for debugging
      if (invoices.length > 0) {
        console.log(`[GST Reports] Sample: Invoice ${invoices[0].invoice_id} - ${invoices[0].customer_name} (ID: ${invoices[0].customer_id})`);
      }

      if (invoices.length > 0) {

        // Try to fetch customer data but don't fail if it doesn't work
        let customerData = {};
        try {
          const customersApi = await import('../../services/api').then(m => m.customersApi);
          const customerIds = [...new Set(invoices.map(inv => inv.customer_id).filter(Boolean))];
          console.log(`[GST Reports] Fetching ${customerIds.length} customers: ${customerIds.join(', ')}`);

          let customersWithGSTIN = 0;
          let customersWithoutGSTIN = 0;

          for (const customerId of customerIds) {
            try {
              const customer = await customersApi.getById(customerId);
              // Extract the actual customer data from the API response
              const customerData_obj = customer?.data || customer;

              if (customerData_obj) {
                customerData[customerId as string] = customerData_obj;
                const possibleGSTIN = customerData_obj.gstin || customerData_obj.gst_number || customerData_obj.gst_no || customerData_obj.gstin_number || customerData_obj.tax_number || customerData_obj.customer_gstin;

                if (possibleGSTIN) {
                  customersWithGSTIN++;
                  console.log(`[GST Reports] ${customerData_obj.customer_name} (${customerId}): GSTIN: ${possibleGSTIN}`);
                } else {
                  customersWithoutGSTIN++;
                  console.log(`[GST Reports] ${customerData_obj.customer_name} (${customerId}): NO GSTIN`);
                }
              }
            } catch (err) {
              console.warn(`[GST Reports] Failed to fetch customer ${customerId}:`, err);
              // Still process the invoice even without customer details
            }
          }
          console.log(`[GST Reports] Customer Summary: ${customersWithGSTIN} with GSTIN, ${customersWithoutGSTIN} without GSTIN`);
        } catch (err) {
          console.warn('[GST Reports] Failed to fetch customer data, continuing without it:', err);
        }

        const baseData = transformInvoicesToGSTR1(invoices, customerData);
        // Apply credit/debit note adjustments
        const adjustedSummary = applyNoteAdjustments(baseData.summary, creditDebitNotesData);
        return {
          ...baseData,
          summary: adjustedSummary
        };
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
      // GSTR-3B uses the same invoice data as GSTR-1 but formatted differently
      // For now, let's use the same data source as GSTR-1
      console.log('[GST Reports] Loading GSTR-3B data from invoices...');
      return await loadGSTR1FromInvoices();
    } catch (err) {
      console.error('[GST Reports] GSTR-3B loading failed:', err);
      throw new Error('Unable to load GSTR-3B data');
    }
  };

  const loadGSTR2BData = async (): Promise<GSTR1Data> => {
    try {
      // Get full data for summary and first page
      const allResponse = await gstApi.reports.gstr2a({
        from_date: dateRange.from,
        to_date: dateRange.to
      });

      if (allResponse) {
        const totalCount = allResponse.summary?.totalInvoices || allResponse.invoices?.length || 0;
        setTotalInvoices(totalCount);

        // For initial load, show first page of data
        const invoices = allResponse.invoices || [];
        const firstPageInvoices = invoices.slice(0, pageSize);

        const transformedData = transformGSTR2BResponse({
          invoices: firstPageInvoices,
          summary: allResponse.summary
        });

        return transformedData;
      }

      throw new Error('Invalid response format from GSTR-2B API');
    } catch (err) {
      throw new Error('Unable to load GSTR-2B data');
    }
  };

  // Separate function to load paginated data for the table
  const loadPaginatedGSTR2BData = async (page: number = currentPage, size: number = pageSize) => {
    try {
      setIsLoadingData(true);
      const skip = (page - 1) * size;

      // Use supplier-invoices endpoint directly for pagination
      const response = await apiClient.get('/supplier-invoices/', {
        params: {
          from_date: dateRange.from,
          to_date: dateRange.to,
          limit: size,
          skip: skip
        }
      });

      const invoices = response.data || [];

      // Transform for display
      const paginatedData = transformGSTR2BResponse({
        invoices: invoices,
        summary: {
          totalInvoices: totalInvoices,
          totalTaxableValue: invoices.reduce((sum: number, inv: any) => sum + (inv.taxable_amount || 0), 0),
          totalCGST: invoices.reduce((sum: number, inv: any) => sum + (inv.cgst_amount || 0), 0),
          totalSGST: invoices.reduce((sum: number, inv: any) => sum + (inv.sgst_amount || 0), 0),
          totalIGST: invoices.reduce((sum: number, inv: any) => sum + (inv.igst_amount || 0), 0),
          totalITC: invoices.reduce((sum: number, inv: any) => sum + (inv.tax_amount || 0), 0)
        }
      });

      setReportData(prevData => ({
        ...prevData,
        b2b: paginatedData.b2b,
        summary: prevData?.summary || paginatedData.summary,
        b2c: prevData?.b2c
      } as any));

      setIsLoadingData(false);
    } catch (err) {
      console.error('Error loading paginated GSTR-2B data:', err);
      setIsLoadingData(false);
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
      // Use real invoice data for party-wise GST summary
      const invoices = await loadInvoiceDataOnce();

      // Group by party and calculate GST amounts
      const partyGroups: { [key: string]: any } = {};
      invoices.forEach(invoice => {
        const partyName = invoice.customer_name || 'Unknown Party';
        if (!partyGroups[partyName]) {
          partyGroups[partyName] = {
            party_name: partyName,
            gstin: invoice.customer_gstin || '',
            total_taxable_value: 0,
            total_cgst: 0,
            total_sgst: 0,
            total_igst: 0,
            total_tax: 0
          };
        }

        const group = partyGroups[partyName];
        group.total_taxable_value += invoice.subtotal_amount || 0;
        group.total_cgst += invoice.cgst_amount || 0;
        group.total_sgst += invoice.sgst_amount || 0;
        group.total_igst += invoice.igst_amount || 0;
        group.total_tax += (invoice.cgst_amount || 0) + (invoice.sgst_amount || 0) + (invoice.igst_amount || 0);
      });

      const partyWiseData = Object.values(partyGroups);

      return {
        b2b: partyWiseData,
        b2c: {
          small: { count: 0, taxableValue: 0, cgst: 0, sgst: 0, igst: 0 },
          large: { count: 0, taxableValue: 0, cgst: 0, sgst: 0, igst: 0 }
        },
        hsn: [],
        exempted: []
      } as any;
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
      // Use real invoice data for GST payable calculation
      const invoices = await loadInvoiceDataOnce();

      // Calculate total payable GST
      let totalTaxableValue = 0;
      let totalCGST = 0;
      let totalSGST = 0;
      let totalIGST = 0;

      invoices.forEach(invoice => {
        totalTaxableValue += invoice.subtotal_amount || 0;
        totalCGST += invoice.cgst_amount || 0;
        totalSGST += invoice.sgst_amount || 0;
        totalIGST += invoice.igst_amount || 0;
      });

      return {
        b2b: [{
          gstin: 'CONSOLIDATED',
          name: 'All Suppliers',
          invoices: invoices.length,
          taxableValue: totalTaxableValue,
          cgst: totalCGST,
          sgst: totalSGST,
          igst: totalIGST
        }],
        b2c: {
          small: { count: 0, taxableValue: 0, cgst: 0, sgst: 0, igst: 0 },
          large: { count: 0, taxableValue: 0, cgst: 0, sgst: 0, igst: 0 }
        },
        hsn: [],
        exempted: []
      } as any;
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

  // Function to apply credit/debit note adjustments to GST summary
  const applyNoteAdjustments = (summary: GSTSummary, notes: any[]): GSTSummary => {
    console.log('[GST Reports] Applying adjustments:', { notesCount: notes?.length, summary });

    if (!notes || notes.length === 0) {
      console.log('[GST Reports] No notes to apply adjustments');
      return summary;
    }

    const creditNotes = notes.filter(note => note.note_type === 'credit');
    const debitNotes = notes.filter(note => note.note_type === 'debit');

    console.log('[GST Reports] Credit notes:', creditNotes.length, 'Debit notes:', debitNotes.length);

    // Calculate credit note reductions (reduce output tax)
    const creditReduction = creditNotes.reduce((total, note) => {
      // Try different field names for tax amount
      const taxAmount = note.tax_amount ||
        (note.cgst_amount || 0) + (note.sgst_amount || 0) + (note.igst_amount || 0) ||
        note.total_gst || note.gst_amount || 0;
      console.log('[GST Reports] Credit note tax amount:', taxAmount, 'from note:', note);
      return total + taxAmount;
    }, 0);

    // Calculate debit note additions (add to output tax)
    const debitAddition = debitNotes.reduce((total, note) => {
      // Try different field names for tax amount
      const taxAmount = note.tax_amount ||
        (note.cgst_amount || 0) + (note.sgst_amount || 0) + (note.igst_amount || 0) ||
        note.total_gst || note.gst_amount || 0;
      console.log('[GST Reports] Debit note tax amount:', taxAmount, 'from note:', note);
      return total + taxAmount;
    }, 0);

    console.log('[GST Reports] Calculated adjustments:', { creditReduction, debitAddition });

    // Calculate net taxable value adjustments
    const creditTaxableReduction = creditNotes.reduce((total, note) => {
      return total + (note.taxable_amount || 0);
    }, 0);

    const debitTaxableAddition = debitNotes.reduce((total, note) => {
      return total + (note.taxable_amount || 0);
    }, 0);

    return {
      ...summary,
      totalTaxableValue: summary.totalTaxableValue - creditTaxableReduction + debitTaxableAddition,
      totalTax: summary.totalTax - creditReduction + debitAddition,
      totalCGST: summary.totalCGST - (creditReduction / 2) + (debitAddition / 2), // Assuming CGST/SGST split
      totalSGST: summary.totalSGST - (creditReduction / 2) + (debitAddition / 2),
      // Store adjustments for display
      creditAdjustment: creditReduction,
      debitAdjustment: debitAddition,
      netAdjustment: debitAddition - creditReduction
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
      // Use subtotal (before tax) for B2C classification, but final_amount for aggregated display
      const subtotalAmount = invoice.subtotal_amount || invoice.taxable_amount || 0;
      const finalAmount = invoice.final_amount || invoice.total_amount || invoice.grand_total || 0;

      // For GSTR-1, we show final amounts but classify B2C based on taxable amounts
      const taxableValue = finalAmount;
      totalTaxableValue += taxableValue;

      // Get GST amounts from invoice data (backend now provides these)
      const cgst = invoice.cgst_amount || 0;
      const sgst = invoice.sgst_amount || 0;
      const igst = invoice.igst_amount || 0;

      // Log GST amounts for debugging (first invoice only)
      if (totalInvoices === 1) {
        console.log(`[GST Reports] GST amounts sample - CGST: ₹${cgst}, SGST: ₹${sgst}, IGST: ₹${igst}`);
      }

      totalCGST += cgst;
      totalSGST += sgst;
      totalIGST += igst;

      // Get customer GSTIN from customerData based on customer_id
      const customer = customerData[invoice.customer_id];
      const invoiceCustomerName = invoice.customer_name || 'Unknown';
      const masterCustomerName = customer?.customer_name || 'Unknown';

      // Only use the fetched customer GSTIN if the invoice customer name matches the master customer name
      // This prevents applying wrong GSTIN to invoices with mismatched customer names
      let customerGSTIN;
      if (invoiceCustomerName === masterCustomerName) {
        // Names match - use the customer's GSTIN
        customerGSTIN = customer?.gstin ||
          customer?.gst_number ||
          customer?.gst_no ||
          customer?.gstin_number ||
          customer?.tax_number ||
          customer?.customer_gstin ||
          invoice.customer_gstin ||
          invoice.gstin;
      } else {
        // Names don't match - only use invoice-level GSTIN fields (usually null)
        customerGSTIN = invoice.customer_gstin || invoice.gstin;
        console.log(`[GST Reports] Name mismatch - Invoice: "${invoiceCustomerName}" vs Master: "${masterCustomerName}" - using invoice GSTIN only`);
      }

      const customerName = invoiceCustomerName;

      // Only log first few invoices and unique customers for debugging
      if (totalInvoices <= 5) {
        console.log(`[GST Reports] Invoice ${invoice.invoice_id}: ${customerName} (ID: ${invoice.customer_id}) - GSTIN: ${customerGSTIN || 'None'}`);
      }

      // Show ALL customers in the main table - both with and without GSTIN
      const displayGSTIN = customerGSTIN || 'Not Registered';

      // Group by customer name AND GSTIN to handle data inconsistencies
      // This ensures that even if the same customer_id has different names in different invoices,
      // they appear as separate entries (which reflects the invoice-level data)
      const existingEntry = b2bInvoices.find(b => {
        if (customerGSTIN) {
          // Customers with GSTIN: group by both GSTIN AND name to handle data inconsistencies
          return b.gstin === displayGSTIN && b.name === customerName;
        } else {
          // Customers without GSTIN: group by name only
          return b.gstin === displayGSTIN && b.name === customerName;
        }
      });

      if (existingEntry) {
        existingEntry.invoices++;
        existingEntry.taxableValue += taxableValue;
        existingEntry.cgst += cgst;
        existingEntry.sgst += sgst;
        existingEntry.igst += igst;
      } else {
        // Always add to the main B2B table (whether they have GSTIN or not)
        b2bInvoices.push({
          gstin: displayGSTIN,
          name: customerName,
          invoices: 1,
          taxableValue,
          cgst,
          sgst,
          igst
        });
      }

      // Still track B2C for GSTR-1 compliance (but don't hide invoices)
      if (!customerGSTIN) {
        // B2C - no GSTIN, classify based on taxable amount (excluding tax)
        if (subtotalAmount <= 250000) {
          b2cSmall.count++;
          b2cSmall.taxableValue += subtotalAmount; // Use taxable amount for B2C
          b2cSmall.cgst += cgst;
          b2cSmall.sgst += sgst;
          b2cSmall.igst += igst;
        } else {
          b2cLarge.count++;
          b2cLarge.taxableValue += subtotalAmount; // Use taxable amount for B2C
          b2cLarge.cgst += cgst;
          b2cLarge.sgst += sgst;
          b2cLarge.igst += igst;
        }
      }
    });

    console.log(`[GST Reports] Summary: ${b2bInvoices.length} B2B parties, ${b2cSmall.count + b2cLarge.count} B2C invoices`);
    console.log(`[GST Reports] Final B2B parties:`, b2bInvoices.map(b => `${b.name} (GSTIN: ${b.gstin})`));

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
    // Transform GSTR-2B response (supplier invoices for input credit)
    const invoices = data.invoices || [];
    const summary = data.summary || {};

    // Map supplier invoices to B2B structure for display
    const b2bInvoices = invoices.map((inv: any) => ({
      supplier_name: inv.supplier_name,
      supplier_gstin: inv.supplier_gstin,
      invoice_number: inv.supplier_invoice_number,
      invoice_date: inv.invoice_date,
      invoice_value: inv.invoice_total || 0,
      taxable_value: inv.taxable_amount || 0,
      cgst_amount: inv.cgst_amount || 0,
      sgst_amount: inv.sgst_amount || 0,
      igst_amount: inv.igst_amount || 0,
      tax_amount: inv.tax_amount || 0,
      itc_eligible: inv.itc_eligible
    }));

    return {
      b2b: b2bInvoices,
      b2c: {
        small: { count: 0, taxableValue: 0, cgst: 0, sgst: 0, igst: 0 },
        large: { count: 0, taxableValue: 0, cgst: 0, sgst: 0, igst: 0 }
      },
      summary: {
        totalInvoices: summary.totalInvoices || invoices.length,
        totalTaxableValue: summary.totalTaxableValue || 0,
        totalCGST: summary.totalCGST || 0,
        totalSGST: summary.totalSGST || 0,
        totalIGST: summary.totalIGST || 0,
        totalTax: summary.totalITC || summary.totalTax || 0
      }
    };
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

  const getCurrentReportData = async () => {
    switch (selectedReport) {
      case 'gstr-1':
        return await loadGSTR1Data();
      case 'gstr-3b':
        return await loadGSTR3BData();
      case 'gstr-2b':
        return await loadGSTR2BData();
      case 'party-wise':
        return await loadPartyWiseData();
      case 'gst-payable':
        return await loadGSTPayableData();
      default:
        return null;
    }
  };

  const handleExport = async (format: 'excel' | 'pdf'): Promise<void> => {
    try {
      setLoading(true);

      // Generate CSV export from current data
      const data = await getCurrentReportData();
      if (!data || (Array.isArray(data.b2b) && data.b2b.length === 0)) {
        alert('No data available to export. Please ensure data is loaded first.');
        return;
      }

      // Create CSV content
      let csvContent = '';
      if (selectedReport === 'gstr-1') {
        csvContent = 'Customer Name,GSTIN,Invoice No,Invoice Date,Taxable Value,CGST,SGST,IGST,Total Tax\n';
        data.b2b.forEach((item: any) => {
          csvContent += `"${item.party_name || ''}","${item.gstin || ''}","${item.invoice_no || ''}","${item.invoice_date || ''}",${item.total_taxable_value || 0},${item.total_cgst || 0},${item.total_sgst || 0},${item.total_igst || 0},${item.total_tax || 0}\n`;
        });
      } else if (selectedReport === 'hsn-summary') {
        csvContent = 'HSN Code,Description,UQC,Total Quantity,Total Value,Taxable Value,CGST,SGST,IGST,Total Tax\n';
        hsnSummaryData.forEach((item: any) => {
          csvContent += `"${item.hsn_code}","${item.description}","${item.uqc}",${item.total_quantity},${item.total_value},${item.taxable_value},${item.cgst_amount},${item.sgst_amount},${item.igst_amount},${item.total_tax}\n`;
        });
      }

      // Create and download file
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `${selectedReport}-${dateRange.from}-${dateRange.to}.csv`);
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
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4 mb-6">
            <Card padding="sm" shadow="sm">
              <div className="p-3 text-center">
                <p className="text-xs text-gray-600">Invoices</p>
                <p className="text-lg font-bold text-gray-900">{reportData.summary?.totalInvoices || 0}</p>
              </div>
            </Card>

            <Card padding="sm" shadow="sm">
              <div className="p-3 text-center">
                <p className="text-xs text-gray-600">Taxable Value</p>
                <p className="text-lg font-bold text-gray-900">₹{(reportData.summary?.totalTaxableValue || 0).toLocaleString()}</p>
              </div>
            </Card>

            <Card padding="sm" shadow="sm">
              <div className="p-3 text-center">
                <p className="text-xs text-gray-600">Original GST</p>
                <p className="text-lg font-bold text-gray-900">₹{((reportData.summary?.totalTax || 0) + (reportData.summary?.creditAdjustment || 0) - (reportData.summary?.debitAdjustment || 0)).toLocaleString()}</p>
              </div>
            </Card>

            <Card padding="sm" shadow="sm">
              <div className="p-3 text-center">
                <p className="text-xs text-green-600">Credit Reduction</p>
                <p className="text-lg font-bold text-green-600">-₹{(reportData.summary?.creditAdjustment || 0).toLocaleString()}</p>
              </div>
            </Card>

            <Card padding="sm" shadow="sm">
              <div className="p-3 text-center">
                <p className="text-xs text-red-600">Debit Addition</p>
                <p className="text-lg font-bold text-red-600">+₹{(reportData.summary?.debitAdjustment || 0).toLocaleString()}</p>
              </div>
            </Card>

            <Card padding="sm" shadow="sm">
              <div className="p-3 text-center">
                <p className="text-xs text-purple-600">Net GST</p>
                <p className="text-lg font-bold text-purple-600">₹{(reportData.summary?.totalTax || 0).toLocaleString()}</p>
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
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right">₹{(party.taxableValue || 0).toLocaleString()}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right">₹{(party.cgst || 0).toLocaleString()}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right">₹{(party.sgst || 0).toLocaleString()}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right">₹{(party.igst || 0).toLocaleString()}</td>
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

          {/* Credit Notes Section */}
          {creditDebitNotesData.filter(note => note.note_type === 'credit').length > 0 && (
            <Card title="Credit Notes Issued" className="mt-6">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Credit Note No.</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Customer</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Reason</th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Amount</th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Tax Reduction</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {(() => {
                      const creditNotes = creditDebitNotesData.filter(note => note.note_type === 'credit');
                      const startIndex = (creditNotesCurrentPage - 1) * creditNotesPageSize;
                      const endIndex = startIndex + creditNotesPageSize;
                      const paginatedNotes = creditNotes.slice(startIndex, endIndex);

                      return paginatedNotes.map((note: any, index: number) => (
                        <tr key={index} className="hover:bg-gray-50">
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                            {note.note_number || note.credit_note_number}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {note.note_date || note.credit_note_date || note.return_date}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {note.customer_name || 'N/A'}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                            {note.reason || note.return_reason || 'Adjustment'}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right">
                            ₹{(note.amount || note.return_amount || 0).toLocaleString()}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-red-600 text-right">
                            -₹{(note.tax_amount || 0).toLocaleString()}
                          </td>
                        </tr>
                      ));
                    })()}
                  </tbody>
                </table>
                <div className="bg-gray-50 px-6 py-3">
                  <div className="flex justify-between text-sm font-medium">
                    <span>Total Credit Notes: {creditDebitNotesData.filter(note => note.note_type === 'credit').length}</span>
                    <span className="text-red-600">
                      Tax Reduction: -₹{creditDebitNotesData
                        .filter(note => note.note_type === 'credit')
                        .reduce((sum, note) => sum + (note.tax_amount || 0), 0)
                        .toLocaleString()}
                    </span>
                  </div>
                </div>

                {/* Credit Notes Pagination */}
                {(() => {
                  const creditNotes = creditDebitNotesData.filter(note => note.note_type === 'credit');
                  const totalCreditNotes = creditNotes.length;

                  if (totalCreditNotes > creditNotesPageSize) {
                    return (
                      <div className="bg-white px-6 py-3 flex items-center justify-between border-t border-gray-200">
                        <div className="flex items-center space-x-2">
                          <span className="text-sm text-gray-700">
                            Showing {Math.min((creditNotesCurrentPage - 1) * creditNotesPageSize + 1, totalCreditNotes)} to{' '}
                            {Math.min(creditNotesCurrentPage * creditNotesPageSize, totalCreditNotes)} of {totalCreditNotes} credit notes
                          </span>
                          <select
                            value={creditNotesPageSize}
                            onChange={(e) => {
                              setCreditNotesPageSize(Number(e.target.value));
                              setCreditNotesCurrentPage(1);
                            }}
                            className="border rounded px-2 py-1 text-sm"
                          >
                            <option value={25}>25 per page</option>
                            <option value={50}>50 per page</option>
                            <option value={100}>100 per page</option>
                          </select>
                        </div>

                        <div className="flex items-center space-x-2">
                          <button
                            onClick={() => setCreditNotesCurrentPage(prev => Math.max(1, prev - 1))}
                            disabled={creditNotesCurrentPage <= 1}
                            className="px-3 py-1 text-sm border rounded disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
                          >
                            Previous
                          </button>

                          {/* Page numbers */}
                          {Math.ceil(totalCreditNotes / creditNotesPageSize) > 1 && (
                            <div className="flex space-x-1">
                              {Array.from({ length: Math.min(5, Math.ceil(totalCreditNotes / creditNotesPageSize)) }, (_, i) => {
                                const totalPages = Math.ceil(totalCreditNotes / creditNotesPageSize);
                                let pageNum;

                                if (totalPages <= 5) {
                                  pageNum = i + 1;
                                } else if (creditNotesCurrentPage <= 3) {
                                  pageNum = i + 1;
                                } else if (creditNotesCurrentPage >= totalPages - 2) {
                                  pageNum = totalPages - 4 + i;
                                } else {
                                  pageNum = creditNotesCurrentPage - 2 + i;
                                }

                                return (
                                  <button
                                    key={pageNum}
                                    onClick={() => setCreditNotesCurrentPage(pageNum)}
                                    className={`px-3 py-1 text-sm border rounded ${creditNotesCurrentPage === pageNum
                                      ? 'bg-blue-500 text-white border-blue-500'
                                      : 'hover:bg-gray-50'
                                      }`}
                                  >
                                    {pageNum}
                                  </button>
                                );
                              })}
                            </div>
                          )}

                          <button
                            onClick={() => setCreditNotesCurrentPage(prev =>
                              Math.min(Math.ceil(totalCreditNotes / creditNotesPageSize), prev + 1)
                            )}
                            disabled={creditNotesCurrentPage >= Math.ceil(totalCreditNotes / creditNotesPageSize)}
                            className="px-3 py-1 text-sm border rounded disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-50"
                          >
                            Next
                          </button>
                        </div>
                      </div>
                    );
                  }
                  return null;
                })()}
              </div>
            </Card>
          )}

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
                  <span className="font-medium">₹{(reportData.b2c.small.taxableValue || 0).toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Total Tax:</span>
                  <span className="font-medium">₹{((reportData.b2c.small.cgst || 0) + (reportData.b2c.small.sgst || 0)).toLocaleString()}</span>
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
                  <span className="font-medium">₹{(reportData.b2c.large.taxableValue || 0).toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Total Tax:</span>
                  <span className="font-medium">₹{((reportData.b2c.large.cgst || 0) + (reportData.b2c.large.sgst || 0)).toLocaleString()}</span>
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
                  <p className="text-2xl font-bold text-blue-600">₹{inputCreditAmount.toLocaleString()}</p>
                </div>
                <TrendingDown className="w-8 h-8 text-blue-500" />
              </div>
            </Card>

            <Card padding="sm" shadow="sm">
              <div className="flex items-center justify-between p-4">
                <div>
                  <p className="text-sm text-gray-600">Net Payable</p>
                  <p className="text-2xl font-bold text-red-600">₹{Math.max(0, reportData.summary.totalTax - inputCreditAmount).toLocaleString()}</p>
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
                  <span className="font-medium">₹{inputCreditAmount.toLocaleString()}</span>
                </div>
                <div className="flex justify-between py-2">
                  <span className="text-gray-600">CGST Credit:</span>
                  <span className="font-medium">₹{inputCreditBreakdown.cgst.toLocaleString()}</span>
                </div>
                <div className="flex justify-between py-2">
                  <span className="text-gray-600">SGST Credit:</span>
                  <span className="font-medium">₹{inputCreditBreakdown.sgst.toLocaleString()}</span>
                </div>
                <div className="flex justify-between py-2">
                  <span className="text-gray-600">IGST Credit:</span>
                  <span className="font-medium">₹{inputCreditBreakdown.igst.toLocaleString()}</span>
                </div>
                <div className="flex justify-between py-2 border-t font-bold">
                  <span>Total ITC:</span>
                  <span>₹{inputCreditAmount.toLocaleString()}</span>
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
                  <p className="text-2xl font-bold text-gray-900">₹{(reportData.summary.totalTaxableValue || 0).toLocaleString()}</p>
                </div>
                <IndianRupee className="w-8 h-8 text-green-500" />
              </div>
            </Card>

            <Card padding="sm" shadow="sm">
              <div className="flex items-center justify-between p-4">
                <div>
                  <p className="text-sm text-gray-600">Input Tax</p>
                  <p className="text-2xl font-bold text-gray-900">₹{inputCreditAmount.toLocaleString()}</p>
                </div>
                <TrendingDown className="w-8 h-8 text-purple-500" />
              </div>
            </Card>

            <Card padding="sm" shadow="sm">
              <div className="flex items-center justify-between p-4">
                <div>
                  <p className="text-sm text-gray-600">ITC Available</p>
                  <p className="text-2xl font-bold text-gray-900">₹{inputCreditAmount.toLocaleString()}</p>
                </div>
                <BarChart3 className="w-8 h-8 text-amber-500" />
              </div>
            </Card>
          </div>

          <Card title="Supplier Invoice Details">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium text-gray-700">Supplier</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-700">GSTIN</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-700">Invoice No</th>
                    <th className="px-4 py-3 text-left font-medium text-gray-700">Date</th>
                    <th className="px-4 py-3 text-right font-medium text-gray-700">Taxable Value</th>
                    <th className="px-4 py-3 text-right font-medium text-gray-700">CGST</th>
                    <th className="px-4 py-3 text-right font-medium text-gray-700">SGST</th>
                    <th className="px-4 py-3 text-right font-medium text-gray-700">IGST</th>
                    <th className="px-4 py-3 text-right font-medium text-gray-700">Total Tax</th>
                    <th className="px-4 py-3 text-center font-medium text-gray-700">ITC</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {reportData.b2b && reportData.b2b.length > 0 ? (
                    reportData.b2b.map((invoice: any, index: number) => (
                      <tr key={index} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-gray-900">{invoice.supplier_name || 'N/A'}</td>
                        <td className="px-4 py-3 text-gray-600">{invoice.supplier_gstin || 'N/A'}</td>
                        <td className="px-4 py-3 text-gray-900">{invoice.invoice_number}</td>
                        <td className="px-4 py-3 text-gray-600">
                          {new Date(invoice.invoice_date).toLocaleDateString('en-IN')}
                        </td>
                        <td className="px-4 py-3 text-right text-gray-900">
                          ₹{(invoice.taxable_value || 0).toLocaleString()}
                        </td>
                        <td className="px-4 py-3 text-right text-gray-600">
                          ₹{(invoice.cgst_amount || 0).toLocaleString()}
                        </td>
                        <td className="px-4 py-3 text-right text-gray-600">
                          ₹{(invoice.sgst_amount || 0).toLocaleString()}
                        </td>
                        <td className="px-4 py-3 text-right text-gray-600">
                          ₹{(invoice.igst_amount || 0).toLocaleString()}
                        </td>
                        <td className="px-4 py-3 text-right font-medium text-gray-900">
                          ₹{(invoice.tax_amount || 0).toLocaleString()}
                        </td>
                        <td className="px-4 py-3 text-center">
                          {invoice.itc_eligible ? (
                            <span className="inline-flex px-2 py-1 text-xs font-medium bg-green-100 text-green-800 rounded-full">
                              Eligible
                            </span>
                          ) : (
                            <span className="inline-flex px-2 py-1 text-xs font-medium bg-gray-100 text-gray-800 rounded-full">
                              Not Eligible
                            </span>
                          )}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={10} className="px-4 py-8 text-center text-gray-500">
                        No supplier invoices found for this period
                      </td>
                    </tr>
                  )}
                </tbody>
                {reportData.b2b && reportData.b2b.length > 0 && (
                  <tfoot className="bg-gray-50">
                    <tr className="font-semibold">
                      <td colSpan={4} className="px-4 py-3 text-right">Total</td>
                      <td className="px-4 py-3 text-right">₹{(reportData.summary?.totalTaxableValue || 0).toLocaleString()}</td>
                      <td className="px-4 py-3 text-right">₹{(reportData.summary?.totalCGST || 0).toLocaleString()}</td>
                      <td className="px-4 py-3 text-right">₹{(reportData.summary?.totalSGST || 0).toLocaleString()}</td>
                      <td className="px-4 py-3 text-right">₹{(reportData.summary?.totalIGST || 0).toLocaleString()}</td>
                      <td className="px-4 py-3 text-right">₹{(reportData.summary?.totalTax || 0).toLocaleString()}</td>
                      <td className="px-4 py-3"></td>
                    </tr>
                  </tfoot>
                )}
              </table>

              {/* Pagination Controls */}
              {totalInvoices > 0 && (
                <div className="flex items-center justify-between px-4 py-3 bg-gray-50 border-t">
                  <div className="flex items-center text-sm text-gray-700">
                    <span>
                      Showing {Math.min((currentPage - 1) * pageSize + 1, totalInvoices)} to{' '}
                      {Math.min(currentPage * pageSize, totalInvoices)} of {totalInvoices} invoices
                    </span>
                    <select
                      value={pageSize}
                      onChange={(e) => {
                        setPageSize(Number(e.target.value));
                        setCurrentPage(1);
                        loadPaginatedGSTR2BData(1, Number(e.target.value));
                      }}
                      className="ml-4 border border-gray-300 rounded px-2 py-1 text-sm"
                    >
                      <option value={25}>25 per page</option>
                      <option value={50}>50 per page</option>
                      <option value={100}>100 per page</option>
                    </select>
                  </div>

                  {Math.ceil(totalInvoices / pageSize) > 1 && (
                    <div className="flex items-center space-x-2">
                      <Button
                        onClick={() => {
                          const newPage = currentPage - 1;
                          setCurrentPage(newPage);
                          loadPaginatedGSTR2BData(newPage, pageSize);
                        }}
                        disabled={currentPage === 1 || isLoadingData}
                        variant="secondary"
                        size="sm"
                      >
                        Previous
                      </Button>

                      <div className="flex items-center space-x-1">
                        {Array.from({ length: Math.min(5, Math.ceil(totalInvoices / pageSize)) }, (_, i) => {
                          const totalPages = Math.ceil(totalInvoices / pageSize);
                          let pageNumber;

                          if (totalPages <= 5) {
                            pageNumber = i + 1;
                          } else if (currentPage <= 3) {
                            pageNumber = i + 1;
                          } else if (currentPage >= totalPages - 2) {
                            pageNumber = totalPages - 4 + i;
                          } else {
                            pageNumber = currentPage - 2 + i;
                          }

                          return (
                            <Button
                              key={pageNumber}
                              onClick={() => {
                                setCurrentPage(pageNumber);
                                loadPaginatedGSTR2BData(pageNumber, pageSize);
                              }}
                              variant={currentPage === pageNumber ? "primary" : "secondary"}
                              size="sm"
                              className="w-8 h-8 p-0"
                              disabled={isLoadingData}
                            >
                              {pageNumber}
                            </Button>
                          );
                        })}
                      </div>

                      <Button
                        onClick={() => {
                          const newPage = currentPage + 1;
                          setCurrentPage(newPage);
                          loadPaginatedGSTR2BData(newPage, pageSize);
                        }}
                        disabled={currentPage >= Math.ceil(totalInvoices / pageSize) || isLoadingData}
                        variant="secondary"
                        size="sm"
                      >
                        Next
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </Card>

          {/* Debit Notes Section */}
          {creditDebitNotesData.filter(note => note.note_type === 'debit').length > 0 && (
            <Card title="Debit Notes Issued" className="mt-6">
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Debit Note No.</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Date</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Supplier</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Reason</th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Amount</th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">ITC Reduction</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {creditDebitNotesData.filter(note => note.note_type === 'debit').map((note: any, index: number) => (
                      <tr key={index} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                          {note.note_number || note.debit_note_number}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {note.note_date || note.debit_note_date || note.return_date}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {note.customer_name || 'N/A'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {note.reason || note.return_reason || 'Adjustment'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right">
                          ₹{(note.amount || note.return_amount || 0).toLocaleString()}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-red-600 text-right">
                          -₹{(note.tax_amount || 0).toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="bg-gray-50 px-6 py-3">
                  <div className="flex justify-between text-sm font-medium">
                    <span>Total Debit Notes: {creditDebitNotesData.filter(note => note.note_type === 'debit').length}</span>
                    <span className="text-red-600">
                      ITC Reduction: -₹{creditDebitNotesData
                        .filter(note => note.note_type === 'debit')
                        .reduce((sum, note) => sum + (note.tax_amount || 0), 0)
                        .toLocaleString()}
                    </span>
                  </div>
                </div>
              </div>
            </Card>
          )}
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
                  <p className="text-2xl font-bold text-gray-900">{hsnSummaryData.length}</p>
                </div>
                <Package className="w-8 h-8 text-blue-500" />
              </div>
            </Card>

            <Card padding="sm" shadow="sm">
              <div className="flex items-center justify-between p-4">
                <div>
                  <p className="text-sm text-gray-600">Total Qty</p>
                  <p className="text-2xl font-bold text-gray-900">{hsnSummaryData.reduce((sum, hsn) => sum + hsn.quantity, 0).toLocaleString()}</p>
                </div>
                <BarChart3 className="w-8 h-8 text-green-500" />
              </div>
            </Card>

            <Card padding="sm" shadow="sm">
              <div className="flex items-center justify-between p-4">
                <div>
                  <p className="text-sm text-gray-600">Total Value</p>
                  <p className="text-2xl font-bold text-gray-900">₹{hsnSummaryData.reduce((sum, hsn) => sum + hsn.taxable_value, 0).toLocaleString()}</p>
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
                  {hsnSummaryData.length > 0 ? hsnSummaryData.map((hsn, index) => (
                    <tr key={index} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{hsn.hsn_code}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{hsn.description}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-center">{hsn.quantity.toLocaleString()}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right">₹{hsn.taxable_value.toLocaleString()}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-center">{hsn.tax_rate}%</td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 text-right">₹{hsn.tax_amount.toLocaleString()}</td>
                    </tr>
                  )) : (
                    <tr>
                      <td colSpan={6} className="px-6 py-8 text-center text-gray-500">
                        <div className="text-sm">
                          <p className="font-medium">No HSN data found</p>
                          <p className="text-xs mt-1">No invoice items with HSN codes found for this period</p>
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
                  <p className="text-2xl font-bold text-gray-900">₹{(reportData.summary?.totalTaxableValue || 0).toLocaleString()}</p>
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
                  <p className="text-2xl font-bold text-blue-600">₹{inputCreditAmount.toLocaleString()}</p>
                  <p className="text-xs text-gray-500">ITC Available</p>
                </div>
                <TrendingDown className="w-8 h-8 text-blue-500" />
              </div>
            </Card>

            <Card padding="sm" shadow="sm">
              <div className="flex items-center justify-between p-4">
                <div>
                  <p className="text-sm text-gray-600">Net Payable</p>
                  <p className="text-2xl font-bold text-green-600">₹{Math.max(0, reportData.summary.totalTax - inputCreditAmount).toLocaleString()}</p>
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
                      <span>₹{inputCreditBreakdown.cgst.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>SGST Credit:</span>
                      <span>₹{inputCreditBreakdown.sgst.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>IGST Credit:</span>
                      <span>₹{inputCreditBreakdown.igst.toLocaleString()}</span>
                    </div>
                    <div className="flex justify-between font-semibold border-t pt-2">
                      <span>Total:</span>
                      <span>₹{inputCreditAmount.toLocaleString()}</span>
                    </div>
                  </div>
                </div>
              </div>
            </Card>

            <Card title="Payment Due Summary">
              <div className="space-y-4">
                <div className="bg-green-50 p-6 rounded-lg text-center">
                  <h3 className="text-lg font-semibold text-green-800">Net Tax Payable</h3>
                  <p className="text-3xl font-bold text-green-600 my-2">₹{Math.max(0, reportData.summary.totalTax - inputCreditAmount).toLocaleString()}</p>
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
    <div className="flex-1 flex flex-col bg-gray-50 h-screen overflow-hidden">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4 flex-shrink-0">
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
      <div className="bg-white border-b border-gray-200 px-6 py-4 flex-shrink-0">
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-3">
            <select
              value={selectedPeriod}
              onChange={(e) => {
                setSelectedPeriod(e.target.value);
                if (e.target.value === 'custom') {
                  // Keep current date range for custom
                } else {
                  // Date range will be updated by useEffect
                }
              }}
              className="px-4 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="current">Current Month</option>
              <option value="previous">Previous Month</option>
              <option value="quarter">Current Quarter (FY)</option>
              <option value="year">Current Financial Year</option>
              <option value="custom">Custom Range</option>
            </select>
          </div>

          <div className="flex items-center space-x-2">
            <Calendar className="w-5 h-5 text-gray-400" />
            <input
              type="date"
              value={dateRange.from}
              onChange={(e) => {
                setDateRange({ ...dateRange, from: e.target.value });
                setSelectedPeriod('custom'); // Switch to custom when manually changing dates
              }}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            />
            <span className="text-gray-500">to</span>
            <input
              type="date"
              value={dateRange.to}
              onChange={(e) => {
                setDateRange({ ...dateRange, to: e.target.value });
                setSelectedPeriod('custom'); // Switch to custom when manually changing dates
              }}
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
      <div className="bg-white border-b border-gray-200 px-6 py-3 flex-shrink-0">
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