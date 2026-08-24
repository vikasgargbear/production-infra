import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, Loader2, Receipt, RefreshCw, Search, X } from 'lucide-react';
import { settingsApi } from '../../../services/api';
import type { TaxViewDto } from '../../../services/api/modules/settings/settings.api';
import CanonicalWriteNotice from '../../global/ui/CanonicalWriteNotice';

interface TaxMasterProps {
    open?: boolean;
    onClose?: () => void;
}

const formatDate = (value: string | null) => value
    ? new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium' }).format(new Date(value))
    : 'Open ended';

const TaxMaster: React.FC<TaxMasterProps> = ({ open, onClose }) => {
    const [taxes, setTaxes] = useState<TaxViewDto[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [taxability, setTaxability] = useState('all');
    const [isLoading, setIsLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const loadTaxes = useCallback(async () => {
        setError(null);
        try {
            const response = await settingsApi.taxes.getAll();
            setTaxes(response.data);
        } catch {
            setTaxes([]);
            setError('Tax codes could not be loaded from the live canonical API.');
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        if (open) void loadTaxes();
    }, [open, loadTaxes]);

    const handleRefresh = async () => {
        setRefreshing(true);
        await loadTaxes();
        setRefreshing(false);
    };

    const types = useMemo(
        () => Array.from(new Set(taxes.map(item => item.type).filter(Boolean))).sort(),
        [taxes],
    );
    const visibleTaxes = useMemo(() => {
        const query = searchTerm.trim().toLowerCase();
        return taxes.filter(item => {
            const matchesSearch = !query || [item.name, item.code, item.type]
                .some(value => value.toLowerCase().includes(query));
            return matchesSearch && (taxability === 'all' || item.type === taxability);
        });
    }, [taxes, searchTerm, taxability]);

    if (!open) return null;

    return (
        <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden bg-gray-50">
            <header className="border-b border-gray-200 bg-white px-4 py-4 sm:px-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3"><Receipt className="h-6 w-6 shrink-0 text-gray-700" aria-hidden="true" /><div><h1 className="text-xl font-semibold text-gray-900 sm:text-2xl">Tax Master</h1><p className="text-sm text-gray-500">{taxes.length} effective canonical tax codes</p></div></div>
                    <div className="flex items-center gap-2"><button type="button" onClick={handleRefresh} disabled={refreshing} className="inline-flex min-h-11 items-center gap-2 border border-gray-300 bg-white px-4 text-sm font-medium text-gray-700 disabled:opacity-50">{refreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}Refresh</button>{onClose && <button type="button" onClick={onClose} aria-label="Close tax master" className="grid h-11 w-11 place-items-center border border-gray-300 bg-white text-gray-600"><X className="h-5 w-5" /></button>}</div>
                </div>
            </header>

            <CanonicalWriteNotice action="Changing tax codes" className="mx-4 mt-4 sm:mx-6" />

            <div className="grid gap-3 border-b border-gray-200 bg-white px-4 py-3 sm:grid-cols-[minmax(0,1fr)_14rem] sm:px-6">
                <label className="relative block"><span className="sr-only">Search tax codes</span><Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" /><input value={searchTerm} onChange={event => setSearchTerm(event.target.value)} placeholder="Search tax code, name, or taxability" className="min-h-11 w-full border border-gray-300 bg-white pl-10 pr-3" /></label>
                <select aria-label="Filter taxability" value={taxability} onChange={event => setTaxability(event.target.value)} className="min-h-11 w-full border border-gray-300 bg-white px-3"><option value="all">All taxability types</option>{types.map(item => <option key={item} value={item}>{item}</option>)}</select>
            </div>

            <main className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
                {error && <div role="alert" className="mb-4 flex items-center gap-2 border border-red-200 bg-red-50 p-3 text-sm text-red-800"><AlertCircle className="h-5 w-5 shrink-0" />{error}</div>}
                {isLoading ? <div className="flex h-48 items-center justify-center text-gray-600"><Loader2 className="mr-2 h-6 w-6 animate-spin" />Loading tax codes…</div> : visibleTaxes.length === 0 ? <div className="border border-gray-200 bg-white p-8 text-center text-gray-600">No tax codes match the current filters.</div> : (
                    <>
                        <div className="space-y-3 md:hidden">{visibleTaxes.map(item => <article key={item.id} className="border border-gray-200 bg-white p-4"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><h2 className="truncate font-medium text-gray-900">{item.name}</h2><p className="text-sm text-gray-500">{item.code}</p></div><strong className="shrink-0 text-blue-700">{item.totalRate}%</strong></div><dl className="mt-3 grid grid-cols-2 gap-3 text-sm"><div><dt className="text-gray-500">Taxability</dt><dd>{item.type || '—'}</dd></div><div><dt className="text-gray-500">Status</dt><dd>{item.isActive ? 'Active' : item.status || 'Inactive'}</dd></div><div><dt className="text-gray-500">CGST / SGST</dt><dd>{item.cgst}% / {item.sgst}%</dd></div><div><dt className="text-gray-500">IGST / Cess</dt><dd>{item.igst}% / {item.cess}%</dd></div><div className="col-span-2"><dt className="text-gray-500">Effective</dt><dd>{formatDate(item.effectiveFrom)} – {formatDate(item.effectiveTo)}</dd></div></dl></article>)}</div>
                        <div className="hidden overflow-x-auto border border-gray-200 bg-white md:block"><table className="w-full min-w-[860px] text-sm"><thead className="bg-gray-50 text-left text-xs uppercase tracking-wide text-gray-500"><tr><th className="px-4 py-3">Tax code</th><th className="px-4 py-3">Taxability</th><th className="px-4 py-3 text-right">Total</th><th className="px-4 py-3 text-right">CGST</th><th className="px-4 py-3 text-right">SGST</th><th className="px-4 py-3 text-right">IGST</th><th className="px-4 py-3">Effective period</th><th className="px-4 py-3">Status</th></tr></thead><tbody className="divide-y divide-gray-200">{visibleTaxes.map(item => <tr key={item.id}><td className="px-4 py-3"><div className="font-medium text-gray-900">{item.name}</div><div className="text-gray-500">{item.code}</div></td><td className="px-4 py-3">{item.type || '—'}</td><td className="px-4 py-3 text-right font-medium">{item.totalRate}%</td><td className="px-4 py-3 text-right">{item.cgst}%</td><td className="px-4 py-3 text-right">{item.sgst}%</td><td className="px-4 py-3 text-right">{item.igst}%</td><td className="px-4 py-3">{formatDate(item.effectiveFrom)} – {formatDate(item.effectiveTo)}</td><td className="px-4 py-3">{item.isActive ? 'Active' : item.status || 'Inactive'}</td></tr>)}</tbody></table></div>
                    </>
                )}
            </main>
        </div>
    );
};

export default TaxMaster;
