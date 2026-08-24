/**
 * GRNFlow - Goods Receipt Notes (Read-Only Viewer)
 *
 * GRNs are now auto-created from Purchase Entry.
 * This component shows a read-only list of existing GRNs with source badges.
 */
import React, { useState, useEffect, useCallback } from 'react';
import { Package, FileText, Loader2, RefreshCw, Eye } from 'lucide-react';
import { grnApi } from '../../../services/api';
import { DataTable, StatusBadge, ModuleHeader } from '../../global';
import { formatCurrency } from '../../../utils/formatters';

const GRNFlow = ({ onClose }: { onClose: any; prefilledData?: any }) => {
  const [grns, setGrns] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedGrn, setSelectedGrn] = useState<any>(null);

  const fetchGRNs = useCallback(async () => {
    setLoading(true);
    try {
      const response = await grnApi.getAll({ limit: 50 });
      const data = response?.data;
      const grnList = Array.isArray(data) ? data : (data?.grns || data?.data || []);
      setGrns(grnList);
    } catch (err) {
      setGrns([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchGRNs();
  }, [fetchGRNs]);

  // Source badge colors
  const sourceBadge = (source: string) => {
    switch (source) {
      case 'PO':
        return <span className="px-2 py-0.5 text-xs font-medium bg-purple-100 text-purple-700 rounded-full">From PO</span>;
      case 'DIRECT':
        return <span className="px-2 py-0.5 text-xs font-medium bg-blue-100 text-blue-700 rounded-full">From Purchase Entry</span>;
      default:
        return <span className="px-2 py-0.5 text-xs font-medium bg-gray-100 text-gray-700 rounded-full">Manual</span>;
    }
  };

  const columns = [
    {
      key: 'grn_number',
      header: 'GRN #',
      render: (_: any, grn: any) => (
        <span className="text-sm font-medium text-gray-900">{grn.grn_number}</span>
      ),
      width: '140px'
    },
    {
      key: 'grn_date',
      header: 'Date',
      render: (_: any, grn: any) => (
        <span className="text-sm text-gray-600">
          {grn.grn_date ? new Date(grn.grn_date).toLocaleDateString('en-IN', {
            day: '2-digit', month: 'short', year: 'numeric'
          }) : '-'}
        </span>
      ),
      width: '110px'
    },
    {
      key: 'source',
      header: 'Source',
      render: (_: any, grn: any) => sourceBadge(grn.source || 'MANUAL'),
      width: '140px'
    },
    {
      key: 'supplier_invoice_number',
      header: 'Supplier Invoice',
      render: (_: any, grn: any) => (
        <span className="text-sm text-gray-600">{grn.supplier_invoice_number || '-'}</span>
      ),
      width: '140px'
    },
    {
      key: 'grn_status',
      header: 'Status',
      align: 'center' as const,
      render: (_: any, grn: any) => {
        const status = grn.grn_status || 'completed';
        const map: Record<string, any> = {
          completed: { status: 'success', label: 'Completed' },
          draft: { status: 'info', label: 'Draft' },
          pending: { status: 'warning', label: 'Pending' }
        };
        const config = map[status] || { status: 'default', label: status };
        return <StatusBadge status={config.status} label={config.label} />;
      },
      width: '100px'
    },
    {
      key: 'stock_updated',
      header: 'Stock',
      align: 'center' as const,
      render: (_: any, grn: any) => (
        <span className={`text-xs font-medium ${grn.stock_updated ? 'text-green-600' : 'text-orange-600'}`}>
          {grn.stock_updated ? 'Updated' : 'Pending'}
        </span>
      ),
      width: '80px'
    },
    {
      key: 'actions',
      header: '',
      align: 'center' as const,
      render: (_: any, grn: any) => (
        <button
          onClick={() => setSelectedGrn(grn)}
          className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg text-gray-600 hover:bg-gray-100 transition-colors"
          title="View Details"
          aria-label={`View GRN ${grn.grn_number}`}
        >
          <Eye className="w-4 h-4" />
        </button>
      ),
      width: '50px'
    }
  ];

  // Detail view
  if (selectedGrn) {
    return (
      <div className="h-full bg-gray-50">
        <div className="h-full flex flex-col">
          <ModuleHeader
            title={`GRN ${selectedGrn.grn_number}`}
            documentNumber={selectedGrn.grn_number}
            status="active"
            icon={Package}
            iconColor="text-blue-600"
            onClose={() => setSelectedGrn(null)}
            showSaveDraft={false}
            onSaveDraft={() => {}}
          />
          <div className="flex-1 overflow-y-auto p-6">
            <div className="max-w-3xl mx-auto space-y-6">
              {/* Header Info */}
              <div className="bg-white rounded-lg border p-6">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <span className="text-sm text-gray-500">GRN Number</span>
                    <p className="font-medium">{selectedGrn.grn_number}</p>
                  </div>
                  <div>
                    <span className="text-sm text-gray-500">Date</span>
                    <p className="font-medium">
                      {selectedGrn.grn_date ? new Date(selectedGrn.grn_date).toLocaleDateString('en-IN') : '-'}
                    </p>
                  </div>
                  <div>
                    <span className="text-sm text-gray-500">Source</span>
                    <p className="mt-1">{sourceBadge(selectedGrn.source || 'MANUAL')}</p>
                  </div>
                  <div>
                    <span className="text-sm text-gray-500">Supplier Invoice</span>
                    <p className="font-medium">{selectedGrn.supplier_invoice_number || '-'}</p>
                  </div>
                  {selectedGrn.purchase_order_id && (
                    <div>
                      <span className="text-sm text-gray-500">Linked PO</span>
                      <p className="font-medium text-purple-600">PO #{selectedGrn.purchase_order_id}</p>
                    </div>
                  )}
                  {selectedGrn.supplier_invoice_id && (
                    <div>
                      <span className="text-sm text-gray-500">Linked Invoice</span>
                      <p className="font-medium text-blue-600">Invoice #{selectedGrn.supplier_invoice_id}</p>
                    </div>
                  )}
                </div>
              </div>

              {/* Info Banner */}
              <div className="bg-white border border-gray-200 rounded-lg p-4">
                <div className="flex items-center gap-2">
                  <FileText className="w-5 h-5 text-blue-600" />
                  <p className="text-sm text-blue-800">
                    This GRN was auto-generated from {selectedGrn.source === 'PO' ? 'a Purchase Order receipt' : 'a Purchase Entry'}.
                    Stock has {selectedGrn.stock_updated ? 'been updated' : 'not been updated yet'}.
                  </p>
                </div>
              </div>

              {/* Notes */}
              {selectedGrn.notes && (
                <div className="bg-white rounded-lg border p-4">
                  <span className="text-sm text-gray-500">Notes</span>
                  <p className="mt-1 text-sm">{selectedGrn.notes}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full bg-gray-50">
      <div className="h-full flex flex-col">
        <ModuleHeader
          title="Goods Receipts"
          documentNumber=""
          status="active"
          icon={Package}
          iconColor="text-blue-600"
          onClose={onClose}
          showSaveDraft={false}
          onSaveDraft={() => {}}
          additionalActions={[
            {
              label: "",
              onClick: fetchGRNs,
              variant: "ghost",
              icon: RefreshCw,
              title: "Refresh"
            }
          ] as any}
        />

        {/* Info Banner */}
        <div className="px-6 py-3 bg-white border-b border-gray-200">
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-gray-600" />
            <p className="text-sm text-gray-700">
              Goods Receipt Notes are auto-generated when you create a Purchase Entry.
              Use the <strong>Purchase Entry</strong> tab to record new receipts.
            </p>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="max-w-7xl mx-auto">
            {loading ? (
              <div className="flex items-center justify-center h-64">
                <Loader2 className="w-8 h-8 animate-spin text-green-600" />
                <span className="ml-2">Loading receipts...</span>
              </div>
            ) : (
              <div className="bg-white rounded-lg shadow-sm">
                <DataTable
                  columns={columns}
                  data={grns}
                  keyField="grn_id"
                  loading={false}
                  emptyMessage="No goods receipts yet. Create a Purchase Entry to auto-generate GRNs."
                />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default GRNFlow;
