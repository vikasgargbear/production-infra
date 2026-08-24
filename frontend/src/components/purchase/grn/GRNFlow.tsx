import React, { useState, useEffect, useCallback } from 'react';
import { Package, FileText, Loader2, RefreshCw, Eye, AlertCircle } from 'lucide-react';
import { grnApi } from '../../../services/api';
import { DataTable, StatusBadge, ModuleHeader } from '../../global';
import { canonicalGoodsReceiptsApi } from '../../../services/api/modules/purchase/canonicalGoodsReceipts.api';
import type {
  CanonicalReceiptContext,
  CanonicalReceiptDetail,
} from '../../../services/api/modules/purchase/canonicalGoodsReceipts.api';
import { CanonicalGoodsReceiptForm } from './CanonicalGoodsReceiptForm';

interface GRNFlowProps {
  onClose: () => void;
  prefilledData?: CanonicalReceiptContext | null;
  initialDetailId?: string | null;
  onReceiptContextConsumed?: () => void;
  onReceiptPosted?: (goodsReceiptId: string) => void;
}

const GRNFlow = ({
  onClose,
  prefilledData,
  initialDetailId,
  onReceiptContextConsumed,
  onReceiptPosted,
}: GRNFlowProps) => {
  const [grns, setGrns] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedGrn, setSelectedGrn] = useState<CanonicalReceiptDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);

  const stockState = (grn: any) => {
    const status = String(grn?.grn_status || '').toLowerCase();
    if (status === 'reversed') return { updated: false, label: 'Reversed', tone: 'text-gray-600' };
    if (status === 'posted' || grn?.stock_updated === true) {
      return { updated: true, label: 'Updated', tone: 'text-green-700' };
    }
    return { updated: false, label: 'Not posted', tone: 'text-orange-700' };
  };

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

  const loadDetail = useCallback(async (goodsReceiptId: string) => {
    setDetailLoading(true);
    setDetailError(null);
    try {
      const response = await canonicalGoodsReceiptsApi.getDetail(goodsReceiptId);
      setSelectedGrn(response.data);
    } catch (error: any) {
      const detail = error?.response?.data?.detail;
      setDetailError(typeof detail === 'string'
        ? detail
        : detail?.message || error?.message || 'Canonical receipt detail is unavailable');
      setSelectedGrn(null);
    } finally {
      setDetailLoading(false);
    }
  }, []);

  useEffect(() => {
    if (initialDetailId) loadDetail(initialDetailId);
  }, [initialDetailId, loadDetail]);

  // Source badge colors
  const sourceBadge = (source: string) => {
    switch (source) {
      case 'PO':
        return <span className="px-2 py-0.5 text-xs font-medium bg-purple-100 text-purple-700 rounded-full">From PO</span>;
      case 'DIRECT':
        return <span className="px-2 py-0.5 text-xs font-medium bg-blue-100 text-blue-700 rounded-full">From Purchase Entry</span>;
      default:
        return <span className="px-2 py-0.5 text-xs font-medium bg-gray-100 text-gray-700 rounded-full">Canonical receipt</span>;
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
        const status = grn.grn_status;
        const map: Record<string, any> = {
          posted: { status: 'success', label: 'Posted' },
          approved: { status: 'success', label: 'Approved' },
          inspected: { status: 'info', label: 'Inspected' },
          submitted: { status: 'warning', label: 'Submitted' },
          draft: { status: 'info', label: 'Draft' },
          rejected: { status: 'error', label: 'Rejected' },
          cancelled: { status: 'error', label: 'Cancelled' },
          reversed: { status: 'error', label: 'Reversed' },
        };
        const config = status ? (map[status] || { status: 'default', label: status }) : { status: 'default', label: 'Unknown' };
        return <StatusBadge status={config.status} label={config.label} />;
      },
      width: '100px'
    },
    {
      key: 'stock_updated',
      header: 'Stock',
      align: 'center' as const,
      render: (_: any, grn: any) => {
        const state = stockState(grn);
        return <span className={`text-xs font-medium ${state.tone}`}>{state.label}</span>;
      },
      width: '80px'
    },
    {
      key: 'actions',
      header: '',
      align: 'center' as const,
      render: (_: any, grn: any) => (
        <button
          onClick={() => loadDetail(String(grn.grn_id))}
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

  if (prefilledData) {
    return (
      <CanonicalGoodsReceiptForm
        context={prefilledData}
        onCancel={() => onReceiptContextConsumed?.()}
        onPosted={goodsReceiptId => {
          fetchGRNs();
          onReceiptPosted?.(goodsReceiptId);
        }}
      />
    );
  }

  if (detailLoading) {
    return (
      <div className="flex h-full items-center justify-center bg-gray-50" role="status">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
        <span className="ml-3 text-sm text-gray-700">Loading canonical stock evidence…</span>
      </div>
    );
  }

  // Detail view
  if (selectedGrn) {
    return (
      <div className="h-full bg-gray-50">
        <div className="h-full flex flex-col">
          <ModuleHeader
            title={`GRN ${selectedGrn.goods_receipt_number}`}
            documentNumber={selectedGrn.goods_receipt_number}
            status="active"
            icon={Package}
            iconColor="text-blue-600"
            onClose={() => setSelectedGrn(null)}
            showSaveDraft={false}
            onSaveDraft={() => {}}
          />
          <div className="flex-1 overflow-y-auto p-6">
            <div className="max-w-6xl mx-auto space-y-6">
              <div className="bg-white rounded-lg border p-6">
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <div>
                    <span className="text-sm text-gray-500">GRN Number</span>
                    <p className="font-medium">{selectedGrn.goods_receipt_number}</p>
                  </div>
                  <div>
                    <span className="text-sm text-gray-500">Date</span>
                    <p className="font-medium">
                      {new Date(selectedGrn.received_at).toLocaleString('en-IN')}
                    </p>
                  </div>
                  <div>
                    <span className="text-sm text-gray-500">Supplier</span>
                    <p className="font-medium">{selectedGrn.supplier_name}</p>
                  </div>
                  <div>
                    <span className="text-sm text-gray-500">Supplier challan</span>
                    <p className="font-medium">{selectedGrn.supplier_challan_number || '-'}</p>
                  </div>
                  <div>
                    <span className="text-sm text-gray-500">Linked PO</span>
                    <p className="font-medium text-purple-700">{selectedGrn.purchase_order_number}</p>
                  </div>
                  <div>
                    <span className="text-sm text-gray-500">Base quantity posted</span>
                    <p className="font-medium">{selectedGrn.total_abs_base_quantity}</p>
                  </div>
                  <div>
                    <span className="text-sm text-gray-500">Posted receipt valuation</span>
                    <p className="font-medium">₹{selectedGrn.total_inventory_value}</p>
                  </div>
                  <div>
                    <span className="text-sm text-gray-500">Costing</span>
                    <p className="font-medium">Moving weighted average</p>
                  </div>
                </div>
                <p className="mt-4 break-all border-t border-gray-100 pt-4 text-xs text-gray-500">Receipt UUID: {selectedGrn.goods_receipt_id}</p>
              </div>

              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <div className="flex items-center gap-2">
                  <FileText className="w-5 h-5 text-blue-600" />
                  <p className="text-sm text-blue-800">
                    Inventory-only receipt: no supplier payable, GST/ITC document, or journal entry is created at GRN posting. Those belong to the matched supplier invoice.
                  </p>
                </div>
              </div>

              <div className="space-y-4">
                {selectedGrn.lines.map(line => (
                  <div key={line.goods_receipt_line_id} className="rounded-xl border border-gray-200 bg-white p-5">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <h3 className="font-semibold text-gray-900">{line.product_name}</h3>
                        <p className="text-xs text-gray-500">{line.sku} · Line {line.line_number} · {line.uom_code}</p>
                      </div>
                      <span className="rounded-full bg-green-100 px-3 py-1 text-xs font-semibold text-green-800">{line.qc_status}</span>
                    </div>
                    <dl className="mt-4 grid gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
                      <div><dt className="text-gray-500">Batch</dt><dd className="font-medium text-gray-900">{line.manufacturer_batch_number}</dd></div>
                      <div><dt className="text-gray-500">Expiry / MRP</dt><dd className="font-medium text-gray-900">{line.expires_on} · ₹{line.mrp}</dd></div>
                      <div><dt className="text-gray-500">Billed / free</dt><dd className="font-medium text-gray-900">{line.accepted_quantity} / {line.free_quantity}</dd></div>
                      <div><dt className="text-gray-500">Base billed / free</dt><dd className="font-medium text-gray-900">{line.base_accepted_quantity} / {line.base_free_quantity}</dd></div>
                      <div><dt className="text-gray-500">Location</dt><dd className="font-medium text-gray-900">{line.location_code} · {line.location_type}</dd></div>
                      <div><dt className="text-gray-500">Receipt cost</dt><dd className="font-medium text-gray-900">₹{line.unit_cost} / ₹{line.extended_cost}</dd></div>
                      <div><dt className="text-gray-500">Ledger delta</dt><dd className="font-medium text-green-700">+{line.inventory.ledger_quantity_delta} / ₹{line.inventory.ledger_value_delta}</dd></div>
                      <div><dt className="text-gray-500">Current balance (includes later movements)</dt><dd className="font-medium text-gray-900">{line.inventory.current_on_hand_quantity} / ₹{line.inventory.current_inventory_value}</dd></div>
                    </dl>
                    <p className="mt-4 break-all border-t border-gray-100 pt-3 text-xs text-gray-500">Line UUID: {line.goods_receipt_line_id} · Batch UUID: {line.batch_id} · Ledger UUID: {line.inventory.ledger_entry_id}</p>
                  </div>
                ))}
              </div>

              <div className="rounded-lg border border-gray-200 bg-white p-4 text-xs text-gray-500">
                Inventory document UUID: {selectedGrn.inventory_document_id} · {selectedGrn.inventory_document_number} · {selectedGrn.inventory_document_status}
              </div>
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
              Receipts are posted only from an approved purchase order through a reviewed canonical command.
              Use <strong>Purchase History → Purchase Orders → Receipt</strong> to start.
            </p>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          <div className="max-w-7xl mx-auto">
            {detailError && (
              <div role="alert" className="mb-4 flex items-start gap-3 rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-800">
                <AlertCircle className="mt-0.5 h-5 w-5 shrink-0" />
                <div>
                  <p className="font-semibold">Receipt detail could not be verified</p>
                  <p>{detailError}</p>
                </div>
              </div>
            )}
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
                  emptyMessage="No canonical goods receipts yet. Start from an approved purchase order."
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
