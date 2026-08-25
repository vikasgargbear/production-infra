import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Download, RefreshCw, Search } from 'lucide-react';
import { ModuleHeader } from '../../global';
import { canonicalInventoryReadsApi } from '../../../services/api/modules/inventory/canonicalInventoryReads.api';
import { InventoryScopeSelector } from './components/InventoryScopeSelector';
import { useInventoryScope } from './hooks/useInventoryScope';
import {
  compareMoney, compareQuantity, decodeMovementPage, displayMoney, displayOrganizationTimestamp,
  displayQuantity, displayRate, exhaustCursorPages, movementLabel, type EntryKind,
  movementItemsCsv, type MovementItem, type MovementSummary,
} from './utils/canonicalStockReads';

type Props = { open?: boolean; onClose?: () => void };
type MovementFilter = 'all' | 'in' | 'out' | 'transfer' | 'adjustment' | 'reversal';
type SortKey = 'posted_at' | 'quantity_delta' | 'value_delta';

const category = (kind: EntryKind): Exclude<MovementFilter, 'all'> => {
  if (kind === 'receipt' || kind === 'count_gain') return 'in';
  if (kind === 'issue' || kind === 'count_loss') return 'out';
  if (kind === 'transfer_in' || kind === 'transfer_out') return 'transfer';
  if (kind === 'reversal') return 'reversal';
  return 'adjustment';
};

