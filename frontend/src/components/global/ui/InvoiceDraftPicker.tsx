import React from 'react';
import { Bot, FilePenLine, Loader2, X } from 'lucide-react';

import type { InvoiceDraft } from '../../../services/api/modules/invoiceDrafts.api';

interface InvoiceDraftPickerProps {
  open: boolean;
  title: string;
  drafts: InvoiceDraft[];
  loading: boolean;
  busyDraftId?: string | null;
  onClose: () => void;
  onOpen: (draft: InvoiceDraft) => void;
  onAbandon: (draft: InvoiceDraft) => void;
}

const updatedLabel = (value: string): string => {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString('en-IN');
};

const InvoiceDraftPicker: React.FC<InvoiceDraftPickerProps> = ({
  open,
  title,
  drafts,
  loading,
  busyDraftId,
  onClose,
  onOpen,
  onAbandon,
}) => {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-slate-950/40 p-0 sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-label={title}>
      <section className="max-h-[85vh] w-full overflow-hidden rounded-t-2xl bg-white shadow-xl sm:max-w-2xl sm:rounded-2xl">
        <header className="flex items-center justify-between border-b border-slate-200 px-4 py-3 sm:px-5">
          <div>
            <h2 className="text-base font-semibold text-slate-900">{title}</h2>
            <p className="text-sm text-slate-500">Resume work created in ERP or ChatGPT.</p>
          </div>
          <button type="button" onClick={onClose} className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg hover:bg-slate-100" aria-label="Close saved drafts">
            <X className="h-5 w-5" />
          </button>
        </header>
        <div className="max-h-[65vh] overflow-y-auto p-4 sm:p-5">
          {loading ? (
            <div className="flex min-h-32 items-center justify-center text-slate-600"><Loader2 className="mr-2 h-5 w-5 animate-spin" />Loading drafts…</div>
          ) : drafts.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center text-sm text-slate-600">No open drafts.</div>
          ) : (
            <ul className="space-y-3">
              {drafts.map((draft) => (
                <li key={draft.draft_id} className="rounded-xl border border-slate-200 p-4">
                  <div className="flex min-w-0 items-start gap-3">
                    <div className="mt-0.5 rounded-lg bg-blue-50 p-2 text-blue-700">
                      {draft.created_via === 'mcp' ? <Bot className="h-5 w-5" /> : <FilePenLine className="h-5 w-5" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-slate-900">{draft.title || 'Untitled invoice draft'}</p>
                      <p className="mt-1 text-xs text-slate-500">
                        {draft.created_via === 'mcp' ? 'Prepared in ChatGPT' : 'Saved in ERP'} · Updated {updatedLabel(draft.updated_at)}
                      </p>
                    </div>
                  </div>
                  <div className="mt-4 flex flex-wrap justify-end gap-2">
                    <button type="button" onClick={() => onAbandon(draft)} disabled={busyDraftId === draft.draft_id} className="min-h-11 rounded-lg px-4 text-sm text-red-700 hover:bg-red-50 disabled:text-slate-400">Discard</button>
                    <button type="button" onClick={() => onOpen(draft)} disabled={Boolean(busyDraftId)} className="min-h-11 rounded-lg bg-blue-600 px-4 text-sm font-medium text-white hover:bg-blue-700 disabled:bg-slate-300">Open draft</button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
};

export default InvoiceDraftPicker;
