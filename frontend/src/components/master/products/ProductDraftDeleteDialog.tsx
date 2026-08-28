import React, { useEffect, useId, useRef } from 'react';
import { AlertTriangle, Trash2, X } from 'lucide-react';
import type { CanonicalProductRead } from '../../../services/api/modules/master/canonicalMasterReads';

interface ProductDraftDeleteDialogProps {
  product: CanonicalProductRead | null;
  deleting: boolean;
  error: string | null;
  onCancel: () => void;
  onDelete: () => void;
  restoreFocusTo: HTMLElement | null;
  fallbackFocusTo: HTMLElement | null;
}

const focusableSelector = [
  'button:not([disabled])',
  '[href]',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

const ProductDraftDeleteDialog: React.FC<ProductDraftDeleteDialogProps> = ({
  product,
  deleting,
  error,
  onCancel,
  onDelete,
  restoreFocusTo,
  fallbackFocusTo,
}) => {
  const titleId = useId();
  const descriptionId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!product) return undefined;
    cancelRef.current?.focus();

    return () => {
      if (restoreFocusTo?.isConnected) restoreFocusTo.focus();
      else if (fallbackFocusTo?.isConnected) fallbackFocusTo.focus();
    };
  }, [fallbackFocusTo, product, restoreFocusTo]);

  if (!product) return null;

  const handleKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      if (!deleting) onCancel();
      return;
    }

    if (event.key !== 'Tab') return;
    const focusable = Array.from(
      dialogRef.current?.querySelectorAll<HTMLElement>(focusableSelector) ?? [],
    );
    if (focusable.length === 0) {
      event.preventDefault();
      return;
    }

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={descriptionId}
        onKeyDown={handleKeyDown}
        className="w-full max-w-md rounded-lg border border-gray-200 bg-white shadow-xl"
      >
        <div className="flex items-start justify-between gap-4 border-b border-gray-200 p-5">
          <div className="flex min-w-0 gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-50 text-red-700">
              <AlertTriangle className="h-5 w-5" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <h2 id={titleId} className="text-lg font-semibold text-gray-900">Delete product draft?</h2>
              <p id={descriptionId} className="mt-1 text-sm text-gray-600">
                This permanently deletes only the unused draft named below. Active or referenced products cannot be deleted.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={deleting}
            aria-label="Close delete product draft dialog"
            className="flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-md text-gray-500 hover:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>

        <div className="space-y-4 p-5">
          <dl className="rounded-md border border-gray-200 bg-gray-50 p-4 text-sm">
            <div>
              <dt className="text-gray-500">Draft</dt>
              <dd className="mt-1 break-words font-medium text-gray-900">{product.product_name}</dd>
            </div>
            <div className="mt-3">
              <dt className="text-gray-500">Code</dt>
              <dd className="mt-1 break-all text-gray-800">{product.product_code}</dd>
            </div>
          </dl>
          {error && (
            <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          )}
        </div>

        <div className="flex flex-col-reverse gap-2 border-t border-gray-200 p-5 sm:flex-row sm:justify-end">
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            disabled={deleting}
            className="min-h-11 rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onDelete}
            disabled={deleting}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" />
            {deleting ? 'Deleting draft…' : 'Delete draft'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ProductDraftDeleteDialog;
