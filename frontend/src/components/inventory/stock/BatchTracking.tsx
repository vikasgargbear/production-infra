import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Download, Eye, Package, RefreshCw, Search } from 'lucide-react';
import { ModuleHeader } from '../../global';
import { canonicalInventoryReadsApi } from '../../../services/api/modules/inventory/canonicalInventoryReads.api';
import { InventoryScopeSelector } from './components/InventoryScopeSelector';
import { useInventoryScope } from './hooks/useInventoryScope';
import {
  compareQuantity, decodeBatchPage, decodeMovementPage, displayDate, displayMoney,
  displayOrganizationTimestamp, displayQuantity, exhaustCursorPages, movementLabel,
  type BatchItem, type BatchSummary, type MovementItem,
} from './utils/canonicalStockReads';

type Props = { open?: boolean; onClose?: () => void };

const BatchTracking: React.FC<Props> = ({ open = true, onClose }) => {
  const scope = useInventoryScope();
  const [items, setItems] = useState<BatchItem[]>([]);
  const [summary, setSummary] = useState<BatchSummary | null>(null);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('all');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<BatchItem | null>(null);
  const [movements, setMovements] = useState<MovementItem[]>([]);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);

  const load = useCallback(async () => {
    if (!scope.branchId) return;
    setLoading(true);
    setError(null);
    try {
      const result = await exhaustCursorPages(
        canonicalInventoryReadsApi.batches,
        { branch_id: scope.branchId, ...(scope.locationId ? { location_id: scope.locationId } : {}) },
        decodeBatchPage,
      );
      setItems(result.items);
      setSummary(result.summary);
    } catch (caught) {
      setItems([]); setSummary(null);
      setError(caught instanceof Error ? caught.message : 'Unable to load batches.');
    } finally { setLoading(false); }
  }, [scope.branchId, scope.locationId]);

  useEffect(() => { void load(); }, [load]);

  const closeMovements = useCallback(() => {
    setSelected(null);
    setMovements([]);
    requestAnimationFrame(() => triggerRef.current?.focus());
  }, []);

  useEffect(() => {
    if (!selected) return undefined;
    closeRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.preventDefault(); event.stopPropagation(); closeMovements();
    };
    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  }, [selected, closeMovements]);

  const openMovements = async (batch: BatchItem, trigger: HTMLButtonElement) => {
    triggerRef.current = trigger;
    setSelected(batch);
    setMovements([]);
    try {
      const result = await exhaustCursorPages(
        canonicalInventoryReadsApi.movements,
        { branch_id: scope.branchId, batch_id: batch.batch_id, ...(scope.locationId ? { location_id: scope.locationId } : {}) },
        decodeMovementPage,
      );
      setMovements(result.items);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Unable to load batch movements.');
      closeMovements();
    }
  };

  const visible = useMemo(() => items.filter(item => {
    const lowered = query.trim().toLowerCase();
    if (lowered && !`${item.batch_number} ${item.product_name} ${item.product_code}`.toLowerCase().includes(lowered)) return false;
    return status === 'all' || item.expiry_state === status || item.status === status;
  }).sort((left, right) => compareQuantity(right.total_quantity, left.total_quantity)), [items, query, status]);

  const exportCsv = () => {
    const rows = [['Batch', 'Product', 'Quantity', 'Value', 'Expiry', 'Status'], ...visible.map(item => [
      item.batch_number, item.product_name, item.total_quantity, item.total_value,
      item.expires_on || '', item.status,
    ])];
    const blob = new Blob([rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n')], { type: 'text/csv' });
    const anchor = document.createElement('a');
    anchor.href = URL.createObjectURL(blob); anchor.download = 'canonical-batches.csv'; anchor.click();
    URL.revokeObjectURL(anchor.href);
  };

  if (!open) return null;
  return <div className="flex h-full flex-col bg-gray-50">
    <ModuleHeader title="Batch Tracking" onClose={onClose} />
    <main className="flex-1 space-y-4 overflow-y-auto p-6">
      {scope.context && <InventoryScopeSelector context={scope.context} branchId={scope.branchId}
        locationId={scope.locationId} onBranchChange={scope.setBranchId}
        onLocationChange={scope.setLocationId} disabled={loading} />}
      {(scope.scopeError || error) && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-red-700">{scope.scopeError || error}</div>}
      <section className="rounded-lg border border-gray-200 bg-white p-4">
        <div className="flex flex-wrap gap-3">
          <label className="relative min-w-[250px] flex-1"><span className="sr-only">Search batches</span>
            <Search className="absolute left-3 top-3.5 h-4 w-4 text-gray-400" />
            <input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search batch, product, or code..."
              className="min-h-11 w-full rounded-lg border border-gray-300 pl-10 pr-3" /></label>
          <select aria-label="Batch status" value={status} onChange={event => setStatus(event.target.value)}
            className="min-h-11 rounded-lg border border-gray-300 bg-white px-3">
            <option value="all">All statuses</option><option value="expired">Expired</option>
            <option value="expiring_30d">Expiring in 30 days</option><option value="near_expiry_90d">Expiring in 31–90 days</option>
            <option value="released">Released</option><option value="blocked">Blocked</option>
          </select>
          <button onClick={() => void load()} disabled={loading || !scope.branchId} aria-label="Refresh batches"
            className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-gray-300 bg-white disabled:opacity-50">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /></button>
          <button onClick={exportCsv} disabled={visible.length === 0}
            className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-blue-600 px-4 text-white disabled:bg-gray-300">
            <Download className="h-4 w-4" /> Export visible</button>
        </div>
        <p className="mt-3 text-sm text-gray-600">Loaded {items.length} of {summary?.batch_count || 0} scoped batches</p>
        {summary && <div className="mt-3 flex flex-wrap gap-5 border-t border-gray-100 pt-3 text-sm">
          <span>Quantity: <strong>{displayQuantity(summary.total_quantity)}</strong></span>
          <span>Value: <strong>{displayMoney(summary.total_value)}</strong></span>
          <span>Positive stock: <strong>{summary.positive_stock_count}</strong></span>
          <span>Exhausted: <strong>{summary.exhausted_batch_count}</strong></span>
          {summary.negative_stock_count > 0 && <span className="text-red-700">Negative: <strong>{summary.negative_stock_count}</strong></span>}
          <span>Expired: <strong>{summary.expired_count}</strong></span>
          <span>0–30 days: <strong>{summary.expiring_30d_count}</strong></span>
        </div>}
      </section>
      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
        <table className="min-w-full divide-y divide-gray-200"><thead className="bg-gray-50"><tr>
          <th className="px-4 py-3 text-left">Batch</th><th className="px-4 py-3 text-left">Product</th>
          <th className="px-4 py-3 text-right">Quantity</th><th className="px-4 py-3 text-right">Value</th>
          <th className="px-4 py-3 text-left">Expiry</th><th className="px-4 py-3 text-left">State</th><th className="px-4 py-3">Action</th>
        </tr></thead><tbody className="divide-y divide-gray-100">{visible.map(item => <tr key={item.batch_id} data-batch-id={item.batch_id}>
          <td className="px-4 py-3 font-medium">{item.batch_number}</td><td className="px-4 py-3">{item.product_name}<div className="text-xs text-gray-500">{item.product_code}</div></td>
          <td className="px-4 py-3 text-right">{displayQuantity(item.total_quantity)}</td><td className="px-4 py-3 text-right">{displayMoney(item.total_value)}</td>
          <td className="px-4 py-3">{displayDate(item.expires_on)}</td><td className="px-4 py-3 capitalize">{item.expiry_state.replace(/_/g, ' ')}</td>
          <td className="px-4 py-3 text-center"><button aria-label={`View movements for batch ${item.batch_number}`}
            onClick={event => void openMovements(item, event.currentTarget)} className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-gray-300">
            <Eye className="h-4 w-4" /></button></td>
        </tr>)}</tbody></table>
        {!loading && visible.length === 0 && <p className="p-8 text-center text-gray-500">No batches found in this scope.</p>}
      </div>
    </main>
    {selected && <div role="dialog" aria-modal="true" aria-labelledby="batch-movements-title" className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-[80vh] w-full max-w-5xl overflow-auto rounded-lg border border-gray-200 bg-white p-5 shadow-xl">
        <div className="flex items-center justify-between"><div><h2 id="batch-movements-title" className="text-lg font-semibold">Batch movements — {selected.batch_number}</h2><p className="text-sm text-gray-500">{selected.product_name}</p></div>
          <button ref={closeRef} onClick={closeMovements} className="min-h-11 rounded-lg border border-gray-300 px-4">Close</button></div>
        {movements.length === 0 ? <div className="p-10 text-center text-gray-500"><Package className="mx-auto mb-2 h-10 w-10" />No movement history found.</div>
          : <table className="mt-5 min-w-full divide-y divide-gray-200"><thead><tr><th className="px-3 py-2 text-left">Date</th><th className="px-3 py-2 text-left">Kind</th><th className="px-3 py-2 text-right">Quantity delta</th><th className="px-3 py-2 text-right">Value delta</th><th className="px-3 py-2 text-left">Location</th><th className="px-3 py-2 text-left">Document</th></tr></thead>
            <tbody>{movements.map(movement => <tr key={movement.movement_id}><td className="px-3 py-2">{displayOrganizationTimestamp(movement.posted_at, scope.context!.organization_timezone)}</td><td className="px-3 py-2 capitalize">{movementLabel(movement)}</td><td className="px-3 py-2 text-right">{displayQuantity(movement.quantity_delta)}</td><td className="px-3 py-2 text-right">{displayMoney(movement.value_delta)}</td><td className="px-3 py-2">{movement.location_code} — {movement.location_name}</td><td className="px-3 py-2">{movement.document_number}</td></tr>)}</tbody>
          </table>}
      </div>
    </div>}
  </div>;
};

export default BatchTracking;
