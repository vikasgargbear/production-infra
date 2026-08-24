import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  TrendingUp, TrendingDown, FileText,
  RefreshCw, Loader2, AlertCircle, IndianRupee,
  BarChart3, ChevronDown, ChevronUp, Home
} from 'lucide-react';
import SummaryCard from '../../global/ui/display/SummaryCard';
import ModuleHeader from '../../global/ui/ModuleHeader';
import { gstApi } from '../../../services/api';
import { compareExactDecimals, formatExactCurrency, normalizeAuthoritativeDecimal } from '../../../utils/exactDecimal';

interface GSTDashboardProps {
  onNavigateToReports?: () => void;
}

interface TaxBreakdown {
  cgst: string;
  sgst: string;
  igst: string;
  total: string;
}

interface DashboardState {
  outputTax: TaxBreakdown;
  inputCredit: TaxBreakdown;
  netPayable: string;
  totalInvoices: number;
  totalSuppliers: number;
  totalSupplierInvoices: number;
}

interface GSTDashboardSummaryPayload {
  period?: {
    key: string;
    start?: string;
    end?: string;
  };
  outputTax?: string;
  inputCredit?: string;
  netPayable?: string;
  summary?: {
    total_invoices?: number;
    total_suppliers?: number;
    total_supplier_invoices?: number;
    cgst_amount?: string;
    sgst_amount?: string;
    igst_amount?: string;
    purchase_cgst_amount?: string;
    purchase_sgst_amount?: string;
    purchase_igst_amount?: string;
  };
}

const EMPTY_STATE: DashboardState = {
  outputTax: { cgst: '0.00', sgst: '0.00', igst: '0.00', total: '0.00' },
  inputCredit: { cgst: '0.00', sgst: '0.00', igst: '0.00', total: '0.00' },
  netPayable: '0.00',
  totalInvoices: 0,
  totalSuppliers: 0,
  totalSupplierInvoices: 0,
};

