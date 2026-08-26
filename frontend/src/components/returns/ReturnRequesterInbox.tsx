import React, { useCallback, useEffect, useState } from 'react';
import { FileCheck2, Inbox, Loader2, RefreshCw, Send } from 'lucide-react';
import { toast } from 'react-toastify';
import type { CanonicalCommandExecution } from '../../services/api/canonicalOperatorActions';
import {
  canonicalReturnsApi,
  type CanonicalReturnCommandDetail,
  type CanonicalReturnCommandSummary,
} from '../../services/api/modules/returns/canonicalReturns.api';
import CanonicalReturnPreview from './components/CanonicalReturnPreview';
import {
  executeApprovedCanonicalReturn,
  retryCanonicalReturnReadback,
  type CanonicalReturnReadback,
} from './utils/canonicalReturnResume';

const errorMessage = (error: any, fallback: string) =>
  error?.response?.data?.detail?.message
  || error?.response?.data?.detail
  || error?.message
  || fallback;

const statusLabel: Record<string, string> = {
  prepared: 'Awaiting independent approval',
  pending_approval: 'Awaiting independent approval',
  approved: 'Approved — ready to post',
  executing: 'Posting in progress',
  succeeded: 'Posted',
  failed: 'Posting failed',
  rejected: 'Rejected',
  expired: 'Expired',
  cancelled: 'Cancelled',
};