const StockMovement: React.FC<Props> = ({ open = true, onClose }) => {
  const scope = useInventoryScope();
  const [items, setItems] = useState<MovementItem[]>([]);
  const [summary, setSummary] = useState<MovementSummary | null>(null);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<MovementFilter>('all');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sort, setSort] = useState<{ key: SortKey; direction: 'asc' | 'desc' }>({ key: 'posted_at', direction: 'desc' });

  const load = useCallback(async () => {
    if (!scope.branchId) return;
    setLoading(true); setError(null);
    try {
      const result = await exhaustCursorPages(
        canonicalInventoryReadsApi.movements,
        { branch_id: scope.branchId, ...(scope.locationId ? { location_id: scope.locationId } : {}) },
        decodeMovementPage,
      );
      setItems(result.items); setSummary(result.summary);
    } catch (caught) {
      setItems([]); setSummary(null);
      setError(caught instanceof Error ? caught.message : 'Unable to load stock movements.');
    } finally { setLoading(false); }
  }, [scope.branchId, scope.locationId]);

  useEffect(() => { void load(); }, [load]);

  const visible = useMemo(() => {
    const lowered = query.trim().toLowerCase();
    const filtered = items.filter(item => {
      if (filter !== 'all' && category(item.entry_kind) !== filter) return false;
      return !lowered || `${item.document_number} ${item.product_name} ${item.product_code} ${item.batch_number} ${item.location_name}`.toLowerCase().includes(lowered);
    });
    filtered.sort((left, right) => {
      const comparison = sort.key === 'posted_at'
        ? left.posted_at.localeCompare(right.posted_at)
        : sort.key === 'quantity_delta'
          ? compareQuantity(left.quantity_delta, right.quantity_delta)
          : compareMoney(left.value_delta, right.value_delta);
      return sort.direction === 'asc' ? comparison : -comparison;
    });
    return filtered;
  }, [items, filter, query, sort]);

  const toggleSort = (key: SortKey) => setSort(current => ({
    key, direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc',
  }));

  const exportCsv = () => {
    const anchor = document.createElement('a');
    anchor.href = URL.createObjectURL(new Blob([movementItemsCsv(visible)], { type: 'text/csv;charset=utf-8' }));
    anchor.download = 'canonical-stock-movements.csv'; anchor.click(); URL.revokeObjectURL(anchor.href);
  };

  if (!open) return null;
  return <div className="flex h-full flex-col bg-gray-50">
    <ModuleHeader title="Stock Movements" onClose={onClose} />
    <div className="border-b border-gray-200 bg-white px-4 py-2 text-xs text-gray-600">
      Keyboard shortcut: <strong>Esc</strong> - Close
    </div>
    <main className="flex-1 space-y-4 overflow-y-auto p-6">
      {scope.context && <InventoryScopeSelector context={scope.context} branchId={scope.branchId}
        locationId={scope.locationId} onBranchChange={scope.setBranchId}
        onLocationChange={scope.setLocationId} disabled={loading} />}
      {(scope.scopeError || error) && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-red-700">{scope.scopeError || error}</div>}
      <section className="rounded-lg border border-gray-200 bg-white p-4">
        <div className="flex flex-wrap gap-3">
          <label className="relative min-w-[260px] flex-1"><span className="sr-only">Search stock movements</span>
            <Search className="absolute left-3 top-3.5 h-4 w-4 text-gray-400" />
            <input value={query} onChange={event => setQuery(event.target.value)}
              placeholder="Search document, product, batch, or location..." className="min-h-11 w-full rounded-lg border border-gray-300 pl-10 pr-3" /></label>
          <select aria-label="Movement type" value={filter} onChange={event => setFilter(event.target.value as MovementFilter)}
            className="min-h-11 rounded-lg border border-gray-300 bg-white px-3">
            <option value="all">All movements</option><option value="in">Stock in</option><option value="out">Stock out</option>
            <option value="transfer">Transfers</option><option value="adjustment">Value adjustments</option><option value="reversal">Reversals</option>
          </select>
          <button onClick={() => void load()} disabled={loading || !scope.branchId} aria-label="Refresh stock movements"
            className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-gray-300 bg-white disabled:opacity-50">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /></button>
          <button onClick={exportCsv} disabled={visible.length === 0}
            className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-blue-600 px-4 text-white disabled:bg-gray-300"><Download className="h-4 w-4" /> Export visible</button>
        </div>
        <p className="mt-3 text-sm text-gray-600">
          Loaded {items.length} of {summary ? summary.movement_count : '—'} scoped immutable ledger entries
        </p>
        {summary && <div className="mt-3 grid gap-3 border-t border-gray-100 pt-3 text-sm sm:grid-cols-4">
          <span>Gross quantity: <strong>{displayQuantity(summary.gross_quantity)}</strong></span>
          <span>Net quantity delta: <strong>{displayQuantity(summary.net_quantity_delta)}</strong></span>
          <span>Gross ledger value: <strong>{displayMoney(summary.gross_value)}</strong></span>
          <span>Net value delta: <strong>{displayMoney(summary.net_value_delta)}</strong></span>
        </div>}
      </section>
      <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white"><table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50"><tr>
          <th className="px-4 py-3 text-left"><button onClick={() => toggleSort('posted_at')}>Posted</button></th>
          <th className="px-4 py-3 text-left">Document / Kind</th><th className="px-4 py-3 text-left">Product / Batch</th>
          <th className="px-4 py-3 text-left">Location</th><th className="px-4 py-3 text-right"><button onClick={() => toggleSort('quantity_delta')}>Quantity delta</button></th>
          <th className="px-4 py-3 text-right"><button onClick={() => toggleSort('value_delta')}>Value delta</button></th><th className="px-4 py-3 text-right">Unit cost</th>
        </tr></thead><tbody className="divide-y divide-gray-100">{visible.map(item => <tr key={item.movement_id} data-movement-id={item.movement_id}>
          <td className="px-4 py-3">{displayOrganizationTimestamp(item.posted_at, scope.context!.organization_timezone)}</td>
          <td className="px-4 py-3"><strong>{item.document_number}</strong><div className="text-xs capitalize text-gray-500">{movementLabel(item)}</div></td>
          <td className="px-4 py-3">{item.product_name}<div className="text-xs text-gray-500">{item.batch_number}</div></td>
          <td className="px-4 py-3">{item.location_code} — {item.location_name}</td>
          <td className="px-4 py-3 text-right font-medium">{displayQuantity(item.quantity_delta)}</td>
          <td className="px-4 py-3 text-right font-medium">{displayMoney(item.value_delta)}</td>
          <td className="px-4 py-3 text-right">{displayRate(item.unit_cost)}</td>
        </tr>)}</tbody></table>{!loading && visible.length === 0 && <p className="p-8 text-center text-gray-500">No movements found in this scope.</p>}</div>
    </main>
  </div>;
};

export default StockMovement;
