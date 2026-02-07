import React, { useState, useEffect } from 'react';
import {
  RefreshCw, AlertTriangle, CheckCircle, XCircle,
  Download, Search, Loader2, AlertCircle, Info
} from 'lucide-react';
import { invoicesApi, purchasesApi } from '../../services/api';

interface ReconciliationItem {
  id: number;
  partyGSTIN: string;
  partyName: string;
  invoiceNumber: string;
  invoiceDate: string;
  taxableAmount: number;
  cgst: number;
  sgst: number;
  igst: number;
  totalTax: number;
  totalAmount: number;
}

type ActiveTab = 'purchase' | 'sales';

const GSTReconciliation: React.FC = () => {
  const [activeTab, setActiveTab] = useState<ActiveTab>('purchase');
  const [purchaseItems, setPurchaseItems] = useState<ReconciliationItem[]>([]);
  const [salesItems, setSalesItems] = useState<ReconciliationItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  const loadData = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const now = new Date();
      const fromDate = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
      const toDate = now.toISOString().split('T')[0];

      const [invoiceResponse, purchaseResponse] = await Promise.allSettled([
        invoicesApi.getAll({ from_date: fromDate, to_date: toDate, limit: 1000 }),
        purchasesApi.getAll({ from_date: fromDate, to_date: toDate, limit: 1000 })
      ]);

      // Process sales invoices
      if (invoiceResponse.status === 'fulfilled') {
        const raw = invoiceResponse.value;
        const invoices = Array.isArray(raw) ? raw : (raw as any)?.invoices || (raw as any)?.data?.invoices || [];
        setSalesItems(invoices.map((inv: any, i: number) => ({
          id: i + 1,
          partyGSTIN: inv.customer_gst_number || inv.gst_number || '',
          partyName: inv.customer_name || 'Walk-in Customer',
          invoiceNumber: inv.invoice_number || `INV-${i + 1}`,
          invoiceDate: inv.invoice_date || '',
          taxableAmount: inv.taxable_amount || inv.subtotal_amount || 0,
          cgst: inv.cgst_amount || 0,
          sgst: inv.sgst_amount || 0,
          igst: inv.igst_amount || 0,
          totalTax: (inv.cgst_amount || 0) + (inv.sgst_amount || 0) + (inv.igst_amount || 0),
          totalAmount: inv.final_amount || 0,
        })));
      }

      // Process purchase invoices
      if (purchaseResponse.status === 'fulfilled') {
        const raw = purchaseResponse.value;
        const purchases = Array.isArray(raw) ? raw : (raw as any)?.purchases || (raw as any)?.data?.purchases || [];
        setPurchaseItems(purchases.map((p: any, i: number) => ({
          id: i + 1,
          partyGSTIN: p.supplier_gst_number || p.gst_number || '',
          partyName: p.supplier_name || `Supplier ${i + 1}`,
          invoiceNumber: p.invoice_number || p.supplier_invoice_number || p.purchase_no || `PUR-${i + 1}`,
          invoiceDate: p.invoice_date || p.purchase_date || '',
          taxableAmount: p.taxable_amount || p.subtotal_amount || 0,
          cgst: p.cgst_amount || 0,
          sgst: p.sgst_amount || 0,
          igst: p.igst_amount || 0,
          totalTax: (p.cgst_amount || 0) + (p.sgst_amount || 0) + (p.igst_amount || 0),
          totalAmount: p.total_amount || p.invoice_total || 0,
        })));
      }

      if (invoiceResponse.status === 'rejected' && purchaseResponse.status === 'rejected') {
        setError('Failed to load invoice data. Please try again.');
      }
    } catch (err) {
      setError(`Unable to load data: ${(err as Error)?.message || 'Unknown error'}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  useEffect(() => { loadData(); }, []);

  const items = activeTab === 'purchase' ? purchaseItems : salesItems;
  const filtered = items.filter(item => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    return item.invoiceNumber.toLowerCase().includes(term) ||
      item.partyName.toLowerCase().includes(term) ||
      item.partyGSTIN.toLowerCase().includes(term);
  });

  const totalTax = filtered.reduce((sum, item) => sum + item.totalTax, 0);
  const totalAmount = filtered.reduce((sum, item) => sum + item.totalAmount, 0);

  const fmt = (n: number) => `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const handleExport = () => {
    const header = 'Invoice No,Date,Party,GSTIN,Taxable,CGST,SGST,IGST,Total Tax,Total Amount\n';
    const rows = filtered.map(item =>
      `${item.invoiceNumber},${item.invoiceDate},"${item.partyName}",${item.partyGSTIN},${item.taxableAmount},${item.cgst},${item.sgst},${item.igst},${item.totalTax},${item.totalAmount}`
    ).join('\n');
    const blob = new Blob([header + rows], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `gst_${activeTab}_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
        <span className="ml-2 text-gray-600">Loading GST data...</span>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">GST Reconciliation</h1>
          <p className="text-gray-600">Review your GST data for filing</p>
        </div>
        <div className="flex items-center space-x-3">
          <button
            onClick={handleRefresh}
            disabled={refreshing}
            className="inline-flex items-center px-3 py-2 border border-gray-300 rounded-md bg-white text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 mr-1 ${refreshing ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Portal Integration Notice */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="flex items-start">
          <Info className="h-5 w-5 text-blue-600 mr-2 mt-0.5 flex-shrink-0" />
          <div className="text-sm text-blue-800">
            <p className="font-medium">Books Data Only</p>
            <p>This shows your invoice and purchase data from books. To reconcile against the GST portal, upload your GSTR-2B file in the "2B Upload" tab.</p>
          </div>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 flex items-center justify-between">
          <div className="flex items-center">
            <AlertCircle className="h-5 w-5 text-red-600 mr-2" />
            <span className="text-red-800">{error}</span>
          </div>
          <button onClick={() => setError(null)} className="text-sm text-red-600 hover:text-red-800 underline">Dismiss</button>
        </div>
      )}

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-8">
          {(['purchase', 'sales'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`py-2 px-1 border-b-2 font-medium text-sm ${activeTab === tab
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              {tab === 'purchase' ? 'Purchase (Input Tax)' : 'Sales (Output Tax)'}
            </button>
          ))}
        </nav>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
          <p className="text-sm font-medium text-gray-600">Total Invoices</p>
          <p className="text-2xl font-bold text-gray-900">{filtered.length}</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
          <p className="text-sm font-medium text-gray-600">Total Tax</p>
          <p className="text-2xl font-bold text-blue-600">{fmt(totalTax)}</p>
        </div>
        <div className="bg-white rounded-xl shadow-sm p-6 border border-gray-100">
          <p className="text-sm font-medium text-gray-600">Total Amount</p>
          <p className="text-2xl font-bold text-gray-900">{fmt(totalAmount)}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl shadow-sm p-4 border border-gray-100 flex items-center justify-between">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            placeholder="Search by invoice, party, or GSTIN..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <button
          onClick={handleExport}
          className="inline-flex items-center px-3 py-2 border border-gray-300 rounded-md bg-white text-gray-700 hover:bg-gray-50 ml-3"
        >
          <Download className="h-4 w-4 mr-2" />
          Export CSV
        </button>
      </div>

      {/* Data Table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <h3 className="text-lg font-medium text-gray-900">
            {activeTab === 'purchase' ? 'Purchase' : 'Sales'} Invoices ({filtered.length})
          </h3>
        </div>

        {filtered.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <AlertTriangle className="h-12 w-12 mx-auto mb-2 text-gray-300" />
            <p>No invoices found for this period</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Invoice</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Party</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Taxable</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">CGST</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">SGST</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">IGST</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Total</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filtered.map((item) => (
                  <tr key={item.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">{item.invoiceNumber}</div>
                      <div className="text-sm text-gray-500">{item.invoiceDate}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">{item.partyName}</div>
                      {item.partyGSTIN && <div className="text-xs text-gray-500 font-mono">{item.partyGSTIN}</div>}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm">{fmt(item.taxableAmount)}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm">{item.cgst > 0 ? fmt(item.cgst) : '-'}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm">{item.sgst > 0 ? fmt(item.sgst) : '-'}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm">{item.igst > 0 ? fmt(item.igst) : '-'}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">{fmt(item.totalAmount)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-gray-50">
                <tr>
                  <td colSpan={2} className="px-6 py-3 text-sm font-semibold text-gray-900">Total</td>
                  <td className="px-6 py-3 text-right text-sm font-semibold">{fmt(filtered.reduce((s, i) => s + i.taxableAmount, 0))}</td>
                  <td className="px-6 py-3 text-right text-sm font-semibold">{fmt(filtered.reduce((s, i) => s + i.cgst, 0))}</td>
                  <td className="px-6 py-3 text-right text-sm font-semibold">{fmt(filtered.reduce((s, i) => s + i.sgst, 0))}</td>
                  <td className="px-6 py-3 text-right text-sm font-semibold">{fmt(filtered.reduce((s, i) => s + i.igst, 0))}</td>
                  <td className="px-6 py-3 text-right text-sm font-semibold">{fmt(totalAmount)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default GSTReconciliation;
