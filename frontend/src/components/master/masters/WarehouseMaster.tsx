import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, Loader2, RefreshCw, Search, Warehouse, X } from 'lucide-react';
import { settingsApi } from '../../../services/api';
import type { WarehouseViewDto } from '../../../services/api/modules/settings/settings.api';
import CanonicalWriteNotice from '../../global/ui/CanonicalWriteNotice';

interface WarehouseMasterProps {
    open?: boolean;
    onClose?: () => void;
}

const WarehouseMaster: React.FC<WarehouseMasterProps> = ({ open, onClose }) => {
    const [warehouses, setWarehouses] = useState<WarehouseViewDto[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [filterType, setFilterType] = useState('all');
    const [isLoading, setIsLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const loadWarehouses = useCallback(async () => {
        setError(null);
        try {
            const response = await settingsApi.warehouses.getAll();
            setWarehouses(response.data);
        } catch {
            setWarehouses([]);
            setError('Locations could not be loaded from the live canonical API.');
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        if (open) void loadWarehouses();
    }, [open, loadWarehouses]);

    const handleRefresh = async () => {
        setRefreshing(true);
        await loadWarehouses();
        setRefreshing(false);
    };

    const types = useMemo(
        () => Array.from(new Set(warehouses.map(item => item.type).filter(Boolean))).sort(),
        [warehouses],
    );
    const filteredWarehouses = useMemo(() => {
        const query = searchTerm.trim().toLowerCase();
        return warehouses.filter(item => {
            const matchesSearch = !query || [item.name, item.code, item.branchName, item.type]
                .some(value => value.toLowerCase().includes(query));
            return matchesSearch && (filterType === 'all' || item.type === filterType);
        });
    }, [warehouses, searchTerm, filterType]);

    if (!open) return null;

    return (
        <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-gray-50">
            <header className="border-b border-gray-200 bg-white px-4 py-4 sm:px-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                        <Warehouse className="h-6 w-6 shrink-0 text-gray-700" aria-hidden="true" />
                        <div className="min-w-0">
                            <h1 className="truncate text-xl font-semibold text-gray-900 sm:text-2xl">Warehouse Master</h1>
                            <p className="text-sm text-gray-500">{warehouses.length} live locations</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2">
                        <button type="button" onClick={handleRefresh} disabled={refreshing} className="inline-flex min-h-11 items-center gap-2 border border-gray-300 bg-white px-4 text-sm font-medium text-gray-700 disabled:opacity-50">
                            {refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                            Refresh
                        </button>
                        {onClose && <button type="button" onClick={onClose} aria-label="Close warehouse master" className="grid h-11 w-11 place-items-center border border-gray-300 bg-white text-gray-600"><X className="h-5 w-5" /></button>}
                    </div>
                </div>
            </header>

            <CanonicalWriteNotice action="Changing locations" className="mx-4 mt-4 sm:mx-6" />

            <div className="grid gap-3 border-b border-gray-200 bg-white px-4 py-3 sm:grid-cols-[minmax(0,1fr)_14rem] sm:px-6">
                <label className="relative block">
                    <span className="sr-only">Search locations</span>
                    <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
                    <input value={searchTerm} onChange={event => setSearchTerm(event.target.value)} placeholder="Search name, code, branch, or type" className="min-h-11 w-full border border-gray-300 bg-white pl-10 pr-3" />
                </label>
                <select aria-label="Filter location type" value={filterType} onChange={event => setFilterType(event.target.value)} className="min-h-11 w-full border border-gray-300 bg-white px-3">
                    <option value="all">All location types</option>
                    {types.map(type => <option key={type} value={type}>{type}</option>)}
                </select>
            </div>

            <main className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
                {error && <div role="alert" className="mb-4 flex items-center gap-2 border border-red-200 bg-red-50 p-3 text-sm text-red-800"><AlertCircle className="h-5 w-5 shrink-0" />{error}</div>}
                {isLoading ? (
                    <div className="flex h-48 items-center justify-center text-gray-600"><Loader2 className="mr-2 h-6 w-6 animate-spin" />Loading locations…</div>
                ) : filteredWarehouses.length === 0 ? (
                    <div className="border border-gray-200 bg-white p-8 text-center text-gray-600">No locations match the current filters.</div>
                ) : (
                    <>
                        <div className="space-y-3 md:hidden">
                            {filteredWarehouses.map(item => (
                                <article key={item.id} className="border border-gray-200 bg-white p-4">
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0"><h2 className="truncate font-medium text-gray-900">{item.name}</h2><p className="text-sm text-gray-500">{item.code}</p></div>
                                        <span className="shrink-0 border border-gray-200 px-2 py-1 text-xs text-gray-700">{item.isActive ? 'Active' : item.status || 'Inactive'}</span>
                                    </div>
                                    <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
                                        <div><dt className="text-gray-500">Branch</dt><dd className="text-gray-900">{item.branchName || '—'}</dd></div>
                                        <div><dt className="text-gray-500">Type</dt><dd className="text-gray-900">{item.type || '—'}</dd></div>
                                        <div><dt className="text-gray-500">Sales</dt><dd>{item.allowsSale ? 'Allowed' : 'Not allowed'}</dd></div>
                                        <div><dt className="text-gray-500">Negative stock</dt><dd>{item.allowsNegativeStock ? 'Allowed' : 'Not allowed'}</dd></div>
                                    </dl>
                                </article>
                            ))}
                        </div>
                        <div className="hidden overflow-x-auto border border-gray-200 bg-white md:block">
                            <table className="w-full min-w-[760px] text-sm">
                                <thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500"><tr><th className="px-4 py-3">Location</th><th className="px-4 py-3">Type</th><th className="px-4 py-3">Branch</th><th className="px-4 py-3">Sales</th><th className="px-4 py-3">Negative stock</th><th className="px-4 py-3">Status</th></tr></thead>
                                <tbody className="divide-y divide-gray-200">{filteredWarehouses.map(item => <tr key={item.id}><td className="px-4 py-3"><div className="font-medium text-gray-900">{item.name}</div><div className="text-gray-500">{item.code}</div></td><td className="px-4 py-3">{item.type || '—'}</td><td className="px-4 py-3">{item.branchName || '—'}</td><td className="px-4 py-3">{item.allowsSale ? 'Allowed' : 'Not allowed'}</td><td className="px-4 py-3">{item.allowsNegativeStock ? 'Allowed' : 'Not allowed'}</td><td className="px-4 py-3">{item.isActive ? 'Active' : item.status || 'Inactive'}</td></tr>)}</tbody>
                            </table>
                        </div>
                    </>
                )}
            </main>
        </div>
    );
};

export default WarehouseMaster;
