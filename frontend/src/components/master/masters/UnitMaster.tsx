import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, Loader2, RefreshCw, Ruler, Search, X } from 'lucide-react';
import { settingsApi } from '../../../services/api';
import type { UnitViewDto } from '../../../services/api/modules/settings/settings.api';
import CanonicalWriteNotice from '../../global/ui/CanonicalWriteNotice';

interface UnitMasterProps {
    open?: boolean;
    onClose?: () => void;
}

const UnitMaster: React.FC<UnitMasterProps> = ({ open, onClose }) => {
    const [units, setUnits] = useState<UnitViewDto[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [category, setCategory] = useState('all');
    const [isLoading, setIsLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const loadUnits = useCallback(async () => {
        setError(null);
        try {
            const response = await settingsApi.units.getAll();
            setUnits(response.data);
        } catch {
            setUnits([]);
            setError('Units could not be loaded from the live canonical API.');
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        if (open) void loadUnits();
    }, [open, loadUnits]);

    const handleRefresh = async () => {
        setRefreshing(true);
        await loadUnits();
        setRefreshing(false);
    };

    const categories = useMemo(
        () => Array.from(new Set(units.map(item => item.category).filter(Boolean))).sort(),
        [units],
    );
    const visibleUnits = useMemo(() => {
        const query = searchTerm.trim().toLowerCase();
        return units.filter(item => {
            const matchesSearch = !query || [item.name, item.code, item.symbol, item.category]
                .some(value => value.toLowerCase().includes(query));
            return matchesSearch && (category === 'all' || item.category === category);
        });
    }, [units, searchTerm, category]);

    if (!open) return null;

    return (
        <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-gray-50">
            <header className="border-b border-gray-200 bg-white px-4 py-4 sm:px-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                        <Ruler className="h-6 w-6 shrink-0 text-gray-700" aria-hidden="true" />
                        <div><h1 className="text-xl font-semibold text-gray-900 sm:text-2xl">Unit Master</h1><p className="text-sm text-gray-500">{units.length} live units of measure</p></div>
                    </div>
                    <div className="flex items-center gap-2">
                        <button type="button" onClick={handleRefresh} disabled={refreshing} className="inline-flex min-h-11 items-center gap-2 border border-gray-300 bg-white px-4 text-sm font-medium text-gray-700 disabled:opacity-50">{refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}Refresh</button>
                        {onClose && <button type="button" onClick={onClose} aria-label="Close unit master" className="grid h-11 w-11 place-items-center border border-gray-300 bg-white text-gray-600"><X className="h-5 w-5" /></button>}
                    </div>
                </div>
            </header>

            <CanonicalWriteNotice action="Changing units" className="mx-4 mt-4 sm:mx-6" />

            <div className="grid gap-3 border-b border-gray-200 bg-white px-4 py-3 sm:grid-cols-[minmax(0,1fr)_14rem] sm:px-6">
                <label className="relative block"><span className="sr-only">Search units</span><Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" /><input value={searchTerm} onChange={event => setSearchTerm(event.target.value)} placeholder="Search name, code, symbol, or dimension" className="min-h-11 w-full border border-gray-300 bg-white pl-10 pr-3" /></label>
                <select aria-label="Filter unit dimension" value={category} onChange={event => setCategory(event.target.value)} className="min-h-11 w-full border border-gray-300 bg-white px-3"><option value="all">All dimensions</option>{categories.map(item => <option key={item} value={item}>{item}</option>)}</select>
            </div>

            <main className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
                {error && <div role="alert" className="mb-4 flex items-center gap-2 border border-red-200 bg-red-50 p-3 text-sm text-red-800"><AlertCircle className="h-5 w-5 shrink-0" />{error}</div>}
                {isLoading ? <div className="flex h-48 items-center justify-center text-gray-600"><Loader2 className="mr-2 h-6 w-6 animate-spin" />Loading units…</div> : visibleUnits.length === 0 ? <div className="border border-gray-200 bg-white p-8 text-center text-gray-600">No units match the current filters.</div> : (
                    <>
                        <div className="grid gap-3 sm:grid-cols-2 md:hidden">{visibleUnits.map(item => <article key={item.id} className="border border-gray-200 bg-white p-4"><div className="flex items-start justify-between gap-3"><div><h2 className="font-medium text-gray-900">{item.name}</h2><p className="text-sm text-gray-500">{item.code}{item.symbol ? ` · ${item.symbol}` : ''}</p></div><span className="border border-gray-200 px-2 py-1 text-xs">{item.isActive ? 'Active' : item.status || 'Inactive'}</span></div><dl className="mt-3 grid grid-cols-2 gap-3 text-sm"><div><dt className="text-gray-500">Dimension</dt><dd>{item.category || '—'}</dd></div><div><dt className="text-gray-500">Decimals</dt><dd>{item.decimalPlaces}</dd></div></dl></article>)}</div>
                        <div className="hidden overflow-x-auto border border-gray-200 bg-white md:block"><table className="w-full min-w-[640px] text-sm"><thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500"><tr><th className="px-4 py-3">Unit</th><th className="px-4 py-3">Code</th><th className="px-4 py-3">Symbol</th><th className="px-4 py-3">Dimension</th><th className="px-4 py-3">Decimals</th><th className="px-4 py-3">Status</th></tr></thead><tbody className="divide-y divide-gray-200">{visibleUnits.map(item => <tr key={item.id}><td className="px-4 py-3 font-medium text-gray-900">{item.name}</td><td className="px-4 py-3">{item.code}</td><td className="px-4 py-3">{item.symbol || '—'}</td><td className="px-4 py-3">{item.category || '—'}</td><td className="px-4 py-3">{item.decimalPlaces}</td><td className="px-4 py-3">{item.isActive ? 'Active' : item.status || 'Inactive'}</td></tr>)}</tbody></table></div>
                    </>
                )}
            </main>
        </div>
    );
};

export default UnitMaster;