const GSTDashboard: React.FC<GSTDashboardProps> = ({ onNavigateToReports }) => {
  const [selectedPeriod, setSelectedPeriod] = useState('current');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<DashboardState>(EMPTY_STATE);
  const [periodRange, setPeriodRange] = useState<{ start?: string; end?: string } | null>(null);
  const [showBreakdown, setShowBreakdown] = useState(false);
  const requestRef = useRef(0);

  const loadDashboardData = useCallback(async () => {
    const requestId = ++requestRef.current;
    setLoading(true);
    setError(null);

    try {
      const dashboardRes = await gstApi.dashboard.getSummary(selectedPeriod);
      const gstData: GSTDashboardSummaryPayload = dashboardRes?.data || dashboardRes;
      const summary = gstData?.summary || {};

      if (requestId !== requestRef.current) return;
      const money = (value: unknown, label: string) => normalizeAuthoritativeDecimal(value, label, {
        scale: 2, maximumWholeDigits: 20, allowNegative: true,
      });
      setPeriodRange(gstData.period || null);
      setData({
        outputTax: {
          cgst: money(summary.cgst_amount, 'Output CGST'),
          sgst: money(summary.sgst_amount, 'Output SGST'),
          igst: money(summary.igst_amount, 'Output IGST'),
          total: money(gstData?.outputTax, 'Output tax'),
        },
        inputCredit: {
          cgst: money(summary.purchase_cgst_amount, 'Input CGST'),
          sgst: money(summary.purchase_sgst_amount, 'Input SGST'),
          igst: money(summary.purchase_igst_amount, 'Input IGST'),
          total: money(gstData?.inputCredit, 'Input credit'),
        },
        netPayable: money(gstData?.netPayable, 'Net GST payable'),
        totalInvoices: summary.total_invoices || 0,
        totalSuppliers: summary.total_suppliers || 0,
        totalSupplierInvoices: summary.total_supplier_invoices || 0,
      });
    } catch (err) {
      if (requestId !== requestRef.current) return;
      setError(`Unable to load GST data: ${(err as Error)?.message || 'Unknown error'}`);
      setData(EMPTY_STATE);
      setPeriodRange(null);
    } finally {
      if (requestId === requestRef.current) setLoading(false);
    }
  }, [selectedPeriod]);

  const handleRefresh = async () => {
    setRefreshing(true);
    setError(null);
    try {
      await loadDashboardData();
    } catch {
      setError('Failed to refresh data.');
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    const timeout = setTimeout(() => loadDashboardData(), 100);
    return () => clearTimeout(timeout);
  }, [loadDashboardData]);

  const fmt = (amount: string) => formatExactCurrency(amount, 'GST dashboard amount');
  const isPositive = (amount: string, label: string) => compareExactDecimals(amount, '0.00', label, {
    scale: 2, maximumWholeDigits: 20, allowNegative: true,
  }) > 0;
  const netIsPayable = compareExactDecimals(data.netPayable, '0.00', 'Net GST payable', {
    scale: 2, maximumWholeDigits: 20, allowNegative: true,
  }) >= 0;
  const displayNet = data.netPayable.startsWith('-') ? data.netPayable.slice(1) : data.netPayable;

  const selectedPeriodLabel = periodRange?.start && periodRange?.end
    ? `${new Date(`${periodRange.start}T00:00:00`).toLocaleDateString('en-IN', {
      day: 'numeric', month: 'short', year: 'numeric'
    })} – ${new Date(`${periodRange.end}T00:00:00`).toLocaleDateString('en-IN', {
      day: 'numeric', month: 'short', year: 'numeric'
    })}`
    : '';

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
        <span className="ml-2 text-gray-600">Loading GST dashboard...</span>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <ModuleHeader
        title="GST Dashboard"
        icon={Home}
        iconColor="text-blue-600"
        additionalActions={[
          {
            label: 'Refresh',
            icon: RefreshCw,
            onClick: handleRefresh,
            variant: 'secondary',
            disabled: refreshing,
          },
        ]}
      />

      {/* Period Selector */}
      <div className="px-6 py-3 bg-white border-b border-gray-200">
        <div className="flex items-center space-x-3">
          <span className="text-sm font-medium text-gray-500">Period:</span>
          <select
            aria-label="GST reporting period"
            value={selectedPeriod}
            onChange={(e) => setSelectedPeriod(e.target.value)}
            className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="current">Current Month</option>
            <option value="previous">Previous Month</option>
            <option value="quarter">Current Quarter</option>
            <option value="year">Current Year</option>
          </select>
          <span className="text-sm text-gray-400">
            {selectedPeriodLabel}
          </span>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="mx-6 mt-4 bg-red-50 border border-red-200 rounded-lg p-4 flex items-center justify-between">
          <div className="flex items-center">
            <AlertCircle className="h-5 w-5 text-red-600 mr-2" />
            <span className="text-red-800">{error}</span>
          </div>
          <button onClick={() => setError(null)} className="text-sm text-red-600 hover:text-red-800 underline">Dismiss</button>
        </div>
      )}

      <div className="px-6 py-6 max-w-7xl mx-auto space-y-6">
        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <SummaryCard
            title="Output Tax (Sales)"
            items={[
              { label: 'Amount', value: fmt(data.outputTax.total), isBold: true },
              { label: 'Invoices', value: `${data.totalInvoices} invoices`, color: '#6B7280' }
            ]}
            headerContent={<TrendingUp className="w-6 h-6 text-green-600" />}
          />
          <SummaryCard
            title="Input Credit (Purchases)"
            items={[
              { label: 'Amount', value: fmt(data.inputCredit.total), isBold: true },
              { label: 'Suppliers', value: `${data.totalSuppliers} suppliers`, color: '#6B7280' }
            ]}
            headerContent={<TrendingDown className="w-6 h-6 text-blue-600" />}
          />
          <SummaryCard
            title="Net GST Payable"
            items={[
              { label: 'Amount', value: fmt(displayNet), isBold: true },
              { label: 'Status', value: netIsPayable ? 'Payable' : 'Refundable', color: netIsPayable ? '#F59E0B' : '#10B981' }
            ]}
            headerContent={<IndianRupee className="w-6 h-6 text-amber-600" />}
          />
          <SummaryCard
            title="Supplier Invoices"
            items={[
              { label: 'Count', value: data.totalSupplierInvoices.toString(), isBold: true },
              { label: 'ITC Available', value: fmt(data.inputCredit.total), color: '#6B7280' }
            ]}
            headerContent={<FileText className="w-6 h-6 text-purple-600" />}
          />
        </div>

        <div className="grid grid-cols-1 gap-4">
          <button
            onClick={onNavigateToReports}
            className="flex min-h-11 items-center space-x-3 rounded-lg border border-gray-200 bg-white p-4 text-left transition-colors hover:border-blue-300 hover:bg-blue-50/30"
          >
            <div className="rounded-lg border border-blue-200 bg-blue-50 p-2">
              <BarChart3 className="h-5 w-5 text-blue-700" />
            </div>
            <div>
              <div className="font-medium text-gray-900">View Reports</div>
              <div className="text-sm text-gray-500">Authoritative GST and HSN reports</div>
            </div>
          </button>
        </div>

        {/* Collapsible Tax Breakdown (for power users) */}
        <div className="rounded-lg border border-gray-200 bg-white">
          <button
            onClick={() => setShowBreakdown(!showBreakdown)}
            className="flex min-h-11 w-full items-center justify-between rounded-lg px-6 py-4 transition-colors hover:bg-gray-50"
          >
            <span className="text-sm font-medium text-gray-600">Tax Breakdown (CGST / SGST / IGST)</span>
            {showBreakdown ? (
              <ChevronUp className="h-4 w-4 text-gray-400" />
            ) : (
              <ChevronDown className="h-4 w-4 text-gray-400" />
            )}
          </button>
          {showBreakdown && (
            <div className="px-6 pb-6 space-y-4">
              {/* Output */}
              <div>
                <h4 className="text-sm font-medium text-gray-700 mb-2 flex items-center">
                  <TrendingUp className="w-4 h-4 text-red-500 mr-1" /> Output Tax (Sales)
                </h4>
                <div className="space-y-1 text-sm">
                  {isPositive(data.outputTax.cgst, 'Output CGST') && (
                    <div className="flex justify-between"><span className="text-gray-600">CGST</span><span>{fmt(data.outputTax.cgst)}</span></div>
                  )}
                  {isPositive(data.outputTax.sgst, 'Output SGST') && (
                    <div className="flex justify-between"><span className="text-gray-600">SGST</span><span>{fmt(data.outputTax.sgst)}</span></div>
                  )}
                  {isPositive(data.outputTax.igst, 'Output IGST') && (
                    <div className="flex justify-between"><span className="text-gray-600">IGST</span><span>{fmt(data.outputTax.igst)}</span></div>
                  )}
                  <div className="flex justify-between font-semibold border-t pt-1">
                    <span>Total Output</span><span className="text-red-600">{fmt(data.outputTax.total)}</span>
                  </div>
                </div>
              </div>

              {/* Input */}
              <div>
                <h4 className="text-sm font-medium text-gray-700 mb-2 flex items-center">
                  <TrendingDown className="w-4 h-4 text-green-500 mr-1" /> Input Credit (Purchases)
                </h4>
                <div className="space-y-1 text-sm">
                  {isPositive(data.inputCredit.cgst, 'Input CGST') && (
                    <div className="flex justify-between"><span className="text-gray-600">CGST</span><span>{fmt(data.inputCredit.cgst)}</span></div>
                  )}
                  {isPositive(data.inputCredit.sgst, 'Input SGST') && (
                    <div className="flex justify-between"><span className="text-gray-600">SGST</span><span>{fmt(data.inputCredit.sgst)}</span></div>
                  )}
                  {isPositive(data.inputCredit.igst, 'Input IGST') && (
                    <div className="flex justify-between"><span className="text-gray-600">IGST</span><span>{fmt(data.inputCredit.igst)}</span></div>
                  )}
                  <div className="flex justify-between font-semibold border-t pt-1">
                    <span>Total Input</span><span className="text-green-600">{fmt(data.inputCredit.total)}</span>
                  </div>
                </div>
              </div>

              {/* Net */}
              <div className="p-3 bg-gray-50 rounded-lg">
                <div className="flex justify-between text-sm">
                  <span>Output Tax</span><span>{fmt(data.outputTax.total)}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span>Less: Input Credit</span><span className="text-green-600">- {fmt(data.inputCredit.total)}</span>
                </div>
                <div className="flex justify-between font-bold border-t mt-2 pt-2">
                  <span>Net {netIsPayable ? 'Payable' : 'Refundable'}</span>
                  <span className={netIsPayable ? 'text-red-600' : 'text-green-600'}>{fmt(displayNet)}</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default GSTDashboard;
