import React, { useState, useEffect, useRef } from 'react';
import {
  TrendingUp, TrendingDown, FileText, CheckCircle,
  RefreshCw, Loader2, AlertCircle, IndianRupee,
  BarChart3, Upload, ChevronDown, ChevronUp, Home
} from 'lucide-react';
import SummaryCard from '../../global/ui/display/SummaryCard';
import ModuleHeader from '../../global/ui/ModuleHeader';
import { gstApi, clearGSTCache } from '../../../services/api';

interface GSTDashboardProps {
  onNavigateToReports?: () => void;
  onNavigateToUpload?: () => void;
  onNavigateToFiling?: () => void;
}

interface TaxBreakdown {
  cgst: number;
  sgst: number;
  igst: number;
  total: number;
}

interface DashboardState {
  outputTax: TaxBreakdown;
  inputCredit: TaxBreakdown;
  netPayable: number;
  totalInvoices: number;
  totalSuppliers: number;
  totalSupplierInvoices: number;
  compliance: {
    gstr1: { status: string; dueDate: string };
    gstr3b: { status: string; dueDate: string };
    gstr2b: { status: string; lastUpdated: string };
  };
}

const EMPTY_STATE: DashboardState = {
  outputTax: { cgst: 0, sgst: 0, igst: 0, total: 0 },
  inputCredit: { cgst: 0, sgst: 0, igst: 0, total: 0 },
  netPayable: 0,
  totalInvoices: 0,
  totalSuppliers: 0,
  totalSupplierInvoices: 0,
  compliance: {
    gstr1: { status: 'pending', dueDate: '' },
    gstr3b: { status: 'pending', dueDate: '' },
    gstr2b: { status: 'available', lastUpdated: '' },
  },
};

