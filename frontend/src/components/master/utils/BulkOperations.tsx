import React, { useEffect, useRef } from 'react';
import { AlertTriangle, Database, X } from 'lucide-react';

interface BulkOperationsProps {
  open: boolean;
  onClose: () => void;
}

/** Fail closed until the canonical cloud bulk-job API exists. */
const BulkOperations: React.FC<BulkOperationsProps> = ({ open, onClose }) => {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        onClose();
      }
    };
    document.addEventListener('keydown', closeOnEscape, true);
    return () => document.removeEventListener('keydown', closeOnEscape, true);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <section role="dialog" aria-modal="true" aria-labelledby="bulk-operations-title" className="w-full max-w-lg rounded-lg border border-gray-200 bg-white p-6 shadow-xl">
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 items-start gap-3">
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-2 text-amber-700">
              <Database className="h-5 w-5" aria-hidden="true" />
            </div>
            <div>
              <h2 id="bulk-operations-title" className="text-lg font-semibold text-gray-900">Bulk Operations</h2>
              <p className="mt-1 text-sm text-gray-600">Canonical cloud import and export jobs are not available yet.</p>
            </div>
          </div>
          <button ref={closeRef} type="button" onClick={onClose} aria-label="Close bulk operations" className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-md border border-gray-200 text-gray-600 hover:bg-gray-50">
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <div className="mt-6 flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
          <p>No file will be uploaded and no export will be reported as successful until a server-confirmed job API is wired.</p>
        </div>

        <button type="button" disabled title="Canonical bulk job API is unavailable" className="mt-6 min-h-11 w-full cursor-not-allowed rounded-md bg-gray-200 px-4 py-2 font-medium text-gray-500">
          Import / export unavailable
        </button>
      </section>
    </div>
  );
};

export default BulkOperations;