const ReturnRequesterInbox: React.FC = () => {
  const [commands, setCommands] = useState<CanonicalReturnCommandSummary[]>([]);
  const [selected, setSelected] = useState<CanonicalReturnCommandDetail | null>(null);
  const [execution, setExecution] = useState<(CanonicalCommandExecution & { resource_id: string }) | null>(null);
  const [readback, setReadback] = useState<CanonicalReturnReadback | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [confirmed, setConfirmed] = useState(false);

  const loadInbox = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await canonicalReturnsApi.listRequesterInbox();
      setCommands(response.data);
    } catch (loadError) {
      setError(errorMessage(loadError, 'Unable to load your canonical return commands.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadInbox(); }, [loadInbox]);

  const loadReadbackOnly = useCallback(async (
    command: CanonicalReturnCommandDetail,
    resourceId: string,
  ) => {
    setBusy(true);
    setError('');
    try {
      setReadback(await retryCanonicalReturnReadback(command.return_kind, resourceId));
    } catch (readError) {
      setError(errorMessage(readError, 'The return posted, but exact readback is temporarily unavailable. Retry performs GET only.'));
    } finally {
      setBusy(false);
    }
  }, []);

  const openCommand = async (commandId: string) => {
    setBusy(true);
    setError('');
    setReadback(null);
    setExecution(null);
    setConfirmed(false);
    try {
      const response = await canonicalReturnsApi.getRequesterCommand(commandId);
      const command = response.data;
      setSelected(command);
      if (command.status === 'succeeded' && command.resource_id) {
        setBusy(false);
        await loadReadbackOnly(command, command.resource_id);
        return;
      }
    } catch (loadError) {
      setSelected(null);
      setError(errorMessage(loadError, 'This requester command is unavailable.'));
    } finally {
      setBusy(false);
    }
  };

  const execute = async () => {
    if (!selected || !confirmed || busy || execution) return;
    setBusy(true);
    setError('');
    try {
      const result = await executeApprovedCanonicalReturn(
        selected,
        `erp-web-return-execute:${selected.command_request_id}`,
        persisted => setExecution(persisted),
      );
      if (result.readback) {
        setReadback(result.readback);
        toast.success('Canonical return posted and reconciled.');
      } else {
        setError(result.readbackError?.message || 'Posted return readback is unavailable.');
      }
      setSelected(current => current ? {
        ...current,
        status: 'succeeded',
        resource_id: result.execution.resource_id,
        resource_type: result.execution.resource_type as any,
        executed_at: result.execution.executed_at as string | undefined,
      } : current);
      await loadInbox();
    } catch (executeError) {
      setError(errorMessage(executeError, 'Canonical return posting failed closed.'));
    } finally {
      setBusy(false);
    }
  };

  const resourceId = execution?.resource_id || selected?.resource_id;

  return (
    <main className="h-full overflow-y-auto bg-gray-50 p-4 sm:p-6">
      <div className="mx-auto max-w-7xl space-y-5">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 pb-4">
          <div><h1 className="text-xl font-semibold text-gray-950">My Prepared Returns</h1><p className="text-sm text-gray-600">Resume only after a different authorized member approves.</p></div>
          <button type="button" onClick={() => void loadInbox()} className="flex min-h-11 items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 text-sm font-medium text-gray-800 hover:bg-gray-50"><RefreshCw className="h-4 w-4" />Refresh</button>
        </header>
        {error && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div>}
        {loading ? (
          <div role="status" className="flex min-h-44 items-center justify-center gap-2 text-gray-600"><Loader2 className="h-5 w-5 animate-spin" />Loading your returns…</div>
        ) : commands.length === 0 ? (
          <div className="flex min-h-44 flex-col items-center justify-center rounded-lg border border-gray-200 bg-white p-6 text-center"><Inbox className="mb-2 h-8 w-8 text-gray-400" /><p className="font-medium text-gray-900">No prepared returns</p><p className="text-sm text-gray-600">Prepare a sales or purchase return to begin the reviewed lifecycle.</p></div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white"><table className="w-full text-left text-sm"><thead className="border-b border-gray-200 bg-gray-50 text-gray-600"><tr><th className="p-3">Return</th><th className="p-3">State</th><th className="p-3">Created</th><th className="p-3">Action</th></tr></thead><tbody>{commands.map(command => (
            <tr key={command.command_request_id} className="border-b border-gray-100 last:border-0"><td className="p-3"><p className="font-medium text-gray-950">{command.return_kind === 'sales' ? 'Sales return' : 'Purchase return'}</p><p className="break-all font-mono text-xs text-gray-500">{command.command_request_id}</p></td><td className="p-3">{statusLabel[command.status] || command.status}</td><td className="p-3">{new Date(command.created_at).toLocaleString()}</td><td className="p-3"><button type="button" data-testid={`open-return-${command.command_request_id}`} onClick={() => void openCommand(command.command_request_id)} className="min-h-11 rounded-lg border border-gray-300 bg-white px-4 font-medium text-gray-800 hover:bg-gray-50">Open</button></td></tr>
          ))}</tbody></table></div>
        )}
        {busy && !selected && <div role="status" className="flex items-center gap-2 text-sm text-gray-600"><Loader2 className="h-4 w-4 animate-spin" />Loading command…</div>}
        {selected && (
          <section className="space-y-4 border-t border-gray-200 pt-5">
            <div className="rounded-lg border border-gray-200 bg-white p-4"><p className="text-sm text-gray-600">Current state</p><p className="font-semibold text-gray-950">{statusLabel[selected.status] || selected.status}</p>{selected.failure_message && <p className="mt-2 text-sm text-red-700">{selected.failure_code}: {selected.failure_message}</p>}</div>
            <CanonicalReturnPreview command={selected} />
            {selected.status === 'approved' && !execution && !selected.resource_id && (
              <>
                <label className="flex min-h-11 items-center gap-3 rounded-lg border border-gray-200 bg-white px-4 text-sm text-gray-800"><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} />Post this exact approved preview. This creates inventory, GST and ledger effects.</label>
                <button type="button" disabled={!confirmed || busy} onClick={() => void execute()} className="flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-5 font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-300 sm:w-auto"><Send className="h-5 w-5" />{busy ? 'Posting…' : 'Post Approved Return'}</button>
              </>
            )}
            {resourceId && (
              <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-950"><p className="flex items-center gap-2 font-semibold"><FileCheck2 className="h-5 w-5" />Persisted canonical resource</p><p data-testid="canonical-posted-resource-id" aria-label="Persisted canonical resource ID" className="mt-1 break-all font-mono">{resourceId}</p>{!readback && <button type="button" disabled={busy} onClick={() => void loadReadbackOnly(selected, resourceId)} className="mt-3 flex min-h-11 items-center gap-2 rounded-lg border border-green-300 bg-white px-4 font-medium hover:bg-green-100"><RefreshCw className="h-4 w-4" />Retry exact readback (GET only)</button>}</div>
            )}
            {readback && <div className="rounded-lg border border-green-200 bg-white p-4"><h3 className="mb-2 font-semibold text-gray-950">Posted reconciliation</h3><pre aria-label="Authoritative return readback" className="max-h-96 overflow-auto whitespace-pre-wrap break-words text-xs text-gray-700">{JSON.stringify(readback, null, 2)}</pre></div>}
          </section>
        )}
      </div>
    </main>
  );
};

export default ReturnRequesterInbox;
