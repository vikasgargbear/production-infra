import React, { useCallback, useEffect, useRef, useState } from 'react';
import type { CanonicalCommandPreview } from '../../services/api/canonicalOperatorActions';

interface Props {
  title: string;
  preview: CanonicalCommandPreview | null;
  open: boolean;
  posting: boolean;
  onBack: () => void;
  onPost: () => Promise<void>;
  selectedProducts?: Array<{ id: string; code: string; name: string }>;
}

export default function CanonicalSalesCommandReview({
  title, preview, open, posting, onBack, onPost, selectedProducts = [],
}: Props) {
  const [confirmed, setConfirmed] = useState(false);
  const backRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  const postingRef = useRef(posting);
  const onBackRef = useRef(onBack);
  useEffect(() => { postingRef.current = posting; }, [posting]);
  useEffect(() => { onBackRef.current = onBack; }, [onBack]);
  const closeReview = useCallback(() => {
    if (!postingRef.current) onBackRef.current();
  }, []);

  useEffect(() => {
    if (!open) return;
    triggerRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setConfirmed(false);
    backRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation();
        closeReview();
        return;
      }
      if (event.key !== 'Tab' || !dialogRef.current) return;
      const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])',
      ));
      if (focusable.length === 0) return;
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
    document.addEventListener('keydown', handleKeyDown, true);
    const trigger = triggerRef.current;
    return () => {
      document.removeEventListener('keydown', handleKeyDown, true);
      trigger?.focus();
    };
  }, [closeReview, open, preview?.preview_hash]);

  if (!open || !preview) return null;
  const finance = Array.isArray(preview.financial_impact) && preview.financial_impact[0]
    && typeof preview.financial_impact[0] === 'object'
    ? preview.financial_impact[0] as Record<string, unknown>
    : {};
  const receivable = finance.receivable ?? finance.grand_total ?? finance.amount ?? 'Calculated by server';
  const taxLines = Array.isArray(preview.tax_impact) ? preview.tax_impact : [];
  const inventoryLines = Array.isArray(preview.inventory_impact) ? preview.inventory_impact : [];
  const warnings = Array.isArray(preview.policy_warnings) ? preview.policy_warnings : [];
  const resolvedReferences = Array.isArray(preview.resolved_references)
    ? preview.resolved_references
    : [];
  const serverProducts = resolvedReferences.flatMap(reference => {
      if (!reference || typeof reference !== 'object') return [];
      const fields = reference as Record<string, unknown>;
      if (fields.resource_type !== 'product'
        || typeof fields.product_name !== 'string'
        || !fields.product_name.trim()
        || typeof fields.product_code !== 'string'
        || !fields.product_code.trim()) return [];
      return [{
        id: String(fields.id || ''),
        code: fields.product_code.trim(),
        name: fields.product_name.trim(),
      }];
    });
  const resolvedProductIds = new Set(resolvedReferences.flatMap(reference => {
    if (!reference || typeof reference !== 'object') return [];
    const fields = reference as Record<string, unknown>;
    if (fields.resource_type === 'product' && fields.id) return [String(fields.id)];
    if (fields.resource_type === 'product_uom_tax' && fields.product_id) {
      return [String(fields.product_id)];
    }
    return [];
  }));
  const products = serverProducts.length > 0 ? serverProducts : selectedProducts.filter(
    product => resolvedProductIds.has(product.id),
  );
  return <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/40 p-4">
    <div ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="canonical-sales-review-title"
      data-testid="canonical-immutable-preview"
      className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-lg border border-gray-200 bg-white shadow-xl">
      <div className="border-b border-gray-200 p-5">
        <h2 id="canonical-sales-review-title" className="text-lg font-semibold text-gray-900">{title}</h2>
        <p className="mt-1 text-sm text-gray-600">This server preview is immutable. Back does not post or queue anything.</p>
      </div>
      <dl className="grid gap-2 border-b border-gray-200 p-5 text-sm">
        <div><dt className="font-medium text-gray-700">Customer receivable</dt><dd className="text-lg font-semibold text-gray-900">₹{String(receivable)}</dd></div>
        <div><dt className="font-medium text-gray-700">GST evidence</dt><dd className="text-gray-900">{taxLines.length} server-calculated line{taxLines.length === 1 ? '' : 's'}</dd></div>
        <div><dt className="font-medium text-gray-700">Stock movements</dt><dd className="text-gray-900">{inventoryLines.length}</dd></div>
        <div><dt className="font-medium text-gray-700">Policy warnings</dt><dd className={warnings.length ? 'font-medium text-amber-700' : 'text-gray-900'}>{warnings.length || 'None'}</dd></div>
        {products.length > 0 && <div>
          <dt className="font-medium text-gray-700">Products matched to canonical IDs</dt>
          <dd className="text-gray-900"><ul>
            {products.map(product => <li key={`${product.id}:${product.code}`}>{product.name} ({product.code})</li>)}
          </ul></dd>
        </div>}
        <div><dt className="font-medium text-gray-700">Command</dt><dd className="break-all text-gray-900">{preview.command_request_id}</dd></div>
        <div><dt className="font-medium text-gray-700">Preview hash</dt><dd className="break-all text-gray-900">{preview.preview_hash}</dd></div>
      </dl>
      <pre className="m-5 max-h-72 overflow-auto rounded border border-gray-200 bg-gray-50 p-4 text-xs text-gray-800">{JSON.stringify({
        financial_impact: preview.financial_impact,
        tax_impact: preview.tax_impact,
        inventory_impact: preview.inventory_impact,
        resolved_references: preview.resolved_references,
      }, null, 2)}</pre>
      <label className="mx-5 flex min-h-11 items-center gap-3 text-sm text-gray-800">
        <input type="checkbox" className="h-5 w-5" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} />
        I reviewed this exact server preview and want to post it.
      </label>
      <div className="mt-4 flex justify-end gap-3 border-t border-gray-200 p-5">
        <button ref={backRef} type="button" onClick={closeReview} disabled={posting}
          className="min-h-11 rounded border border-gray-300 bg-white px-5 text-gray-800 disabled:opacity-50">Back</button>
        <button type="button" onClick={() => void onPost()} disabled={!confirmed || posting}
          className="min-h-11 rounded bg-blue-600 px-5 font-medium text-white disabled:bg-gray-300">
          {posting ? 'Posting…' : 'Approve & Post'}
        </button>
      </div>
    </div>
  </div>;
}
