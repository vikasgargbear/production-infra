import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Download, RefreshCw, Search } from 'lucide-react';
import { jsPDF } from 'jspdf';
import { ModuleHeader } from '../../global';
import { canonicalInventoryReadsApi } from '../../../services/api/modules/inventory/canonicalInventoryReads.api';
import { InventoryScopeSelector } from './components/InventoryScopeSelector';
import { useInventoryScope } from './hooks/useInventoryScope';
import {
  compareMoney, compareQuantity, decodeCurrentStockPage, displayMoney,
  displayOrganizationTimestamp, displayQuantity, displayRate, exhaustCursorPages,
  isNegativeMoney, isNegativeQuantity,
  type CurrentStockItem, type CurrentStockSummary,
} from './utils/canonicalStockReads';

type Props = { open?: boolean; onClose?: () => void };
type SortKey = 'product_name' | 'total_quantity' | 'total_value';

const CurrentStock: React.FC<Props> = ({ open = true, onClose }) => {
  const scope = useInventoryScope();
  const [items, setItems] = useState<CurrentStockItem[]>([]);
  const [summary, setSummary] = useState<CurrentStockSummary | null>(null);
  const [asOf, setAsOf] = useState('');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sort, setSort] = useState<{ key: SortKey; direction: 'asc' | 'desc' }>({ key: 'product_name', direction: 'asc' });

  const load = useCallback(async () => {
    if (!scope.branchId) return;
    setLoading(true);
    setError(null);
    try {
      const result = await exhaustCursorPages(
        canonicalInventoryReadsApi.currentStock,
        { branch_id: scope.branchId, ...(scope.locationId ? { location_id: scope.locationId } : {}) },
        decodeCurrentStockPage,
      );
      setItems(result.items);
      setSummary(result.summary);
      setAsOf(result.as_of);
    } catch (caught) {
      setItems([]);
      setSummary(null);
      setError(caught instanceof Error ? caught.message : 'Unable to load current stock.');
    } finally {
      setLoading(false);
    }
  }, [scope.branchId, scope.locationId]);

  useEffect(() => { void load(); }, [load]);

  const visible = useMemo(() => {
    const lowered = query.trim().toLowerCase();
    const filtered = lowered ? items.filter(item => (
      item.product_name.toLowerCase().includes(lowered)
      || item.product_code.toLowerCase().includes(lowered)
      || (item.generic_name || '').toLowerCase().includes(lowered)
    )) : [...items];
    filtered.sort((left, right) => {
      const comparison = sort.key === 'product_name'
        ? left.product_name.localeCompare(right.product_name)
        : sort.key === 'total_quantity'
          ? compareQuantity(left.total_quantity, right.total_quantity)
          : compareMoney(left.total_value, right.total_value);
      return sort.direction === 'asc' ? comparison : -comparison;
    });
    return filtered;
  }, [items, query, sort]);

  const toggleSort = (key: SortKey) => setSort(current => ({
    key, direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc',
  }));

  const exportPdf = () => {
    const doc = new jsPDF();
    doc.text('Canonical Current Stock', 16, 16);
    doc.setFontSize(9);
    visible.forEach((item, index) => {
      if (index > 0 && index % 30 === 0) doc.addPage();
      const y = 28 + (index % 30) * 8;
      doc.text(`${item.product_code} | ${item.product_name} | ${displayQuantity(item.total_quantity)} ${item.unit} | ${displayMoney(item.total_value)}`, 16, y);
    });
    doc.save('canonical-current-stock.pdf');
  };

  if (!open) return null;
  return (
    <div className="flex h-full flex-col bg-gray-50">
      <ModuleHeader title="Current Stock" onClose={onClose} />
      <main className="flex-1 space-y-4 overflow-y-auto p-6">
        {scope.context && <InventoryScopeSelector context={scope.context} branchId={scope.branchId}
          locationId={scope.locationId} onBranchChange={scope.setBranchId}
          onLocationChange={scope.setLocationId} disabled={loading} />}
        {(scope.scopeError || error) && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-red-700">{scope.scopeError || error}</div>}
        <section className="rounded-lg border border-gray-200 bg-white p-4" aria-label="Current stock controls">
          <div className="flex flex-wrap items-center gap-3">
            <label className="relative min-w-[260px] flex-1"><span className="sr-only">Search current stock</span>
              <Search className="absolute left-3 top-3.5 h-4 w-4 text-gray-400" />
              <input value={query} onChange={event => setQuery(event.target.value)} placeholder="Search products by name or code..."
                className="min-h-11 w-full rounded-lg border border-gray-300 pl-10 pr-3" />
            </label>
            <button type="button" disabled title="Unavailable until canonical branch/product reorder policy is configured"
              className="min-h-11 rounded-lg border border-gray-200 bg-gray-100 px-4 text-gray-500 disabled:cursor-not-allowed">
              Low Stock unavailable
            </button>
            <button type="button" onClick={() => void load()} disabled={loading || !scope.branchId}
              className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-gray-300 bg-white disabled:opacity-50"
              aria-label="Refresh current stock"><RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /></button>
            <button type="button" onClick={exportPdf} disabled={visible.length === 0}
              className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-blue-600 px-4 text-white disabled:bg-gray-300">
              <Download className="h-4 w-4" /> Export visible
            </button>
          </div>
          <p className="mt-3 text-sm text-gray-600">Loaded {items.length} of {summary?.product_count || 0} scoped products{asOf && scope.context ? ` • As of ${displayOrganizationTimestamp(asOf, scope.context.organization_timezone)}` : ''}</p>
          {summary && <div className="mt-3 flex flex-wrap gap-6 border-t border-gray-100 pt-3 text-sm">
            <span className={isNegativeQuantity(summary.total_quantity) ? 'text-red-700' : undefined}>
              Total quantity: <strong>{displayQuantity(summary.total_quantity)}</strong>
            </span>
            <span className={isNegativeMoney(summary.total_value) ? 'text-red-700' : undefined}>
              Total value: <strong>{displayMoney(summary.total_value)}</strong>
            </span>
            <span>Tracked batches: <strong>{summary.batch_count}</strong></span>
            <span>With positive stock: <strong>{summary.positive_stock_batch_count}</strong></span>
            <span>Exhausted: <strong>{summary.exhausted_batch_count}</strong></span>
            {summary.negative_stock_batch_count > 0 && <span className="text-red-700">
              Negative: <strong>{summary.negative_stock_batch_count}</strong>
            </span>}
          </div>}
        </section>
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50"><tr>
              <th className="px-4 py-3 text-left"><button onClick={() => toggleSort('product_name')}>Product</button></th>
              <th className="px-4 py-3 text-left">HSN</th>
              <th className="px-4 py-3 text-right"><button onClick={() => toggleSort('total_quantity')}>Quantity</button></th>
              <th className="px-4 py-3 text-right"><button onClick={() => toggleSort('total_value')}>Value</button></th>
              <th className="px-4 py-3 text-right">Average cost</th><th className="px-4 py-3 text-right">Tracked batches</th>
            </tr></thead>
            <tbody className="divide-y divide-gray-100">
              {visible.map(item => {
                const negative = isNegativeQuantity(item.total_quantity) || isNegativeMoney(item.total_value);
                return <tr key={item.product_id} data-product-id={item.product_id}
                  data-stock-sign={negative ? 'negative' : 'nonnegative'}
                  className={negative ? 'bg-red-50 text-red-700' : undefined}>
                <td className="px-4 py-3"><strong>{item.product_name}</strong><div className="text-xs text-gray-500">{item.product_code}</div></td>
                <td className="px-4 py-3">{item.hsn_code || '—'}</td>
                <td className="px-4 py-3 text-right">{displayQuantity(item.total_quantity)} {item.unit}</td>
                <td className="px-4 py-3 text-right">{displayMoney(item.total_value)}</td>
                <td className="px-4 py-3 text-right">{item.average_unit_cost === null ? '—' : displayRate(item.average_unit_cost)}</td>
                <td className="px-4 py-3 text-right">{item.batch_count}</td>
              </tr>;
              })}
            </tbody>
          </table>
          {!loading && visible.length === 0 && <p className="p-8 text-center text-gray-500">No stock found in this scope.</p>}
        </div>
      </main>
    </div>
  );
};

export default CurrentStock;
