import React, { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, Inbox, Loader2, RefreshCw } from 'lucide-react';
import { toast } from 'react-toastify';
import {
  canonicalReturnsApi,
  type CanonicalReturnCommandDetail,
  type CanonicalReturnCommandSummary,
} from '../../services/api/modules/returns/canonicalReturns.api';
import {
  approveReturnAsIndependentReviewer,
  loadReturnForIndependentApproval,
} from './utils/canonicalReturnApproval';
import CanonicalReturnPreview from './components/CanonicalReturnPreview';

const errorMessage = (error: any, fallback: string) =>
  error?.response?.data?.detail?.message
  || error?.response?.data?.detail
  || error?.message
  || fallback;

const ReturnApprovalInbox: React.FC = () => {
  const [commands, setCommands] = useState<CanonicalReturnCommandSummary[]>([]);
  const [selected, setSelected] = useState<CanonicalReturnCommandDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [approving, setApproving] = useState(false);
  const [error, setError] = useState('');
  const [confirmed, setConfirmed] = useState(false);

  const loadInbox = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await canonicalReturnsApi.listApprovalInbox();
      setCommands(response.data);
    } catch (loadError) {
      setError(errorMessage(loadError, 'Unable to load the canonical return approval inbox.'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadInbox(); }, [loadInbox]);

  const openCommand = async (commandId: string) => {
    setDetailLoading(true);
    setError('');
    setConfirmed(false);
    try {
      setSelected(await loadReturnForIndependentApproval(commandId));
    } catch (loadError) {
      setSelected(null);
      setError(errorMessage(loadError, 'This return is no longer available for independent approval.'));
    } finally {
      setDetailLoading(false);
    }
  };

  const approve = async () => {
    if (!selected || !confirmed || approving) return;
    setApproving(true);
    try {
      await approveReturnAsIndependentReviewer(
        selected,
        `erp-web-return-approve:${selected.command_request_id}`,
      );
      toast.success('Return approved. The original requester can now post it.');
      setSelected(null);
      setConfirmed(false);
      await loadInbox();
    } catch (approvalError) {
      setError(errorMessage(approvalError, 'Canonical return approval failed closed.'));
    } finally {
      setApproving(false);
    }
  };

  return (
    <main className="h-full overflow-y-auto bg-gray-50 p-4 sm:p-6">
      <div className="mx-auto max-w-7xl space-y-5">
        <header className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 pb-4">
          <div><h1 className="text-xl font-semibold text-gray-950">Return Approval Inbox</h1><p className="text-sm text-gray-600">Review another member’s immutable return. Approval never posts it.</p></div>
          <button type="button" onClick={() => void loadInbox()} className="flex min-h-11 items-center gap-2 rounded-lg border border-gray-300 bg-white px-4 text-sm font-medium text-gray-800 hover:bg-gray-50"><RefreshCw className="h-4 w-4" />Refresh</button>
        </header>
        {error && <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">{error}</div>}
        {loading ? (
          <div role="status" className="flex min-h-44 items-center justify-center gap-2 text-gray-600"><Loader2 className="h-5 w-5 animate-spin" />Loading approvals…</div>
        ) : commands.length === 0 ? (
          <div className="flex min-h-44 flex-col items-center justify-center rounded-lg border border-gray-200 bg-white p-6 text-center"><Inbox className="mb-2 h-8 w-8 text-gray-400" /><p className="font-medium text-gray-900">No returns await your approval</p><p className="text-sm text-gray-600">Expired, approved, rejected and self-requested commands are not shown.</p></div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{commands.map(command => (
            <button key={command.command_request_id} type="button" data-testid={`review-return-${command.command_request_id}`} onClick={() => void openCommand(command.command_request_id)} className="min-h-11 rounded-lg border border-gray-200 bg-white p-4 text-left hover:border-blue-400 hover:bg-blue-50">
              <span className="text-sm font-semibold text-gray-950">{command.return_kind === 'sales' ? 'Sales return' : 'Purchase return'}</span>
              <span className="mt-1 block text-sm text-gray-600">Requested by {command.requester_name}</span>
              <span className="mt-2 block break-all font-mono text-xs text-gray-500">{command.command_request_id}</span>
            </button>
          ))}</div>
        )}
        {detailLoading && <div role="status" className="flex items-center gap-2 text-sm text-gray-600"><Loader2 className="h-4 w-4 animate-spin" />Loading immutable preview…</div>}
        {selected && (
          <section className="space-y-4 border-t border-gray-200 pt-5">
            <CanonicalReturnPreview command={selected} />
            <label className="flex min-h-11 items-center gap-3 rounded-lg border border-gray-200 bg-white px-4 text-sm text-gray-800"><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} />I reviewed the exact source, evidence, inventory, financial and tax impacts.</label>
            <button type="button" disabled={!confirmed || approving} onClick={() => void approve()} className="flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-5 font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:bg-gray-300 sm:w-auto"><CheckCircle2 className="h-5 w-5" />{approving ? 'Approving…' : 'Approve — requester posts later'}</button>
          </section>
        )}
      </div>
    </main>
  );
};

export default ReturnApprovalInbox;