const GSTDashboard: React.FC<GSTDashboardProps> = ({ onNavigateToReports, onNavigateToUpload, onNavigateToFiling }) => {
  const [selectedPeriod, setSelectedPeriod] = useState('current');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<DashboardState>(EMPTY_STATE);
  const [showBreakdown, setShowBreakdown] = useState(false);
  const loadingRef = useRef(false);

  const loadDashboardData = async () => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    setLoading(true);
    setError(null);

    try {
      const [dashboardRes, returnsRes] = await Promise.allSettled([
        gstApi.dashboard.getSummary(selectedPeriod),
        gstApi.returns.getStatus(selectedPeriod),
      ]);

      const gstData = dashboardRes.status === 'fulfilled' ? dashboardRes.value : null;
      const returnsData = returnsRes.status === 'fulfilled' ? returnsRes.value : null;
      const summary = gstData?.summary || {};

      setData({
        outputTax: {
          cgst: summary.cgst_amount || 0,
          sgst: summary.sgst_amount || 0,
          igst: summary.igst_amount || 0,
          total: gstData?.outputTax || 0,
        },
        inputCredit: {
          cgst: summary.purchase_cgst_amount || 0,
          sgst: summary.purchase_sgst_amount || 0,
          igst: summary.purchase_igst_amount || 0,
          total: gstData?.inputCredit || 0,
        },
        netPayable: gstData?.netPayable || 0,
        totalInvoices: summary.total_invoices || 0,
        totalSuppliers: summary.total_suppliers || 0,
        totalSupplierInvoices: summary.total_supplier_invoices || 0,
        compliance: {
          gstr1: {
            status: returnsData?.gstr1?.status || 'pending',
            dueDate: returnsData?.gstr1?.dueDate || '',
          },
          gstr3b: {
            status: returnsData?.gstr3b?.status || 'pending',
            dueDate: returnsData?.gstr3b?.dueDate || '',
          },
          gstr2b: {
            status: returnsData?.gstr2b?.status || 'available',
            lastUpdated: returnsData?.gstr2b?.lastUpdated || '',
          },
        },
      });

      if (dashboardRes.status === 'rejected') {
        setError('Failed to load dashboard data. Please try again.');
      }
    } catch (err) {
      setError(`Unable to load GST data: ${(err as Error)?.message || 'Unknown error'}`);
      setData(EMPTY_STATE);
    } finally {
      setLoading(false);
      loadingRef.current = false;
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    setError(null);
    try {
      clearGSTCache();
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
  }, [selectedPeriod]);

  const fmt = (amount: number) =>
    new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2 }).format(amount);

  const statusStyles: Record<string, string> = {
    filed: 'bg-green-100 text-green-800',
    pending: 'bg-amber-100 text-amber-800',
    overdue: 'bg-red-100 text-red-800',
    available: 'bg-blue-100 text-blue-800',
    error: 'bg-gray-100 text-gray-800',
  };

  const getStatusClass = (status: string) => statusStyles[status] || statusStyles.pending;

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
            {new Date().toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}
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
              { label: 'Amount', value: fmt(Math.abs(data.netPayable)), isBold: true },
              { label: 'Status', value: data.netPayable >= 0 ? 'Payable' : 'Refundable', color: data.netPayable >= 0 ? '#F59E0B' : '#10B981' }
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

        {/* Quick Actions */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <button
            onClick={onNavigateToReports}
            className="bg-white rounded-lg border border-gray-200 p-4 hover:shadow-md transition-shadow text-left flex items-center space-x-3"
          >
            <div className="p-2 bg-purple-50 rounded-lg">
              <BarChart3 className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <div className="font-medium text-gray-900">View Reports</div>
              <div className="text-sm text-gray-500">GSTR-1, 2B, 3B, HSN</div>
            </div>
          </button>
          <button
            onClick={onNavigateToUpload}
            className="bg-white rounded-lg border border-gray-200 p-4 hover:shadow-md transition-shadow text-left flex items-center space-x-3"
          >
            <div className="p-2 bg-teal-50 rounded-lg">
              <Upload className="h-5 w-5 text-teal-600" />
            </div>
            <div>
              <div className="font-medium text-gray-900">Upload 2B</div>
              <div className="text-sm text-gray-500">Reconcile with portal</div>
            </div>
          </button>
          <button
            onClick={onNavigateToFiling}
            className="bg-white rounded-lg border border-gray-200 p-4 hover:shadow-md transition-shadow text-left flex items-center space-x-3"
          >
            <div className="p-2 bg-green-50 rounded-lg">
              <FileText className="h-5 w-5 text-green-600" />
            </div>
            <div>
              <div className="font-medium text-gray-900">File Returns</div>
              <div className="text-sm text-gray-500">GSTR-1, GSTR-3B</div>
            </div>
          </button>
        </div>

        {/* Filing Status */}
        <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Filing Status</h3>
          <div className="space-y-4">
            {[
              { name: 'GSTR-1', desc: 'Outward Supplies', status: data.compliance.gstr1.status, date: data.compliance.gstr1.dueDate, color: 'text-blue-600' },
              { name: 'GSTR-3B', desc: 'Summary Return', status: data.compliance.gstr3b.status, date: data.compliance.gstr3b.dueDate, color: 'text-green-600' },
              { name: 'GSTR-2B', desc: 'Input Tax Credit', status: data.compliance.gstr2b.status, date: data.compliance.gstr2b.lastUpdated, color: 'text-purple-600' },
            ].map((item) => (
              <div key={item.name} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div className="flex items-center">
                  <FileText className={`w-5 h-5 ${item.color} mr-3`} />
                  <div>
                    <p className="font-medium text-gray-900">{item.name}</p>
                    <p className="text-sm text-gray-500">{item.desc}</p>
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusClass(item.status)}`}>
                    {item.status}
                  </span>
                  {item.date && <span className="text-sm text-gray-500">Due: {item.date}</span>}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Collapsible Tax Breakdown (for power users) */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-100">
          <button
            onClick={() => setShowBreakdown(!showBreakdown)}
            className="w-full px-6 py-4 flex items-center justify-between hover:bg-gray-50 transition-colors rounded-xl"
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
                  {data.outputTax.cgst > 0 && (
                    <div className="flex justify-between"><span className="text-gray-600">CGST</span><span>{fmt(data.outputTax.cgst)}</span></div>
                  )}
                  {data.outputTax.sgst > 0 && (
                    <div className="flex justify-between"><span className="text-gray-600">SGST</span><span>{fmt(data.outputTax.sgst)}</span></div>
                  )}
                  {data.outputTax.igst > 0 && (
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
                  {data.inputCredit.cgst > 0 && (
                    <div className="flex justify-between"><span className="text-gray-600">CGST</span><span>{fmt(data.inputCredit.cgst)}</span></div>
                  )}
                  {data.inputCredit.sgst > 0 && (
                    <div className="flex justify-between"><span className="text-gray-600">SGST</span><span>{fmt(data.inputCredit.sgst)}</span></div>
                  )}
                  {data.inputCredit.igst > 0 && (
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
                  <span>Net {data.netPayable >= 0 ? 'Payable' : 'Refundable'}</span>
                  <span className={data.netPayable >= 0 ? 'text-red-600' : 'text-green-600'}>{fmt(Math.abs(data.netPayable))}</span>
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
